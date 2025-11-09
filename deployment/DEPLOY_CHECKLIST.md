Going live checklist — ITnVend (POS + eStore)
===============================================

This checklist collects the minimal, high-value steps to prepare the POS + eStore to run in production.
Follow each item and tick it off as you complete it.

1) Database
-----------
- Use Postgres for production. Set `DATABASE_URL` to a realistic connection string.
  Example (PowerShell):

  ```powershell
  $env:DATABASE_URL = 'postgres://itnvend:securepass@db-host:5432/itnvend'
  ```

- If you must use SQLite in production (single-process), ensure the DB file is on a persistent disk and backed up regularly.

2) JWT secret (critical)
-------------------------
- Do NOT rely on the server-generated secret in production. Set `JWT_SECRET` in the environment and keep it secret.
  Example:

  ```powershell
  $env:JWT_SECRET = 'a-very-long-random-secret'
  ```

- The server will persist a generated secret into the `settings` row if none exists, but providing `JWT_SECRET` avoids accidental rotation across restarts.

3) TLS / HTTPS
---------------
- Terminate TLS at a trusted proxy or load-balancer, or provide certs to the backend when using the dev server.
- If your frontends are on different origins (estore vs pos), cookies must be configured `SameSite=None` and `secure: true`.

4) Cookies & CORS
-----------------
- Backend already uses `cors({ origin: true, credentials: true })`.
- Ensure frontend API calls that rely on the refresh cookie use `credentials: 'include'`.
- The server now uses `cookie-parser` and will prefer `req.cookies.ITnvend_refresh` when exchanging refresh tokens.

5) Build & serve frontends
--------------------------
- Build the POS frontend:
  ```powershell
  cd POS/Frontend
  npm ci
  npm run build
  ```
- Build the eStore frontend (estore):
  ```powershell
  cd estore/Frontend
  npm ci
  npm run build
  ```
- Serve `dist` behind your static server / CDN.

6) Start backend in production
------------------------------
- Use pm2/systemd/docker with environment variables set. Example PM2:

  ```powershell
  pm2 start npm --name itnvend-backend -- start --cwd C:\path\to\POS\Backend
  pm2 save
  ```

7) Health checks (smoke tests)
------------------------------
- After deploy, run these simple checks to confirm the main flows work:
  - GET `/api/products` should return 200 and a JSON array
  - GET `/api/submissions` should return 200 (requires role/credentials for detailed list)
  - POST `/api/login` with a valid staff account must return a JWT token
  - POST `/api/token/refresh` must rotate the refresh cookie and return a new JWT

- Quick PowerShell (examples):
  ```powershell
  $base = 'https://pos.example.com'
  # list products
  Invoke-RestMethod -Uri "$base/api/products" -Method Get

  # login (example) — use an actual staff account
  $login = Invoke-RestMethod -Uri "$base/api/login" -Method Post -Body (@{ username='admin'; password='yourpass' } | ConvertTo-Json) -ContentType 'application/json' -SessionVariable s

  # refresh (cookie must be present in $s)
  Invoke-RestMethod -Uri "$base/api/token/refresh" -Method Post -WebSession $s
  ```

8) Post-deploy checks & notes
----------------------------
- Ensure `JWT_SECRET` is stable across restarts.
- If tokens suddenly appear invalid after a restart, it's usually because the JWT secret rotated; verify env and settings row.
- Verify cookies are being sent (browser devtools → Application → Cookies) and that the `ITnvend_refresh` cookie is present with correct domain/path.

9) Optional: monitoring & process manager
-----------------------------------------
- Configure Prometheus/Health checks or a simple uptime check that queries `/api/products` and `/api/public/vendors`.
- Use a process manager (pm2/systemd) to ensure restarts on failures.

If you want, I can:
 - Add a `deployment/verify_deploy.ps1` script that runs the smoke tests for you (already present in this repo root `deployment/`).
 - Add a short `deployment/.env.example` listing the required env vars for prod (already present in this repo root `deployment/`).
- Add simple Prometheus-style health checks to the server.

If you'd like me to also make a small `DEPLOY.md` in the repo root with NGINX example config, tell me and I'll add it next.
