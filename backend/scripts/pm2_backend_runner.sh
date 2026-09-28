#!/usr/bin/env bash
# PM2 Backend Service Runner for OxenGL
# Manages oxengl_backend_container and streams logs into PM2

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Syncing backend files to oxengl_backend_container..."
docker cp /root/oxen-gl/backend/. oxengl_backend_container:/app/backend/ 2>/dev/null || true

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Restarting oxengl_backend_container..."
docker restart oxengl_backend_container

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Backend container active. Streaming logs to PM2..."
exec docker logs -f --tail 50 oxengl_backend_container
