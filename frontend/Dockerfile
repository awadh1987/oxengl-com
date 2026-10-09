# ==============================================================================
# Multi-Stage Dockerfile for OxenGL React Frontend
# Stage 1: Build the static bundle using Node.js
# Stage 2: Serve the production distribution via high-performance Nginx
# ==============================================================================

# Stage 1: Build Environment
FROM docker.io/library/node:20-alpine AS builder

WORKDIR /app

# Ensure Node memory is bounded to prevent OOM spikes on 2GB host
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Install dependencies using cache mounts where supported
COPY package*.json ./
RUN npm ci || npm install

# Copy application source code
COPY . .

# Build production bundle
RUN ulimit -n 65535 2>/dev/null || true; npm run build

# Stage 2: Production Nginx Server
FROM docker.io/library/nginx:1.25-alpine AS production

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration for SPA routing & API proxying
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Built-in lightweight healthcheck
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
