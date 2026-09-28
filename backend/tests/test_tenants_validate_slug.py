"""
Tests for Multi-Tenant Workspace Slug Validation Endpoint.
Verifies POST /api/v1/tenants/validate-slug behavior for frontend login flow.
"""

import uuid
import pytest
from starlette.testclient import TestClient

from backend.app.main import app
from backend.database import SessionLocal
import backend.models as models

client = TestClient(app)


@pytest.fixture
def test_company():
    db = SessionLocal()
    try:
        comp = db.query(models.ResCompany).filter(models.ResCompany.slug == "wac-ye").first()
        if not comp:
            comp = models.ResCompany(
                id=uuid.uuid4(),
                name="Alwehda Alarabia Oil Services Co Ltd",
                slug="wac-ye",
                domain_slug="wac-ye",
                currency="SAR",
                is_active=True,
            )
            db.add(comp)
            db.commit()
            db.refresh(comp)
        return comp
    finally:
        db.close()


def test_validate_slug_success(test_company):
    response = client.post(
        "/api/v1/tenants/validate-slug",
        json={"slug": "wac-ye"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["tenant_id"] == str(test_company.id)
    assert data["name"] == test_company.name
    assert "target" in data
    assert "status" in data


def test_validate_slug_case_insensitive(test_company):
    response = client.post(
        "/api/v1/tenants/validate-slug",
        json={"slug": "WAC-YE"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["tenant_id"] == str(test_company.id)


def test_validate_slug_hyphen_underscore_tolerance(test_company):
    response = client.post(
        "/api/v1/tenants/validate-slug",
        json={"slug": "wac_ye"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["tenant_id"] == str(test_company.id)


def test_validate_slug_not_found():
    response = client.post(
        "/api/v1/tenants/validate-slug",
        json={"slug": "non-existent-tenant-workspace-999"},
    )
    assert response.status_code == 404
    assert "Requested workspace environment is either inactive or unregistered." in response.json()["detail"]


def test_validate_slug_too_short():
    response = client.post(
        "/api/v1/tenants/validate-slug",
        json={"slug": "a"},
    )
    assert response.status_code == 400


def test_validate_slug_returns_custom_domain():
    db = SessionLocal()
    try:
        comp = db.query(models.ResCompany).filter(models.ResCompany.slug == "test-custom-domain-corp").first()
        if not comp:
            comp = models.ResCompany(
                id=uuid.uuid4(),
                name="Test Custom Domain Corp",
                slug="test-custom-domain-corp",
                domain_slug="test-custom-domain-corp",
                custom_domain="enterprise.customdomain.org",
                currency="SAR",
                is_active=True,
            )
            db.add(comp)
            db.commit()
            db.refresh(comp)

        response = client.post(
            "/api/v1/tenants/validate-slug",
            json={"slug": "test-custom-domain-corp"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert data["custom_domain"] == "enterprise.customdomain.org"
        assert data["domain"] == "enterprise.customdomain.org"
    finally:
        db.close()

