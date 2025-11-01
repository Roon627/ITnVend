# ITnVend Fresh Deployment Checklist

## Pre-Deployment Setup

### 1. Server Preparation
- [ ] Ubuntu 22.04+ server with sudo access
- [ ] Git installed: `sudo apt update && sudo apt install git`
- [ ] Node.js 22+ installed
- [ ] Nginx installed: `sudo apt install nginx`
- [ ] PM2 installed: `sudo npm install -g pm2`
- [ ] Redis installed: `sudo apt install redis-server`

### 2. Domain Configuration
- [ ] DNS A records pointing to server IP:
  - `estore.itnvend.com` → your-server-ip
  - `pos.itnvend.com` → your-server-ip
- [ ] SSL certificates (Let's Encrypt recommended)

### 3. Directory Structure
```bash
sudo mkdir -p /var/www/ITnVend/Backend/public/images
sudo mkdir -p /var/www/estore.itnvend.com/html
sudo mkdir -p /var/www/pos.itnvend.com/html
sudo chown -R $USER:$USER /var/www
sudo chown -R www-data:www-data /var/www/ITnVend/Backend/public
sudo chmod -R 755 /var/www/ITnVend/Backend/public
```

## Deployment Steps

### 1. Clone Repository
```bash
cd /var/www
git clone https://github.com/Roon627/ITnVend.git
cd ITnVend
```

### 2. Backend Setup
```bash
cd Backend
npm install

# Copy environment file
cp ../.env .env
# Edit .env with your actual values:
# - FRONTEND_URL=https://estore.itnvend.com (for password reset links)
# - REDIS_URL=redis://localhost:6379
# - PORT=4000
# - NODE_ENV=production

# Start backend with PM2
pm2 start index.js --name "itnvend-backend"
pm2 save
pm2 startup
```

### 3. Deploy E-Store (estore.itnvend.com)
```bash
chmod +x deploy-estore.sh
./deploy-estore.sh
```

### 4. Deploy POS (pos.itnvend.com)
```bash
chmod +x deploy-pos.sh
./deploy-pos.sh
```

### 5. Nginx Configuration
Create `/etc/nginx/sites-available/estore.itnvend.com`:
```nginx
server {
    listen 80;
    server_name estore.itnvend.com;

    root /var/www/estore.itnvend.com/html;
    index index.html;

    # Serve uploaded images
    location /uploads/ {
        alias /var/www/ITnVend/Backend/public/images/;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Handle WebSocket connections
    location /socket.io/ {
        proxy_pass http://localhost:4000;
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

    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Create `/etc/nginx/sites-available/pos.itnvend.com`:
```nginx
server {
    listen 80;
    server_name pos.itnvend.com;

    root /var/www/pos.itnvend.com/html;
    index index.html;

    # Serve uploaded images
    location /uploads/ {
        alias /var/www/ITnVend/Backend/public/images/;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Redirect root to /admin for POS
    location = / {
        return 302 /admin;
    }

    # Handle WebSocket connections
    location /socket.io/ {
        proxy_pass http://localhost:4000;
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

    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable sites and restart nginx:
```bash
sudo ln -s /etc/nginx/sites-available/estore.itnvend.com /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/pos.itnvend.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Post-Deployment

### 1. SSL Setup (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d estore.itnvend.com -d pos.itnvend.com
```

### 2. Initial Configuration
- [ ] Visit https://pos.itnvend.com
- [ ] Create admin account
- [ ] Configure email settings in Settings
- [ ] Set up products and categories

### 3. Testing
- [ ] E-Store: https://estore.itnvend.com (public website)
- [ ] POS System: https://pos.itnvend.com (admin login required)
- [ ] Password reset functionality
- [ ] Email notifications

## Environment Variables Reference

### Backend (.env)
```
FRONTEND_URL=https://estore.itnvend.com
JWT_SECRET=your-secure-jwt-secret
REDIS_URL=redis://localhost:6379
DATABASE_PATH=./database.db
```

### Frontend Build (environment variables)
- `VITE_API_BASE`: API endpoint (set in nginx proxy)
- `VITE_ONLY_ADMIN`: Set to '1' for POS-only build

## Troubleshooting

### Common Issues:
1. **Build fails**: Ensure Node.js 22+ and npm are installed
2. **API not working**: Check backend is running on port 4000
3. **WebSocket issues**: Verify Redis is running and Nginx is proxying `/socket.io/`
4. **Email not sending**: Configure SMTP in Settings UI

### WebSocket Connection Issues:
If you see "realtime disconnected":
1. **Check Nginx configuration**: Ensure `/socket.io/` location block is present
2. **Verify backend logs**: Look for "WebSocket server ready" and connection messages
3. **Check Redis**: WebSocket service requires Redis for pub/sub
4. **Browser console**: Check for WebSocket connection errors
5. **Firewall**: Ensure port 4000 is accessible internally

### Logs:
```bash
# Backend logs
pm2 logs itnvend-backend

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Check WebSocket connections
curl -I http://localhost:4000/socket.io/
```