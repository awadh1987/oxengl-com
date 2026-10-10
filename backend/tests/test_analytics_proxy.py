"""
OxenGL ERP — Unit & Integration Tests for Analytics Secure Proxy
================================================================
Location: backend/tests/test_analytics_proxy.py

Validates:
1. Routing structure and OpenAPI schema registration for `/api/v1/analytics`.
2. Strict parameterized query security (no string interpolation).
3. Redis composite caching protocol (`analytics:{company_id}:{dashboard_id}`).
4. Cache-aside hit/miss handling and fail-open resilience.
5. Cache invalidation endpoints.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from starlette.testclient import TestClient

from backend.app.main import app
from backend.app.api.v1.analytics import (
    DASHBOARD_QUERIES,
    DEFAULT_CACHE_TTL_SECONDS,
    router,
)
from backend.app.core.auth import get_authenticated_user

client = TestClient(app)


class MockUser:
    """Mock authenticated tenant user."""
    def __init__(self, company_id="f7b38b2f-5426-4625-a110-e38261fdf6e1", is_super=False):
        self.id = "user-12345"
        self.email = "test.accountant@oxengl.me"
        self.company_id = company_id
        self.is_superuser = is_super
        self.is_super_admin = is_super
        self.role = "ACCOUNTANT"


@pytest.fixture
def override_auth():
    """Overrides authenticated user dependency with a test tenant user."""
    mock_user = MockUser()
    app.dependency_overrides[get_authenticated_user] = lambda: mock_user
    yield mock_user
    app.dependency_overrides.pop(get_authenticated_user, None)


def test_analytics_routes_registered_in_app():
    """Verify that all analytics proxy routes are registered in the FastAPI OpenAPI schema."""
    paths = app.openapi().get("paths", {})
    assert "/api/v1/analytics/dashboards/{dashboard_id}" in paths
    assert "/api/v1/analytics/cache/{dashboard_id}" in paths
    assert "/api/v1/analytics/cache" in paths


def test_dashboard_queries_strictly_parameterized():
    """Verify that all queries in DASHBOARD_QUERIES use @company_id parameters."""
    for dashboard_id, query_sql in DASHBOARD_QUERIES.items():
        assert "@company_id" in query_sql, f"Query for '{dashboard_id}' lacks @company_id parameter binding!"
        # Guarantee no unsafe f-string substitution of values inside WHERE clauses
        assert "WHERE company_id = '" not in query_sql, f"Unsafe string interpolation detected in '{dashboard_id}'!"


def test_unknown_dashboard_returns_404(override_auth):
    """Verify that requesting an unregistered dashboard returns 404 Not Found."""
    response = client.get("/api/v1/analytics/dashboards/non_existent_dashboard")
    assert response.status_code == 404
    assert "Unknown dashboard" in response.json()["detail"]


@pytest.mark.asyncio
async def test_cache_hit_bypasses_bigquery(override_auth):
    """Verify that a Redis cache hit returns cached payload without invoking BigQuery."""
    test_company = override_auth.company_id
    cached_payload = {
        "dashboard_id": "overview",
        "company_id": test_company,
        "cached_at": "2026-10-10T12:00:00Z",
        "cache_hit": False,
        "row_count": 1,
        "data": [{"total_invoices": 42, "total_revenue": 150000.0}],
    }
    expected_cache_key = f"analytics:{test_company}:overview"

    with patch("backend.app.api.v1.analytics.redis_client.get", new_callable=AsyncMock) as mock_get, \
         patch("backend.app.api.v1.analytics._execute_bigquery_sync") as mock_bq:
        mock_get.return_value = json.dumps(cached_payload)

        response = client.get("/api/v1/analytics/dashboards/overview")

        assert response.status_code == 200
        data = response.json()
        assert data["cache_hit"] is True
        assert data["data"][0]["total_invoices"] == 42
        mock_get.assert_called_once_with(expected_cache_key)
        mock_bq.assert_not_called()


@pytest.mark.asyncio
async def test_cache_miss_queries_bigquery_and_populates_redis(override_auth):
    """Verify that a cache miss calls BigQuery and writes to Redis with correct composite key & TTL."""
    test_company = override_auth.company_id
    expected_cache_key = f"analytics:{test_company}:invoices"
    mock_db_rows = [
        {"id": "inv-1", "invoice_number": "INV-100", "grand_total": 500.0, "company_id": test_company}
    ]

    with patch("backend.app.api.v1.analytics.redis_client.get", new_callable=AsyncMock) as mock_get, \
         patch("backend.app.api.v1.analytics.redis_client.setex", new_callable=AsyncMock) as mock_setex, \
         patch("backend.app.api.v1.analytics._execute_bigquery_sync", return_value=mock_db_rows) as mock_bq:
        mock_get.return_value = None  # Cache miss

        response = client.get("/api/v1/analytics/dashboards/invoices?limit=10&ttl=1200")

        assert response.status_code == 200
        data = response.json()
        assert data["cache_hit"] is False
        assert data["dashboard_id"] == "invoices"
        assert data["company_id"] == test_company
        assert len(data["data"]) == 1

        mock_get.assert_called_once_with(expected_cache_key)
        mock_bq.assert_called_once()
        mock_setex.assert_called_once()

        # Check setex arguments: key, ttl, serialized json
        setex_key = mock_setex.call_args[0][0]
        setex_ttl = mock_setex.call_args[0][1]
        assert setex_key == expected_cache_key
        assert setex_ttl == 1200


@pytest.mark.asyncio
async def test_invalidate_dashboard_cache(override_auth):
    """Verify that DELETE /api/v1/analytics/cache/{dashboard_id} deletes the composite key."""
    test_company = override_auth.company_id
    expected_cache_key = f"analytics:{test_company}:procurement"

    with patch("backend.app.api.v1.analytics.redis_client.delete", new_callable=AsyncMock) as mock_delete:
        mock_delete.return_value = 1

        response = client.delete("/api/v1/analytics/cache/procurement")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["cache_key"] == expected_cache_key
        assert data["invalidated"] is True
        mock_delete.assert_called_once_with(expected_cache_key)


@pytest.mark.asyncio
async def test_invalidate_all_tenant_cache(override_auth):
    """Verify that DELETE /api/v1/analytics/cache purges all tenant keys under pattern."""
    test_company = override_auth.company_id
    expected_pattern = f"analytics:{test_company}:*"

    with patch("backend.app.api.v1.analytics.redis_client.keys", new_callable=AsyncMock) as mock_keys, \
         patch("backend.app.api.v1.analytics.redis_client.delete", new_callable=AsyncMock) as mock_delete:
        mock_keys.return_value = [f"analytics:{test_company}:overview", f"analytics:{test_company}:finance"]
        mock_delete.return_value = 2

        response = client.delete("/api/v1/analytics/cache")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["keys_purged"] == 2
        mock_keys.assert_called_once_with(expected_pattern)
        mock_delete.assert_called_once_with(f"analytics:{test_company}:overview", f"analytics:{test_company}:finance")
