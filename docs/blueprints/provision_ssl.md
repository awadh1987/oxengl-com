# OxenGL Certbot SSL Provisioning Commands Suite
**Objective:** Automate Let's Encrypt certificate acquisition to bind your server's public IP domain safely into the Nginx configuration gateway.

---

## 1. PRE-FLIGHT REQUISITES
Before deploying, ensure that your domain name (e.g., `erp.oxengl.com`) points directly to your cloud server's public IP address via your DNS provider settings (A Record).

## 2. PRODUCTION AUTOMATION RUNNER
```bash
# A. Install Certbot and the Nginx service plugin wrapper
apt-get update && apt-get install -y certbot python3-certbot-nginx

# B. Execute the interactive certificate validation loop
# (This auto-reads your oxengl.conf server block, requests keys, and wires the paths)
certbot --nginx -d erp.oxengl.com --non-interactive --agree-tos --m admin@oxengl.com

# C. Verify automated renewal cron timers are active inside systemd
systemctl status certbot.timer
```
