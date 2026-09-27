import sys
from pathlib import Path

# Ensure project virtualenv packages are accessible when run via system python3
venv_site = Path(__file__).resolve().parent.parent / "backend/.venv/lib/python3.12/site-packages"
if venv_site.exists() and str(venv_site) not in sys.path:
    sys.path.insert(0, str(venv_site))

import asyncio, json, random, httpx

URL = "http://localhost:8000/api/v1/logistics/telemetry/ping"
VEHICLES_COUNT = 100 # Simulates a massive active fleet array

async def ping_vehicle_gps(client: httpx.AsyncClient, v_idx: int):
    payload = {
        "vehicle_id": f"00000000-0000-0000-0000-00000000{v_idx:04d}",
        "tenant_id": "f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c",
        "trip_id": "11111111-1111-1111-1111-111111111111",
        "latitude": 15.3562 + random.uniform(-0.1, 0.1),
        "longitude": 44.2081 + random.uniform(-0.1, 0.1),
        "speed": random.uniform(40.0, 95.0)
    }
    try:
        res = await client.post(URL, json=payload)
        return res.status_code
    except Exception: return 500

async def main():
    async with httpx.AsyncClient() as client:
        print(f"[TELEMETRY] Pumping {VEHICLES_COUNT} concurrent GPS pings into service loop...")
        start = asyncio.get_event_loop().time()
        results = await asyncio.gather(*(ping_vehicle_gps(client, i) for i in range(VEHICLES_COUNT)))
        duration = (asyncio.get_event_loop().time() - start) * 1000
        print(f"[TELEMETRY] Complete. Duration: {duration:.2f}ms | Total Status 200 OK: {results.count(200)}")

if __name__ == "__main__":
    asyncio.run(main())
