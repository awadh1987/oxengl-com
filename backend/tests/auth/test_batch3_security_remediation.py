"""
Security Tests for Batch 3 of Phase P0:
- REM-P0-06: Teltonika TCP Telemetry Device Authentication & Company Binding
- REM-P0-07: Restrict CORS Origins & Eliminate Permissive DevTunnels
- REM-P0-08: Tenant-Scoped Logo & Asset Management
"""

import io
import re
import uuid
import pytest
from fastapi import status
from starlette.testclient import TestClient

from backend.app.main import app, create_session_token
from backend.database import PlatformSessionLocal as SessionLocal
from backend import models


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def tenant_fixture():
    db = SessionLocal()
    cid_a = uuid.uuid4()
    cid_b = uuid.uuid4()
    uid_a = uuid.uuid4()
    uid_b = uuid.uuid4()
    try:
        company_a = models.ResCompany(
            id=cid_a,
            name=f"Tenant Alpha {cid_a.hex[:8]}",
            slug=f"alpha-{cid_a.hex[:6]}",
            logo_url="/media/logos/original_alpha.png",
        )
        company_b = models.ResCompany(
            id=cid_b,
            name=f"Tenant Beta {cid_b.hex[:8]}",
            slug=f"beta-{cid_b.hex[:6]}",
            logo_url="/media/logos/original_beta.png",
        )
        db.add_all([company_a, company_b])
        db.flush()

        user_a = models.ResUser(
            id=uid_a,
            email=f"admin_a_{uid_a.hex[:6]}@alpha.com",
            full_name="Admin Alpha",
            company_id=cid_a,
            role="Admin",
            is_active=True,
        )
        user_b = models.ResUser(
            id=uid_b,
            email=f"admin_b_{uid_b.hex[:6]}@beta.com",
            full_name="Admin Beta",
            company_id=cid_b,
            role="Admin",
            is_active=True,
        )
        db.add_all([user_a, user_b])
        db.commit()
        db.refresh(company_a)
        db.refresh(company_b)

        token_a = create_session_token(
            subject=user_a.email,
            company_id=company_a.id,
            role="Admin",
            tenant_slug=company_a.slug,
        )
        token_b = create_session_token(
            subject=user_b.email,
            company_id=company_b.id,
            role="Admin",
            tenant_slug=company_b.slug,
        )
        return {
            "company_a": company_a,
            "company_b": company_b,
            "token_a": token_a,
            "token_b": token_b,
            "headers_a": {"Authorization": f"Bearer {token_a}"},
            "headers_b": {"Authorization": f"Bearer {token_b}"},
        }
    finally:
        db.close()


# ============================================================================
# REM-P0-07: CORS Origins Restrictiveness Tests
# ============================================================================

def test_rem_p0_07_cors_allowed_production_origins(client):
    """Verify that validated production domains are allowed by CORS."""
    allowed_origins = [
        "https://oxengl.me",
        "https://app.oxengl.me",
        "https://oxengl.com",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
    ]
    for origin in allowed_origins:
        response = client.options(
            "/api/v1/auth/master/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.headers.get("access-control-allow-origin") == origin, (
            f"Origin {origin} should be allowed but got {response.headers.get('access-control-allow-origin')}"
        )


def test_rem_p0_07_cors_rejects_devtunnels_and_unauthorized_origins(client):
    """Verify that permissive DevTunnels and arbitrary origins are rejected."""
    disallowed_origins = [
        "https://attacker-controlled.devtunnels.ms",
        "https://random-sub.devtunnels.ms",
        "https://evil-phishing.com",
        "http://localhost:9999",
        "http://malicious.org",
    ]
    for origin in disallowed_origins:
        response = client.options(
            "/api/v1/auth/master/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
            },
        )
        allow_header = response.headers.get("access-control-allow-origin")
        assert allow_header != origin, (
            f"Security Breach: Disallowed origin {origin} was accepted by CORS!"
        )


# ============================================================================
# REM-P0-08: Tenant-Scoped Logo Upload & Isolation Tests
# ============================================================================

def test_rem_p0_08_upload_logo_requires_authentication(client):
    """Verify /api/v1/tenants/upload-logo returns 401 for unauthenticated requests."""
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    files = {"file": ("logo.png", io.BytesIO(png_content), "image/png")}

    response = client.post("/api/v1/tenants/upload-logo", files=files)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED, (
        f"Expected 401 but got {response.status_code}: {response.text}"
    )


def test_rem_p0_08_upload_logo_rejects_cross_tenant_tampering(client, tenant_fixture):
    """Verify Tenant A cannot overwrite or upload a logo targeting Tenant B."""
    headers_a = tenant_fixture["headers_a"]
    company_b_id = str(tenant_fixture["company_b"].id)

    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    files = {"file": ("tamper_logo.png", io.BytesIO(png_content), "image/png")}

    # Attempt cross-tenant overwrite via path parameter
    response = client.post(
        f"/api/v1/tenants/{company_b_id}/upload-logo",
        files=files,
        headers=headers_a,
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN, (
        f"Security Breach: Tenant A was allowed to access Tenant B route! Got {response.status_code}: {response.text}"
    )
    assert "Cannot modify" in response.text or "Access denied" in response.text

    # Verify Tenant B's logo was untouched
    db = SessionLocal()
    try:
        b_refreshed = db.get(models.ResCompany, tenant_fixture["company_b"].id)
        assert b_refreshed.logo_url == "/media/logos/original_beta.png"
    finally:
        db.close()


def test_rem_p0_08_upload_logo_isolated_success(client, tenant_fixture):
    """Verify Tenant A can upload its own logo without affecting Tenant B."""
    headers_a = tenant_fixture["headers_a"]
    company_a_id = tenant_fixture["company_a"].id
    company_b_id = tenant_fixture["company_b"].id

    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    files = {"file": ("alpha_new.png", io.BytesIO(png_content), "image/png")}

    response = client.post(
        "/api/v1/tenants/upload-logo",
        files=files,
        headers=headers_a,
    )
    assert response.status_code == status.HTTP_200_OK, (
        f"Expected 200 OK but got {response.status_code}: {response.text}"
    )
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert "logo_url" in data
    assert f"logo_{company_a_id}" in data["logo_url"]

    # Verify DB: Tenant A updated, Tenant B unchanged
    db = SessionLocal()
    try:
        a_refreshed = db.get(models.ResCompany, company_a_id)
        b_refreshed = db.get(models.ResCompany, company_b_id)
        assert a_refreshed.logo_url == data["logo_url"]
        assert b_refreshed.logo_url == "/media/logos/original_beta.png"
    finally:
        db.close()


def test_rem_p0_08_upload_logo_rejects_disallowed_extension(client, tenant_fixture):
    """Verify /api/v1/tenants/upload-logo rejects executable or script extensions."""
    headers_a = tenant_fixture["headers_a"]
    script_content = b"#!/bin/bash\necho 'hacked'"
    files = {"file": ("exploit.sh", io.BytesIO(script_content), "application/x-sh")}

    response = client.post(
        "/api/v1/tenants/upload-logo",
        files=files,
        headers=headers_a,
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Unsupported media format" in response.text
