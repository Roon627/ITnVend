# ITnVend API Reference

This document summarizes the primary REST endpoints exposed by `POS/Backend`. All responses are JSON unless stated otherwise. Errors follow the shape `{ "error": "message" }` with a relevant HTTP status code.

- Base URL (local dev): `https://localhost:4000/api` (or `http://localhost:4000/api` when `DEV_HTTP=true`)
- Authentication: Bearer JWTs issued by staff (`/api/login`) or vendor (`/api/vendors/login`) flows. Include `Authorization: Bearer <token>` and keep the `ITnvend_refresh` HttpOnly cookie if refresh tokens are enabled.

> **Note:** Only the endpoints relevant to vendor onboarding, billing, and storefront integrations are listed here. Core POS endpoints (invoices, products, slips, etc.) keep existing semantics and can be introspected inside `POS/Backend/index.js`.

---

## Authentication & Identity

### POST `/api/vendors/login`
Authenticate a vendor account and retrieve a JWT.

**Body**
```json
{
  "username": "vendor@example.com",
  "password": "secret"
}
```

**Responses**
- `200 OK` – `{ "token": "<jwt>", "vendor": { "id": 12, "email": "...", "legal_name": "Acme" } }`
- `401 Unauthorized` – invalid credentials
- `423 Locked` – vendor account is disabled because of unpaid invoices

### POST `/api/vendors/password-reset/request`
Trigger a password reset email for a vendor.

```json
{ "email": "vendor@example.com" }
```
Response is always `200 { "status": "ok" }` to avoid leaking whether the email exists.

### POST `/api/vendors/password-reset/confirm`
Complete password reset using the emailed token.

```json
{ "token": "<hex>", "password": "new-strong-pass" }
```

Returns `{ "status": "ok", "token": "<jwt>" }` on success.

---

## Vendor Self-Service

All endpoints below require a vendor JWT (role `vendor`).

### GET `/api/vendor/me`
Returns the vendor profile including billing metadata.

```json
{
  "id": 12,
  "legal_name": "Acme Labs",
  "email": "vendor@example.com",
  "monthly_fee": 250,
  "billing_start_date": "2024-02-01",
  "last_invoice_date": "2025-01-01",
  "account_active": 1,
  "product_count": 43,
  "...": "..."
}
```

### GET `/api/vendor/me/products`
List the most recent 20 products for the vendor (uses the shared product serializer).

### GET `/api/vendor/me/invoices`
Return billing history (latest 100 invoices) so vendors can view outstanding fees.

```json
[
  {
    "id": 31,
    "invoice_number": "VF-12-202501-482",
    "fee_amount": 250,
    "status": "unpaid",
    "due_date": "2025-01-06",
    "issued_at": "2025-01-01"
  },
  ...
]
```

### Vendor Product CRUD

- `POST /api/vendor/products` – Create a product under the vendor account.
- `PUT /api/vendor/products/:id` – Update own product (fails with 404 if another vendor ID).
- `DELETE /api/vendor/products/:id` – Archive/remove a product.

Payload mirrors the shared `ProductForm` component; send `type: "digital"` to expose digital fulfilment fields. Inventory tracking is disabled automatically for digital items.

---

## Vendor Onboarding (Admin/Manager)

These routes require a staff JWT with `manager` or `admin` role unless noted.

### POST `/api/vendors/register`
Used by the internal onboarding UI. Accepts business details, billing configuration, and optional base64/URL attachments.

```json
{
  "legal_name": "Acme Labs",
  "email": "vendor@example.com",
  "phone": "+960 1234567",
  "tagline": "Premium AV supplier",
  "public_description": "Full-stack hardware shop",
  "capabilities": "Pro audio, display walls, staging",
  "notes": "Requires monthly liveness check",
  "bank_details": "Bank MVR • 7700000123",
  "monthly_fee": 250,
  "billing_start_date": "2025-02-01",
  "logo_url": "/uploads/vendors/logos/acme.png"
}
```

Returns `{ "id": 12, "slug": "acme-labs", "message": "Vendor registered" }`.

### GET `/api/vendors?status=pending|active|rejected`
List vendors filtered by status. Requires `cashier` role or higher.

### PUT `/api/vendors/:id/status`
Approve (`active`), reject or reset to `pending`. When a vendor becomes active the backend ensures a login credential exists and emails the vendor if SMTP is configured.

### POST `/api/vendors/:id/resend-credentials`
Regenerate a temporary password and attempt to email the vendor. Pass `{ "reveal": true }` to have the temporary credentials returned in the response (displayed inside the POS admin UI).

### POST `/api/vendors/:id/impersonate`
Generate a vendor JWT for impersonation. The frontend opens `/vendor/dashboard?impersonation_token=...` in a new tab.

### GET `/api/vendors/:id/password-reset-tokens`
Audit trail for reset tokens (no raw token values).

---

## Billing & Invoices (Admin)

All endpoints require `manager` or `admin` role.

### GET `/api/vendors/:id/invoices`
Paginated invoice history (`?limit=<n>`). Response:
```json
{
  "vendorId": 12,
  "invoices": [
    {
      "id": 31,
      "invoice_number": "VF-12-202501-482",
      "fee_amount": 250,
      "status": "unpaid",
      "issued_at": "2025-01-01",
      "due_date": "2025-01-06",
      "reminder_stage": 1
    }
  ]
}
```

### PATCH `/api/vendors/:id/billing`
Update monthly fee and/or billing start date.
```json
{ "monthly_fee": 300, "billing_start_date": "2025-03-01" }
```

### POST `/api/vendors/:id/invoices/generate`
Manually create an invoice outside of the monthly job.

```json
{ "amount": 350, "issueDate": "2025-01-15", "metadata": { "reason": "Onboarding package" } }
```

Returns the created invoice row.

### POST `/api/vendors/:id/invoices/:invoiceId/pay`
Mark an invoice as paid. Automatically reactivates the vendor account.

### POST `/api/vendors/:id/reactivate`
Force reactivation (sets `account_active=1`). Optional payload `{ "billing_start_date": "2025-02-01" }` to override the next billing cycle.

---

## Scheduler & Reminder Logic

- **Job**: `initVendorBillingScheduler` runs on backend boot and re-schedules itself to execute shortly after midnight. It calls `processDailyVendorBilling`.
- **Invoice creation**: On the 1st the job looks for vendors where `monthly_fee > 0` and `billing_start_date <= today`. It skips vendors already invoiced this month (`last_invoice_date` check).
- **Reminder stages**:
  - Day 3: reminder email, `reminder_stage = 1`
  - Day 5: final reminder, `reminder_stage = 2`
  - Day 6: account disabled (`account_active = 0`), `reminder_stage = 3`, and a lockout email is sent.
- **Lock messaging**: Any vendor API guarded by `requireVendorAccess()` will respond with HTTP 423 and the message _“Your vendor account is temporarily disabled due to unpaid monthly fees. Please contact support.”_

Manual actions (`/billing`, `/invoices/*`, `/reactivate`) are idempotent so they can be triggered repeatedly if PM2 restarts or there is uncertainty about a payment.

---

## Uploads

- `POST /api/uploads?category=logos` – Accepts multipart file uploads, stores them under `/uploads/<category>/...` and returns `{ "path": "/uploads/..." }`.
- Products and vendor onboarding also allow base64 images; the backend detects `data:image/*;base64,...` payloads and writes them to disk.

---

## Error Codes

| Status | Meaning |
| --- | --- |
| `400 Bad Request` | Validation failure. Check the `error` string for details. |
| `401 Unauthorized` | Missing/invalid JWT. |
| `403 Forbidden` | Role mismatch (e.g., vendor hitting staff-only endpoint). |
| `404 Not Found` | Resource not found or belongs to a different vendor. |
| `409 Conflict` | Typically triggered by duplicate vendor email during registration. |
| `423 Locked` | Vendor account is disabled; pay invoices or have admin reactivate. |
| `500 Internal Error` | Unexpected server-side failure (logged on the backend). |

Keep logs/PM2 output handy when handing the project over—the billing scheduler, email delivery, and cron-like operations all report their status via console logs so issues can be diagnosed quickly.
