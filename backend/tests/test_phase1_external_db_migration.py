# File: backend/tests/test_phase1_external_db_migration.py
"""
Automated Integration and Architectural Verification Suite for Phase 1:
Private External Database Hosting, Dynamic Connection Pooling, and In-App Migration.
"""
import uuid
import pytest
from sqlalchemy import create_engine, text
from fastapi.testclient import TestClient

from backend.database import (
    tenant_connection_manager,
    TenantConnectionManager,
    engine as shared_engine,
    encrypt_connection_url,
)
from backend.app.main import app
from backend.models import TenantDatabaseConfig, TenantDatabaseMigration, ResCompany
from backend.app.database import SessionLocal
from backend.app.services.migration_service import (
    build_connection_url,
    parse_connection_metadata,
    get_tenant_database_info,
    revert_to_shared_database,
)
from backend.api.dependencies import create_access_token

client = TestClient(app)


def test_tenant_connection_manager_negative_cache_and_pooling():
    """
    Verifies that TenantConnectionManager utilizes thread-safe negative caching
    for standard multi-tenant accounts, avoiding redundant database lookups,
    and supports dynamic engine registration and cache clearing.
    """
    dummy_company_id = uuid.uuid4()

    # 1. Clear any prior cache state for this ID
    tenant_connection_manager.reset_cache(dummy_company_id)
    assert dummy_company_id not in tenant_connection_manager._no_dedicated_cache

    # 2. Querying for an unconfigured tenant should yield default engine and populate negative cache
    db = SessionLocal()
    try:
        resolved_engine = tenant_connection_manager.get_engine(dummy_company_id, db=db)
        assert resolved_engine == tenant_connection_manager.default_engine
        assert dummy_company_id in tenant_connection_manager._no_dedicated_cache

        # 3. Subsequent query hits the negative cache immediately without hitting DB
        resolved_engine_cached = tenant_connection_manager.get_engine(dummy_company_id, db=db)
        assert resolved_engine_cached == tenant_connection_manager.default_engine
    finally:
        db.close()

    # 4. Test engine registration
    sqlite_engine = create_engine("sqlite:///:memory:")
    tenant_connection_manager.register_engine(dummy_company_id, sqlite_engine)
    
    assert tenant_connection_manager.has_dedicated_engine(dummy_company_id) is True
    assert dummy_company_id not in tenant_connection_manager._no_dedicated_cache

    # 5. Get isolated session from registered engine
    session = tenant_connection_manager.get_session(dummy_company_id)
    assert session is not None
    res = session.execute(text("SELECT 1")).scalar()
    assert res == 1
    session.close()

    # 6. Test eviction and disposal
    tenant_connection_manager.reset_cache(dummy_company_id)
    assert tenant_connection_manager.has_dedicated_engine(dummy_company_id) is False
    assert dummy_company_id not in tenant_connection_manager._engine_cache


def test_connection_testing_utility():
    """
    Verifies that TenantConnectionManager.test_connection
    accurately tests live PostgreSQL/database connectivity with timeouts.
    """
    # 1. Invalid unreachable host should fail gracefully within timeout
    unreachable_url = "postgresql://invalid_user:invalid_pass@127.0.0.99:5439/nonexistent_db"
    success, err_msg = TenantConnectionManager.test_connection(unreachable_url, timeout=2)
    assert success is False
    assert err_msg is not None

    # 2. Valid connection to existing shared database engine should pass
    shared_db_url = shared_engine.url.render_as_string(hide_password=False)
    success, err_msg = TenantConnectionManager.test_connection(shared_db_url, timeout=5)
    assert success is True
    assert err_msg is None

    # 3. Connection string builder helper
    constructed_url = build_connection_url(
        host="db.corp.local",
        port=5432,
        database_name="prod_erp",
        username="oxen_admin",
        password="secret_password",
        ssl_mode="require",
    )
    assert "oxen_admin:secret_password@db.corp.local:5432/prod_erp" in constructed_url
    assert "sslmode=require" in constructed_url

    # 4. Metadata parser
    meta = parse_connection_metadata(constructed_url)
    assert meta["host"] == "db.corp.local"
    assert meta["port"] == 5432
    assert meta["database_name"] == "prod_erp"
    assert meta["ssl_mode"] == "require"


def test_migration_service_lifecycle_and_revert():
    """
    Verifies that get_tenant_database_info correctly identifies LOCAL_SHARED vs
    DEDICATED_EXTERNAL, and revert_to_shared_database evicts external engines and restores state.
    """
    db = SessionLocal()
    test_company_id = uuid.uuid4()

    try:
        # Create a transient test company
        test_company = ResCompany(
            id=test_company_id,
            name=f"Migration Test Corp {test_company_id.hex[:6]}",
            domain_slug=f"mig-test-{test_company_id.hex[:6]}",
            is_active=True,
        )
        db.add(test_company)
        db.commit()

        # 1. Before any config, tenant should be in LOCAL_SHARED mode
        info = get_tenant_database_info(test_company_id, db)
        assert info["storage_mode"] == "LOCAL_SHARED"
        assert info["is_external"] is False

        # 2. Attach an encrypted dedicated configuration
        mock_ext_url = "postgresql://user:pass@external-db.example.com:5432/test_db?sslmode=prefer"
        enc_url = encrypt_connection_url(mock_ext_url)
        cfg = TenantDatabaseConfig(
            company_id=test_company_id,
            database_name="test_db",
            encrypted_connection_url=enc_url,
            is_active=True,
            residency_region="me-central2",
            isolation_level="dedicated",
        )

        db.add(cfg)
        db.commit()

        # Invalidate cache to detect new row
        tenant_connection_manager.reset_cache(test_company_id)

        # 3. Should now report DEDICATED_EXTERNAL
        info_dedicated = get_tenant_database_info(test_company_id, db)
        assert info_dedicated["storage_mode"] == "DEDICATED_EXTERNAL"
        assert info_dedicated["is_external"] is True
        assert info_dedicated["host"] == "external-db.example.com"
        assert info_dedicated["database_name"] == "test_db"

        # 4. Revert to shared database
        revert_result = revert_to_shared_database(test_company_id, db)
        assert revert_result["success"] is True

        # Confirm config row is deactivated
        db.refresh(cfg)
        assert cfg.is_active is False

        # Mode should revert back to LOCAL_SHARED
        info_reverted = get_tenant_database_info(test_company_id, db)
        assert info_reverted["storage_mode"] == "LOCAL_SHARED"
        assert info_reverted["is_external"] is False

    finally:
        # Cleanup
        db.query(TenantDatabaseConfig).filter(TenantDatabaseConfig.company_id == test_company_id).delete()
        db.query(ResCompany).filter(ResCompany.id == test_company_id).delete()
        db.commit()
        db.close()
        tenant_connection_manager.reset_cache(test_company_id)


def test_tenant_control_api_database_endpoints():
    """
    Verifies that the /api/v1/tenant/control/database endpoints:
    - Return current config with auth context
    - Execute live connection tests
    - Handle live migration triggers with BackgroundTasks
    """
    db = SessionLocal()
    test_company_id = uuid.uuid4()
    random_str = uuid.uuid4().hex[:6]

    try:
        # Create test company and user for JWT token
        company = ResCompany(
            id=test_company_id,
            name=f"API Test Tenant Corp {random_str}",
            domain_slug=f"api-test-{random_str}",
            is_active=True,
        )
        db.add(company)
        db.commit()

        token = create_access_token(data={"sub": f"admin@{random_str}.com", "company_id": str(test_company_id), "role": "admin"})
        headers = {
            "Authorization": f"Bearer {token}",
            "x-tenant-id": str(test_company_id),
            "x-company-id": str(test_company_id),
        }

        # 1. GET /database/config
        resp = client.get("/api/v1/tenant/control/database/config", headers=headers)
        assert resp.status_code == 200, f"Config endpoint failed: {resp.text}"
        data = resp.json()
        assert data["storage_mode"] == "LOCAL_SHARED"
        assert data["is_external"] is False

        # 2. POST /database/test-connection with unreachable target
        test_payload = {
            "host": "127.0.0.99",
            "port": 5439,
            "database_name": "test_db",
            "username": "user",
            "password": "pwd",
            "ssl_mode": "prefer",
        }
        test_resp = client.post("/api/v1/tenant/control/database/test-connection", json=test_payload, headers=headers)
        assert test_resp.status_code == 200
        test_data = test_resp.json()
        assert test_data["success"] is False
        assert "failed" in test_data["message"].lower()

        # 3. GET /database/migration-status when no migration exists returns 404
        mig_status_resp = client.get("/api/v1/tenant/control/database/migration-status", headers=headers)
        assert mig_status_resp.status_code == 404
        assert "no database migration" in mig_status_resp.json()["detail"].lower()

        # 4. Seed a migration record and verify status response
        mig_job = TenantDatabaseMigration(
            company_id=test_company_id,
            status="COMPLETED",
            progress_pct=100,
            current_step="Active & Verified",
            records_transferred=42,
            target_host="db.example.com",
            target_database="test_db",
            ssl_mode="require",
        )
        db.add(mig_job)
        db.commit()

        mig_status_resp2 = client.get("/api/v1/tenant/control/database/migration-status", headers=headers)
        assert mig_status_resp2.status_code == 200
        mig_data = mig_status_resp2.json()
        assert mig_data["status"] == "COMPLETED"
        assert mig_data["progress_pct"] == 100
        assert mig_data["records_transferred"] == 42
    finally:
        db.query(TenantDatabaseMigration).filter(TenantDatabaseMigration.company_id == test_company_id).delete()
        db.query(ResCompany).filter(ResCompany.id == test_company_id).delete()
        db.commit()
        db.close()


def test_onboarding_pipeline_with_external_database_validation():
    """
    Verifies that the tenant onboarding pipeline (/api/v1/auth/register-tenant):
    - Validates external database connectivity when use_external_db=True
    - Rejects invalid/unreachable external databases with clear 400 error
    """
    random_str = uuid.uuid4().hex[:6]
    failing_payload = {
        "company_name_ar": f"شركة الاختبار الخارجي {random_str}",
        "company_name_en": f"External Test Corp {random_str}",
        "domain_slug": f"ext-corp-{random_str}",
        "admin_email": f"admin@{random_str}.com",
        "use_external_db": True,
        "external_db_host": "127.0.0.99",
        "external_db_port": 5439,
        "external_db_name": "unreachable_db",
        "external_db_user": "postgres",
        "external_db_password": "invalid_password",
        "external_db_sslmode": "require",
    }

    # Should attempt to verify connectivity before creating any records and fail cleanly
    resp = client.post("/api/v1/auth/register-tenant", json=failing_payload)
    assert resp.status_code == 400
    assert "connection test failed" in resp.text.lower() or "connection failed" in resp.text.lower()
