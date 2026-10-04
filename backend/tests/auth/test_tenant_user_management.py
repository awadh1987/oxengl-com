"""
Unit & Integration Tests for Phase 5: Tenant User Management & RBAC Isolation.
Verifies that:
1. Admins in Tenant A can list and invite users strictly within Tenant A.
2. Users with non-Admin roles (e.g., Accountant, Data_Entry, Guest) are rejected with HTTP 403 Forbidden.
3. Cross-Tenant Isolation: An Admin in Tenant A cannot view, modify, or delete a user in Tenant B (HTTP 403 Forbidden).
"""

import uuid
import pytest
from fastapi import status
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import ResCompany, ResUser
from backend.two_tier_auth import hash_password, issue_two_tier_jwt


@pytest.fixture
def test_tenants_and_users():
    """Seeds two separate tenant workspaces with an admin and a member each."""
    db: Session = SessionLocal()
    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    company_a = ResCompany(
        id=tenant_a_id,
        name="Tenant A Corp",
        slug=f"tenant-a-{tenant_a_id.hex[:6]}",
        currency="SAR",
        fiscal_calendar="gregorian",
        fiscal_year_start_month=1,
        tax_regime="KSA_VAT",
    )
    company_b = ResCompany(
        id=tenant_b_id,
        name="Tenant B Corp",
        slug=f"tenant-b-{tenant_b_id.hex[:6]}",
        currency="SAR",
        fiscal_calendar="gregorian",
        fiscal_year_start_month=1,
        tax_regime="KSA_VAT",
    )
    db.add_all([company_a, company_b])
    db.commit()

    # Tenant A Owner, Admin & Non-Admin
    user_owner_a_id = uuid.uuid4()
    user_admin_a_id = uuid.uuid4()
    user_accountant_a_id = uuid.uuid4()
    owner_a = ResUser(
        id=user_owner_a_id,
        company_id=tenant_a_id,
        email=f"owner_a_{user_owner_a_id.hex[:6]}@tenanta.com",
        full_name="Owner Tenant A",
        role="Owner",
        password_hash=hash_password("Pass123!"),
        is_active=True,
    )
    admin_a = ResUser(
        id=user_admin_a_id,
        company_id=tenant_a_id,
        email=f"admin_a_{user_admin_a_id.hex[:6]}@tenanta.com",
        full_name="Admin Tenant A",
        role="Admin",
        password_hash=hash_password("Pass123!"),
        is_active=True,
    )
    accountant_a = ResUser(
        id=user_accountant_a_id,
        company_id=tenant_a_id,
        email=f"acc_a_{user_accountant_a_id.hex[:6]}@tenanta.com",
        full_name="Accountant Tenant A",
        role="Accountant",
        password_hash=hash_password("Pass123!"),
        is_active=True,
    )

    # Tenant B Admin & Target Member
    user_admin_b_id = uuid.uuid4()
    user_member_b_id = uuid.uuid4()
    admin_b = ResUser(
        id=user_admin_b_id,
        company_id=tenant_b_id,
        email=f"admin_b_{user_admin_b_id.hex[:6]}@tenantb.com",
        full_name="Admin Tenant B",
        role="Admin",
        password_hash=hash_password("Pass123!"),
        is_active=True,
    )
    member_b = ResUser(
        id=user_member_b_id,
        company_id=tenant_b_id,
        email=f"member_b_{user_member_b_id.hex[:6]}@tenantb.com",
        full_name="Member Tenant B",
        role="Data_Entry",
        password_hash=hash_password("Pass123!"),
        is_active=True,
    )

    db.add_all([owner_a, admin_a, accountant_a, admin_b, member_b])
    db.commit()

    # Generate JWT access tokens
    token_owner_a = issue_two_tier_jwt(
        tier="tenant",
        user_id=user_owner_a_id,
        identity=owner_a.email,
        role="Owner",
        tenant_id=tenant_a_id,
        tenant_slug=company_a.slug,
    )
    token_admin_a = issue_two_tier_jwt(
        tier="tenant",
        user_id=user_admin_a_id,
        identity=admin_a.email,
        role="Admin",
        tenant_id=tenant_a_id,
        tenant_slug=company_a.slug,
    )
    token_accountant_a = issue_two_tier_jwt(
        tier="tenant",
        user_id=user_accountant_a_id,
        identity=accountant_a.email,
        role="Accountant",
        tenant_id=tenant_a_id,
        tenant_slug=company_a.slug,
    )
    token_admin_b = issue_two_tier_jwt(
        tier="tenant",
        user_id=user_admin_b_id,
        identity=admin_b.email,
        role="Admin",
        tenant_id=tenant_b_id,
        tenant_slug=company_b.slug,
    )

    data = {
        "tenant_a_id": tenant_a_id,
        "tenant_b_id": tenant_b_id,
        "owner_a_id": user_owner_a_id,
        "admin_a_id": user_admin_a_id,
        "member_b_id": user_member_b_id,
        "token_owner_a": token_owner_a,
        "token_admin_a": token_admin_a,
        "token_accountant_a": token_accountant_a,
        "token_admin_b": token_admin_b,
    }

    yield data

    # Cleanup
    try:
        db.query(ResUser).filter(ResUser.company_id.in_([tenant_a_id, tenant_b_id])).delete(synchronize_session=False)
        db.query(ResCompany).filter(ResCompany.id.in_([tenant_a_id, tenant_b_id])).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_get_users_tenant_isolation(async_client, test_tenants_and_users):
    """Admin A should only see users of Tenant A, never Tenant B."""
    token_admin_a = test_tenants_and_users["token_admin_a"]
    headers = {"Authorization": f"Bearer {token_admin_a}"}

    response = await async_client.get("/api/v1/users", headers=headers)
    assert response.status_code == status.HTTP_200_OK
    users = response.json()
    assert len(users) >= 2
    for u in users:
        assert u["tenant_id"] == str(test_tenants_and_users["tenant_a_id"])


@pytest.mark.asyncio
async def test_require_role_rejection(async_client, test_tenants_and_users):
    """Accountant (non-Admin) requesting GET /api/v1/users must receive HTTP 403 Forbidden."""
    token_accountant_a = test_tenants_and_users["token_accountant_a"]
    headers = {"Authorization": f"Bearer {token_accountant_a}"}

    response = await async_client.get("/api/v1/users", headers=headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "Access forbidden" in response.json().get("detail", "")


@pytest.mark.asyncio
async def test_invite_user_creates_tenant_scoped_external_record(async_client, test_tenants_and_users):
    """Admin A can invite an *external* identity; it is tenant-scoped and no password is ever returned."""
    token_admin_a = test_tenants_and_users["token_admin_a"]
    headers = {"Authorization": f"Bearer {token_admin_a}"}

    unique_email = f"auditor_{uuid.uuid4().hex[:6]}@gmail.com"
    payload = {"email": unique_email, "role": "External_Auditor", "full_name": "Ext Auditor"}
    response = await async_client.post("/api/v1/users/invite", json=payload, headers=headers)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["status"] == "invited"
    assert data["email"] == unique_email
    assert data["role"] == "External_Auditor"
    assert "temporary_password" not in data and "password" not in data


@pytest.mark.asyncio
async def test_invite_rejects_internal_roles(async_client, test_tenants_and_users):
    """Internal staff must come through HR: the invite endpoint refuses every internal/legacy role."""
    headers = {"Authorization": f"Bearer {test_tenants_and_users['token_admin_a']}"}
    for role in ("Data_Entry", "Finance_Manager", "Super_Admin", "Admin"):
        response = await async_client.post(
            "/api/v1/users/invite",
            json={"email": f"x_{uuid.uuid4().hex[:6]}@gmail.com", "role": role},
            headers=headers,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "registered via the HR module" in response.json().get("detail", "")


@pytest.mark.asyncio
async def test_cross_tenant_delete_prevention(async_client, test_tenants_and_users):
    """Admin A attempting to delete Member B (Tenant B) must be blocked with HTTP 403 Forbidden."""
    token_admin_a = test_tenants_and_users["token_admin_a"]
    headers = {"Authorization": f"Bearer {token_admin_a}"}
    member_b_id = test_tenants_and_users["member_b_id"]

    response = await async_client.delete(f"/api/v1/users/{member_b_id}", headers=headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "Cross-tenant violation" in response.json().get("detail", "")


@pytest.mark.asyncio
async def test_tenant_a_user_cannot_see_tenant_b_users(async_client, test_tenants_and_users):
    """
    CRITICAL MULTI-TENANT ISOLATION ASSERTION:
    Explicitly asserts that an Admin from Tenant A cannot see any accounts belonging
    to Tenant B in the user listing endpoint (GET /api/v1/users).
    Also asserts that attempting to inject Tenant B's ID via X-Company-ID or ?company_id=
    is actively intercepted and rejected with HTTP 403 Forbidden.
    """
    token_admin_a = test_tenants_and_users["token_admin_a"]
    token_admin_b = test_tenants_and_users["token_admin_b"]
    tenant_a_id = test_tenants_and_users["tenant_a_id"]
    tenant_b_id = test_tenants_and_users["tenant_b_id"]

    headers_a = {"Authorization": f"Bearer {token_admin_a}"}
    headers_b = {"Authorization": f"Bearer {token_admin_b}"}

    # 1. Fetch Tenant B users with Tenant B token to get the exact set of Tenant B emails
    resp_b = await async_client.get("/api/v1/users", headers=headers_b)
    assert resp_b.status_code == status.HTTP_200_OK
    tenant_b_users = resp_b.json()
    tenant_b_emails = {u["email"] for u in tenant_b_users}
    assert len(tenant_b_emails) >= 2, "Tenant B should have at least 2 users"

    # 2. Fetch Tenant A users with Tenant A token
    resp_a = await async_client.get("/api/v1/users", headers=headers_a)
    assert resp_a.status_code == status.HTTP_200_OK
    tenant_a_users = resp_a.json()
    tenant_a_emails = {u["email"] for u in tenant_a_users}

    # Explicit assertion: Zero intersection between Tenant A user list and Tenant B users
    bleed = tenant_a_emails.intersection(tenant_b_emails)
    assert not bleed, f"CRITICAL DATA BLEED DETECTED: Tenant A saw Tenant B users: {bleed}"

    # Explicit assertion: Every user returned for Tenant A belongs strictly to Tenant A
    for user in tenant_a_users:
        assert user["tenant_id"] == str(tenant_a_id)
        assert user["tenant_id"] != str(tenant_b_id)
        assert user["email"] not in tenant_b_emails

    # 3. IDOR Attack Assertion: Tenant A Admin attempts to query Tenant B users via query parameter
    idor_query = await async_client.get(f"/api/v1/users?company_id={tenant_b_id}", headers=headers_a)
    assert idor_query.status_code == status.HTTP_403_FORBIDDEN
    assert "Multi-tenant isolation violation" in idor_query.json().get("detail", "")

    # 4. IDOR Attack Assertion: Tenant A Admin attempts to query Tenant B users via header spoofing
    idor_header = await async_client.get("/api/v1/users", headers={**headers_a, "X-Company-ID": str(tenant_b_id)})
    assert idor_header.status_code == status.HTTP_403_FORBIDDEN
    assert "Multi-tenant isolation violation" in idor_header.json().get("detail", "")


@pytest.mark.asyncio
async def test_owner_can_list_tenant_users(async_client, test_tenants_and_users):
    """OWNER should successfully query GET /api/v1/users without triggering 403."""
    token_owner_a = test_tenants_and_users["token_owner_a"]
    headers = {"Authorization": f"Bearer {token_owner_a}"}

    response = await async_client.get("/api/v1/users", headers=headers)
    assert response.status_code == status.HTTP_200_OK
    users = response.json()
    assert len(users) >= 3
    for u in users:
        assert u["tenant_id"] == str(test_tenants_and_users["tenant_a_id"])


@pytest.mark.asyncio
async def test_owner_can_invite_external_and_assign_standard_roles(async_client, test_tenants_and_users):
    """OWNER invites external identities only, and can then assign any standardized role."""
    token_owner_a = test_tenants_and_users["token_owner_a"]
    headers = {"Authorization": f"Bearer {token_owner_a}"}

    unique_email = f"contractor_{uuid.uuid4().hex[:6]}@outlook.com"
    response = await async_client.post(
        "/api/v1/users/invite", json={"email": unique_email, "role": "Guest", "full_name": "Contractor"}, headers=headers
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["role"] == "Guest"
    assert data["email"] == unique_email

    user_id = data["user_id"]
    update_resp = await async_client.put(f"/api/v1/users/{user_id}/role", json={"role": "Ops_Editor"}, headers=headers)
    assert update_resp.status_code == status.HTTP_200_OK
    assert update_resp.json()["role"] == "Ops_Editor"
    assert update_resp.json()["iam_role"] == "Ops_Editor"

    legacy_resp = await async_client.put(f"/api/v1/users/{user_id}/role", json={"role": "Admin"}, headers=headers)
    assert legacy_resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.asyncio
async def test_owner_cross_tenant_isolation(async_client, test_tenants_and_users):
    """OWNER cannot access users of another tenant or spoof headers."""
    token_owner_a = test_tenants_and_users["token_owner_a"]
    tenant_b_id = test_tenants_and_users["tenant_b_id"]
    headers = {"Authorization": f"Bearer {token_owner_a}"}

    # Attempt query param IDOR
    idor_query = await async_client.get(f"/api/v1/users?company_id={tenant_b_id}", headers=headers)
    assert idor_query.status_code == status.HTTP_403_FORBIDDEN
    assert "Multi-tenant isolation violation" in idor_query.json().get("detail", "")

    # Attempt header spoofing
    idor_header = await async_client.get("/api/v1/users", headers={**headers, "X-Company-ID": str(tenant_b_id)})
    assert idor_header.status_code == status.HTTP_403_FORBIDDEN
    assert "Multi-tenant isolation violation" in idor_header.json().get("detail", "")

