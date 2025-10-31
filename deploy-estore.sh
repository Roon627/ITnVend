#!/bin/bash
# Deploy script for estore.itnvend.com (public website + admin access)

set -e

echo "🚀 Deploying ITnVend E-Store..."

# Pull latest changes
git pull origin main

# Install/update dependencies
cd Frontend
npm install

# Build for estore (normal mode - includes public routes)
npm run build

# Copy build to web root
sudo cp -r dist/* /var/www/estore.itnvend.com/html/

# Copy/update environment file
sudo cp ../.env /var/www/ITnVend/

# Set proper permissions for image uploads
sudo chown -R www-data:www-data /var/www/ITnVend/Backend/public
sudo chmod -R 755 /var/www/ITnVend/Backend/public

# Restart services
sudo systemctl restart nginx
sudo systemctl restart itnvend-backend

echo "✅ E-Store deployed successfully!"
echo "🌐 Visit: https://estore.itnvend.com"