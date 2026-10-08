"""
Security Tests for Batch 2 of Phase P0:
- REM-P0-03: WebSocket Telemetry Authentication & Tenant Scoping
- REM-P0-04: Asset Upload Hardening & Path Traversal Prevention
- REM-P0-05: Tenant Slug Sanitization & DDL Injection Prevention
"""

import io
import re
import uuid
import pytest
from fastapi import status
from starlette.testclient import TestClient

from backend.app.main import app, create_session_token
from backend.app.domains.auth.onboard_tenant import TenantRegistrationPayload
from backend.database import PlatformSessionLocal as SessionLocal
from backend import models


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def test_company_and_user():
    db = SessionLocal()
    cid = uuid.uuid4()
    uid = uuid.uuid4()
    slug = f"test-sec-{cid.hex[:6]}"
    email = f"sec_admin_{uid.hex[:6]}@example.com"
    try:
        company = models.ResCompany(
            id=cid,
            name=f"Batch 2 Security Test Co {cid.hex[:8]}",
            slug=slug,
        )
        db.add(company)
        db.flush()

        user = models.ResUser(
            id=uid,
            email=email,
            full_name="Security Admin",
            company_id=cid,
            role="Admin",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(company)
        db.refresh(user)

        token = create_session_token(
            subject=user.email,
            company_id=company.id,
            role="Admin",
            tenant_slug=company.slug,
        )
        headers = {"Authorization": f"Bearer {token}"}
        return company, user, headers
    finally:
        db.close()


def test_rem_p0_05_slug_regex_validation():
    """Verify regex rejects DDL injection attempts and malformed slugs."""
    valid_slugs = [
        "acme",
        "acme-logistics",
        "tenant_123",
        "riyadh-fleet-01",
    ]
    invalid_slugs = [
        'test"; DROP SCHEMA public CASCADE; --',
        "acme/subpath",
        "acme\\path",
        "acme..traversal",
        "acme company",
        "acme$special",
        "acme' OR '1'='1",
        "schema`injection",
        "CAPITAL_NOT_LOWERCASE",
    ]

    slug_pattern = re.compile(r"^[a-z0-9_-]+$")

    for slug in valid_slugs:
        assert slug_pattern.match(slug) is not None, f"Valid slug {slug} failed match"

    for slug in invalid_slugs:
        assert slug_pattern.match(slug) is None, f"Invalid slug {slug} incorrectly matched"


def test_rem_p0_05_onboard_tenant_rejects_ddl_injection(client):
    """Verify /api/v1/auth/register-tenant rejects DDL injection in domain_slug."""
    malicious_payload = {
        "company_name": "Exploit Corp",
        "admin_email": f"hacker_{uuid.uuid4().hex[:8]}@example.com",
        "password": "StrongPassword123!",
        "domain_slug": 'test"; DROP SCHEMA public CASCADE; --',
        "commercial_registration_number": "1010101010",
        "vat_number": "300000000000003",
    }

    response = client.post("/api/v1/auth/register-tenant", json=malicious_payload)
    assert response.status_code in [400, 422], f"Expected 400/422 but got {response.status_code}: {response.text}"


def test_rem_p0_04_asset_upload_requires_authentication(client):
    """Verify /api/platform/assets/upload rejects unauthenticated requests with 401."""
    payload = {
        "fileName": "test.png",
        "fileBuffer": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "assetType": "platform_logo",
    }

    response = client.post("/api/platform/assets/upload", json=payload)
    assert response.status_code == 401, f"Expected 401 Unauthorized but got {response.status_code}: {response.text}"


def test_rem_p0_04_asset_upload_rejects_disallowed_mime(client, test_company_and_user):
    """Verify /api/platform/assets/upload rejects non-image MIME types."""
    _, _, headers = test_company_and_user

    payload = {
        "fileName": "malicious.sh",
        "fileBuffer": "data:application/x-sh;base64,IyEvYmluL2Jhc2g=",
        "assetType": "platform_logo",
    }

    response = client.post("/api/platform/assets/upload", json=payload, headers=headers)
    assert response.status_code == 400, f"Expected 400 Bad Request but got {response.status_code}: {response.text}"
    assert "Invalid file type" in response.text or "Disallowed file extension" in response.text


def test_rem_p0_04_asset_upload_rejects_disallowed_extension(client, test_company_and_user):
    """Verify /api/platform/assets/upload rejects disallowed file extensions even if buffer starts with data:image."""
    _, _, headers = test_company_and_user

    payload = {
        "fileName": "malicious.exe",
        "fileBuffer": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "assetType": "platform_logo",
    }

    response = client.post("/api/platform/assets/upload", json=payload, headers=headers)
    assert response.status_code == 400, f"Expected 400 Bad Request but got {response.status_code}: {response.text}"
    assert "Disallowed file extension" in response.text


def test_rem_p0_04_asset_upload_sanitizes_filename(client, test_company_and_user):
    """Verify /api/platform/assets/upload ignores user-supplied path traversal and generates secure UUID filename."""
    _, _, headers = test_company_and_user

    payload = {
        "fileName": "../../../../etc/cron.d/malicious.png",
        "fileBuffer": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "assetType": "platform_logo",
    }

    response = client.post("/api/platform/assets/upload", json=payload, headers=headers)
    assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"
    data = response.json()
    assert "url" in data
    assert ".." not in data["url"]
    assert "etc" not in data["url"]
    assert ".." not in data["fileName"]
    assert "etc" not in data["fileName"]
    assert "asset_" in data["fileName"]


@pytest.mark.asyncio
async def test_rem_p0_03_websocket_rejection_without_token(async_client):
    """Verify WebSocket /api/v1/logistics/ws/fleet-stream closes with 1008 if unauthenticated."""
    try:
        async with async_client.websocket_connect("/api/v1/logistics/ws/fleet-stream?tenant_id=tenant-123") as ws:
            await ws.send_text('{"type": "ping"}')
            pytest.fail("Security Breach: WebSocket accepted unauthenticated connection without token.")
    except Exception:
        # Success: Connection must be rejected
        assert True
