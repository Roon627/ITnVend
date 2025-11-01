# ITnVend Deployment Guide

**Updated:** November 2025  
**Stack:** Node.js 22 (Express), React (Vite 7), SQLite/Postgres, Redis (optional)  
**Targets:** `pos.itnvend.com` (POS/admin) and `estore.itnvend.com` (public storefront)

---

## 1. Overview

The repository now ships two applications side by side:

- `POS/Backend` — Express API (uploads, invoices, accounting, websocket hub).
- `POS/Frontend` — React/Vite SPA for staff (POS registers, back office).
- `estore` — React/Vite storefront + optional lightweight Node backend.

Both frontends talk to the same POS API. Production should serve everything over HTTPS with a reverse proxy (Nginx, Caddy, etc.) in front of the Node processes and static assets.

---

## 2. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Ubuntu 22.04+ host (2 vCPU / 4 GB RAM recommended) | Add a 2 GB swapfile if memory is tight. |
| Node.js 22.x + npm | Install via NodeSource or nvm. |
| PM2 or systemd | To run backend services as daemons. |
| Git | Clone/pull the repo. |
| Nginx + Certbot (or equivalent) | Acts as reverse proxy and handles TLS. |
| Domain records | `pos.itnvend.com` and `estore.itnvend.com` pointing to the server IP. |
| Optional: Redis 7+ | Enables websocket fan-out and caching. |

---

## 3. Repository Layout Recap

```
ITnVend/
|-- POS/
|   |-- Backend/        # Express API and uploads
|   |-- Frontend/       # React POS/admin SPA
|   `-- public/         # Shared static assets (if needed)
`-- estore/
    |-- src/            # React storefront
    |-- Backend/        # Optional storefront API utilities
    `-- dist/           # Production build output (after npm run build)
```

Clone the repository somewhere like `/var/www/itnvend` and run deployments from there.

---

## 4. Environment Variables

### POS backend (`POS/Backend/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | API listen port (default `4000`). |
| `HOST` | Optional bind host (default `0.0.0.0`). |
| `DATABASE_URL` | Postgres connection string (leave unset for SQLite). |
| `JWT_SECRET` | Stable JWT signing key (required in production). |
| `STOREFRONT_API_KEY` | Shared secret for storefront endpoints (`X-Storefront-Key`). |
| `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` | Redis connection info (optional). |
| `FRONTEND_URL` | Used in password reset emails and links. |

Uploads live under `POS/Backend/public/images` and are served via `/uploads/*`.

### POS frontend (`POS/Frontend/.env.production`)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE` | Absolute API base, e.g. `https://pos.itnvend.com/api`. |
| `VITE_UPLOAD_BASE` | Absolute uploads base, e.g. `https://pos.itnvend.com/uploads`. |
| `VITE_HMR_HOST` / `VITE_ALLOWED_HOSTS` | Only needed in dev; can be omitted in production builds. |

### Estore frontend (`estore/.env.production`)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE` | `https://pos.itnvend.com/api`. |
| `VITE_UPLOAD_BASE` | `https://pos.itnvend.com/uploads`. |
| `VITE_STOREFRONT_KEY` | Same value as `STOREFRONT_API_KEY`. |

---

## 5. Deployment Steps

1. **Create application directories**
   ```bash
   sudo mkdir -p /var/www/itnvend
   sudo chown $USER:$USER /var/www/itnvend
   cd /var/www/itnvend
   git clone git@github.com:Roon627/ITnVend.git .
   ```

2. **Install backend dependencies**
   ```bash
   cd POS/Backend
   npm install
   cp .env.example .env    # create and edit with production values
   ```

3. **Build frontends**
   ```bash
   # POS admin build
   cd /var/www/itnvend/POS/Frontend
   npm install
   VITE_API_BASE="https://pos.itnvend.com/api" \
   VITE_UPLOAD_BASE="https://pos.itnvend.com/uploads" \
   npm run build

   # Estore build
   cd /var/www/itnvend/estore
   npm install
   VITE_API_BASE="https://pos.itnvend.com/api" \
   VITE_UPLOAD_BASE="https://pos.itnvend.com/uploads" \
   VITE_STOREFRONT_KEY="your-shared-secret" \
   npm run build
   ```

   The POS build outputs to `POS/Frontend/dist`, the estore build to `estore/dist`.

4. **Run the backend with PM2 (or systemd)**
   ```bash
   cd /var/www/itnvend/POS/Backend
   pm2 start index.js --name pos-backend
   pm2 save
   ```

   If you need the estore Node backend (optional), repeat with its entry point.

5. **Configure Nginx**

   Example reverse proxy snippets:

   ```nginx
   # POS API + uploads
   server {
       listen 80;
       server_name pos.itnvend.com;

       location /api/ {
           proxy_pass http://127.0.0.1:4000/api/;
           include proxy_params;
       }

       location /uploads/ {
           proxy_pass http://127.0.0.1:4000/uploads/;
           include proxy_params;
       }

       location / {
           root /var/www/itnvend/POS/Frontend/dist;
           try_files $uri /index.html;
       }
   }

   # Estore SPA
   server {
       listen 80;
       server_name estore.itnvend.com;

       location / {
           root /var/www/itnvend/estore/dist;
           try_files $uri /index.html;
       }
   }
   ```

   After configuration, request certificates with Certbot and reload Nginx:
   ```bash
   sudo certbot --nginx -d pos.itnvend.com -d estore.itnvend.com
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## 6. Post-Deployment Checklist

- Verify `/api/health` responds with status 200.
- Confirm uploads work: POST `/api/uploads` from the POS UI and open the returned URL.
- Create an admin user and test login from both POS and estore flows.
- Check websocket connectivity (notifications, live inventory updates).
- Enable automatic PM2 startup (`pm2 startup systemd`) or create systemd units if preferred.
- Schedule backups for:
  - `POS/Backend/database.db` (if using SQLite).
  - `POS/Backend/public/images`.
  - Postgres database (if configured).

---

## 7. Updating

1. Pull latest changes:
   ```bash
   cd /var/www/itnvend
   git pull
   ```
2. Reinstall dependencies if package manifests changed.
3. Rebuild frontends (`npm run build`).
4. Restart backend process (`pm2 restart pos-backend`).
5. Clear CDN caches if frontends are cached behind Cloudflare.

---

## 8. Troubleshooting

- **API 502/504 errors**: Check PM2 logs (`pm2 logs pos-backend`) and ensure the process is running.
- **Static assets 404**: Confirm Nginx `root` paths point to the latest `dist` directories and `try_files` includes `index.html`.
- **Uploads broken**: Verify Nginx `/uploads/` location proxies to the backend and the process user has write access to `POS/Backend/public/images`.
- **Storefront 401**: Ensure `X-Storefront-Key` is set to the same value as `STOREFRONT_API_KEY`.
- **Websocket issues**: If behind Cloudflare, enable WebSocket support and ensure TLS certificates are valid.

---

Following this guide keeps the POS and storefront deployable on separate domains while sharing a single backend API. Adjust ports, paths, and automation to match your infrastructure, and maintain secrets via your preferred credential store (e.g., systemd drop-in, Ansible vault, or cloud secrets manager).
