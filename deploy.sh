#!/usr/bin/env bash
# ==============================================================================
# OxenGL Production Deployment & VPS Storage Cleanup Script
# Target: Hostinger VPS (Resource & Storage Constrained)
# ==============================================================================

set -euo pipefail

echo "=========================================="
echo " Starting OxenGL Production Deployment"
echo " Time: $(date -u '+%Y-%m-%d %H:%M:%SZ')"
echo "=========================================="

# 1. Pull latest code from main branch
echo "[1/4] Pulling latest code from origin/main..."
git pull origin main

# 2. Build and restart services in detached mode
echo "[2/4] Building and launching containers via Docker Compose..."
docker compose up -d --build

# 3. Aggressive cleanup of unused images to preserve VPS disk space
echo "[3/4] Pruning unused Docker images..."
docker image prune -a -f

# 4. Aggressive cleanup of Docker build cache to preserve VPS disk space
echo "[4/4] Pruning Docker build cache..."
docker builder prune -a -f

echo "=========================================="
echo " OxenGL Deployment & Cleanup Complete!"
echo "=========================================="
