#!/usr/bin/env bash
set -eo pipefail

DOMAIN="oxengl.com" # Replace with your definitive domain name
EMAIL="admin@oxengl.com"
CONF_PATH="/etc/nginx/sites-available/oxengl"

echo -e "\033[1m=== Initializing Automated HTTPS Nginx Gateway Deployment ===\033[0m"

# 1. Install Certbot and its automated Nginx routing module dependency wrapper
apt-get update && apt-get install -y certbot python3-certbot-nginx nginx

# 2. Copy production configuration matrix file into Nginx available sites layout
cp infrastructure/nginx/oxengl.conf "${CONF_PATH}"

# 3. Enable site binding and clear default server index links
ln -sfn "${CONF_PATH}" /etc/nginx/sites-enabled/oxengl
rm -f /etc/nginx/sites-enabled/default || true

# 4. Trigger non-interactive Certbot certificate acquisition loop
echo -e "[NGINX] Requesting live SSL certificates from Let's Encrypt..."
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect

# 5. Execute structural config syntax safety check loop before applying commits
if nginx -t; then
    echo -e "\033[92m[SUCCESS]\033[0m Re-loading Nginx proxy gateway container mesh..."
    systemctl reload nginx
    systemctl restart certbot.timer
else
    echo -e "\033[91m[CRITICAL ALERT]\033[0m Nginx syntax check failed. Reverting changes."
    exit 1
fi
