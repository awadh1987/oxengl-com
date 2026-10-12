import sys
from pathlib import Path

# Ensure project virtualenv packages are accessible when run via system python3
venv_site = Path(__file__).resolve().parent.parent / "backend/.venv/lib/python3.12/site-packages"
if venv_site.exists() and str(venv_site) not in sys.path:
    sys.path.insert(0, str(venv_site))

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
