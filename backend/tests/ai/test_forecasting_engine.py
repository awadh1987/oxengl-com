import uuid
from datetime import datetime, timedelta
from unittest.mock import MagicMock
import pytest
from starlette.testclient import TestClient

from backend.app.main import app
from backend.app.domains.ai.services import AIExecutiveForecastingEngine
from backend.app.security.abac import ABACUserContext

client = TestClient(app)


class MockStockRecord:
    def __init__(self, total_value, created_at):
        self.total_value = total_value
        self.created_at = created_at


def test_linear_regression_five_data_points():
    """Unit test validating least-squares slope and intercept with 5 historical data points."""
    # 5 chronological day offsets: Days 0, 1, 2, 3, 4
    x = [0.0, 1.0, 2.0, 3.0, 4.0]
    # Linear progression: y = 25.0 * x + 150.0
    y = [150.0, 175.0, 200.0, 225.0, 250.0]

    slope, intercept = AIExecutiveForecastingEngine.calculate_linear_regression(x, y)

    assert pytest.approx(slope, rel=1e-4) == 25.0
    assert pytest.approx(intercept, rel=1e-4) == 150.0


@pytest.mark.asyncio
async def test_project_30day_inventory_value_simulation():
    """Simulates 5 historical stock points and verifies the 30-day projection calculation."""
    tenant_id = uuid.uuid4()
    base_time = datetime(2026, 1, 1, 12, 0, 0)
    
    # 5 historical inventory points spaced 7 days apart with steady $500/week growth
    mock_records = [
        MockStockRecord(total_value=10000.0 + (i * 500.0), created_at=base_time + timedelta(days=i * 7))
        for i in range(5)
    ]

    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.fetchall.return_value = mock_records
    mock_db.execute.return_value = mock_res

    res = await AIExecutiveForecastingEngine.project_30day_inventory_value(mock_db, tenant_id)

    assert res["status"] in ("DATA_SYNCHRONIZED", "SUCCESS")
    assert res["current_value"] == 12000.0
    # Slope per day: 500 / 7 ≈ 71.4286
    expected_slope = 500.0 / 7.0
    assert pytest.approx(res["calculated_slope"], rel=1e-2) == round(expected_slope, 4)
    
    # Day 28 + 30 = Day 58. Projected: 10000 + 58 * (500/7) = 14142.86
    expected_30d = 10000.0 + (58 * expected_slope)
    assert pytest.approx(res["projected_value_30d"], rel=1e-2) == round(expected_30d, 2)
    assert res["confidence_metric"] == 0.88


def test_forecasting_inventory_requires_authentication():
    assert client.get("/api/v1/ai/forecasting/inventory").status_code == 401


def test_forecasting_inventory_endpoint(authed_tenant):
    """Validates HTTP GET /api/v1/ai/forecasting/inventory route response."""
    _, headers = authed_tenant
    response = client.get("/api/v1/ai/forecasting/inventory", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "projected_value_30d" in data
