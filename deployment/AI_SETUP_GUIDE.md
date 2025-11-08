# ITnVend Frontend <-> POS Integration Guide

This guide explains how the React clients connect to the ITnVend POS backend across local development (with custom hosts entries) and production deployments. The repository now hosts **two** deployable apps:

- `POS/`: the point-of-sale, admin, and accounting stack (backend + frontend).
- `estore/`: the public-facing marketing/estore site that talks to the POS API.

---

## 1. Repository Layout

- **POS backend** (`POS/Backend`): Express + SQLite/Postgres API and upload server.
  - Serves static files under `/uploads/**` (filesystem path `POS/Backend/public/images/**`).
  - Provides JSON REST endpoints for authentication, catalog, invoices, orders, payments, etc.
  - Handles transfer slips and product uploads, storing files in category-based directories.
- **POS frontend** (`POS/Frontend`): React (Vite) admin/POS single-page app.
  - Communicates with the backend via `/api/**`.
  - Uses shared helpers such as `resolveMediaUrl` to build absolute media URLs.
- **Estore frontend** (`estore/src`): React (Vite) storefront that integrates with the POS.
  - Calls the POS backend with an API key for order and catalog sync.
  - Bundled separately so the POS can be sold/hosted without the marketing site if needed.

---

## 2. Environment Variables

Set these before running either app. Locally you can use `.env`, shell exports, or PowerShell `$env:` variables.

### POS backend (`POS/Backend`)
| Variable | Meaning |
| -------- | ------- |
| `PORT` | API port (default `4000`). |
| `DATABASE_URL` | Postgres connection string (leave blank for SQLite). |
| `JWT_SECRET` | Optional static JWT signing key. |
| `STOREFRONT_API_KEY` | Required if the public estore calls `/api/orders` or `/api/storefront/preorders`. Requests must send `X-Storefront-Key`. |
| `FRONTEND_URL` | Used in password reset emails to form redirect links. |

Static uploads live under `POS/Backend/public/images`. The server exposes them at `/uploads/**` and `/images/**`.

### POS frontend (`POS/Frontend`)
| Variable | Meaning |
| -------- | ------- |
| `VITE_API_BASE` | Absolute base for API calls (e.g. `https://pos.itnvend.com`). If unset, the frontend uses the current origin. |
| `VITE_UPLOAD_BASE` | Absolute base for media URLs. Defaults to `VITE_API_BASE`, falling back to `window.location.origin`. Set explicitly when the backend runs on another host/port. |
| `VITE_API_PROXY_TARGET` | Dev server proxy target for `/api` and `/uploads` (defaults to `http://localhost:4000`). |
| `VITE_API_DIRECT_FALLBACK` | Optional fallback base used by the API helper on *final* 404s (e.g. `http://localhost:4000`). |
| `VITE_DEV_HOST` | Dev server bind host (`true` -> `0.0.0.0`). Use `pos.itnvend.com` if bound to a hosts entry. |
| `VITE_ALLOWED_HOSTS` | Comma-separated hosts Vite should accept (default `pos.itnvend.com,estore.itnvend.com,localhost,127.0.0.1`). |
| `VITE_HMR_HOST` | Host used by Vite's HMR websocket (helpful behind proxies). |
| `VITE_DEV_PORT` | Override Vite dev server port (default `5173`). |

### Estore frontend (`estore`)
| Variable | Meaning |
| -------- | ------- |
| `VITE_API_BASE` | Absolute URL to the POS backend (e.g. `https://pos.itnvend.com/api`). |
| `VITE_UPLOAD_BASE` | Absolute URL to backend uploads (e.g. `https://pos.itnvend.com/uploads`). |
| `VITE_STOREFRONT_KEY` | Shared secret sent as `X-Storefront-Key` when calling secured storefront endpoints. |
| `VITE_DEV_HOST` / `VITE_ALLOWED_HOSTS` | Optional overrides when serving via custom domains like `estore.itnvend.com`. |
| `VITE_DEV_PORT` | Override dev server port (defaults to `5174` for estore). |

---

## 3. Upload Strategy

- Product uploads are organized into subdirectories derived from `category/subcategory`:
  - API call: `POST /api/uploads` with `category=products/<category>/<subcategory>`.
  - Server stores the file under `POS/Backend/public/images/products/<category>/<subcategory>/`.
  - Response returns `{ path: "/uploads/products/<...>", url: "https://.../uploads/products/<...>" }`.
  - POS & Products pages use `resolveMediaUrl` to convert stored paths to absolute URLs automatically.
- Transfer slips (`payment_slips`) use `payment_slips/<year>/<month>` directories; POS can upload slips before completing payment.
- `resolveMediaUrl` understands:
  - `/uploads/...` or `http://<host>/uploads/...`.
  - File-system paths that include `public/images/...` (rewritten to `/uploads/...`).
  - Combined with the Vite `/uploads` proxy, images load correctly on both localhost and custom domains.

---

## 4. Frontend <-> Backend Communication

- All POS API requests go through `POS/Frontend/src/lib/api.js`.
  - Automatically prefixes `/api` paths and attaches JWT bearer token + credentials.
  - Retries failed calls; optional direct fallback when `VITE_API_DIRECT_FALLBACK` is set.
- WebSocket (`POS/Frontend/src/components/WebSocketContext.jsx`) connects to the backend for real-time stock/order notifications.
- Auth is managed via `AuthContext`; tokens live in `localStorage` plus refresh cookies.
- The estore uses its own lightweight API helper but follows the same header/URL conventions.
  - Marketing/commerce routes include `/` (overview), `/market` (catalogue), `/product/:id`, and `/checkout`.

---

## 5. POS Payment Flow

- Payment modal allows reference + slip upload for bank transfers:
  - Slips stored via the shared uploader with `category=payment_slips/<YYYY>/<MM>`.
  - Invoice creation attaches `paymentInfo` (method, amount, reference, slip path).
  - Backend persists the payment record (`payments` table) and updates invoice `payment_method` / `payment_reference`.
- Held orders stay in `localStorage`; real-time updates adjust inventory and notifications.

---

## 6. Integrating the Estore

1. Configure env vars on both sides:
   - Backend: set `STOREFRONT_API_KEY` (shared secret).
   - Estore frontend: set `VITE_API_BASE=https://pos.itnvend.com/api`, `VITE_UPLOAD_BASE=https://pos.itnvend.com/uploads`, and `VITE_STOREFRONT_KEY` to match the backend.
2. Product catalog:
   - Use `/api/storefront/preorders` (requires key) or `/api/products?preorderOnly=true`.
   - Public site can fetch `/uploads/...` image URLs directly using `VITE_UPLOAD_BASE`.
3. Online orders:
   - POST `/api/orders` with `source: 'estore'`, transfer slip details (path or base64), and the `X-Storefront-Key` header.
   - Backend logs payment info, creates an invoice, and notifies staff via websockets/email.

---

## 7. Development Workflow Checklist

1. Start the POS backend:
   ```powershell
   cd POS/Backend
   npm install
   npm start    # or npm run dev if nodemon is configured
   ```
2. Start the POS frontend:
   ```powershell
   cd POS/Frontend
   npm install
   # set env (see Section 2) for custom domains or non-default ports
   npm run dev
   ```
3. Start the estore frontend (optional while developing storefront pages):
   ```powershell
   cd estore
   npm install
   $env:VITE_API_BASE = "http://pos.itnvend.com:4000/api"
   $env:VITE_UPLOAD_BASE = "http://pos.itnvend.com:4000/uploads"
   npm run dev -- --host estore.itnvend.com --port 5174
   ```
4. Hosts file (example):
   ```
   127.0.0.1 pos.itnvend.com
   127.0.0.1 estore.itnvend.com
   ```
5. Access POS at `http://pos.itnvend.com:5173`, API at `http://pos.itnvend.com:4000`, estore at `http://estore.itnvend.com:5173` (or whichever port Vite chooses).

---

## 8. Production Notes

- Serve the POS backend behind HTTPS (`https://pos.itnvend.com`) and deploy the POS frontend as static assets (Vite `npm run build`).
- Build the estore separately with its own environment variables pointing back to the POS API.
- Set `VITE_API_BASE` / `VITE_UPLOAD_BASE` in both frontend builds to the HTTPS backend URL.
- Ensure `/uploads` is writable by the backend process; keep backups of `POS/Backend/public/images`.
- Monitor `payments`, `orders`, and slip uploads, and prune old assets as needed.

---

## 9. Troubleshooting

- **Images not loading**: Confirm `VITE_UPLOAD_BASE` or `VITE_API_BASE` points to the backend host; check for browser extensions blocking requests (`ERR_BLOCKED_BY_CLIENT`).
- **Invalid hook call**: Ensure React components declare hooks only inside component bodies.
- **CORS/auth issues**: The backend sets `origin: true, credentials: true`; frontend fetch logic attaches cookies and bearer tokens automatically.
- **Storefront 401s**: Verify the estore sends `X-Storefront-Key` with the value configured in `STOREFRONT_API_KEY`.

---

With this guide, a new assistant or deployment pipeline can spin up the POS stack, including custom domains, uploads, storefront orders, and payment slips, without digging through the codebase. Adjust URLs and environment variables to fit your infrastructure, and you are ready to link the estore and POS in production.
