import pytest
from sqlalchemy import text
from backend.database import SessionLocal

@pytest.fixture(scope="function")
def db_session():
    """Provides a fresh database session running as the oxengl_app role."""
    session = SessionLocal()
    yield session
    session.close()

def test_unscoped_access_returns_zero_rows(db_session):
    """Ensure queries without a tenant context fail closed (0 rows)."""
    # Querying a known tenant table without setting app.current_tenant_id
    result = db_session.execute(text("SELECT count(*) FROM res_users")).scalar()
    
    assert result == 0, f"RLS Breach: Expected 0 rows without tenant context, got {result}."

def test_spoofed_master_admin_returns_zero_rows(db_session):
    """Ensure legacy master flags cannot bypass RLS from the app role."""
    # Attempt to spoof the legacy platform flag
    db_session.execute(text("SELECT set_config('app.is_master_admin', 'true', false)"))
    
    # RLS should still block access because oxengl_app does not have BYPASSRLS
    result = db_session.execute(text("SELECT count(*) FROM res_users")).scalar()
    
    assert result == 0, "RLS Breach: Application role bypassed RLS using legacy master flag!"

def test_app_role_cannot_bypass_rls(db_session):
    """Verify the oxengl_app role inherently lacks BYPASSRLS privileges."""
    current_user = db_session.execute(text("SELECT current_user")).scalar()
    
    query = text("SELECT rolbypassrls FROM pg_roles WHERE rolname = :username")
    can_bypass = db_session.execute(query, {"username": current_user}).scalar()
    
    assert can_bypass is False, f"Security Risk: Application role '{current_user}' has BYPASSRLS privileges!"

def test_all_public_tables_have_rls_enabled(db_session):
    """
    Verify 100% RLS enforcement across the public schema.
    This will catch any future Alembic migrations that forget to add RLS policies.
    """
    query = text("""
        SELECT count(c.relname)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p')
          AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
               OR NOT EXISTS (SELECT 1 FROM pg_policies p
                               WHERE p.schemaname='public' AND p.tablename=c.relname))
    """)
    unprotected_tables = db_session.execute(query).scalar()
    
    # This expects exactly 0 unprotected tables. 
    # NOTE: This will fail immediately until you run enforce_erp_db_rls.sql on those 4 missing tables!
    assert unprotected_tables == 0, f"RLS Drift Detected: Found {unprotected_tables} unprotected tables. Run enforce_erp_db_rls.sql."