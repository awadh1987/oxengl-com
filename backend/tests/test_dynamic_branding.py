"""
Tests for OxenGL Two-Tier Dynamic Branding Architecture.
File: backend/tests/test_dynamic_branding.py

Validates:
1. GET /api/v1/platform/branding (Public Global Branding Defaults)
2. PUT /api/v1/admin/platform/branding (Super Admin Platform Branding Update)
3. GET /api/v1/tenant/branding (Tenant Subdomain / Header / Query Resolution)
4. PUT /api/v1/admin/tenant/{tenant_id}/branding (Admin Branding Overrides)
5. Non-existent Tenant 404 Resolution Error
"""

import uuid
import pytest
from starlette.testclient import TestClient

from backend.app.main import app
from backend.database import SessionLocal
import backend.models as models

client = TestClient(app)


@pytest.fixture
def sample_branding_tenant():
    db = SessionLocal()
    try:
        slug = f"brand_test_{uuid.uuid4().hex[:6]}"
        company = models.ResCompany(
            id=uuid.uuid4(),
            name=f"Brand Test Corp {slug}",
            slug=slug,
            domain_slug=slug,
            currency="SAR",
            is_active=True,
            primary_color="#10b981",
            secondary_color="#064e3b",
            logo_url="https://cdn.oxengl.me/logos/test-logo.png",
        )
        db.add(company)
        db.commit()
        db.refresh(company)

        org = models.Organization(
            name=company.name,
            slug=company.slug,
            company_id=company.id,
        )
        db.add(org)
        db.commit()
        db.refresh(org)

        branding = models.TenantBranding(
            tenant_id=org.id,
            brand_name=company.name,
            logo_url=company.logo_url,
            favicon_url="https://cdn.oxengl.me/favicons/test-fav.ico",
            primary_color=company.primary_color,
            accent_color=company.secondary_color,
            custom_domain=f"{slug}.oxengl.me",
        )
        db.add(branding)
        db.commit()
        db.refresh(branding)

        return {
            "company_id": str(company.id),
            "org_id": org.id,
            "slug": slug,
            "brand_name": branding.brand_name,
            "primary_color": branding.primary_color,
            "accent_color": branding.accent_color,
            "logo_url": branding.logo_url,
        }
    finally:
        db.close()



def test_get_global_platform_branding():
    """Verify GET /api/v1/platform/branding returns global defaults without authentication."""
    response = client.get("/api/v1/platform/branding")
    assert response.status_code == 200
    data = response.json()
    assert "platform_name" in data
    assert "default_logo" in data
    assert "logo_url" in data
    assert "primary_color" in data
    assert "accent_color" in data


def test_update_global_platform_branding_authorized():
    """Verify PUT /api/v1/admin/platform/branding successfully modifies platform settings."""
    payload = {
        "platform_name": "OxenGL Global Cloud Suite",
        "primary_color": "#ea580c",
        "accent_color": "#020617",
    }
    response = client.put(
        "/api/v1/admin/platform/branding",
        json=payload,
        headers={"X-Recovery-Code": "SUPER_ADMIN_EMERGENCY_RECOVERY_KEY_2026"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["platform_name"] == "OxenGL Global Cloud Suite"
    assert data["primary_color"] == "#ea580c"
    assert data["accent_color"] == "#020617"


def test_get_tenant_branding_via_header(sample_branding_tenant):
    """Verify GET /api/v1/tenant/branding resolves tenant via X-Tenant-Slug header."""
    tenant = sample_branding_tenant
    slug = tenant["slug"]
    response = client.get(
        "/api/v1/tenant/branding",
        headers={"X-Tenant-Slug": slug},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == tenant["org_id"]
    assert data["brand_name"] == tenant["brand_name"]
    assert data["primary_color"] == tenant["primary_color"]
    assert data["accent_color"] == tenant["accent_color"]
    assert data["logo_url"] == tenant["logo_url"]


def test_get_tenant_branding_via_query_uuid(sample_branding_tenant):
    """Verify GET /api/v1/tenant/branding resolves tenant via company UUID query parameter."""
    tenant = sample_branding_tenant
    cid_str = tenant["company_id"]
    response = client.get(f"/api/v1/tenant/branding?tenant_id={cid_str}")
    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == tenant["org_id"]
    assert data["brand_name"] == tenant["brand_name"]


def test_get_tenant_branding_not_found():
    """Verify GET /api/v1/tenant/branding returns 404 when no context is provided."""
    response = client.get("/api/v1/tenant/branding")
    assert response.status_code == 404
    data = response.json()
    assert "Tenant workspace context not found" in data["detail"]


def test_update_tenant_branding_override(sample_branding_tenant):
    """Verify PUT /api/v1/admin/tenant/{id}/branding updates visual identity and syncs ResCompany."""
    tenant = sample_branding_tenant
    org_id = tenant["org_id"]
    company_id = tenant["company_id"]
    new_name = f"Updated Horizon {uuid.uuid4().hex[:6]}"
    payload = {
        "brand_name": new_name,
        "primary_color": "#6366f1",
        "accent_color": "#1e1b4b",
        "logo_url": "https://cdn.oxengl.me/logos/horizon.png",
    }
    response = client.put(
        f"/api/v1/admin/tenant/{org_id}/branding",
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["brand_name"] == new_name
    assert data["primary_color"] == "#6366f1"
    assert data["accent_color"] == "#1e1b4b"
    assert data["logo_url"] == "https://cdn.oxengl.me/logos/horizon.png"

    # Verify persistence in DB
    db = SessionLocal()
    try:
        updated_org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
        assert updated_org.branding.brand_name == new_name
        assert updated_org.branding.primary_color == "#6366f1"

        # Verify linked ResCompany is also synchronized
        comp = db.query(models.ResCompany).filter(models.ResCompany.id == uuid.UUID(company_id)).first()
        assert comp.name == new_name
        assert comp.primary_color == "#6366f1"
        assert comp.logo_url == "https://cdn.oxengl.me/logos/horizon.png"
    finally:
        db.close()

