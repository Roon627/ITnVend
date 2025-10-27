# ITnVend MVP (Node + Express backend, React Vite frontend)

This repository contains a minimal, runnable MVP for a small-business POS with quotations and invoices.

What you get
- Express server with SQLite (file db), product/customer CRUD, quote/invoice endpoints, and PDF invoice generation (PDFKit).
- React (Vite) client with a simple POS UI: search products, add to cart, checkout (creates invoice) and opens PDF invoice.
- Seed endpoint to populate sample products and customers.

Quick start (Windows PowerShell)

1) Start backend

```powershell
cd server
npm install
node index.js
```

Server runs on http://localhost:4000 by default.

Project structure (important files)

- `server/` - Express backend, SQLite DB, and invoice PDF generator
	- `index.js` - main server and API routes
	- `database.js` - SQLite setup and migrations
	- `invoice-service.js` - PDF invoice generation
- `client/` - React (Vite) frontend
	- `src/main.jsx` - app entry
	- `src/App.jsx` - router + layout
	- `src/components/` - shared components (Header, Sidebar)
	- `src/pages/` - app pages (POS, Products, Customers, Settings)
	- `src/styles/global.css` - Tailwind + global styles

If you plan to run both servers during development, start the backend first, then the frontend.

2) Seed sample data (in new terminal)

```powershell
curl http://localhost:4000/api/seed
```

3) Start frontend

```powershell
cd client
npm install
npm run dev
```

Open the client shown in the terminal (typically http://localhost:5173).

Notes
- This is an MVP scaffold: authentication, email sending, and production hardening are left as next steps.
- Invoice PDFs are generated server-side at `/api/invoices/:id/pdf`.

Next steps I can implement for you on request:
- Authentication and roles (admin/cashier).
- Email sending with SendGrid, and exporting CSV.
- Receipt printer integration and offline POS sync.

Development (Docker + local env)
-------------------------------
This project provides a lightweight Docker-based development setup in `server/docker-compose.dev.yml` that runs Postgres, pgAdmin and the Node server for testing with Postgres.

Quick dev notes:
- Create a local env file at `server/.env` with at minimum these variables (do NOT commit this file):
	- POSTGRES_USER=postgres
	- POSTGRES_PASSWORD=<your-dev-password>
	- POSTGRES_DB=itnvend
	- PGADMIN_DEFAULT_EMAIL=admin@local
	- PGADMIN_DEFAULT_PASSWORD=<your-dev-password>
	- DATABASE_URL=postgres://postgres:<your-dev-password>@postgres:5432/itnvend

- The compose file reads `server/.env` automatically. `.gitignore` is set to exclude `server/.env`.

- Start the dev stack (from project root):

```powershell
cd server
docker compose -f docker-compose.dev.yml up -d
```

- To recreate just the server (helpful after upgrading packages or clearing native modules):

```powershell
docker compose -f docker-compose.dev.yml up --no-deps --force-recreate server
```

- If you mount your workspace from Windows into a Linux container you may encounter native module issues (invalid ELF header). The compose file maps a named `node_modules` volume for the server so `npm install` runs inside the container and builds Linux-native modules.

Security note (local dev): the repository previously contained a placeholder password `secret` in examples; those docs have been sanitized. Use `server/.env` for local credentials and avoid committing it.

If you want, I can:
- Add a `dev:server` script (nodemon) and update compose to use it for live reloads.
- Create a short section documenting how to run the pgloader migration (migrating SQLite -> Postgres) using `server/README.migrate-postgres.md` as the canonical guide.

---

