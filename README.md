# ITnVend — Beginner-friendly developer README

Welcome! This README will help you run and develop the ITnVend project from scratch on Windows (PowerShell), using either Docker-based development or a local Node/Vite setup. I've written step-by-step instructions so someone new to Node, Docker, and Vite can follow along.

If you prefer a short checklist, skip to "Quick start" below. Otherwise read on for explanation and troubleshooting tips.

## What this project contains

- `server/` — Node.js (Express) backend. It provides API endpoints for products, customers, invoices, accounting, and PDF invoice generation. Uses either SQLite (file) or Postgres (dev with Docker).
- `client/` — React frontend built with Vite. This is the web UI (POS, products, customers, accounting pages).

## Prerequisites

Install these tools on your machine before proceeding:

- Node.js (LTS, e.g. Node 18+). Download from https://nodejs.org/
- npm (comes with Node)
- Docker Desktop (for Docker-based development) — https://www.docker.com/products/docker-desktop
- PowerShell (Windows) — you're already using this.

Note: You can run the project without Docker (using SQLite). Docker is recommended for a Postgres-backed dev environment that mirrors production more closely.

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
	# ITnVend — Beginner-friendly developer README

	Welcome! This README will help you run and develop the ITnVend project from scratch on Windows (PowerShell), using either Docker-based development or a local Node/Vite setup. I've written step-by-step instructions so someone new to Node, Docker, and Vite can follow along.

	If you prefer a short checklist, skip to "Quick start" below. Otherwise read on for explanation and troubleshooting tips.

	## What this project contains

	- `server/` — Node.js (Express) backend. It provides API endpoints for products, customers, invoices, accounting, and PDF invoice generation. Uses either SQLite (file) or Postgres (dev with Docker).
	- `client/` — React frontend built with Vite. This is the web UI (POS, products, customers, accounting pages).

	## Prerequisites

	Install these tools on your machine before proceeding:

	- Node.js (LTS, e.g. Node 18+). Download from https://nodejs.org/
	- npm (comes with Node)
	- Docker Desktop (for Docker-based development) — https://www.docker.com/products/docker-desktop
	- PowerShell (Windows) — you're already using this.

	Note: You can run the project without Docker (using SQLite). Docker is recommended for a Postgres-backed dev environment that mirrors production more closely.

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

