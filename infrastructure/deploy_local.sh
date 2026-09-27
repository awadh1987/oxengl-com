#!/bin/bash
set -e

echo "🚀 Starting local zero-downtime deployment for OxenGL..."
#!/bin/bash
set -e
echo "🚀 Starting local zero-downtime deployment for OxenGL..."
# 1. Pull the latest code from GitHub
git pull origin main

# 2. Build Frontend Assets
echo "�� Building frontend production bundle..."
cd frontend
rm -rf dist node_modules/.vite
npm install
npm run build
cd ..

# 3. Run Type Checking and Sanity Checks
echo "🔍 Running static type check and migration sanity checks..."
npx tsc --noEmit
python3 scripts/migration_sanity_check.py

# 4. Sync Distribution Files to Nginx Web Root
echo "🌐 Syncing production assets to Nginx..."
sudo cp -r frontend/dist/* /var/www/oxengl/dist/

# 5. Reload Nginx and Restart the Backend Service
echo "🔄 Reloading Nginx and restarting backend service..."
sudo systemctl reload nginx
sudo systemctl restart oxengl.service

echo "✅ Deployment completed successfully!"
