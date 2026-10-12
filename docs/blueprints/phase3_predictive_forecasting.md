# OxenGL Phase 3 Blueprint: Executive Predictive Analytics Engine
**Target Role:** Principal ERP Architect, Lead Data Scientist, Core Platform Engineer
**Objective:** Deploy an asynchronous mathematical pipeline to parse historical inventory ledgers and cost-center allocations to output rolling 30-day predictive trend vectors.

---

## 1. PREDICTIVE VALUATION LOGIC
The engine evaluates trend vectors using an asynchronous least-squares linear regression model to compute slope (m) and intercept (c) metrics based on historical time intervals:
\[\hat{y} = m \cdot x + c\]
- **Inventory Valuation Trend:** Scans historical `stock_balances` to calculate capital tied up in warehouses.
- **Cost Center Run-Rates:** Evaluates monthly `payroll_runs` and procurement invoices to predict cash outflows.

---

## 2. REPOSITORY CORE SERVICES (`backend/app/domains/ai/forecasting.py`)

Implement the asynchronous trend projection calculation layer using your database context [://tiangolo.com, docs.sqlalchemy.org]:

```python
import uuid
from decimal import Decimal
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.domains.inventory.models import StockBalance

class AIExecutiveForecastingEngine:
    @staticmethod
    def calculate_linear_regression(x: List[float], y: List[float]) -> tuple:
        """Computes slope and intercept over numerical time matrices vectors."""
        n = len(x)
        if n < 2:
            return 0.0, 0.0 if n == 0 else (y[0], 0.0)
        
        sum_x = sum(x)
        sum_y = sum(y)
        sum_xx = sum(i*i for i in x)
        sum_xy = sum(i*j for i, j in zip(x, y))
        
        denominator = (n * sum_xx) - (sum_x ** 2)
        if denominator == 0:
            return 0.0, sum_y / n
            
        slope = ((n * sum_xy) - (sum_x * sum_y)) / denominator
        intercept = (sum_y - (slope * sum_x)) / n
        return slope, intercept

    @classmethod
    async def project_30day_inventory_value(cls, db: AsyncSession, tenant_id: uuid.UUID) -> Dict[str, Any]:
        """Scans stock rows and generates a 30-day baseline capital allocation projection."""
        stmt = select(StockBalance.total_value, StockBalance.created_at).where(
            StockBalance.tenant_id == tenant_id
        ).order_by(StockBalance.created_at)
        
        res = await db.execute(stmt)
        records = res.fetchall()
        
        if len(records) < 2:
            return {"status": "INSUFFICIENT_DATA", "projected_value_30d": 0.0, "confidence": 0.0}

        # Normalize dates to chronological integer day offsets
        base_date = records[0].created_at
        x_days = [(r.created_at - base_date).days for r in records]
        y_values = [float(r.total_value) for r in records]
        
        slope, intercept = cls.calculate_linear_regression(x_days, y_values)
        
        # Project exactly 30 days into the future boundary matrix
        target_day = x_days[-1] + 30
        projected_value = max(0.0, (slope * target_day) + intercept)
        
        return {
            "status": "SUCCESS",
            "current_value": y_values[-1],
            "projected_value_30d": round(projected_value, 2),
            "calculated_slope": round(slope, 4),
            "confidence_metric": 0.88 if abs(slope) > 0 else 0.50
        }
```

---

## 3. ANALYTICS GATEWAY API CONTROLLERS (`backend/app/api/v1/ai.py`)

Append the secure forecasting endpoint to your active AI router [://tiangolo.com]:

```python
from app.domains.ai.forecasting import AIExecutiveForecastingEngine
from app.security.abac import ABACUserContext, get_current_user

@router.get("/forecasting/inventory", status_code=200)
async def get_predictive_inventory_trends(db: AsyncSession = Depends(get_db), current_user: ABACUserContext = Depends(get_current_user)):
    """Computes and exposes a rolling 30-day stock allocation value projection trend."""
    metrics = await AIExecutiveForecastingEngine.project_30day_inventory_value(
        db=db, tenant_id=current_user.tenant_id
    )
    return metrics
```
# Instructions
Read and parse the analytics forecasting specifications saved at `docs/blueprints/phase3_predictive_forecasting.md`.

# Sub-Tasks
1. BACKEND ENGINE: Append the `AIExecutiveForecastingEngine` class exactly as written into `backend/app/domains/ai/services.py`.
2. ROUTE MAP: Append the `/forecasting/inventory` GET route to your existing route handler at `backend/app/api/v1/ai.py`.
3. AUTOMATED TESTS: Write a validation unit test at `backend/tests/ai/test_forecasting_engine.py` simulating 5 historical data points and asserting slope correctness.
4. VERIFICATION: Execute our full test suite to guarantee zero regression breaks:
   `PYTHONPATH=.:backend backend/.venv/bin/pytest backend/tests/ -v`

Print out the final test pass metrics and confirmation logs.
