# ITnVend Frontend ↔ POS Integration Guide

This document summarizes everything an assistant or teammate needs to know to connect the React frontend(s) to the ITnVend POS backend, both in local development (custom domains via hosts file) and when deploying to production.

---

## 1. Repository Layout

- **Backend** (`/Backend`): Express + SQLite/Postgres API and upload server.
  - Serves static files under `/uploads/**` (`Backend/public/images/**`).
  - Provides JSON REST endpoints for authentication, catalog, invoices, orders, etc.
  - Handles transfer slips and product uploads, organizing files by category.
- **Frontend** (`/Frontend`): React (Vite) admin/POS SPA.
  - Communicates with the backend via `/api/**`.
  - Uses `resolveMediaUrl` helper to build absolute media URLs.

---

## 2. Environment Variables

Set these before running the backend or frontend—locally you can use `.env`, shell exports, or PowerShell `$env:` variables.

### Backend (in `/Backend`)
| Variable | Meaning |
| -------- | ------- |
| `PORT` | API port (default `4000`). |
| `DATABASE_URL` | Postgres connection string (leave blank for SQLite). |
| `JWT_SECRET` | Optional static JWT signing key. |
| `STOREFRONT_API_KEY` | Required if the public estore will call `/api/orders` or `/api/storefront/preorders`. Requests must send `X-Storefront-Key`. |
| `FRONTEND_URL` | Used in password reset emails to form redirect links. |

Static uploads live under `Backend/public/images`. The server exposes them at `/uploads/**` and `/images/**`.

### Frontend (in `/Frontend`)
| Variable | Meaning |
| -------- | ------- |
| `VITE_API_BASE` | Absolute base for API calls (e.g. `https://pos.itnvend.com`). If unset, the frontend uses the current origin. |
| `VITE_UPLOAD_BASE` | Absolute base for media URLs. Defaults to `VITE_API_BASE`, falling back to `window.location.origin`. Set explicitly when the backend runs on another host/port. |
| `VITE_API_PROXY_TARGET` | Dev server proxy target for `/api` and `/uploads` (defaults to `http://localhost:4000`). |
| `VITE_API_DIRECT_FALLBACK` | Optional fallback base used by the API helper when it gets a *final* 404 (e.g. `http://localhost:4000`). |
| `VITE_DEV_HOST` | Dev server bind host (`true` → `0.0.0.0`). Use `pos.itnvend.com` if bound to a hosts entry. |
| `VITE_ALLOWED_HOSTS` | Comma-separated hosts Vite should accept (default `pos.itnvend.com,localhost,127.0.0.1`). |
| `VITE_HMR_HOST` | Host used by Vite’s HMR websocket (helpful behind proxies). |
| `VITE_DEV_PORT` | Override Vite dev server port (default `5173`). |

Example PowerShell setup for custom domain `pos.itnvend.com`:
```powershell
$env:VITE_DEV_HOST = "pos.itnvend.com"
$env:VITE_ALLOWED_HOSTS = "pos.itnvend.com,localhost,127.0.0.1"
$env:VITE_UPLOAD_BASE = "http://pos.itnvend.com:4000"
npm run dev
```

---

## 3. Upload Strategy

- Product uploads are organized into subdirectories derived from `category/subcategory`:
  - API call: `POST /api/uploads` with `category=products/<category>/<subcategory>`.
  - Server stores file under `Backend/public/images/products/<category>/<subcategory>/`.
  - Response returns `{ path: "/uploads/products/<...>", url: "https://.../uploads/products/<...>" }`.
  - POS & Products pages use `resolveMediaUrl` to convert stored paths to absolute URLs automatically.
- Transfer slips (`payment_slips`) use `payment_slips/<year>/<month>` directories; POS can upload slips before completing payment.
- `resolveMediaUrl` understands:
  - `/uploads/...` or `http://<host>/uploads/...`.
  - File-system style paths that include `public/images/...` (it rewrites them to `/uploads/...`).
  - Combined with the `/uploads` proxy in Vite, images load under both `localhost` and custom domains.

---

## 4. Frontend → Backend Communication

- All API requests go through `Frontend/src/lib/api.js`.
  - Automatically prefixes `/api` paths and attaches JWT bearer token + credentials.
  - Retries failed calls; optional direct fallback when `VITE_API_DIRECT_FALLBACK` is set.
- WebSocket (`WebSocketContext`) connects to the backend for real-time stock/order notifications.
- Auth is handled via `AuthContext`; tokens stored in `localStorage` + refresh cookies.

---

## 5. POS Payment Flow

- Payment modal allows reference + slip upload for bank transfers:
  - Slip stored via the shared uploader with `category=payment_slips/<YYYY>/<MM>`.
  - Invoice creation attaches `paymentInfo` (method, amount, reference, slip path).
  - Backend persists payment record (`payments` table) and updates invoice `payment_method` / `payment_reference`.
- Held orders stay in `localStorage`; real-time updates adjust inventory/notifications.

---

## 6. Integrating the Estore

1. Configure env vars on both sides:
   - Backend: set `STOREFRONT_API_KEY` (shared secret).
   - Estore frontend: call POS API endpoints using `https://pos.itnvend.com/api/...`, providing `X-Storefront-Key`.
2. Product catalog:
   - Use `/api/storefront/preorders` (requires key) or `/api/products?preorderOnly=true`.
   - Public site can fetch `/uploads/...` image URLs directly.
3. Online orders:
   - POST `/api/orders` with `source: 'estore'` and transfer slip details (path or base64).
   - Backend logs payment info, creates invoice, notifies staff.

---

## 7. Development Workflow Checklist

1. Backend:
   ```bash
   cd Backend
   npm install
   npm start     # or npm run dev with nodemon if configured
   ```
2. Frontend:
   ```bash
   cd Frontend
   npm install
   # set env (see Section 2)
   npm run dev
   ```
3. Hosts file for custom domain (example):
   ```
   127.0.0.1 pos.itnvend.com
   127.0.0.1 estore.itnvend.com
   ```
4. Access POS at `http://pos.itnvend.com:5173`, API at `http://pos.itnvend.com:4000`.

---

## 8. Production Notes

- Serve backend behind HTTPS (`pos.itnvend.com`) and frontend as static assets (Vite `npm run build`).
- Set `VITE_API_BASE` / `VITE_UPLOAD_BASE` in the production frontend build to the HTTPS backend URL.
- Ensure `/uploads` directory is writable by the backend process.
- Add automated backups for `Backend/public/images/`.
- Monitor `payments`, `orders`, and slip uploads to keep storage tidy (cleanup job already runs daily).

---

## 9. Troubleshooting

- **Images not loading**: confirm `VITE_UPLOAD_BASE` or `VITE_API_BASE` points to backend host; check for browser extensions blocking requests (`ERR_BLOCKED_BY_CLIENT`).
- **Invalid hook call**: ensure React components don’t define hooks outside component bodies.
- **CORS/auth issues**: the backend sets `origin: true, credentials: true`; frontend fetch attaches cookies & bearer token.

---

With this guide, a new assistant or deployment pipeline should be able to spin up the POS/frontend stack—including custom domains, uploads, and payment slips—without diving deep into the codebase. Adjust the URLs/environments for your production infrastructure, and you’re ready to connect the estore.喝
