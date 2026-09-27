import asyncio
import uuid
import random
import sys
from pathlib import Path
from datetime import datetime, timedelta
from decimal import Decimal

# Ensure repository root and venv site-packages are accessible
repo_root = Path(__file__).resolve().parent.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

venv_site = repo_root / "backend/.venv/lib/python3.12/site-packages"
if venv_site.exists() and str(venv_site) not in sys.path:
    sys.path.insert(0, str(venv_site))

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

    print(f"[DATA SEED] Commencing 6-month historical stock valuation data generation injection for tenant {tenant_id}...")
    
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
            await db.flush()  # type: ignore[misc]
            
    await db.commit()  # type: ignore[misc]
    print("[DATA SEED] Complete. 180 historical ledger entries successfully seeded into PostgreSQL.")
    db.close()

if __name__ == "__main__":
    asyncio.run(seed_historical_stock_ledger())
