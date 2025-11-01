# ITnVend Deployment Checklist

This note keeps the quick punch list for deploying the reorganized repository (POS + estore) onto a fresh Ubuntu host.

---

## 1. Server Prep

- Ubuntu 22.04+ server with sudo access  
- Packages: `git`, `build-essential`, `nginx`, `certbot`, `python3-certbot-nginx`  
- Node.js 22.x + npm (via NodeSource or nvm)  
- PM2 or systemd for process management  
- Optional: Redis if websocket fan-out/caching is required

Create the base directory layout used by the latest docs:

```bash
sudo mkdir -p /var/www/itnvend
sudo mkdir -p /var/www/itnvend/POS/Backend/public/images
sudo mkdir -p /var/www/itnvend/POS/Frontend/dist
sudo mkdir -p /var/www/itnvend/estore/dist
sudo chown -R $USER:$USER /var/www/itnvend
sudo chown -R www-data:www-data /var/www/itnvend/POS/Backend/public
sudo chmod -R 755 /var/www/itnvend/POS/Backend/public
```

Hosts file (local dev) or DNS (production) must point both `pos.itnvend.com` and `estore.itnvend.com` to the server IP.

---

## 2. Clone & Install

```bash
cd /var/www/itnvend
git clone https://github.com/Roon627/ITnVend.git .

# Backend
cd POS/Backend
npm install
cp .env.example .env   # create and edit with production values

# POS frontend
cd ../Frontend
npm install

# Estore frontend
cd ../../estore
npm install
```

Sample backend `.env` values:

```
PORT=4000
HOST=0.0.0.0
DATABASE_URL=postgres://user:pass@localhost:5432/itnvend   # leave blank for SQLite
JWT_SECRET=change-me
STOREFRONT_API_KEY=shared-key-for-estore
FRONTEND_URL=https://pos.itnvend.com
```

---

## 3. Build Frontends

```bash
# POS build
cd /var/www/itnvend/POS/Frontend
VITE_API_BASE="https://pos.itnvend.com/api" \
VITE_UPLOAD_BASE="https://pos.itnvend.com/uploads" \
npm run build

# Estore build
cd /var/www/itnvend/estore
VITE_API_BASE="https://pos.itnvend.com/api" \
VITE_UPLOAD_BASE="https://pos.itnvend.com/uploads" \
VITE_STOREFRONT_KEY="shared-key-for-estore" \
npm run build
```

Copy the `dist` outputs (if the builds emit elsewhere) into `/var/www/itnvend/POS/Frontend/dist` and `/var/www/itnvend/estore/dist`.

---

## 4. Run Backend with PM2

```bash
cd /var/www/itnvend/POS/Backend
pm2 start index.js --name pos-backend
pm2 save
pm2 startup
```

If you enable the estore Node backend (optional), register it with PM2 under a different process name.

---

## 5. Nginx Configuration

Create `/etc/nginx/sites-available/pos.itnvend.com`:

```nginx
server {
    listen 80;
    server_name pos.itnvend.com;

    root /var/www/itnvend/POS/Frontend/dist;
    index index.html;

    location /uploads/ {
        alias /var/www/itnvend/POS/Backend/public/images/;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location = / {
        return 302 /admin;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Create `/etc/nginx/sites-available/estore.itnvend.com`:

```nginx
server {
    listen 80;
    server_name estore.itnvend.com;

    root /var/www/itnvend/estore/dist;
    index index.html;

    location /uploads/ {
        alias /var/www/itnvend/POS/Backend/public/images/;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable the sites, test, and acquire TLS:

```bash
sudo ln -s /etc/nginx/sites-available/pos.itnvend.com /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/estore.itnvend.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d pos.itnvend.com -d estore.itnvend.com
```

---

## 6. Verification

- Visit `https://pos.itnvend.com/admin` and confirm login, orders, and websocket notifications.  
- Upload a product image or payment slip; confirm the file appears under `/var/www/itnvend/POS/Backend/public/images`.  
- Run a storefront order from `https://estore.itnvend.com` and verify it reaches the POS backend with the `X-Storefront-Key` header.  
- Check PM2 status: `pm2 status` should list `pos-backend` (and any other processes) as online.

---

## 7. Maintenance Notes

- Pull updates: `git pull` in `/var/www/itnvend`, reinstall if lockfiles changed, rebuild both frontends, then `pm2 restart pos-backend`.  
- Backup strategy: schedule backups for `POS/Backend/database.db` (if using SQLite) and `POS/Backend/public/images`.  
- Logs: view backend logs with `pm2 logs pos-backend`, Nginx access/error logs under `/var/log/nginx`.
