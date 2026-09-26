"""
Phase 2 Automated Verification Suite: Host-Header Middleware & Zero-Slug Routing
Tests:
1. HostHeaderMiddleware header parsing, platform host filtering, and state binding
2. Dynamic custom domain and subdomain resolution via resolve_tenant_from_host
3. In-memory domain cache hit and thread-safe invalidate_domain_cache
4. Zero-Slug Authentication via Host / X-Forwarded-Host header without workspace_slug
5. Public and tenant control domain resolution API endpoints
6. Custom domain registration, synchronization across master_tenants & res_companies, and cache invalidation
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from backend.app.main import app
from backend.database import SessionLocal
from backend.models import MasterTenant, ResCompany, TenantUser
from backend.app.core.middleware import (
    HostHeaderMiddleware,
    resolve_tenant_from_host,
    invalidate_domain_cache,
    _DOMAIN_CACHE,
)
from backend.two_tier_auth import hash_password


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def setup_phase2_tenant():
    """Sets up a test tenant in PostgreSQL with custom domain."""
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    domain_name = f"phase2-{uuid.uuid4().hex[:6]}.enterprise.io"
    slug = f"phase2-ent-{uuid.uuid4().hex[:6]}"

    tenant = MasterTenant(
        id=tenant_id,
        name="Phase 2 Logistics Corp",
        slug=slug,
        custom_domain=domain_name,
        owner_full_name="Phase2 Admin",
        owner_email=f"admin@{domain_name}",
        owner_mobile="+966555123456",
        status="active",
        subscription_tier="enterprise",
    )
    db.add(tenant)

    # Sync company
    company = ResCompany(
        id=tenant_id,
        name="Phase 2 Logistics Corp",
        slug=slug,
        domain_slug=slug,
        custom_domain=domain_name,
        currency="SAR",
        is_active=True,
    )
    db.add(company)
    db.commit()

    invalidate_domain_cache()

    yield {
        "tenant_id": str(tenant_id),
        "slug": slug,
        "custom_domain": domain_name,
        "admin_email": f"admin@{domain_name}",
    }

    # Cleanup
    invalidate_domain_cache(domain_name)
    db.execute(text("DELETE FROM res_companies WHERE id = :id"), {"id": tenant_id})
    db.execute(text("DELETE FROM master_tenants WHERE id = :id"), {"id": tenant_id})
    db.commit()
    db.close()


def test_resolve_tenant_from_custom_domain(setup_phase2_tenant):
    """Verifies that resolve_tenant_from_host accurately resolves custom domain."""
    domain = setup_phase2_tenant["custom_domain"]
    slug = setup_phase2_tenant["slug"]

    # First lookup: query PostgreSQL and populate cache
    meta = resolve_tenant_from_host(domain)
    assert meta is not None
    assert meta["tenant_slug"] == slug
    assert meta["custom_domain"] == domain
    assert meta["is_custom_domain"] is True

    # Second lookup: should hit in-memory cache
    cached_meta = resolve_tenant_from_host(f"{domain}:443")
    assert cached_meta is not None
    assert cached_meta["tenant_slug"] == slug
    assert domain in _DOMAIN_CACHE


def test_resolve_tenant_from_subdomain(setup_phase2_tenant):
    """Verifies that resolve_tenant_from_host handles *.oxengl.me subdomains."""
    slug = setup_phase2_tenant["slug"]
    subdomain_host = f"{slug}.oxengl.me"

    meta = resolve_tenant_from_host(subdomain_host)
    assert meta is not None
    assert meta["tenant_slug"] == slug
    assert meta["is_custom_domain"] is False


def test_platform_base_hosts_ignored():
    """Verifies platform base hosts are not resolved as tenants."""
    for host in ["oxengl.me", "oxengl.com", "localhost", "127.0.0.1", "domains.oxengl.me", "app.oxengl.me", "www.oxengl.me"]:
        meta = resolve_tenant_from_host(host)
        assert meta is None


def test_host_header_middleware_headers(client, setup_phase2_tenant):
    """Verifies HostHeaderMiddleware extracts host and attaches response headers."""
    domain = setup_phase2_tenant["custom_domain"]
    slug = setup_phase2_tenant["slug"]

    # Request with custom domain Host header
    res = client.get("/health", headers={"Host": domain})
    assert res.status_code == 200
    assert res.headers.get("x-resolved-tenant") == slug
    assert res.headers.get("x-custom-domain") == domain

    # Request with X-Forwarded-Host header
    res_fwd = client.get("/health", headers={"X-Forwarded-Host": domain, "Host": "loadbalancer.internal"})
    assert res_fwd.status_code == 200
    assert res_fwd.headers.get("x-resolved-tenant") == slug


def test_public_resolve_domain_endpoints(client, setup_phase2_tenant):
    """Verifies GET /api/v1/tenant/resolve-domain with query parameter and Host header."""
    domain = setup_phase2_tenant["custom_domain"]
    slug = setup_phase2_tenant["slug"]

    # 1. Resolve via ?host=
    res_param = client.get(f"/api/v1/tenant/resolve-domain?host={domain}")
    assert res_param.status_code == 200
    data_param = res_param.json()
    assert data_param["resolved"] is True
    assert data_param["tenant_slug"] == slug
    assert data_param["custom_domain"] == domain
    assert data_param["is_custom_domain"] is True

    # 2. Resolve via Host header
    res_hdr = client.get("/api/v1/tenant/resolve-domain", headers={"Host": domain})
    assert res_hdr.status_code == 200
    data_hdr = res_hdr.json()
    assert data_hdr["resolved"] is True
    assert data_hdr["tenant_slug"] == slug


def test_zero_slug_login_flow(client, setup_phase2_tenant):
    """
    CRITICAL: Verifies Zero-Slug Authentication.
    Tenant login request without 'workspace_slug' or 'tenant_slug' resolves tenant
    automatically from the Host header.
    """
    domain = setup_phase2_tenant["custom_domain"]
    admin_email = setup_phase2_tenant["admin_email"]

    # 1. Zero-slug login with custom domain Host header
    # Body has NO workspace_slug or tenant_slug
    login_res = client.post(
        "/api/auth/tenant/login",
        headers={"Host": domain},
        json={
            "identity": admin_email,
            "password": "TemporaryPassword123!",
        },
    )
    # The request should successfully pass zero-slug resolution and reach credential evaluation (returning 401 Unauthorized instead of 400 Bad Request)
    assert login_res.status_code == 401
    assert "Invalid credentials" in login_res.json().get("detail", "")

    # 2. Negative test: Generic apex host without workspace_slug must fail with 400 Bad Request
    neutral_res = client.post(
        "/api/auth/tenant/login",
        headers={"Host": "localhost"},
        json={
            "identity": admin_email,
            "password": "TemporaryPassword123!",
        },
    )
    assert neutral_res.status_code == 400
    assert "workspace_slug is required" in neutral_res.json().get("detail", "")


def test_custom_domain_registration_and_invalidation(client, setup_phase2_tenant):
    """Verifies registering a new custom domain updates PostgreSQL and clears routing cache."""
    tenant_id = setup_phase2_tenant["tenant_id"]
    new_domain = f"new-domain-{uuid.uuid4().hex[:6]}.cloud"

    # Register domain
    reg_res = client.post(
        f"/api/v1/tenant/control/domains?tenant_id={tenant_id}",
        json={"domain_name": new_domain},
    )
    assert reg_res.status_code == 201
    assert reg_res.json()["domain"]["domain_name"] == new_domain

    # Verify domain resolution immediately resolves to the tenant
    resolve_res = client.get(f"/api/v1/tenant/resolve-domain?host={new_domain}")
    assert resolve_res.status_code == 200
    assert resolve_res.json()["resolved"] is True
    assert resolve_res.json()["tenant_id"] == tenant_id

    # Verify removal
    del_res = client.delete(
        f"/api/v1/tenant/control/domains/{new_domain}?tenant_id={tenant_id}",
    )
    assert del_res.status_code == 200

    # Removed domain should no longer resolve
    del_resolve = client.get(f"/api/v1/tenant/resolve-domain?host={new_domain}")
    assert del_resolve.status_code == 200
    assert del_resolve.json()["resolved"] is False
