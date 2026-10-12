# OxenGL Phase 2 Automation & Simulation Tests Spec
**Objective:** Programmatic stress testing of the Stripe webhook data pipeline and frontend HTML5 Canvas coordinate rendering under simulated high-concurrency loads.

---

## ASSET A: STRIPE WEBHOOK EVENT SIMULATOR (`scripts/simulate_stripe_webhook.py`)
```python
import httpx, asyncio, json, time

URL = "http://localhost:8000/api/v1/saas/webhooks/stripe"

async def fire_webhook_event():
    payload = {
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "customer": "cus_test_mock_oxengl_2026",
                "status": "past_due",
                "current_period_end": int(time.time() + 86400)
            }
        }
    }
    async with httpx.AsyncClient() as client:
        res = await client.post(URL, json=payload, headers={"X-Role": "ADMIN"})
        print(f"[STRIPE WEBHOOK] Response: {res.status_code} | Payload: {res.json()}")

if __name__ == "__main__":
    asyncio.run(fire_webhook_event())
```

---

## ASSET B: HIGH-CONCURRENCY TELEMETRY PACIFIER (`scripts/simulate_gps_stream.py`)
```python
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
```
