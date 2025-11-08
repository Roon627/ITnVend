# ITnVend — POS + Inventory + Accounting (detailed developer README)

This repository contains ITnVend, a small-business Point Of Sale (POS) and inventory/accounting MVP built with a Node/Express backend and a React (Vite) frontend.

This README is intentionally detailed: it explains the project's layout, how to get the app running locally (Docker and file-based SQLite), where the database/seeds live, the important API surface, and developer notes (scripts, troubleshooting, and next steps).

Table of contents
- Overview
- Tech stack
- Repository layout
- Quick start (recommended: Docker dev stack)
- Quick start (local, SQLite)
- Environment variables
- Database and seeds
- Important API endpoints (summary)
- Frontend notes (POS behavior, currency & GST)
- Developer tasks and scripts
- Troubleshooting & known issues
- Contributing and next steps
- License

Overview
--------
ITnVend is an opinionated MVP for a small business that needs a simple POS, product catalog, invoice/quote flow, and some basic accounting entries. It is not production hardened but provides a good starting point for local development or demos.

Tech stack
----------
- Backend: Node.js (modern ES modules), Express, sqlite (default) with optional Postgres via Docker compose.
- Frontend: React + Vite, Tailwind CSS.
- Other: PDF generation for invoices (server-side), simple in-file session/demo auth for local dev.

Repository layout (what you'll care about)
----------------------------------------
- `POS/Backend/` - Node/Express server
	- `index.js` - main server, routes, and business logic
	- `database.js` - database initialization, schema migrations, and seed data (this is where products/customers are seeded)
	- `invoice-service.js` - PDF invoice generation logic
	- `public/images/` - upload root exposed at `/uploads/**`
- `POS/Frontend/` - React (Vite) client for POS/admin
	- `src/main.jsx` - app bootstrap
	- `src/components/` - shared UI components (Header, Sidebar, SettingsContext, etc.)
	- `src/pages/` - app pages (POS, Products, Customers, Invoices, Accounting, Settings, Validate Slip)
	- `src/lib/api.js` - lightweight fetch wrapper that handles auth headers and fallbacks
- `estore/` - standalone storefront/marketing site that consumes the POS API
	- `src/` - Vite React source
	- `Backend/` - optional lightweight Node service for storefront needs (under `estore/Backend`)
	- Builds reference the POS API using `VITE_API_BASE` and `X-Storefront-Key`
	- Primary routes: `/` (company overview), `/market` (Market Hub catalogue), `/product/:id`, `/contact` (support form & scam notice)

Quick start (local monorepo)
----------------------------
This setup runs everything locally with the default SQLite database and Vite dev servers.

1) Start the POS backend
```powershell
cd POS/Backend
npm install
npm start          # or npm run dev if you prefer nodemon
```

2) Start the POS frontend
```powershell
cd POS/Frontend
npm install
# Optional: bind to custom domains defined in hosts file
# $env:VITE_DEV_HOST = "pos.itnvend.com"
# $env:VITE_ALLOWED_HOSTS = "pos.itnvend.com,estore.itnvend.com,localhost,127.0.0.1"
npm run dev
```

3) Start the estore frontend (optional while building the public site)
```powershell
cd estore
npm install
$env:VITE_API_BASE = "http://pos.itnvend.com:4000/api"
$env:VITE_UPLOAD_BASE = "http://pos.itnvend.com:4000/uploads"
npm run dev -- --host estore.itnvend.com --port 5174
```

> Hosts file example:
> ```
> 127.0.0.1 pos.itnvend.com
> 127.0.0.1 estore.itnvend.com
> ```

Quick start (Docker / Postgres)
-------------------------------
Prefer to run the backend on Postgres instead of the bundled SQLite file? A compose file now ships with the repo:

```powershell
cd POS/Backend
docker compose -f docker-compose.postgres.yml up -d   # start the db
docker compose -f docker-compose.postgres.yml down    # stop it when done
```

Then point the backend at Postgres by exporting `DATABASE_URL` (or adding it to `POS/Backend/.env`):

```powershell
$env:DATABASE_URL = "postgres://itnvend:itnvend@localhost:5432/itnvend"
npm start
```

In Postgres mode the app does **not** auto-seed demo data—every table starts empty so you can onboard vendors, products, and customers directly from the admin UI. The frontends continue to talk to `http://localhost:4000` unless you change ports.

Environment variables and configuration
----------------------------------------
- POS backend (`POS/Backend/.env` or shell envs)
	- `PORT` - API listen port (default `4000`)
	- `DATABASE_URL` - Postgres connection string (leave unset for SQLite)
	- `JWT_SECRET` - supply a stable secret in production
	- `STOREFRONT_API_KEY` - shared identifier required by `/api/public/preorders`; storefront requests must send `X-Storefront-Key`
	- `STOREFRONT_API_SECRET` - shared HMAC secret used to sign preorder submissions; backend rejects unsigned, invalid, or stale requests
	- `FRONTEND_URL` - used in password reset emails
- POS frontend (`POS/Frontend/.env` or shell envs)
	- `VITE_API_BASE` - absolute POS API base (defaults to current origin)
	- `VITE_UPLOAD_BASE` - absolute uploads base (defaults to `VITE_API_BASE`)
	- `VITE_API_PROXY_TARGET` - dev proxy target for `/api` and `/uploads`
	- `VITE_API_DIRECT_FALLBACK` - optional absolute fallback when the proxy path 404s
	- `VITE_DEV_HOST` / `VITE_ALLOWED_HOSTS` / `VITE_HMR_HOST` - override dev server binding and websocket host when using custom domains
	- `VITE_DEV_PORT` - override dev server port (default `5173`)
- Estore frontend (`estore/.env` or shell envs)
	- `VITE_API_BASE` - absolute POS API base (`https://pos.itnvend.com/api` in prod)
	- `VITE_UPLOAD_BASE` - absolute uploads base
	- `VITE_STOREFRONT_API_KEY` - matches `STOREFRONT_API_KEY`; injected as `X-Storefront-Key`
	- `VITE_STOREFRONT_API_SECRET` - matches `STOREFRONT_API_SECRET`; used by the browser to compute preorder signature headers
	- `VITE_DEV_HOST` / `VITE_ALLOWED_HOSTS` - custom domain support

Email template placeholders
---------------------------
- **Order / invoice confirmation (customer)**: `{{customer_name}}`, `{{order_id}}`, `{{invoice_id}}`, `{{subtotal}}`, `{{tax_amount}}`, `{{total}}`, `{{payment_method}}`, `{{status}}`, `{{preorder_flag}}`, `{{items_html}}`, `{{outlet_name}}`
- **Quote receipt (customer)**: `{{contact_name}}`, `{{contact_first}}`, `{{contact_email}}`, `{{quote_id}}`, `{{invoice_id}}`, `{{subtotal}}`, `{{tax_amount}}`, `{{total}}`, `{{item_count}}`, `{{submitted_at}}`, `{{items_html}}`
- **Quote request notification (staff)**: `{{company_name}}`, `{{contact_name}}`, `{{contact_email}}`, `{{phone}}`, `{{submission_type}}`, `{{existing_customer_ref}}`, `{{registration_number}}`, `{{details}}`, `{{quote_id}}`, `{{invoice_id}}`, `{{subtotal}}`, `{{tax_amount}}`, `{{total}}`, `{{item_count}}`, `{{submitted_at}}`, `{{items_html}}`

Database and seeds
------------------
- Default DB: SQLite file at `POS/Backend/database.db` when running locally.
- The schema and seed logic live in `POS/Backend/database.js`. On initial run, the script creates tables and seeds default data when `products` is empty.
- Recent changes: seeds were expanded to include POS licenses, hardware, consumables and several items intentionally seeded with `stock: 0` so they exist in the catalog but appear as out-of-stock in the POS. This makes it easier to import and test behaviour for zero-quantity items.

How seeding works
- On startup `setupDatabase()` in `POS/Backend/database.js` runs migrations and then checks `SELECT COUNT(*) as c FROM products`. If zero, it inserts the seed list.
- Important: seeding runs only when the products table is empty. If you already have a populated DB and want to add the new seeds, either:
	- Recreate the DB (delete `POS/Backend/database.db` after backing it up) and restart the server, or
	- Run an "append seeds" helper that inserts missing products only (I can add this script).

API surface (summary)
---------------------
Below are the most useful endpoints for development (see `POS/Backend/index.js` for the full list):

- GET `/api/products` — list products (supports `category`, `subcategory`, `search` query params). Returns full product rows.
- GET `/api/products?preorderOnly=true` — list only items flagged for preorder in the POS catalog (authenticated).
- GET `/api/products/categories` — returns categories/subcategories map.
- POST `/api/products` — create product (protected)
- PUT `/api/products/:id` — update product (protected)
- POST `/api/products/bulk-import` — bulk import products (protected, manager role)
- DELETE `/api/products/:id` — delete product (protected)
- POST `/api/invoices` — create invoice/quote (public endpoint used by POS). Important: server now filters out invoice items with quantity <= 0 when computing subtotal and tax.
- GET `/api/invoices/:id/pdf` — get generated PDF invoice (signed token support)
- POST `/api/uploads` — upload images (multer multipart when available or base64 fallback)
- GET `/api/outlets` — list outlets
- POST/PUT `/api/outlets` — manage outlets (protected)
- GET `/api/storefront/preorders` — storefront-facing feed of preorderable products (requires `STOREFRONT_API_KEY` and `X-Storefront-Key` header).
- POST `/api/validate-slip` — OCR-check a BML/MIB payment slip against an expected transaction ID (protected: accounts/manager/admin).

Authentication & roles
- The app seeds basic roles (`admin`, `manager`, `cashier`, `accounts`) and a default `admin` staff user if none exists.
- Some endpoints are protected with role checks. For local development there's a simple demo-auth path; in Docker/Postgres mode you can create staff and assign roles.

Frontend notes — POS behavior, currency, and GST
------------------------------------------------
- Currency: global currency lives in the `settings` table and is exposed to the frontend via `SettingsContext`. Formatting is done with Intl.NumberFormat via `formatCurrency(...)` (configured to hide trailing `.00` for integer amounts).
- GST calculation: the POS calculates GST (tax) using the active outlet's `gst_rate`. Both frontend and backend compute tax on the invoice subtotal. Important fix: the backend and frontend now explicitly ignore items with quantity <= 0 so GST is not added for zero-quantity lines.
- Adding out-of-stock items: by default the POS UI prevents adding items with `stock <= 0`. If you need backorder/pre-order functionality I can add a toggle or confirmation.
- Preorders: product editors now include an “Available for preorder” toggle with optional release date/notes. When enabled, the product surfaces in `/api/products?preorderOnly=true` and (if configured) the `/api/storefront/preorders` feed for the estore.

Payment slip OCR validation
---------------------------
- Purpose: gives finance staff a one-click way to confirm BML/MIB transfer slips match a transaction ID before marking invoices as paid.
- Usage: open **Validate Slip** in the POS sidebar, enter the expected ID, attach the slip image/PDF, submit, and review the match score plus extracted text.
- Backend: `POST /api/validate-slip` preprocesses uploads with `sharp`, runs `tesseract.js`, and returns `{ match, confidence, extractedText }` based on fuzzy matching.
- Setup: ensure `npm install` pulls the native deps; on Windows install the Visual C++ Build Tools if `sharp` fails to compile, then restart the backend server.

Database reset & seed application (safe options)
----------------------------------------------
There are two safe ways to get the new seed products into your DB:

1) Recreate DB (clean):
	 - Backup the existing DB file: `copy Backend\database.db Backend\backups\database.db.<timestamp>.bak`
	 - Remove `Backend\database.db` and restart the server — `setupDatabase()` will create a fresh DB and apply seeds.

2) Append seeds (non-destructive, recommended for live DB):
	 - I can add a script `Backend/scripts/apply_additional_seeds.js` that inserts seed products only if a row with the same `name` or `sku` doesn't already exist. This avoids duplication and preserves existing data. Tell me if you want me to add it and I'll implement it now.

Developer scripts & useful locations
-----------------------------------
- `POS/Backend/database.js` - main place to update schema and seeds.
- `POS/Backend/index.js` - API routes and server logic (search for `/api/products`, `/api/invoices` etc.)
- `POS/Backend/routes/validateSlip.js` - OCR processing and fuzzy matching for payment slip verification.
- `POS/Frontend/src/pages/POS.jsx` - POS UI and checkout flow (cart, totals, tax). The checkout now filters zero-quantity items before sending to the server.

Testing & verification
----------------------
To verify the GST/zero-quantity fix:
1) Start backend and frontend.
2) Add items to the POS cart with positive quantity and complete checkout — tax should be calculated as `subtotal * (gst_rate/100)`.
3) Add a line with quantity 0 (or attempt to send a payload with a zero-quantity item) — server will ignore the zero-quantity item and return a 400 if the entire payload contains no positive-quantity items.

Troubleshooting & known issues
-----------------------------
- If you see native module errors in containers (e.g., `invalid ELF header`), recreate the server container so `npm install` runs inside Linux.
- If the backend fails to start because `database.db` is locked, ensure no other process (or another server instance) is using it. Close other node processes or restart your machine.
- The app currently seeds products only when the products table is empty. If you changed seeds and expect them to appear, run the append seed script or recreate the DB.
- Preorder signatures: errors such as `Invalid API key`, `Missing signature headers`, or `Invalid signature` indicate the storefront key/secret pair is missing or mismatched. Confirm both `.env` files use the same values and rebuild the storefront so the Vite env variables take effect.

Contributing & next steps I can help with
-----------------------------------------
- Add a non-secret `POS/Backend/.env.example` describing env vars.
- Add `POS/Backend/scripts/apply_additional_seeds.js` (append-only seed script) - recommended if you don't want to recreate DB.
- Add tests for accounting flows (invoice tax entries / journal entries).
- Add a simple dev token generator (script) for faster testing of protected endpoints.

License
-------
This repo currently has no license file. If you want, I can add an MIT license or another license you prefer.

Contact / further help
----------------------
Tell me which of the follow-up items you'd like me to implement next and I will make the change and run quick verification locally where possible:

- Create `POS/Backend/scripts/apply_additional_seeds.js` to append seeds safely (recommended)
- Create an easy `npm run dev:server` nodemon task and wire it into the Docker compose for dev hot-reload
- Add `POS/Backend/.env.example` and `README` sections with explicit env var descriptions

Recent updates (2025-11-07)
---------------------------------------
Backend
- `products.availability_status` is now formalized in the schema (auto-added via `ensureColumn`), backfilled for preorder items, and always included in `/api/products` responses.
- Vendor slugs are upgraded safely: the column is added without a UNIQUE constraint, then enforced through `idx_vendors_slug`. `POST /api/products` now validates `vendorId` (must reference an active vendor) before inserts so storefront vendor pages stay in sync with POS data.
- Public marketplace endpoints (`GET /api/public/vendors` with optional `sort/limit`, and `GET /api/public/vendors/:slug`) power the new storefront experiences by returning slug, branding (logo/hero), tagline, description, and live product counts.

POS / Admin frontend
- Product modals expose both availability status and vendor linkages. Draft/original payloads keep `vendorId`, so edits detect vendor changes correctly and the quick “stock-only” flow still works.
- Product insight panels reuse the same `AvailabilityTag` badge that appears on the storefront so internal users see identical status cues. Vendor names show in the insight metadata when a product is linked.

Storefront / Market Hub
- Added a shared `AvailabilityTag` component used by `ProductCard`, `ProductPreviewModal`, and `ProductDetail` so every card/detail view shows “PREORDER / THROUGH VENDOR / USED / IN STOCK” in the top-left corner of the hero image.
- Home now features a “Trending vendors” rail fed by `/api/public/vendors?sort=trending`. Each tile uses the new `VendorCard` component and links to `/vendors/:slug`.
- Introduced `VendorProfile.jsx` and routed `/vendors/:slug`. Vendor pages display hero + logo, tagline, description, and a live product grid (reusing `ProductCard`). Vendors without items show “This vendor is just getting started” to set expectations.

Testing notes
- Backend: restarting `npm start` in `POS/Backend` applies the slug/index migration safely on SQLite. Creating a product with an inactive vendor now returns a 400, preventing inconsistent storefront data.
- POS: open Products → edit/add, assign an active vendor, and confirm the badge + vendor selection persist through saves.
- Storefront: visit `/` to see the Trending Vendors list, click a vendor to reach `/vendors/<slug>`, and verify the grid matches the POS inventory. Product cards/modals/details should all display the availability badge.

Recent updates (2025-11-05)
---------------------------------------
NOTE: The following changes were implemented on 2025-11-05 as part of the Vendor & Casual Seller feature work. These are non-destructive, additive changes that extend existing behavior while preserving backward compatibility with older API routes.

Backend
- Database schema additions (safe migrations via `ensureColumn` / `CREATE TABLE IF NOT EXISTS`):
	- `vendors.commission_rate` (REAL, default 0.10)
	- `vendors.bank_details` (TEXT)
	- `vendors.logo_url` (TEXT)
	- `vendors.status` (TEXT, default 'pending')
	- New tables: `casual_sellers`, `casual_items`, `casual_item_photos` used for one-time seller listings.

- New API endpoints (POS Backend `index.js`):
	- POST `/api/vendors/register` — richer vendor registration (stores bank details, logo_url, commission_rate). Uses DB transactions and returns `{ id, message, commission_rate }`.
	- POST `/api/sellers/submit-item` — casual seller lightweight submission. Creates a `casual_sellers` row and `casual_items` row, persists photos (supports multipart upload path or base64 data URLs), creates a POS invoice for the listing fee (100 MVR) and optional feature fee (20 MVR), and records corresponding journal entries. The created invoice id is returned in the response.

- Invoice/accounting changes:
	- When invoices are created via the existing POST `/api/invoices` route, the server now aggregates item sales by `products.supplier_id` and creates `accounts_payable` entries for each vendor with the vendor net amount after deducting the vendor's `commission_rate` (defaults to 10% if not set). This processing is best-effort and wrapped in try/catch so it does not block invoice creation on edge cases.
	- Accounting GL updates: in addition to creating `accounts_payable` rows, the invoice posting now also attempts to write corresponding general ledger journal lines to reflect vendor payables and commission revenue. The code will debit `Sales Revenue` to remove vendor-supplied gross sales, credit `Accounts Payable` for the vendor net (uses account code `2000` if present), and credit `Commission Revenue` (uses account code `4200` / Other Income). This is best-effort: if the expected chart-of-accounts codes are not found the AP rows are still created and a warning is logged.

Frontend
- New pages added to the POS frontend (`POS/Frontend/src/pages`):
	- `VendorRegister.jsx` — step-based vendor registration UI that uploads an optional logo and POSTs to `/api/vendors/register`.
	- `CasualSeller.jsx` — one-time seller UI that uploads photos (to `/api/uploads`) and POSTs the submission payload to `/api/sellers/submit-item`; shows invoice summary on success.
	- `Vendors.jsx` — admin list to review vendor applications (Pending / Active / Rejected) and approve or reject submissions. Available to manager+ roles at `/vendors`.
	- `OneTimeSellers.jsx` — admin page to review one-time seller submissions, preview photos, and approve/reject listings. Available to manager/accounts roles at `/casual-items`.

- Routes wired (POS frontend `App.jsx`):
	- `/vendors/register` protected for `manager` role
	- `/casual-seller` protected for `cashier`+ role

Notes & testing
- All new DB changes were made using `ensureColumn` and `CREATE TABLE IF NOT EXISTS` so existing SQLite files will upgrade automatically on server restart.
- Uploads use the existing `/api/uploads` endpoint; if `multer` isn't present on your runtime, the backend has a base64 fallback that will still work.
- To test casual seller flow:
	1. Open POS UI as a cashier (or higher).
	2. Navigate to `/casual-seller` and submit an item with or without photos.
	3. Confirm response includes `invoiceId` and check `invoices` and `casual_items` tables.

Migration & safety
- Backup recommendation before production migration:
	1. Backup the SQLite DB file: `copy POS\Backend\database.db POS\Backend\backups\database.db.%DATE:~0,10%`. For Postgres, take a DB dump.
	2. Restart the POS backend — `setupDatabase()` will apply the non-destructive schema changes.

Next steps (I can implement)
- Frontend polish: client-side validation, file-size limits, thumbnails for logo/photo uploads, and a link in the sidebar for quick access to the new pages.
- Accounting polish: explicit GL posting of commission revenue and vendor liabilities (double-entry reflecting commission split). Currently AP rows for vendor net are created; we can add journal lines to show commission revenue if desired.
- Tests: integration tests that create casual submissions and assert invoice + AP rows exist.


Deployment folder
=================

This folder contains small helpers and verification scripts to run after you deploy the POS backend.

Files
-----
- `.env.example` — example environment variables you must configure in production. Copy to `.env` or set env vars via your process manager.
- `verify_deploy.ps1` — PowerShell smoke-test script that checks `/api/products`, attempts login, and calls `/api/token/refresh` to validate cookie-based refresh handling.
- `tests/` — archived test scripts moved from `scripts/` to keep runtime scripts small. These are safe to keep but not executed by default in production.

Notes
-----
- The verify script expects the server to support cookie-based refresh token exchange (it uses a WebSession to preserve cookies). It will skip login/refresh tests if you don't provide credentials.
- If you prefer Bash, I can add an equivalent `verify_deploy.sh`.


-- End of README --
