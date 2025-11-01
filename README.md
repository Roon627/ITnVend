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
---------------------------------------
- `Backend/` — Node/Express server
	- `index.js` — main server, routes, and business logic
	- `database.js` — database initialization, schema migrations, and seed data (this is where products/customers are seeded)
	- `invoice-service.js` — PDF invoice generation logic
	- `scripts/` — helper scripts (reset/backup/apply seeds) — may be present or added by developer

- `Frontend/` — React (Vite) client
	- `src/main.jsx` — app bootstrap
	- `src/components/` — shared UI components (Header, Sidebar, SettingsContext, etc.)
	- `src/pages/` — app pages (POS, Products, Customers, Invoices, Accounting, Settings)
	- `src/lib/api.js` — lightweight wrapper around fetch to call backend API

Quick start — recommended (Docker dev stack)
-----------------------------------------
This runs Postgres + pgAdmin + the server in containers so your dev environment matches production more closely.

1) Create `server/.env` (example values)

```powershell
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-dev-password-here
POSTGRES_DB=itnvend
PGADMIN_DEFAULT_EMAIL=admin@local
PGADMIN_DEFAULT_PASSWORD=your-dev-password-here
# Optional override: DATABASE_URL=postgres://postgres:pass@postgres:5432/itnvend
```

2) Start the dev stack (from repo root)

```powershell
cd Backend
docker compose -f docker-compose.dev.yml up -d
```

3) Start frontend locally (easier for HMR)

```powershell
cd Frontend
npm install
npm run dev
```

Services
- Backend API: http://localhost:4000
- pgAdmin: http://localhost:8080

Quick start — local (SQLite file)
--------------------------------
If you prefer not to use Docker, the app runs locally with a file-based SQLite DB.

1) Backend
```powershell
cd Backend
npm install
node index.js
```

2) Frontend
```powershell
cd Frontend
npm install
# Optional: tell Vite which host to expose (default already listens on 0.0.0.0)
# PowerShell example:
#   $env:VITE_DEV_HOST = "pos.itnvend.com"
#   $env:VITE_ALLOWED_HOSTS = "pos.itnvend.com,localhost,127.0.0.1"
npm run dev
```

Environment variables and configuration
----------------------------------------
- `JWT_SECRET` / session settings: the server stores a persistent JWT secret in `settings` when it first runs; in Docker/Prod you may prefer to set one via env.
- For Postgres, use the `.env` variables shown above.
- `STOREFRONT_API_KEY` (optional): when set, the backend exposes `/api/storefront/preorders` for an external e-commerce site. Requests must send the matching `X-Storefront-Key` header (or `?key=` query) so POS-only deployments can leave this unset and keep the endpoint disabled.
- Frontend dev helpers:
	- `VITE_DEV_HOST` — override the dev server bind host (defaults to `true`, which is `0.0.0.0` so domains defined in your hosts file like `pos.itnvend.com` work).
	- `VITE_ALLOWED_HOSTS` — comma-separated list of hostnames Vite should accept (defaults to `pos.itnvend.com,localhost,127.0.0.1`).
	- `VITE_HMR_HOST` — optional hostname to force in socket connections if you are proxying the dev server.
	- `VITE_API_PROXY_TARGET` — change the dev proxy target if the backend is not on `http://localhost:4000`.
	- `VITE_API_DIRECT_FALLBACK` — optional absolute base used for a last-chance fetch attempt (fills the old `http://localhost:4000` fallback – leave unset if you don’t need it).
	- `VITE_UPLOAD_BASE` — optional absolute URL that should prefix `/uploads/...` paths (defaults to `VITE_API_BASE` when set). Helpful when the API is on a different domain or port.

Database and seeds
------------------
- Default DB: SQLite file at `Backend/database.db` when running locally.
- The schema and seed logic live in `Backend/database.js`. On initial run, the script creates tables and seeds default data when `products` is empty.
- Recent changes: seeds were expanded to include POS licenses, hardware, consumables and several items intentionally seeded with `stock: 0` so they exist in the catalog but appear as out-of-stock in the POS. This makes it easier to import and test behaviour for zero-quantity items.

How seeding works
- On startup `setupDatabase()` in `Backend/database.js` runs migrations and then checks `SELECT COUNT(*) as c FROM products`. If zero, it inserts the seed list.
- Important: seeding runs only when the products table is empty. If you already have a populated DB and want to add the new seeds, either:
	- Recreate the DB (delete `Backend/database.db` after backing it up) and restart the server, or
	- Run an "append seeds" helper that inserts missing products only (I can add this script).

API surface (summary)
---------------------
Below are the most useful endpoints for development (see `Backend/index.js` for the full list):

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

Authentication & roles
- The app seeds basic roles (`admin`, `manager`, `cashier`, `accounts`) and a default `admin` staff user if none exists.
- Some endpoints are protected with role checks. For local development there's a simple demo-auth path; in Docker/Postgres mode you can create staff and assign roles.

Frontend notes — POS behavior, currency, and GST
------------------------------------------------
- Currency: global currency lives in the `settings` table and is exposed to the frontend via `SettingsContext`. Formatting is done with Intl.NumberFormat via `formatCurrency(...)` (configured to hide trailing `.00` for integer amounts).
- GST calculation: the POS calculates GST (tax) using the active outlet's `gst_rate`. Both frontend and backend compute tax on the invoice subtotal. Important fix: the backend and frontend now explicitly ignore items with quantity <= 0 so GST is not added for zero-quantity lines.
- Adding out-of-stock items: by default the POS UI prevents adding items with `stock <= 0`. If you need backorder/pre-order functionality I can add a toggle or confirmation.
- Preorders: product editors now include an “Available for preorder” toggle with optional release date/notes. When enabled, the product surfaces in `/api/products?preorderOnly=true` and (if configured) the `/api/storefront/preorders` feed for the estore.

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
- `Backend/database.js` — main place to update schema and seeds.
- `Backend/index.js` — API routes and server logic (search for `/api/products`, `/api/invoices` etc.)
- `Frontend/src/pages/POS.jsx` — POS UI and checkout flow (cart, totals, tax). The checkout now filters zero-quantity items before sending to the server.

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

Contributing & next steps I can help with
-----------------------------------------
- Add a non-secret `Backend/.env.example` describing env vars.
- Add `Backend/scripts/apply_additional_seeds.js` (append-only seed script) — recommended if you don't want to recreate DB.
- Add tests for accounting flows (invoice tax entries / journal entries).
- Add a simple dev token generator (script) for faster testing of protected endpoints.

License
-------
This repo currently has no license file. If you want, I can add an MIT license or another license you prefer.

Contact / further help
----------------------
Tell me which of the follow-up items you'd like me to implement next and I will make the change and run quick verification locally where possible:

- Create `Backend/scripts/apply_additional_seeds.js` to append seeds safely (recommended)
- Create an easy `npm run dev:server` nodemon task and wire it into the Docker compose for dev hot-reload
- Add `Backend/.env.example` and `README` sections with explicit env var descriptions

-- End of README --


	## Quick start (recommended: Docker dev stack)

	This starts Postgres + pgAdmin + the Node server in Docker containers. The frontend can run locally (Vite) or be served separately.

	1) Create the local environment file (only once)

	Open `server/.env` with a text editor and add the following (example):

	```powershell
	POSTGRES_USER=postgres
	POSTGRES_PASSWORD=your-dev-password-here
	POSTGRES_DB=itnvend
	PGADMIN_DEFAULT_EMAIL=admin@local
	PGADMIN_DEFAULT_PASSWORD=your-dev-password-here
	# DATABASE_URL is optional — the compose file and server use these parts to form a connection string
	# DATABASE_URL=postgres://postgres:your-dev-password-here@postgres:5432/itnvend
	```

	Important: Do NOT commit `server/.env` to source control. The repo already includes `/server/.env` in `.gitignore`.

	2) Start the dev stack (from project root)

	```powershell
	cd server
	docker compose -f docker-compose.dev.yml up -d
	```

	3) Recreate the server container after code changes that affect native modules

	If you change dependencies or see native module errors (common when switching OS/container types), recreate the server container so `npm install` runs inside Linux and builds native modules:

	```powershell
	docker compose -f docker-compose.dev.yml up --no-deps --force-recreate -d server
	```

	4) Visit services

	- Backend API: http://localhost:4000
	- pgAdmin: http://localhost:8080 (login with `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` from your `.env`)

	## Quick start (local, without Docker — uses SQLite)

	These steps are for running the project locally with the file-based SQLite DB.

	1) Start the backend

	```powershell
	cd server
	npm install
	node index.js
	```

	The server will listen on http://localhost:4000 by default.

	2) Seed example data (optional)

	Open a new PowerShell window and run:

	```powershell
	curl http://localhost:4000/api/seed
	```

	3) Start the frontend

	```powershell
	cd client
	npm install
	npm run dev
	```

	Open the URL shown by Vite (typically http://localhost:5173).

	## How the app is organized (files you will care about)

	- `server/index.js` — boots the Express app; defines API routes (products, invoices, accounts, reports, auth).
	- `server/database.js` — database initialization, migrations, and seeds.
	- `server/invoice-service.js` — PDF invoice generation.
	- `client/src/` — React app (pages and components). Key pages:
	  - `client/src/pages/POS.jsx` — point-of-sale
	  - `client/src/pages/Accounting.jsx` — accounting/reports UI

	## Common commands (PowerShell)

	- Start backend locally (SQLite):

	```powershell
	cd server
	npm install
	node index.js
	```

	- Start frontend locally:

	```powershell
	cd client
	npm install
	npm run dev
	```

	- Start Docker dev stack (Postgres + pgAdmin + server):

	```powershell
	cd server
	docker compose -f docker-compose.dev.yml up -d
	```

	- Recreate server container (useful after dependency changes):

	```powershell
	docker compose -f docker-compose.dev.yml up --no-deps --force-recreate -d server
	```

	## How to test the accounting endpoints quickly (programmatic)

	If you just want to see what the API returns (no UI), do the following.

	1) If running the backend locally or in Docker, make sure the server is reachable at http://localhost:4000.

	2) Public endpoints (no auth) — not many; most accounting endpoints are protected. Example seed endpoint:

	```powershell
	curl http://localhost:4000/api/seed
	```

	3) Protected endpoints will respond with `401 Missing authorization header` if you call them unauthenticated. You can test authenticated endpoints by obtaining a JWT via the login flow in the app or by generating a token using the server's JWT secret (advanced). If you want, I can create a short script to generate a dev token for testing.

	## Troubleshooting (known problems and fixes)

	- "open ... server\\server\\docker-compose.dev.yml: The system cannot find the file specified."
	  - Cause: You ran `docker compose -f server\\docker-compose.dev.yml` from inside the `server` directory. The relative path became `server/server/docker-compose.dev.yml` which doesn't exist.
	  - Fix: From inside `server`, run `docker compose -f docker-compose.dev.yml ...` or from the repo root run `docker compose -f server\\docker-compose.dev.yml ...` or use the absolute path.

	- "invalid ELF header" or native module errors when starting server in Docker
	  - Cause: `node_modules` were installed on Windows host and mounted into a Linux container. Native modules (e.g., sqlite3) are compiled for Windows and cannot be loaded in Linux.
	  - Fix: Use the compose setup which mounts a named `node_modules` volume for the container. Recreate the server container so `npm install` runs inside the container:

	```powershell
	docker compose -f docker-compose.dev.yml up --no-deps --force-recreate -d server
	```

	- Postgres port 5432 conflict
	  - Cause: Another Postgres instance (maybe host or previous container) is using port 5432.
	  - Fix: Stop the conflicting service, or change the port mapping in `docker-compose.dev.yml`. You can list containers with `docker ps` and stop unwanted containers with `docker stop <container>`.

	- Endpoints return `401 Missing authorization header`
	  - Cause: The endpoints are protected; the client normally sends a JWT in the Authorization header.
	  - Fix: Use the app login to obtain a token or I can provide a short script to sign a test token for development (I won't print secrets to the chat).

	## Development tips and next steps I can help with

	- Add `npm run dev:server` (nodemon) for auto-reload while developing the backend and wire compose to use it.
	- Add small API tests for accounting endpoints to prevent regressions (example: assert Chart of Accounts includes expected fields).
	- Add a `server/.env.example` with only non-secret guidance so new contributors know required variables.

	If you want me to make any of the above changes (add tests, token helper script, `env.example`, CI), tell me which and I'll implement it.

	## License

	This project doesn't include a license file. If you'd like, I can add an MIT license or another license of your choosing.

	---

	If anything is unclear, say which OS/step you want expanded and I'll make the README even more detailed (screenshots, exact commands, or a video-style sequence). 

