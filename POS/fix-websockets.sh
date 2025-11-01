#!/bin/bash
# Fix WebSocket connections for ITnVend deployment

echo "🔧 Fixing WebSocket configuration..."

# Backup current nginx configs
sudo cp /etc/nginx/sites-available/estore.itnvend.com /etc/nginx/sites-available/estore.itnvend.com.backup
sudo cp /etc/nginx/sites-available/pos.itnvend.com /etc/nginx/sites-available/pos.itnvend.com.backup

# Update estore config
sudo tee /etc/nginx/sites-available/estore.itnvend.com > /dev/null <<EOF
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
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Update POS config
sudo tee /etc/nginx/sites-available/pos.itnvend.com > /dev/null <<EOF
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
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Test and reload nginx
sudo nginx -t
if [ $? -eq 0 ]; then
    sudo systemctl reload nginx
    echo "✅ Nginx configuration updated and reloaded!"
    echo "🔄 WebSocket connections should now work."
    echo "🌐 Test: Visit your site and check browser console for WebSocket connection."
else
    echo "❌ Nginx configuration test failed. Restoring backups..."
    sudo cp /etc/nginx/sites-available/estore.itnvend.com.backup /etc/nginx/sites-available/estore.itnvend.com
    sudo cp /etc/nginx/sites-available/pos.itnvend.com.backup /etc/nginx/sites-available/pos.itnvend.com
    sudo systemctl reload nginx
fi