#!/usr/bin/env bash
# ==============================================================================
# OxenGL Production Stack Deployment Script
# Gracefully stops running containers, rebuilds multi-stage images, and launches
# ==============================================================================
set -e

echo "Deploying OxenGL Production Stack..."

# Gracefully stop any currently running containers
docker-compose down

# Compile multi-stage images and launch production stack in detached mode
docker-compose up -d --build

# Display active container health status
docker-compose ps
