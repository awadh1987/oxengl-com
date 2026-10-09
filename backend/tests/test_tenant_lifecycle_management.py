import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.database import SessionLocal
from backend import models
from backend.tests.auth_helpers import platform_superadmin_headers
from backend.app.api.v1.super_admin import execute_async_tenant_purge
from backend.app.core.guards import SYSTEM_ANCHOR_COMPANY_ID, SYSTEM_ANCHOR_SLUG

client = TestClient(app)


def test_status_toggle_suspends_and_reactivates_tenant():
    """
    Milestone 1 & 2: Verify status toggle endpoint:
    - Suspends tenant, updates master_tenants and res_companies, sets is_active=False, status='suspended'
    - Reactivates tenant, sets is_active=True, status='active'
    """
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    slug = f"lifecycle-toggle-{tenant_id.hex[:6]}"
    tenant_name = f"Lifecycle Toggle Corp {tenant_id.hex[:6]}"

    # Seed master_tenants and res_companies
    mt = models.MasterTenant(
        id=tenant_id,
        name=tenant_name,
        slug=slug,
        owner_full_name="Toggle Admin",
        owner_email=f"toggle_{tenant_id.hex[:6]}@test.oxen.sa",
        owner_mobile="+966500000001",
        status="active",
        subscription_tier="standard",
        max_users=10,
        max_storage_gb=25,
        is_active=True,
    )
    rc = models.ResCompany(
        id=tenant_id,
        name=tenant_name,
        slug=slug,
        domain_slug=slug,
        is_active=True,
        status="ACTIVE",
    )
    db.add_all([mt, rc])
    db.commit()

    admin_headers, admin_user = platform_superadmin_headers(db)
    db.close()

    try:
        # 1. Suspend tenant
        resp_suspend = client.post(
            f"/api/v1/super-admin/tenants/{tenant_id}/toggle-status",
            json={"is_active": False, "reason": "Compliance review suspension"},
            headers=admin_headers,
        )
        assert resp_suspend.status_code == 200, resp_suspend.text
        data_suspend = resp_suspend.json()
        assert data_suspend["is_active"] is False
        assert data_suspend["tenant_status"] == "suspended"
        assert data_suspend["tenant_id"] == str(tenant_id)

        # Verify DB state
        db = SessionLocal()
        mt_check = db.get(models.MasterTenant, tenant_id)
        rc_check = db.get(models.ResCompany, tenant_id)
        assert mt_check is not None and mt_check.is_active is False and mt_check.status == "suspended"
        assert rc_check is not None and rc_check.is_active is False
        db.close()

        # 2. Reactivate tenant
        resp_reactivate = client.post(
            f"/api/v1/super-admin/tenants/{tenant_id}/toggle-status",
            json={"is_active": True, "reason": "Compliance review passed"},
            headers=admin_headers,
        )
        assert resp_reactivate.status_code == 200, resp_reactivate.text
        data_reactivate = resp_reactivate.json()
        assert data_reactivate["is_active"] is True
        assert data_reactivate["tenant_status"] == "active"

        # Verify DB state
        db = SessionLocal()
        mt_check = db.get(models.MasterTenant, tenant_id)
        rc_check = db.get(models.ResCompany, tenant_id)
        assert mt_check is not None and mt_check.is_active is True and mt_check.status == "active"
        assert rc_check is not None and rc_check.is_active is True
        db.close()

    finally:
        # Cleanup
        db = SessionLocal()
        db.query(models.MasterTenant).filter(models.MasterTenant.id == tenant_id).delete()
        db.query(models.ResCompany).filter(models.ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()


def test_offboard_validation_mismatched_confirmation_name():
    """
    Milestone 4: Attempting to offboard with mismatched confirmation name returns 422.
    """
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    slug = f"lifecycle-mismatch-{tenant_id.hex[:6]}"
    tenant_name = f"Exact Tenant Name Corp {tenant_id.hex[:6]}"

    mt = models.MasterTenant(
        id=tenant_id,
        name=tenant_name,
        slug=slug,
        owner_full_name="Mismatch Admin",
        owner_email=f"mismatch_{tenant_id.hex[:6]}@test.oxen.sa",
        owner_mobile="+966500000002",
        status="active",
        subscription_tier="standard",
        max_users=5,
        max_storage_gb=10,
        is_active=True,
    )
    db.add(mt)
    db.commit()

    admin_headers, _ = platform_superadmin_headers(db)
    db.close()

    try:
        # Send wrong confirmation name
        resp = client.post(
            f"/api/v1/super-admin/tenants/{tenant_id}/offboard",
            json={"confirmation_name": "WRONG_CONFIRMATION_NAME", "purge_users": True},
            headers=admin_headers,
        )
        assert resp.status_code == 422, resp.text
        data = resp.json()
        assert "Confirmation name does not match tenant name" in str(data.get("detail"))

    finally:
        db = SessionLocal()
        db.query(models.MasterTenant).filter(models.MasterTenant.id == tenant_id).delete()
        db.commit()
        db.close()


def test_protected_tenant_guard_blocks_anchor_company():
    """
    Milestone 2: Protected tenant guard ensures anchor company (65e675a7-17fe-47fa-993d-25cb57e40ea4 or oxengl-platform)
    can NEVER be suspended or offboarded under any circumstances. Returns 403 Forbidden.
    """
    db = SessionLocal()
    admin_headers, _ = platform_superadmin_headers(db)
    db.close()

    anchor_id = SYSTEM_ANCHOR_COMPANY_ID

    # 1. Attempt to suspend anchor platform
    resp_suspend = client.post(
        f"/api/v1/super-admin/tenants/{anchor_id}/toggle-status",
        json={"is_active": False, "reason": "Malicious attempt"},
        headers=admin_headers,
    )
    assert resp_suspend.status_code == 403, resp_suspend.text
    assert "protected" in resp_suspend.json().get("detail", "").lower()

    # 2. Attempt to offboard anchor platform
    resp_offboard = client.post(
        f"/api/v1/super-admin/tenants/{anchor_id}/offboard",
        json={"confirmation_name": "OxenGL System Platform", "purge_users": True},
        headers=admin_headers,
    )
    assert resp_offboard.status_code == 403, resp_offboard.text
    assert "protected" in resp_offboard.json().get("detail", "").lower()


def test_dummy_tenant_offboard_and_purge_cascade():
    """
    Milestone 4 & 5: Creating temporary dummy tenant with dependent child rows,
    offboarding with exact confirmation name (returning 202 Accepted),
    and confirming background cascade purge completely wipes tenant and child data
    while preserving platform superadmins.
    """
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    slug = f"purge-test-{tenant_id.hex[:6]}"
    tenant_name = f"Purge Target Corp {tenant_id.hex[:6]}"

    # 1. Seed tenant company and master tenant
    mt = models.MasterTenant(
        id=tenant_id,
        name=tenant_name,
        slug=slug,
        owner_full_name="Target Admin",
        owner_email=f"target_{tenant_id.hex[:6]}@test.oxen.sa",
        owner_mobile="+966500000003",
        status="active",
        subscription_tier="standard",
        max_users=10,
        max_storage_gb=25,
        is_active=True,
    )
    rc = models.ResCompany(
        id=tenant_id,
        name=tenant_name,
        slug=slug,
        domain_slug=slug,
        is_active=True,
        status="ACTIVE",
    )
    db.add_all([mt, rc])
    db.commit()

    # 2. Add dependent child records
    tenant_user = models.ResUser(
        id=uuid.uuid4(),
        firebase_uid=f"native-user-{uuid.uuid4().hex[:8]}",
        email=f"employee_{tenant_id.hex[:6]}@purge.oxen.sa",
        full_name="Purgeable Employee",
        password_hash="fakehash",
        company_id=tenant_id,
        role="User",
        is_active=True,
        is_superuser=False,
    )
    partner = models.ResPartner(
        id=uuid.uuid4(),
        company_id=tenant_id,
        name=f"Partner of {slug}",
    )
    account = models.AccountAccount(
        id=uuid.uuid4(),
        company_id=tenant_id,
        code=f"AC-{tenant_id.hex[:4]}",
        name="Operating Cash",
        internal_type="asset",
    )
    db.add_all([tenant_user, partner, account])
    db.commit()

    admin_headers, admin_user = platform_superadmin_headers(db)
    superadmin_id = admin_user.id
    db.close()

    # 3. Call offboard endpoint with exact name confirmation
    resp = client.post(
        f"/api/v1/super-admin/tenants/{tenant_id}/offboard",
        json={"confirmation_name": tenant_name, "purge_users": True},
        headers=admin_headers,
    )
    assert resp.status_code == 202, resp.text
    data = resp.json()
    assert data["status"] == "accepted"
    assert "Offboarding initiated" in data["message"]

    # 4. Execute the purge worker synchronously to verify full database cleanup
    execute_async_tenant_purge(
        tenant_id=str(tenant_id),
        tenant_name=tenant_name,
        purge_users=True,
        actor_email="superadmin@oxengl.com",
    )

    # 5. Assert records purged from DB
    db = SessionLocal()
    try:
        assert db.get(models.MasterTenant, tenant_id) is None
        assert db.get(models.ResCompany, tenant_id) is None
        assert db.query(models.ResUser).filter(models.ResUser.company_id == tenant_id).first() is None
        assert db.query(models.ResPartner).filter(models.ResPartner.company_id == tenant_id).first() is None
        assert db.query(models.AccountAccount).filter(models.AccountAccount.company_id == tenant_id).first() is None

        # Verify platform superadmin user was NOT wiped
        superadmin_record = db.get(models.ResUser, superadmin_id)
        assert superadmin_record is not None, "Platform superadmin must be preserved!"
    finally:
        db.close()
