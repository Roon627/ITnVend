#!/bin/bash
# Deploy script for pos.itnvend.com (admin-only POS system)

set -e

echo "🚀 Deploying ITnVend POS System..."

# Pull latest changes
git pull origin main

# Install/update dependencies
cd Frontend
npm install

# Build for POS (admin-only mode)
VITE_ONLY_ADMIN=1 npm run build

# Copy build to web root
sudo cp -r dist-admin/* /var/www/pos.itnvend.com/html/

# Copy/update environment file
sudo cp ../.env /var/www/ITnVend/

# Set proper permissions for image uploads
sudo chown -R www-data:www-data /var/www/ITnVend/Backend/public
sudo chmod -R 755 /var/www/ITnVend/Backend/public

# Restart services
sudo systemctl restart nginx
sudo systemctl restart itnvend-backend

echo "✅ POS System deployed successfully!"
echo "🌐 Visit: https://pos.itnvend.com"