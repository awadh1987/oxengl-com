# OxenGL Production Blueprint: Nginx Reverse Proxy & Let's Encrypt SSL
**Target Role:** DevSecOps Architect, Site Reliability Engineer, Network Administrator
**Objective:** Secure exposed cloud server ports (3000, 8000), establish a unified gateway, enforce modern TLS 1.3 encryption, and support persistent real-time WebSocket connection loops.

---

## 1. TRAFFIC FLOW ARCHITECTURE

[ Inbound HTTPS Client Traffic (Port 443) ]│▼[ Nginx Reverse Proxy Gateway ]│┌──────────────┴──────────────┐▼ (Port 3000 / Next.js)       ▼ (Port 8000 / FastAPI)[ Frontend Portal Content ]   [ Backend REST / WebSocket Stream ]
---

## 2. PRODUCTION NGINX CONFIGURATION (`infrastructure/nginx/oxengl.conf`)
Create the configuration profile to handle proxy routing mappings and WebSocket connection protocol upgrades:

```nginx
# Upstream routing definitions to internal cluster entry ports
upstream oxengl_frontend {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream oxengl_backend {
    server 127.0.0.1:8000;
    keepalive 32;
}

# 1. Global HTTP enforcement loop - Force rewrite to secure HTTPS channel
server {
    listen 80;
    listen [::]:80;
    server_name ://oxengl.com; # Replace with your definitive domain token name

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://hostrequest_uri;
    }
}

# 2. Hardened HTTPS Gateway Server Context Frame
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ://oxengl.com; # Replace with your definitive domain token name

    # Let's Encrypt SSL Certificate Chain Slashing Paths (Populated automatically by Certbot)
    ssl_certificate /etc/letsencrypt/live/://oxengl.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/://oxengl.com/privkey.pem;

    # Modern Cryptographic Cipher Isolation (Strict OWASP/Mozilla Compliance)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';

    # Session Optimization Parameters
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # Enterprise Protection Headers Security Layer
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline' 'unsafe-eval' ws: wss:;" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Global Buffer Limits mapping to manage large payload scanning
    client_max_body_size 50M;

    # A. ROUTE CONTROLLER: Frontend UI Portal Mapping
    location / {
        proxy_pass http://oxengl_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # B. ROUTE CONTROLLER: Backend Async REST API Mapping
    location /api/v1/ {
        proxy_pass http://oxengl_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # C. ROUTE CONTROLLER: Interactive Docs Mapping
    location ~ ^/(docs|redoc|openapi.json) {
        proxy_pass http://oxengl_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # D. ROUTE CONTROLLER: Asynchronous WebSocket Telemetry Stream Proxy
    location /api/v1/logistics/ws/ {
        proxy_pass http://oxengl_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s; # Persistent channel duration limit (24 hours)
        proxy_send_timeout 86400s;
    }
}
```

# Instructions
Read and parse the network upgrade architecture blueprint saved at `docs/blueprints/nginx_reverse_proxy.md`.

# Sub-Tasks
1. Create the directory tree configuration folder path if it is missing: `infrastructure/nginx/`.
2. Generate the detailed production-ready configuration code inside `infrastructure/nginx/oxengl.conf`.
3. Add the configuration file safely into our Git index tracking database pool area: `git add infrastructure/nginx/oxengl.conf`.
4. Run our platform layout validator module utility script: `python3 scripts/migration_sanity_check.py`.

Print the final file paths and verification confirmation metrics logs.

