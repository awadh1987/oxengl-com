# OxenGL Phase 2 Blueprint: Nginx Automation & 1,000-Vehicle GPS Telemetry Load Simulator
**Objective:** Automate production HTTPS proxy deployment with automated Let's Encrypt certificate fetching, and stress-test the live HTML5 Canvas radar map by pumping 1,000 concurrent vehicle coordinates over loopback.

---

## ASSET A: AUTOMATED HTTPS GATEWAY PROVISIONER (`scripts/deploy_secure_nginx.sh`)
This shell script updates your local Nginx packages, requests SSL certifications via Certbot using non-interactive parameters, maps traffic streams, and reloads system web daemons automatically [fastapi.tiangolo.com].

```bash
#!/usr/bin/env bash
set -eo pipefail

DOMAIN="://oxengl.com" # Replace with your definitive domain name
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
```

---

## ASSET B: 1,000 CONCURRENT GPS TELEMETRY PUMPER (`scripts/stress_test_1000_gps.py`)
This script uses asynchronous task execution layers to flood the ingestion route with 1,000 parallel vehicle coordinates [fastapi.tiangolo.com]. This load simulates high-concurrency fleet conditions to test your HTML5 Canvas frame rate efficiency live.

```python
import asyncio
import json
import random
import time
import sys
from typing import List

try:
    import httpx
except ImportError:
    print("Missing network dependencies wrapper. Run: pip install httpx")
    sys.exit(1)

URL = "http://127.0.0"
TENANT_ID = "fc04f267-47ac-4bb4-bcd3-285425c4df69"  # Matching our active seeded tenant UUID
TRIP_ID = "11111111-1111-1111-1111-111111111111"
TOTAL_VEHICLES = 1000

async def transmit_single_gps_ping(client: httpx.AsyncClient, vehicle_index: int) -> int:
    """Dispatches a mock geospatial location packet over the REST gateway."""
    payload = {
        "vehicle_id": f"00000000-0000-0000-0000-00000000{vehicle_index:04d}",
        "tenant_id": TENANT_ID,
        "trip_id": TRIP_ID,
        "latitude": 15.3562 + random.uniform(-0.15, 0.15),
        "longitude": 44.2081 + random.uniform(-0.15, 0.15),
        "speed": random.uniform(20.0, 110.0)
    }
    try:
        response = await client.post(URL, json=payload, timeout=2.0)
        return response.status_code
    except Exception:
        return 500

async def run_high_concurrency_stress():
    print(f"\033[1m=== Starting 1,000 Vehicle GPS Telemetry Concurrency Stress Test ===\033[0m")
    print(f"[STRESS] Pumping {TOTAL_VEHICLES} parallel telemetry packets across async HTTP connections...")
    
    # Configure an accelerated connection limit map pool to manage outbound bursts
    limits = httpx.Limits(max_keepalive_connections=200, max_connections=1200)
    async with httpx.AsyncClient(limits=limits) as client:
        start_wall_time = time.perf_counter()
        
        # Fire 1,000 non-blocking network calls concurrently via asyncio gather bindings
        tasks = [transmit_single_gps_ping(client, i) for i in range(1, TOTAL_VEHICLES + 1)]
        status_codes = await asyncio.gather(*tasks)
        
        total_duration_ms = (time.perf_counter() - start_wall_time) * 1000
        avg_latency = total_duration_ms / TOTAL_VEHICLES

        print("\n\033[1m=== Live Telemetry Load Simulation Metrics ===\033[0m")
        print(f"Total Requests Dispatched:      {TOTAL_VEHICLES}")
        print(f"Successful HTTP 200 Responses:  \033[92m{status_codes.count(200)}\033[0m")
        print(f"Connection Failures / Drops:    {status_codes.count(500)}")
        print(f"Total Cluster Wall-Clock Time:  {total_duration_ms:.2f} ms")
        print(f"Average Request Ingestion SLA:  {avg_latency:.2f} ms per vehicle")

if __name__ == "__main__":
    asyncio.run(run_high_concurrency_stress())
```

# Instructions
Read and parse the script automation specifications saved at `docs/blueprints/nginx_and_telemetry_load_script.md`.

# Sub-Tasks
1. NGINX SCRIPT: Write the code from Asset A to `scripts/deploy_secure_nginx.sh`. Grant execution rights: `chmod +x scripts/deploy_secure_nginx.sh`. Add it to git tracking.
2. STRESS SCRIPT: Write the code from Asset B to `scripts/stress_test_1000_gps.py`. Run it via `python3 scripts/stress_test_1000_gps.py`.
3. VALIDATION: Run our custom path validator tool: `python3 scripts/migration_sanity_check.py`.

Print out the final 1,000 vehicle canvas telemetry load counts and ingestion duration metrics logs.
