"""
Phase 3 Automated Test Suite: Automated SSL Provisioning Engine & Caddy Dynamic Reverse Proxy
Covers:
1. Caddy On-Demand TLS Gatekeeper logic (verify_caddy_ask)
2. Domain Syntax Validation & Attack / Rate-Limit Prevention
3. In-memory Domain Cache acceleration
4. HTTP /api/v1/ssl/caddy-ask Gatekeeper Endpoint (200 OK vs 403 Forbidden vs 400 Bad Request)
5. Authoritative DNS Pre-flight Verification (CNAME matching, A-record fallback)
6. Live TLS Certificate Probing and Expiration Calculation
7. Tenant Control Verification (/domains/{domain_id}/verify) and SSL telemetry
8. Production Caddyfile Validation
"""
import uuid
import subprocess
import pytest
from unittest.mock import patch, MagicMock
from starlette.testclient import TestClient

from backend.app.main import app
from backend.database import SessionLocal
from backend.models import MasterTenant, ResCompany
from backend.app.services import ssl_service
from backend.app.core.middleware import invalidate_domain_cache, _DOMAIN_CACHE


@pytest.fixture
def db_session():
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def client():
    return TestClient(app)


def test_domain_syntax_validation():
    """Verifies RFC 1123 domain validation and attack filtering."""
    assert ssl_service.is_valid_domain_syntax("portal.myclient.com") is True
    assert ssl_service.is_valid_domain_syntax("app.enterprise-tenant.org") is True
    assert ssl_service.is_valid_domain_syntax("company.sa") is True

    # Rejection of invalid inputs / injection / IPs
    assert ssl_service.is_valid_domain_syntax("") is False
    assert ssl_service.is_valid_domain_syntax("192.168.1.1") is False
    assert ssl_service.is_valid_domain_syntax("127.0.0.1") is False
    assert ssl_service.is_valid_domain_syntax("attacker..com") is False
    assert ssl_service.is_valid_domain_syntax("test;rm -rf /") is False
    assert ssl_service.is_valid_domain_syntax("a" * 300 + ".com") is False


def test_verify_caddy_ask_authorized_tenant(db_session):
    """Verifies that registered active tenants are allowed for on-demand TLS certificates."""
    unique_suffix = uuid.uuid4().hex[:6]
    domain_name = f"ssl-test-{unique_suffix}.myclient.com"
    slug = f"ssl-test-{unique_suffix}"
    tenant_id = uuid.uuid4()

    # Create active MasterTenant
    tenant = MasterTenant(
        id=tenant_id,
        name=f"SSL Test Corp {unique_suffix}",
        slug=slug,
        custom_domain=domain_name,
        owner_full_name="SSL Admin",
        owner_email=f"admin@{domain_name}",
        owner_mobile="+966555123456",
        subscription_tier="enterprise",
        status="active",
    )
    db_session.add(tenant)

    # Create matching ResCompany
    company = ResCompany(
        id=tenant_id,
        name=f"SSL Test Corp {unique_suffix}",
        slug=slug,
        custom_domain=domain_name,
        is_active=True,
    )
    db_session.add(company)
    db_session.commit()

    try:
        # Invalidate any prior cache
        invalidate_domain_cache(domain_name)

        # 1. Gatekeeper check
        check = ssl_service.verify_caddy_ask(domain_name, db=db_session)
        assert check["allowed"] is True
        assert check["domain"] == domain_name
        assert check["tenant_id"] == str(tenant_id)
        assert check["tenant_slug"] == slug

        # 2. Verify cached in memory for sub-millisecond response
        assert domain_name in _DOMAIN_CACHE
        cached_check = ssl_service.verify_caddy_ask(domain_name, db=db_session)
        assert cached_check["allowed"] is True
        assert "cached" in cached_check["reason"].lower()

    finally:
        invalidate_domain_cache(domain_name)
        db_session.delete(tenant)
        db_session.delete(company)
        db_session.commit()


def test_verify_caddy_ask_unauthorized_domain(db_session):
    """Verifies that unregistered domains are rejected to protect against Let's Encrypt rate-limit depletion."""
    unauthorized_domain = f"unregistered-{uuid.uuid4().hex[:8]}.com"
    check = ssl_service.verify_caddy_ask(unauthorized_domain, db=db_session)
    assert check["allowed"] is False
    assert "not registered" in check["reason"].lower()


def test_verify_caddy_ask_inactive_tenant(db_session):
    """Verifies that suspended or canceled tenants are rejected by the Caddy ask gatekeeper."""
    unique_suffix = uuid.uuid4().hex[:6]
    domain_name = f"suspended-{unique_suffix}.example.com"
    tenant_id = uuid.uuid4()

    tenant = MasterTenant(
        id=tenant_id,
        name=f"Suspended Corp {unique_suffix}",
        slug=f"suspended-{unique_suffix}",
        custom_domain=domain_name,
        owner_full_name="Suspended Admin",
        owner_email=f"admin@{domain_name}",
        owner_mobile="+966555123456",
        subscription_tier="enterprise",
        status="suspended",  # INACTIVE
    )
    db_session.add(tenant)
    db_session.commit()

    try:
        invalidate_domain_cache(domain_name)
        check = ssl_service.verify_caddy_ask(domain_name, db=db_session)
        assert check["allowed"] is False
    finally:
        invalidate_domain_cache(domain_name)
        db_session.delete(tenant)
        db_session.commit()


def test_verify_caddy_ask_platform_base_hosts():
    """Verifies platform base domains are recognized and allowed without querying tenant DB."""
    for host in ["oxengl.me", "localhost", "domains.oxengl.me"]:
        res = ssl_service.verify_caddy_ask(host)
        assert res["allowed"] is True
        assert res["reason"] == "Platform base domain"


def test_caddy_ask_http_endpoint(client, db_session):
    """Tests the /api/v1/ssl/caddy-ask endpoint conforming to Caddy on_demand_tls specifications."""
    unique_suffix = uuid.uuid4().hex[:6]
    domain_name = f"caddy-http-{unique_suffix}.client.io"
    tenant_id = uuid.uuid4()

    tenant = MasterTenant(
        id=tenant_id,
        name=f"Caddy HTTP Corp {unique_suffix}",
        slug=f"caddy-http-{unique_suffix}",
        custom_domain=domain_name,
        owner_full_name="Caddy Admin",
        owner_email=f"admin@{domain_name}",
        owner_mobile="+966555123456",
        subscription_tier="enterprise",
        status="active",
    )
    db_session.add(tenant)
    db_session.commit()

    try:
        invalidate_domain_cache(domain_name)

        # 1. Authorized domain returns 200 OK
        resp = client.get(f"/api/v1/ssl/caddy-ask?domain={domain_name}")
        assert resp.status_code == 200
        assert "OK" in resp.text
        assert domain_name in resp.text

        # 2. Unauthorized domain returns 403 Forbidden
        resp_bad = client.get(f"/api/v1/ssl/caddy-ask?domain=random-attacker-{unique_suffix}.net")
        assert resp_bad.status_code == 403

        # 3. Missing domain parameter returns 400 Bad Request
        resp_missing = client.get("/api/v1/ssl/caddy-ask")
        assert resp_missing.status_code == 400

    finally:
        invalidate_domain_cache(domain_name)
        db_session.delete(tenant)
        db_session.commit()


def test_dns_preflight_verification():
    """Tests authoritative DNS pre-flight checking."""
    # Test CNAME match
    with patch("dns.resolver.Resolver.resolve") as mock_resolve:
        mock_cname = MagicMock()
        mock_cname.target = "domains.oxengl.me."
        mock_resolve.return_value = [mock_cname]

        res = ssl_service.verify_domain_dns("sub.client.com", expected_cname="domains.oxengl.me")
        assert res["cname_matched"] is True
        assert res["is_valid"] is True
        assert res["dns_status"] == "cname_verified"

    # Test A record fallback
    with patch("dns.resolver.Resolver.resolve") as mock_resolve:
        import dns.resolver
        def side_effect(qname, rdtype):
            if rdtype == "CNAME":
                raise dns.resolver.NoAnswer()
            elif rdtype == "A":
                mock_a = MagicMock()
                mock_a.address = "198.51.100.42"
                return [mock_a]
            raise dns.resolver.NXDOMAIN()

        mock_resolve.side_effect = side_effect
        res_a = ssl_service.verify_domain_dns("direct-ip.client.com")
        assert res_a["is_valid"] is True
        assert "198.51.100.42" in res_a["a_records"]
        assert res_a["dns_status"] == "a_record_present"


def test_ssl_certificate_probe_unreachable():
    """Tests TLS probing handles offline/unreachable domains cleanly."""
    res = ssl_service.probe_ssl_certificate("unreachable-nonexistent-domain-xyz998.com", timeout=0.5)
    assert res["has_ssl"] is False
    assert res["ssl_status"] == "unreachable"
    assert res["error"] is not None


def test_tenant_control_verify_endpoint(client, db_session):
    """Tests POST /api/v1/tenant/control/domains/{domain_id}/verify endpoint."""
    unique_suffix = uuid.uuid4().hex[:6]
    domain_name = f"verify-endpoint-{unique_suffix}.org"
    tenant_id = uuid.uuid4()

    tenant = MasterTenant(
        id=tenant_id,
        name=f"Verify Endpoint Corp {unique_suffix}",
        slug=f"verify-{unique_suffix}",
        custom_domain=domain_name,
        owner_full_name="Verify Admin",
        owner_email=f"admin@{domain_name}",
        owner_mobile="+966555123456",
        subscription_tier="enterprise",
        status="active",
    )
    db_session.add(tenant)
    db_session.commit()

    try:
        invalidate_domain_cache(domain_name)

        resp = client.post(
            f"/api/v1/tenant/control/domains/{domain_name}/verify",
            headers={"X-Tenant-ID": str(tenant_id)},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["domain_name"] == domain_name
        assert data["is_verified"] is True
        assert "dns_check" in data
        assert "routing" in data
        assert data["routing"] == "Zero-Slug Ready"

    finally:
        invalidate_domain_cache(domain_name)
        db_session.delete(tenant)
        db_session.commit()


def test_caddyfile_syntax_validation():
    """Validates that Caddyfile passes formal validation by the installed Caddy 2.x binary."""
    result = subprocess.run(
        ["caddy", "validate", "--config", "Caddyfile"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Caddyfile validation failed: {result.stderr}"
    assert "Valid configuration" in result.stdout or "Valid configuration" in result.stderr
