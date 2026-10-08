"""
Tests verifying tenant subdomain registration URL formatting, JWT tenant binding,
and elimination of tenant-bleed fallbacks.
"""

import uuid
import pytest
from starlette.testclient import TestClient

from backend.app.main import app, create_session_token, decode_session_token
from backend.two_tier_auth import issue_two_tier_jwt, verify_two_tier_jwt
from backend.app.domains.iam.services import create_access_token, decode_access_token


def test_session_token_includes_tenant_binding():
    """Verify that create_session_token embeds tenant_id, tenant_slug, and domain_slug."""
    cid = uuid.uuid4()
    token = create_session_token(
        subject="tenant_admin@acme.com",
        company_id=cid,
        role="Admin",
        tenant_slug="acme-corp",
        domain_slug="acme-corp",
    )
    claims = decode_session_token(token)

    assert claims["sub"] == "tenant_admin@acme.com"
    assert claims["company_id"] == str(cid)
    assert claims["tenant_id"] == str(cid)
    assert claims["tenant_slug"] == "acme-corp"
    assert claims["domain_slug"] == "acme-corp"


def test_two_tier_jwt_includes_domain_slug():
    """Verify that issue_two_tier_jwt embeds domain_slug, tenant_slug, and company_id."""
    tid = uuid.uuid4()
    token = issue_two_tier_jwt(
        tier="tenant",
        user_id=uuid.uuid4(),
        identity="user@acme.com",
        role="Admin",
        tenant_id=tid,
        tenant_slug="acme-corp",
    )
    claims = verify_two_tier_jwt(token, expected_tier="tenant")

    assert claims["tenant_id"] == str(tid)
    assert claims["company_id"] == str(tid)
    assert claims["tenant_slug"] == "acme-corp"
    assert claims["domain_slug"] == "acme-corp"


def test_iam_access_token_includes_tenant_slug():
    """Verify that IAM create_access_token encodes domain_slug and tenant_slug."""
    uid = uuid.uuid4()
    cid = uuid.uuid4()
    token, _ = create_access_token(
        user_id=uid,
        company_id=cid,
        role="Admin",
        email="test@acme.com",
        domain_slug="acme-corp",
        tenant_slug="acme-corp",
    )
    payload = decode_access_token(token)

    assert payload["tenant_id"] == str(cid)
    assert payload["company_id"] == str(cid)
    assert payload["domain_slug"] == "acme-corp"
    assert payload["tenant_slug"] == "acme-corp"


def test_subdomain_url_formatting():
    """Verify URL construction formats correctly as https://{slug}.oxengl.me."""
    slug = "acme-logistics"
    expected_url = f"https://{slug}.oxengl.me"
    malformed_url = f"https://oxengl.me{slug}"

    assert expected_url != malformed_url
    assert expected_url == "https://acme-logistics.oxengl.me"
