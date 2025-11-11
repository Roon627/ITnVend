# ITnVend — Minimal README

Quick notes — literally the smallest details to get dev running:

POS backend
1) Install & start
```pwsh
cd POS/Backend
npm install
npm start
```

POS frontend (Vite)
```pwsh
cd POS/Frontend
npm install
npm run dev
```

Estore frontend (optional)
```pwsh
cd estore
npm install
npm run dev
```

Self-signed certs (local dev)
- Place certs in `POS/Backend/certs/` as `pos-itnvend-com.pem` and `pos-itnvend-com-key.pem`.
- Vite reads certs from `POS/Backend/certs` by default.
- To make estore/backend trust POS TLS, set `POS_API_CA_PATH` to the CA bundle or set `POS_API_REJECT_UNAUTHORIZED=false` (only for short-term local testing).

Stats hook
- `estore/src/hooks/useMarketplaceStats.js` — used by `SellWithUs` and `VendorOnboarding` for live counts.

Key env vars (tiny set)
- POS backend: `PORT` (4000), `DEV_HTTP=true` to force HTTP in dev.
- Estore: `POS_API_BASE`, `POS_API_CA_PATH`, `POS_API_REJECT_UNAUTHORIZED`.

That's it — minimal. Ask me to expand any section.

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
# ITnVend — Minimal README

Quick notes — literally the smallest details to get dev running:

1) POS backend
```pwsh
cd POS/Backend
npm install
npm start
```

2) POS frontend (Vite)
```pwsh
cd POS/Frontend
npm install
npm run dev
```

# ITnVend — Minimal README

Quick notes — literally the smallest details to get dev running:

POS backend
1) Install & start
```pwsh
cd POS/Backend
npm install
npm start
```

POS frontend (Vite)
```pwsh
cd POS/Frontend
npm install
npm run dev
```

Estore frontend (optional)
```pwsh
cd estore
npm install
npm run dev
```

Self-signed certs (local dev)
- Place certs in `POS/Backend/certs/` as `pos-itnvend-com.pem` and `pos-itnvend-com-key.pem`.
- Vite reads certs from `POS/Backend/certs` by default.
- To make estore/backend trust POS TLS, set `POS_API_CA_PATH` to the CA bundle or set `POS_API_REJECT_UNAUTHORIZED=false` (only for short-term local testing).

Stats hook
- `estore/src/hooks/useMarketplaceStats.js` — used by `SellWithUs` and `VendorOnboarding` for live counts.

Key env vars (tiny set)
- POS backend: `PORT` (4000), `DEV_HTTP=true` to force HTTP in dev.
- Estore: `POS_API_BASE`, `POS_API_CA_PATH`, `POS_API_REJECT_UNAUTHORIZED`.

That's it — minimal. Ask me to expand any section.
