"""
Test Route Parity and PostgreSQL Persistence for Proxied Endpoints.
Verifies /api/tenant/planning/*, /api/tenant/control/*, and /api/master/platform/*
resolve to authoritative FastAPI routers and query PostgreSQL.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.database import SessionLocal
from backend.models import ResCompany, ResUser
from backend.tests.auth_helpers import platform_superadmin_headers, tenant_admin_headers

client = TestClient(app)


def _superadmin():
    db = SessionLocal()
    try:
        headers, user = platform_superadmin_headers(db)
        _created_admins.append(user.id)
        return headers
    finally:
        db.close()


def _tenant_headers(tenant_id):
    db = SessionLocal()
    try:
        return tenant_admin_headers(db, tenant_id)
    finally:
        db.close()


_created_admins = []


@pytest.fixture(autouse=True)
def _cleanup_admins():
    yield
    if _created_admins:
        db = SessionLocal()
        try:
            db.rollback()
            db.query(ResUser).filter(ResUser.id.in_(_created_admins)).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()
            _created_admins.clear()


@pytest.fixture
def sample_tenant():
    db = SessionLocal()
    try:
        tenant_id = uuid.uuid4()
        slug = f"parity-test-{tenant_id.hex[:6]}"
        company = ResCompany(
            id=tenant_id,
            name=f"Parity Test Company {tenant_id.hex[:4]}",
            slug=slug,
            domain_slug=slug,
            currency="SAR",
            tax_id=f"300{tenant_id.hex[:8]}",
            commercial_registration=f"101{tenant_id.hex[:7]}",
            is_active=True,
        )
        db.add(company)

        # Add a user to this company
        user = ResUser(
            id=uuid.uuid4(),
            firebase_uid=f"parity-user-{tenant_id.hex[:6]}",
            email=f"parity-{tenant_id.hex[:6]}@example.com",
            full_name="Parity Test User",
            company_id=tenant_id,
            role="Admin",
            is_active=True,
        )
        db.add(user)
        db.commit()

        yield {"id": str(tenant_id), "slug": slug, "company": company, "user": user}

        # Cleanup
        db.delete(user)
        db.delete(company)
        db.commit()
    finally:
        db.close()


def test_master_platform_health():
    """Verify /api/master/platform/health queries PostgreSQL and returns operational."""
    resp = client.get("/api/master/platform/health", headers=_superadmin())
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "operational"
    assert "api_latency_ms" in data
    assert data["infrastructure"]["database"] == "PostgreSQL 16 Multi-Tenant RLS L3"


def test_master_platform_tenants_and_flags():
    """Verify /api/master/platform/tenants lists registered tenants from PostgreSQL."""
    resp = client.get("/api/master/platform/tenants", headers=_superadmin())
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert isinstance(data["tenants"], list)

    # Feature flags
    resp_flags = client.get("/api/master/platform/feature-flags", headers=_superadmin())
    assert resp_flags.status_code == 200
    assert resp_flags.json()["success"] is True

    # Toggle flag
    resp_toggle = client.post(
        "/api/master/platform/feature-flags/toggle",
        json={"flag_key": "custom_domains_v2", "enabled": False},
        headers=_superadmin(),
    )
    assert resp_toggle.status_code == 200
    assert resp_toggle.json()["enabled"] is False


def test_tenant_control_team_and_settings(sample_tenant):
    """Verify /api/tenant/control endpoints read and write against PostgreSQL."""
    t_id = sample_tenant["id"]

    # 1. Team listing
    resp_team = client.get("/api/tenant/control/team", headers=_tenant_headers(t_id))
    assert resp_team.status_code == 200
    team_data = resp_team.json()
    assert team_data["success"] is True
    assert len(team_data["team"]) >= 1
    assert any(m["email"] == sample_tenant["user"].email for m in team_data["team"])

    # 2. Settings retrieval
    resp_settings = client.get("/api/tenant/control/settings", headers=_tenant_headers(t_id))
    assert resp_settings.status_code == 200
    settings_data = resp_settings.json()
    assert settings_data["success"] is True
    assert settings_data["settings"]["general"]["default_currency"] == "SAR"


def test_planning_routes_parity(sample_tenant):
    """Verify /api/tenant/planning routes query and persist against PostgreSQL."""
    t_id = sample_tenant["id"]

    # 1. Empty charters initially
    resp_charters = client.get("/api/tenant/planning/charters", headers=_tenant_headers(t_id))
    assert resp_charters.status_code == 200
    assert isinstance(resp_charters.json(), list)

    # 2. Planning analytics
    resp_analytics = client.get("/api/tenant/planning/analytics", headers=_tenant_headers(t_id))
    assert resp_analytics.status_code == 200
    analytics = resp_analytics.json()
    assert "total_charters" in analytics
    assert "total_allocated_budget" in analytics
