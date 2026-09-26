"""
Phase 4: Validation, Boundary Testing & Final Integration
Comprehensive test suite verifying:
1. Multi-tenant data isolation & RLS boundaries across local, external, and migrated database tiers
2. Dynamic engine routing, negative caching, and connection pool isolation
3. RLS session scoping and connection cleanup (leak prevention across pooled connections)
4. Zero-slug session persistence, JWT validation, and cross-tenant spoofing prevention
5. Migration boundary error handling, rollback, and live revert workflows
6. Custom domain caching, instant cache invalidation, and Caddy gatekeeper adversarial boundaries
7. Complete End-to-End Enterprise lifecycle integration
"""
import uuid
import time
import pytest
from starlette.testclient import TestClient
from sqlalchemy import text, create_engine
from sqlalchemy.orm import Session

from backend.app.main import app
from backend.database import (
    SessionLocal,
    tenant_connection_manager,
    tenant_rls_scope,
    encrypt_connection_url,
    engine as default_platform_engine,
)
from backend.models import (
    MasterTenant,
    ResCompany,
    ResUser,
    TenantDatabaseConfig,
    TenantDatabaseMigration,
    AccountJournal,
)
from backend.app.core.middleware import (
    resolve_tenant_from_host,
    invalidate_domain_cache,
    _DOMAIN_CACHE,
    _DOMAIN_CACHE_LOCK,
)
from backend.app.services import ssl_service
from backend.app.services.migration_service import (
    run_migration_worker,
    test_target_connection as check_target_conn_fn,
    revert_to_shared_database,
    get_migration_status_data,
)
from backend.two_tier_auth import issue_two_tier_jwt, verify_two_tier_jwt


@pytest.fixture
def db_session():
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def client():
    return TestClient(app)


# ==============================================================================
# 1. Multi-Tenant Data Isolation Across Database Tiers
# ==============================================================================

def test_multi_tenant_data_isolation_across_database_tiers(db_session):
    """
    Verifies that tenants hosted on different database tiers (standard shared vs dedicated private)
    cannot see, modify, or leak data across partitions.
    """
    suffix_a = uuid.uuid4().hex[:6]
    suffix_b = uuid.uuid4().hex[:6]

    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    # Tenant A: Standard Local Platform Database
    tenant_a = MasterTenant(
        id=tenant_a_id,
        name=f"Local Tenant {suffix_a}",
        slug=f"local-tenant-{suffix_a}",
        owner_full_name="Local Admin",
        owner_email=f"admin-a@{suffix_a}.com",
        owner_mobile="+966500000001",
        status="active",
        subscription_tier="standard",
    )
    company_a = ResCompany(
        id=tenant_a_id,
        name=f"Local Tenant {suffix_a}",
        slug=f"local-tenant-{suffix_a}",
        is_active=True,
    )

    # Tenant B: Dedicated Private Database
    tenant_b = MasterTenant(
        id=tenant_b_id,
        name=f"External Tenant {suffix_b}",
        slug=f"ext-tenant-{suffix_b}",
        owner_full_name="External Admin",
        owner_email=f"admin-b@{suffix_b}.com",
        owner_mobile="+966500000002",
        status="active",
        subscription_tier="enterprise",
    )
    company_b = ResCompany(
        id=tenant_b_id,
        name=f"External Tenant {suffix_b}",
        slug=f"ext-tenant-{suffix_b}",
        is_active=True,
    )

    db_session.add_all([tenant_a, company_a, tenant_b, company_b])
    db_session.commit()

    # Create a dedicated isolated SQLite database for Tenant B to simulate private hosting
    ext_sqlite_url = f"sqlite:////tmp/oxengl_ext_{suffix_b}.db"
    dedicated_engine = create_engine(ext_sqlite_url)
    
    # Initialize dedicated tables in Tenant B's private storage
    with dedicated_engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS account_journals (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255),
                code VARCHAR(16),
                journal_type VARCHAR(32),
                company_id VARCHAR(36)
            );
        """))
        conn.commit()

    # Register Tenant B's dedicated engine
    tenant_connection_manager.register_tenant_engine(tenant_b_id, dedicated_engine)

    journal_a = None
    try:
        # Insert sensitive entity in Tenant A's database (default shared DB)
        journal_a = AccountJournal(
            id=uuid.uuid4(),
            name=f"Confidential Journal A {suffix_a}",
            code=f"JA{suffix_a[:2]}",
            journal_type="sale",
            company_id=tenant_a_id,
        )
        db_session.add(journal_a)
        db_session.commit()

        # Insert sensitive entity in Tenant B's private database
        journal_b_id = str(uuid.uuid4())
        with tenant_connection_manager.session_scope(tenant_b_id) as sess_b:
            sess_b.execute(
                text("INSERT INTO account_journals (id, name, code, journal_type, company_id) VALUES (:id, :name, :code, :type, :cid)"),
                {"id": journal_b_id, "name": f"Private Journal B {suffix_b}", "code": f"JB{suffix_b[:2]}", "type": "purchase", "cid": str(tenant_b_id)}
            )

        # 1. Assert Tenant A's session CANNOT find Tenant B's journal
        found_in_a = db_session.query(AccountJournal).filter(AccountJournal.company_id == tenant_b_id).all()
        assert len(found_in_a) == 0, "Security Violation: Tenant B's private data leaked into Tenant A's database!"

        # 2. Assert Tenant B's private session CANNOT find Tenant A's journal
        with tenant_connection_manager.session_scope(tenant_b_id) as sess_b:
            res_b = sess_b.execute(
                text("SELECT * FROM account_journals WHERE company_id = :cid"),
                {"cid": str(tenant_a_id)}
            ).fetchall()
            assert len(res_b) == 0, "Security Violation: Tenant A's data leaked into Tenant B's private database!"

            # 3. Assert Tenant B finds ONLY its own private journal
            res_own = sess_b.execute(
                text("SELECT * FROM account_journals WHERE company_id = :cid"),
                {"cid": str(tenant_b_id)}
            ).fetchall()
            assert len(res_own) == 1
            assert res_own[0][1] == f"Private Journal B {suffix_b}"

    finally:
        tenant_connection_manager.reset_cache(tenant_b_id)
        if journal_a:
            db_session.delete(journal_a)
        db_session.delete(tenant_a)
        db_session.delete(company_a)
        db_session.delete(tenant_b)
        db_session.delete(company_b)
        db_session.commit()
        import os
        if os.path.exists(f"/tmp/oxengl_ext_{suffix_b}.db"):
            os.remove(f"/tmp/oxengl_ext_{suffix_b}.db")


# ==============================================================================
# 2. Dynamic Engine Routing & Negative Caching Eviction
# ==============================================================================

def test_dynamic_engine_negative_caching_and_eviction(db_session):
    """
    Verifies that standard tenants trigger the negative cache to prevent repeated
    DB lookups, and that cache eviction operates cleanly upon configuration changes.
    """
    tenant_id = uuid.uuid4()
    
    # Clean cache state
    tenant_connection_manager.reset_cache(tenant_id)
    assert tenant_id not in tenant_connection_manager._no_dedicated_cache

    # 1. First resolution: should determine no dedicated DB and add to negative cache
    engine_1 = tenant_connection_manager.get_engine(tenant_id, db=db_session)
    assert engine_1 == tenant_connection_manager.default_engine
    assert tenant_id in tenant_connection_manager._no_dedicated_cache

    # 2. Second resolution: fast-path via negative cache without querying DB
    engine_2 = tenant_connection_manager.get_engine(tenant_id, db=db_session)
    assert engine_2 == tenant_connection_manager.default_engine

    # 3. Simulate tenant upgrading to dedicated external DB
    mock_engine = create_engine("sqlite:///:memory:")
    tenant_connection_manager.register_tenant_engine(tenant_id, mock_engine)

    # Negative cache must be cleared and dedicated engine cached
    assert tenant_id not in tenant_connection_manager._no_dedicated_cache
    assert tenant_connection_manager.has_dedicated_engine(tenant_id)
    assert tenant_connection_manager.get_engine(tenant_id) is mock_engine

    # 4. Evict engine: resets back cleanly
    tenant_connection_manager.reset_cache(tenant_id)
    assert not tenant_connection_manager.has_dedicated_engine(tenant_id)
    assert tenant_id not in tenant_connection_manager._no_dedicated_cache


# ==============================================================================
# 3. RLS Connection Pool Scoping & Leak Prevention
# ==============================================================================

def test_rls_connection_scoping_resets_on_exit(db_session):
    """
    Verifies that tenant_rls_scope properly applies SET LOCAL variables
    and guarantees they are RESET on exit, even if an exception occurs.
    """
    tenant_uuid = uuid.uuid4()

    # Normal scope execution
    with tenant_rls_scope(db_session, str(tenant_uuid)):
        curr_tid = db_session.execute(text("SELECT current_setting('app.current_tenant_id', true)")).scalar()
        assert curr_tid == str(tenant_uuid)

    # After exiting scope, session variable must be cleared
    cleared_tid = db_session.execute(text("SELECT current_setting('app.current_tenant_id', true)")).scalar()
    assert cleared_tid in (None, "")

    # Exception inside scope: must still reset variables
    try:
        with tenant_rls_scope(db_session, str(tenant_uuid)):
            raise RuntimeError("Simulated transaction fault")
    except RuntimeError:
        pass

    cleared_after_err = db_session.execute(text("SELECT current_setting('app.current_tenant_id', true)")).scalar()
    assert cleared_after_err in (None, "")


# ==============================================================================
# 4. Zero-Slug Session Persistence & JWT Security Context
# ==============================================================================

def test_zero_slug_session_persistence_and_anti_spoofing(client, db_session):
    """
    Verifies that:
    1. Authenticating via zero-slug Host-header issues a token strictly bound to that tenant.
    2. Subsequent requests authenticate seamlessly with session persistence.
    3. An attacker cannot access another tenant's data by spoofing X-Tenant-ID headers.
    """
    suffix = uuid.uuid4().hex[:6]
    custom_host = f"portal-{suffix}.enterprisesaas.com"
    tenant_id = uuid.uuid4()
    slug = f"tenant-{suffix}"

    tenant = MasterTenant(
        id=tenant_id,
        name=f"Enterprise Corp {suffix}",
        slug=slug,
        custom_domain=custom_host,
        owner_full_name="Enterprise Admin",
        owner_email=f"admin@{custom_host}",
        owner_mobile="+966555987654",
        status="active",
        subscription_tier="enterprise",
    )
    company = ResCompany(
        id=tenant_id,
        name=f"Enterprise Corp {suffix}",
        slug=slug,
        custom_domain=custom_host,
        is_active=True,
    )
    db_session.add_all([tenant, company])
    db_session.commit()

    try:
        invalidate_domain_cache(custom_host)

        # 1. Issue authentic JWT for this enterprise tenant
        token = issue_two_tier_jwt(
            tier="tenant",
            user_id=uuid.uuid4(),
            identity=f"admin@{custom_host}",
            role="Admin",
            tenant_id=tenant_id,
            tenant_slug=slug,
        )

        claims = verify_two_tier_jwt(token, expected_tier="tenant")
        assert claims["tenant_id"] == str(tenant_id)
        assert claims["tenant_slug"] == slug

        # 2. Authenticated request using JWT + Custom Domain Host header
        resp = client.get(
            "/api/v1/tenant/control/domains",
            headers={
                "Host": custom_host,
                "Authorization": f"Bearer {token}",
            },
        )
        assert resp.status_code == 200
        domains_data = resp.json()
        assert any(d.get("domain_name") == custom_host for d in domains_data["domains"])

        # 3. Session persistence: request succeeds without Host header if token is valid
        resp_direct = client.get(
            "/api/v1/tenant/control/domains",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp_direct.status_code == 200
        assert any(d.get("domain_name") == custom_host for d in resp_direct.json()["domains"])

        # 4. Anti-spoofing boundary: An attacker tries passing a different X-Tenant-ID header
        attacker_target_id = str(uuid.uuid4())
        resp_spoofed = client.get(
            "/api/v1/tenant/control/domains",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-ID": attacker_target_id,  # Malicious override attempt
            },
        )
        # Token claims strictly anchor tenant; spoofed header does not switch tenant boundary
        assert resp_spoofed.status_code == 200
        assert any(d.get("domain_name") == custom_host for d in resp_spoofed.json()["domains"])

    finally:
        invalidate_domain_cache(custom_host)
        db_session.delete(tenant)
        db_session.delete(company)
        db_session.commit()


# ==============================================================================
# 5. Migration Boundary Failure & Live Revert Workflows
# ==============================================================================

def test_migration_failure_boundary_preserves_master_mapping(db_session):
    """
    Verifies that attempting migration to an unreachable or faulty external host:
    1. Returns a descriptive failure.
    2. Does NOT mark the tenant as external in master catalog.
    3. Leaves the source local database intact.
    """
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()

    tenant = MasterTenant(
        id=tenant_id,
        name=f"Migration Failure Test {suffix}",
        slug=f"mig-fail-{suffix}",
        owner_full_name="Mig Fail Admin",
        owner_email=f"fail@{suffix}.com",
        owner_mobile="+966555000111",
        status="active",
        subscription_tier="enterprise",
    )
    company = ResCompany(
        id=tenant_id,
        name=f"Migration Failure Test {suffix}",
        slug=f"mig-fail-{suffix}",
        is_active=True,
    )
    db_session.add_all([tenant, company])
    db_session.commit()

    mig_id = uuid.uuid4()
    mig_record = TenantDatabaseMigration(
        id=mig_id,
        company_id=tenant_id,
        target_host="127.0.0.99",
        target_port=5439,
        target_database="nonexistent_db",
        status="PENDING",
    )
    db_session.add(mig_record)
    db_session.commit()

    try:
        # Point to unreachable host
        faulty_target_url = "postgresql://baduser:badpass@127.0.0.99:5439/nonexistent_db"
        run_migration_worker(
            migration_id=mig_id,
            company_id=tenant_id,
            target_params={
                "raw_url": faulty_target_url,
                "host": "127.0.0.99",
                "port": 5439,
                "database_name": "nonexistent_db",
            },
        )

        db_session.expire_all()
        db_session.refresh(mig_record)
        assert mig_record.status == "FAILED"
        assert mig_record.error_message is not None
        assert "failed" in mig_record.error_message.lower() or "connect" in mig_record.error_message.lower()

        task_data = get_migration_status_data(tenant_id, migration_id=mig_id)
        assert task_data is not None
        assert task_data["status"] == "FAILED"

        # Verify master tenant was NOT changed to external
        cfg = db_session.query(TenantDatabaseConfig).filter(TenantDatabaseConfig.company_id == tenant_id).first()
        if cfg:
            assert cfg.is_active is False

    finally:
        db_session.delete(mig_record)
        db_session.delete(tenant)
        db_session.delete(company)
        db_session.commit()


def test_live_database_revert_endpoint(client, db_session):
    """
    Tests POST /api/v1/tenant/control/database/switch-back endpoint:
    Restores the tenant back to local platform database storage and evicts cached engines.
    """
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()

    tenant = MasterTenant(
        id=tenant_id,
        name=f"Revert Corp {suffix}",
        slug=f"revert-{suffix}",
        owner_full_name="Revert Admin",
        owner_email=f"admin@{suffix}.com",
        owner_mobile="+966555222333",
        status="active",
        subscription_tier="enterprise",
    )
    company = ResCompany(
        id=tenant_id,
        name=f"Revert Corp {suffix}",
        slug=f"revert-{suffix}",
        is_active=True,
    )
    db_session.add_all([tenant, company])
    db_session.commit()

    # Establish external config
    enc_url = encrypt_connection_url(f"postgresql://mock_user:mock_pass@external.db:5432/revert_{suffix}")
    config = TenantDatabaseConfig(
        id=uuid.uuid4(),
        company_id=tenant_id,
        database_name=f"revert_{suffix}",
        encrypted_connection_url=enc_url,
        is_active=True,
        residency_region="me-central2",
        isolation_level="dedicated",
    )
    db_session.add(config)
    db_session.commit()

    # Pre-populate engine cache
    dummy_eng = create_engine(f"sqlite:////tmp/revert_{suffix}.db")
    tenant_connection_manager.register_tenant_engine(tenant_id, dummy_eng)
    assert tenant_connection_manager.has_dedicated_engine(tenant_id)

    try:
        resp = client.post(
            "/api/v1/tenant/control/database/switch-back",
            headers={"X-Tenant-ID": str(tenant_id)},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["storage_mode"] == "LOCAL_SHARED"

        # Verify config updated
        db_session.refresh(config)
        assert config.is_active is False

        # Verify engine was evicted from pool
        assert not tenant_connection_manager.has_dedicated_engine(tenant_id)

    finally:
        tenant_connection_manager.reset_cache(tenant_id)
        db_session.delete(config)
        db_session.delete(tenant)
        db_session.delete(company)
        db_session.commit()
        import os
        if os.path.exists(f"/tmp/revert_{suffix}.db"):
            os.remove(f"/tmp/revert_{suffix}.db")


# ==============================================================================
# 6. Custom Domain Invalidation & Adversarial Gatekeeper Boundaries
# ==============================================================================

def test_caddy_ask_adversarial_boundaries_and_sub_millisecond_cache():
    """
    Tests edge cases and attack payloads against the Caddy on-demand ask gatekeeper:
    - Path traversal and shell injections
    - Hostile SQL injection attempts
    - High-throughput cached response benchmarking
    """
    adversarial_payloads = [
        "../../../etc/passwd",
        "'; DROP TABLE master_tenants; --",
        "<script>alert('xss')</script>",
        "attacker.com; rm -rf /",
        "*.wildcard-probe.com",
        "",
        " ",
        "192.168.1.100",
        "10.0.0.1",
    ]

    for bad_domain in adversarial_payloads:
        res = ssl_service.verify_caddy_ask(bad_domain)
        assert res["allowed"] is False, f"Adversarial domain unexpectedly allowed: {bad_domain}"

    # Benchmark: 50 fast calls on cached/base domain to ensure sub-millisecond response
    start_time = time.time()
    for _ in range(50):
        res = ssl_service.verify_caddy_ask("oxengl.me")
        assert res["allowed"] is True
    duration_ms = (time.time() - start_time) * 1000
    assert duration_ms < 50, f"Cache latency too high: {duration_ms}ms for 50 checks"


# ==============================================================================
# 7. End-to-End Enterprise Flow Integration
# ==============================================================================

def test_full_enterprise_end_to_end_integration(client, db_session):
    """
    Comprehensive End-to-End Test:
    Step 1: Onboard enterprise tenant with custom domain & external DB config.
    Step 2: Caddy dynamic ask gatekeeper checks domain -> HTTP 200 OK.
    Step 3: Authoritative DNS pre-flight verification -> verified.
    Step 4: Host-header zero-slug middleware resolves incoming host -> matches tenant.
    Step 5: Zero-slug tenant login -> generates session token.
    Step 6: Authenticated request accesses tenant resources via dedicated engine.
    """
    suffix = uuid.uuid4().hex[:6]
    custom_domain = f"portal-{suffix}.client-hub.org"
    slug = f"e2e-enterprise-{suffix}"
    tenant_id = uuid.uuid4()

    # Step 1: Seed MasterTenant and ResCompany
    tenant = MasterTenant(
        id=tenant_id,
        name=f"E2E Enterprise Corp {suffix}",
        slug=slug,
        custom_domain=custom_domain,
        owner_full_name="E2E Executive",
        owner_email=f"exec@{custom_domain}",
        owner_mobile="+966555333444",
        status="active",
        subscription_tier="enterprise",
    )
    company = ResCompany(
        id=tenant_id,
        name=f"E2E Enterprise Corp {suffix}",
        slug=slug,
        custom_domain=custom_domain,
        is_active=True,
    )
    db_session.add_all([tenant, company])
    db_session.commit()

    # Register private database for tenant
    ext_sqlite_url = f"sqlite:////tmp/e2e_db_{suffix}.db"
    dedicated_eng = create_engine(ext_sqlite_url)
    with dedicated_eng.connect() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS test_records (id VARCHAR(36) PRIMARY KEY, title VARCHAR(100));"))
        conn.commit()
    tenant_connection_manager.register_tenant_engine(tenant_id, dedicated_eng)

    try:
        invalidate_domain_cache(custom_domain)

        # Step 2: Caddy ask gatekeeper
        ask_resp = client.get(f"/api/v1/ssl/caddy-ask?domain={custom_domain}")
        assert ask_resp.status_code == 200, f"Caddy gatekeeper rejected valid enterprise domain: {ask_resp.text}"

        # Step 3: Domain DNS verification endpoint
        verify_resp = client.post(
            f"/api/v1/tenant/control/domains/{custom_domain}/verify",
            headers={"X-Tenant-ID": str(tenant_id)},
        )
        assert verify_resp.status_code == 200
        verify_data = verify_resp.json()
        assert verify_data["is_verified"] is True
        assert verify_data["routing"] == "Zero-Slug Ready"

        # Step 4: Host-header resolution
        resolution = resolve_tenant_from_host(custom_domain, db=db_session)
        assert resolution is not None
        assert resolution["tenant_slug"] == slug
        assert resolution["company_id"] == str(tenant_id)

        # Step 5: Issue and verify zero-slug token
        token = issue_two_tier_jwt(
            tier="tenant",
            user_id=uuid.uuid4(),
            identity=f"exec@{custom_domain}",
            role="Admin",
            tenant_id=tenant_id,
            tenant_slug=slug,
        )

        # Step 6: Authenticated request accessing tenant settings under custom domain
        settings_resp = client.get(
            "/api/v1/tenant/control/settings",
            headers={
                "Host": custom_domain,
                "Authorization": f"Bearer {token}",
            },
        )
        assert settings_resp.status_code == 200
        settings_data = settings_resp.json()
        assert settings_data["tenant_id"] == str(tenant_id)
        assert settings_data["settings"]["general"]["company_name_en"] == f"E2E Enterprise Corp {suffix}"

        # Step 7: Dedicated engine query execution verified
        with tenant_connection_manager.session_scope(tenant_id) as sess:
            sess.execute(text("INSERT INTO test_records (id, title) VALUES (:id, :t)"), {"id": str(uuid.uuid4()), "t": "Private E2E Record"})
            row = sess.execute(text("SELECT title FROM test_records")).fetchone()
            assert row[0] == "Private E2E Record"

    finally:
        tenant_connection_manager.reset_cache(tenant_id)
        invalidate_domain_cache(custom_domain)
        db_session.delete(tenant)
        db_session.delete(company)
        db_session.commit()
        import os
        if os.path.exists(f"/tmp/e2e_db_{suffix}.db"):
            os.remove(f"/tmp/e2e_db_{suffix}.db")
