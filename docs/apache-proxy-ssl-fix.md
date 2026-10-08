# OxenGL Production Environment - Apache Proxy SSL Handshake Resolution Report

**Date:** October 3, 2026  
**Environment:** Production (`srv1874240.hstgr.cloud`)  
**Domain Affected:** `myon-contract.cloud` / `www.myon-contract.cloud`  
**Service:** Apache 2.4 Reverse Proxy (`apache2`)  
**Status:** Resolved & Operational (`200 OK`)

---

## 1. Executive Summary
When users navigated to `https://myon-contract.cloud`, Apache returned an HTTP `500 Proxy Error` with the explicit diagnostic detail:
`Reason: Error during SSL Handshake with remote server`.

The issue was diagnosed as an upstream protocol mismatch in the Apache SSL VirtualHost: Apache was instructed to negotiate TLS (`https://`) against host port `8080`, which is bound to the Nginx reverse proxy container (`oxengl_nginx_container`) serving plain HTTP.

By updating the proxy destination to plain HTTP (`http://127.0.0.1:8080/`) with WebSocket upgrade forwarding, testing configuration syntax, and gracefully reloading Apache, the error was completely resolved and full frontend/backend connectivity restored.

---

## 2. Root Cause Analysis (RCA)
1. **Upstream Architecture**:
   - Host `srv1874240` runs Apache 2.4 as the primary edge reverse proxy terminating public SSL via Let's Encrypt certificates.
   - The OxenGL container stack (`oxengl_nginx_container`, `oxengl_frontend_container`, `oxengl_backend_container`) runs under Podman.
   - `oxengl_nginx_container` maps:
     - Host port `8080` -> Container port `80` (Plain HTTP)
     - Host port `4433` -> Container port `443` (HTTPS with self-signed certificate)

2. **Faulty VirtualHost Directive**:
   - Inside `/etc/apache2/sites-available/myon-contract.cloud-le-ssl.conf`, the proxy directives were configured as:
     ```apache
     SSLProxyEngine on
     ProxyPreserveHost On
     ProxyPass / https://127.0.0.1:8080/
     ProxyPassReverse / https://127.0.0.1:8080/
     ```
   - Apache sent an SSL/TLS ClientHello handshake packet to port `8080`.
   - The upstream Nginx server expecting a plain HTTP request responded with standard HTTP data or an invalid TLS frame, causing Apache's `mod_proxy_http` to fail the handshake and terminate the client connection with HTTP 500.

---

## 3. Implementation & Resolution

### Step 1: VirtualHost Reconfiguration
Updated `/etc/apache2/sites-available/myon-contract.cloud-le-ssl.conf` to target plain HTTP on port `8080` with WebSocket upgrade tunneling:

```apache
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName myon-contract.cloud
    ServerAlias www.myon-contract.cloud

    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8080/ upgrade=websocket
    ProxyPassReverse / http://127.0.0.1:8080/

    ErrorLog ${APACHE_LOG_DIR}/myon-contract_error.log
    CustomLog ${APACHE_LOG_DIR}/myon-contract_access.log combined

    SSLCertificateFile /etc/letsencrypt/live/myon-contract.cloud/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/myon-contract.cloud/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
</IfModule>
```

### Step 2: Syntax Validation
Executed Apache configuration syntax test:
```bash
sudo /usr/sbin/apache2ctl configtest
```
**Result:** `Syntax OK`

### Step 3: Graceful Service Reload
Reloaded Apache without connection disruption:
```bash
sudo /usr/bin/systemctl reload apache2
```

### Step 4: Configuration Version Control
Archived active configuration in the OxenGL repository under `infrastructure/apache/`:
- `infrastructure/apache/myon-contract.cloud.conf`
- `infrastructure/apache/myon-contract.cloud-le-ssl.conf`

---

## 4. Verification Results

Tested edge SSL connectivity directly against Apache:
```bash
curl -k -s -i --resolve myon-contract.cloud:443:127.0.0.1 https://myon-contract.cloud/
```

**Response Header & Content Verification:**
```http
HTTP/1.1 200 OK
Date: Sat, 03 Oct 2026 17:45:25 GMT
Server: nginx
Content-Type: text/html
Content-Length: 2305
Vary: Accept-Encoding
Last-Modified: Sat, 03 Oct 2026 14:41:14 GMT
ETag: "6ac1140a-901"
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self' http: https: data: blob: 'unsafe-inline' 'unsafe-eval' ws: wss:;

<!doctype html>
<html lang="en">
  <head>
    <title>OxenGL Global Cloud ERP</title>
    ...
```

The domain `myon-contract.cloud` is now operating smoothly and serving the platform without SSL handshake errors.
