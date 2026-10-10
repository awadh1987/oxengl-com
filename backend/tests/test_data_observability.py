import pytest
from starlette.testclient import TestClient
from backend.app.main import app
from backend.app.api.v1.data_observability import (
    fetch_all_db_tables,
    build_evaluated_table_items,
    get_table_domain,
)

client = TestClient(app)

def test_fetch_all_db_tables_contains_all_tables():
    """Verify that fetch_all_db_tables retrieves >= 132 tables dynamically from erp_db."""
    tables = fetch_all_db_tables()
    assert len(tables) >= 132, f"Expected at least 132 tables in erp_db, got {len(tables)}"
    # Check core tables are included
    assert "res_companies" in tables
    assert "res_users" in tables
    assert "account_moves" in tables
    assert "customer_invoices" in tables
    assert "fleet_trips" in tables
    assert "inventory_movements" in tables
    assert "purchase_orders" in tables

def test_build_evaluated_table_items():
    """Verify that build_evaluated_table_items evaluates all tables and computes summary metadata."""
    tables, summary = build_evaluated_table_items()
    assert len(tables) >= 132
    assert summary["total_tables"] >= 132
    assert summary["total_tables_in_db"] >= 132
    assert summary["tables_evaluated"] >= 132
    assert summary["tables_with_data"] > 0
    assert summary["total_rows"] > 0
    assert summary["avg_quality_score"] > 0
    assert len(summary["domains"]) >= 8

def test_api_observability_summary_endpoint():
    """Verify GET /api/v1/data-observability/summary returns accurate metadata counts."""
    response = client.get("/api/v1/data-observability/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["total_tables"] >= 132
    assert data["tables_evaluated"] >= 132
    assert data["tables_with_data"] > 0
    assert data["total_rows"] > 0
    assert "total_flags" in data
    assert "domains" in data
    assert "compliance_checks" in data

def test_api_observability_tables_endpoint():
    """Verify GET /api/v1/data-observability/tables returns the full table list with metadata."""
    response = client.get("/api/v1/data-observability/tables")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 132
    assert data["total_tables_in_db"] >= 132
    assert len(data["tables"]) >= 132

    # Check structure of a table item
    first_tbl = data["tables"][0]
    assert "table_name" in first_tbl
    assert "domain" in first_tbl
    assert "domain_label" in first_tbl
    assert "row_count" in first_tbl
    assert "quality_score" in first_tbl
    assert "health_status" in first_tbl
    assert "column_count" in first_tbl

def test_api_observability_tables_filtering():
    """Verify domain and status filters work on /api/v1/data-observability/tables."""
    # Filter by domain
    res_fin = client.get("/api/v1/data-observability/tables?domain=finance")
    assert res_fin.status_code == 200
    fin_data = res_fin.json()
    assert all(t["domain"] == "finance" for t in fin_data["tables"])
    assert fin_data["total"] > 0

    # Search filter
    res_search = client.get("/api/v1/data-observability/tables?search=invoice")
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert all("invoice" in t["table_name"].lower() for t in search_data["tables"])
    assert search_data["total"] > 0

def test_api_observability_table_detail_endpoint():
    """Verify GET /api/v1/data-observability/tables/{table_name} for both profiled and unprofiled tables."""
    # Profiled table
    res1 = client.get("/api/v1/data-observability/tables/customer_invoices")
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["table_name"] == "customer_invoices"
    assert len(d1["columns"]) > 0

    # Table without a static profile file
    res2 = client.get("/api/v1/data-observability/tables/accounts")
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["table_name"] == "accounts"
    assert len(d2["columns"]) > 0

def test_domain_mapping_heuristics():
    """Verify domain mapping resolves sensibly."""
    assert get_table_domain("customer_invoices") == "finance"
    assert get_table_domain("fleet_trips") == "fleet"
    assert get_table_domain("purchase_orders") == "procurement"
    assert get_table_domain("employees") == "hr"
    assert get_table_domain("inventory_movements") == "inventory"
