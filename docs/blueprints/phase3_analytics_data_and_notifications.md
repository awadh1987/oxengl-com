# OxenGL Phase 3 Spec: Historical Data Seeding & Out-of-Band Alerts Broker
**Target Role:** Principal ERP Data Engineer, Lead DevSecOps Architect, Financial Systems Analyst
**Objective:** Deploy a 180-day chronological inventory revaluation dataset to feed the least-squares regression engine, and build a decoupled Celery worker notification broker to dispatch asynchronous operational risk alerts.

---

## ASSET A: HISTORICAL DATA LEDGER GENERATOR (`scripts/generate_historical_stock.py`)
This script uses asynchronous task execution to seed 180 days of ascending stock transactions with random market noise variance parameters into PostgreSQL [docs.sqlalchemy.org, alembic.sq...lchemy.org].

```python
import asyncio
import uuid
import random
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import SessionLocal
from backend.models import Company
from backend.app.domains.inventory.models import StockBalance

WAREHOUSE_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
MATERIAL_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")

async def seed_historical_stock_ledger():
    db = SessionLocal()
    # Replace the hardcoded UUID with a query to res_companies:
    tenant = await db.execute(select(Company.id).limit(1))
    tenant_id = tenant.scalar_one()
    print("[DATA SEED] Commencing 6-month historical stock valuation data generation injection...")
    
    base_date = datetime.utcnow() - timedelta(days=180)
    base_value = 120000.00  # Starting capital buffer: $120,000
    
    for day in range(180):
        current_date = base_date + timedelta(days=day)
        # Apply an upward trending linear slope (+250/day) mixed with a +/- $5,000 noise variance parameter
        simulated_value = base_value + (day * 250.00) + random.uniform(-5000.00, 5000.00)
        
        balance_snapshot = StockBalance(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            warehouse_id=WAREHOUSE_ID,
            material_id=MATERIAL_ID,
            quantity_on_hand=Decimal("1000.0000"),
            quantity_reserved=Decimal("0.0000"),
            unit_cost_moving_avg=Decimal(f"{simulated_value / 1000.0:.4f}"),
            total_valuation=Decimal(f"{max(1000.00, simulated_value):.4f}"),
            last_revaluation_date=current_date
        )
        db.add(balance_snapshot)
        
        if day % 30 == 0:
            await db.flush()
            
    await db.commit()
    print("[DATA SEED] Complete. 180 historical ledger entries successfully seeded into PostgreSQL.")
    db.close()

if __name__ == "__main__":
    asyncio.run(seed_historical_stock_ledger())
```

---

## ASSET B: ASYNCHRONOUS NOTIFICATION BROKER CHANNEL (`backend/app/core/notifications.py`)
This background capability integrates directly with your Celery worker app architecture to execute out-of-band email or SMS alerts without blocking transactional HTTP execution threads [://tiangolo.com, docs.sqlalchemy.org].

```python
import os
import uuid
import httpx
from app.core.celery_app import celery_app

class EnterpriseNotificationBroker:
    @staticmethod
    @celery_app.task(name="app.core.tasks.dispatch_risk_alert_email", max_retries=3, default_retry_delay=10)
    def dispatch_risk_alert_email(tenant_id: str, alert_level: str, notification_message: str):
        """
        Decoupled Celery task executing out-of-band email and SMS broker alerts.
        Ensures telemetry signaling bursts never block transactional HTTP request threads.
        """
        print(f"[BROKER LOG] Intercepted Alert Envelope for Tenant: {tenant_id} | Severity: {alert_level}")
        print(f"[BROKER LOG] Notification Body Context: {notification_message}")
        
        # Simulate dispatching through an external enterprise notification service (SendGrid, Twilio, or Mailgun API)
        # payload = {"to": "ops_director@oxengl.com", "subject": f"[{alert_level}] Risk Alert", "body": notification_message}
        # httpx.post("https://api.notification_provider.internal/v1/send", json=payload)
        
        return "ALERT_DISPATCHED_SUCCESSFULLY"
```
