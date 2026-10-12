import asyncio
import json
import random
import time
import sys
from pathlib import Path
from typing import List

# Ensure virtualenv site-packages are accessible when run via host python3
venv_site = Path(__file__).resolve().parent.parent / "backend/.venv/lib/python3.12/site-packages"
if venv_site.exists() and str(venv_site) not in sys.path:
    sys.path.insert(0, str(venv_site))

try:
    import httpx
except ImportError:
    print("Missing network dependencies wrapper. Run: pip install httpx")
    sys.exit(1)

URL = "http://127.0.0.1:8000/api/v1/logistics/telemetry/ping"
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
        response = await client.post(URL, json=payload, timeout=30.0)
        return response.status_code
    except Exception:
        return 500

async def run_high_concurrency_stress():
    print(f"\033[1m=== Starting 1,000 Vehicle GPS Telemetry Concurrency Stress Test ===\033[0m")
    print(f"[STRESS] Pumping {TOTAL_VEHICLES} parallel telemetry packets across async HTTP connections...")
    
    # Configure an accelerated connection limit map pool to manage outbound bursts
    limits = httpx.Limits(max_keepalive_connections=500, max_connections=1500)
    timeout = httpx.Timeout(30.0, connect=15.0)
    async with httpx.AsyncClient(limits=limits, timeout=timeout) as client:
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
