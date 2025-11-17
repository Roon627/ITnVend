# ITnVend Platform

A monorepo that powers the in-house POS, vendor portal and public estore. It contains three Vite/Node projects:

| Path | Description |
| --- | --- |
| `POS/Backend` | Express API + SQLite/Postgres data layer, vendor billing scheduler, sockets, uploads, cron-style jobs. |
| `POS/Frontend` | Internal POS & marketplace operations console (React 19 + Vite). |
| `estore/` | Public shopping experience and vendor onboarding portal (React 19 + Vite). |

The sections below outline how to set up each service, configure environment variables, and understand the most recent vendor billing changes so a new developer can take over quickly.

## Quick Start

> All commands assume Node 20+ is installed. Use separate terminals for each dev server.

1. **POS API**
   ```bash
   cd POS/Backend
   npm install
   npm start          # uses PORT=4000 by default
   ```
   Optional: set `DEV_HTTP=true` to force HTTP if TLS certs are not available.

2. **POS Frontend**
   ```bash
   cd POS/Frontend
   npm install
   npm run dev        # served on Vite default 5173
   ```

3. **Estore Frontend** (optional for storefront work)
   ```bash
   cd estore
   npm install
   npm run dev
   ```

## Certificates & HTTPS

The backend expects certificates in `POS/Backend/certs/` named `pos-itnvend-com.pem` and `pos-itnvend-com-key.pem`. In local development:

- Use [`mkcert`](https://github.com/FiloSottile/mkcert) to generate cert/key pairs.
- Set `DEV_HTTP=true` when you want to bypass TLS.
- Estore → POS API calls can trust a custom CA by setting `POS_API_CA_PATH`. To temporarily ignore validation set `POS_API_REJECT_UNAUTHORIZED=false` (development only).

## Environment Variables

| Service | Variable | Purpose |
| --- | --- | --- |
| POS Backend | `PORT` | Override API port (default 4000). |
| POS Backend | `DEV_HTTP` | Force HTTP even when TLS certs exist. |
| POS Backend | `JWT_SECRET` | Optional override; auto-generated and stored in DB otherwise. |
| POS Backend | `VENDOR_LOGIN_URL` | Redirect target for `/vendor/login`. |
| Estore | `VITE_API_BASE` / `POS_API_BASE` | Base URL for POS API (ex: `https://pos.local/api`). |
| Estore | `POS_API_CA_PATH` | Custom CA bundle path. |
| Estore | `POS_API_REJECT_UNAUTHORIZED` | Set to `false` to skip TLS checks locally. |

Database migrations are handled programmatically through `ensureColumn` / `CREATE TABLE IF NOT EXISTS`, so restarting the backend after pulling changes is enough to upgrade SQLite databases.

## Vendor Billing Overview

The old percentage-based commission system has been replaced with a fixed monthly fee workflow. The moving pieces to be aware of:

1. **Schema additions** – `vendors.monthly_fee`, `billing_start_date`, `last_invoice_date`, `account_active` plus the new `vendor_invoices` table. These fields are created automatically at startup.
2. **Billing service** – `POS/Backend/modules/vendor/billing.service.js` exposes helpers to generate invoices, mark them paid, send reminders and reactivate accounts.
3. **Scheduler** – `initVendorBillingScheduler` (defined in `POS/Backend/index.js:415-424`) runs shortly after midnight server time. On the 1st it generates invoices for vendors whose billing start date has passed, sends reminders on days 3 and 5, and disables unpaid accounts on day 6.
4. **Manual actions** – Admin endpoints allow managers to adjust fees, trigger invoices and mark payments as received:
   - `GET /api/vendors/:id/invoices`
   - `POST /api/vendors/:id/invoices/generate`
   - `POST /api/vendors/:id/invoices/:invoiceId/pay`
   - `PATCH /api/vendors/:id/billing`
   - `POST /api/vendors/:id/reactivate`
   - `GET /api/vendor/me/invoices` for vendor self-service history
5. **Access control** – Vendors are blocked from dashboard/product routes when `account_active = 0`. Login attempts return HTTP 423 with a friendly error.

See `API_REFERENCE.md` for full request/response samples.

## Frontend Highlights

- **VendorRegister.jsx** (POS) – now a two-step flow capturing brand identity and billing details (monthly fee, billing start date, notes). Submits to `/api/vendors/register`.
- **Vendors.jsx** (POS) – admin tooling to approve vendors plus a Billing modal containing fee inputs, invoice history, manual invoice generation and reactivation controls.
- **VendorDashboard.jsx** (POS) – vendor-facing dashboard displays outstanding invoices, next due dates, and locks UI when the account is disabled.
- **Estore Search Suggestions** – `estore/src/components/SearchSuggestions.jsx` is SSR-safe and debounced for 200 ms.
- **Floating Order Summary** – accessible “View cart” floating CTA with cart length indicator, used across the estore layout.

## Testing & Tooling

| Path | Command | Notes |
| --- | --- | --- |
| `POS/Frontend` | `npm run lint` | ESLint (React, hooks). |
| `estore/` | `npm run lint` | ESLint for storefront. |
| `POS/Backend` | _n/a_ | No formal test suite yet; start API and exercise via Thunder Client/Postman. |

When working with uploads, remember the backend accepts multipart uploads via `/api/uploads` or Base64 payloads for smaller assets (logos, hero images).

## Deploy & Operations Notes

- The repo is PM2 compatible; the production process file lives at `ecosystem.config.js` (outside of these instructions). PM2 restarts will re-run the billing scheduler automatically.
- Emails are sent via the shared `sendMail` helper (`POS/Backend/lib/mail.js`). Ensure SMTP env vars are configured wherever the backend is deployed so billing reminders and password resets keep flowing.
- WebSocket updates (product stock etc.) are emitted through `websocket-service.js`. No changes to the billing overhaul were needed, but the service should stay running so POS dashboards remain real-time.

## Need More Detail?

See `API_REFERENCE.md` for a comprehensive list of endpoints, parameters and sample payloads, or open an issue/ask the previous maintainer if something is unclear. This README is meant to be the “runbook” for hand-off: setup, architecture, and operational context are all here so a new engineer can get productive immediately.
