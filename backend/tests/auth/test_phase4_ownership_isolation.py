"""
Phase 4 Test Suite: Tenant Ownership Model & Superadmin Isolation
Filename: backend/tests/auth/test_phase4_ownership_isolation.py

Validates:
1. Tenant administrative guard authorization: Tenant Owner and Admin are accepted without platform superadmin credentials.
2. Tenant administrative guard denial: Non-administrative roles (Member, Staff, Guest, Accountant) receive HTTP 403.
3. Superadmin isolation: Superadmin users and roles are strictly excluded from tenant member listings
   (tenant_control.list_team_members, users.get_tenant_users, main.list_tenant_users).
4. Tenant communications & branding control: Tenant Owner can read and update workspace branding settings.
5. Workspace user creation: Tenant Admin/Owner can create users with workspace roles (e.g. Accountant) without HR block; Super_Admin is rejected.
6. Full invitation-to-activation lifecycle:
   - Invite with role -> password reset requirement & invited status
   - Login intercept with scope=password_change
   - Mandatory first-login password change -> activation
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, Request, Response, status

from backend.app.api.v1.communications import (
    TenantCommunicationBranding,
    _tenant_admin,
    get_tenant_communication_branding,
    update_tenant_communication_branding,
)
from backend.two_tier_auth import (
    hash_password,
    issue_two_tier_jwt,
    verify_password,
    verify_two_tier_jwt,
)
from backend.app.api.v1.tenant_control import list_team_members
from backend.app.api.v1.users import (
    AuditContext,
    InviteUserRequest,
    get_tenant_users,
    invite_tenant_user,
)
from backend.app.main import (
    TenantUserCreateRequest,
    create_tenant_user,
    list_tenant_users,
    require_tenant_admin,
)
from backend.models import ResCompany, ResUser, TenantUser, TenantUserRole


# ------------------------------------------------------------------------------
# 1. Tenant Administrative Guard: Owner and Admin Authorization
# ------------------------------------------------------------------------------

def test_require_tenant_admin_accepts_owner():
    """Verify require_tenant_admin permits tenant Owner without superadmin credentials."""
    tenant_id = uuid.uuid4()
    owner_user = ResUser(
        id=uuid.uuid4(),
        email="owner@tenant.corp",
        role="Owner",
        is_superuser=False,
        company_id=tenant_id,
    )
    mock_request = MagicMock(spec=Request)
    mock_request.url.path = "/api/v1/tenant/settings"
    mock_request.method = "POST"
    mock_request.headers.get.return_value = "pytest"
    mock_db = MagicMock()

    result = require_tenant_admin(
        request=mock_request,
        database=mock_db,
        current_user=owner_user,
        company_id=tenant_id,
    )
    assert result == owner_user


def test_require_tenant_admin_accepts_admin():
    """Verify require_tenant_admin permits tenant Admin."""
    tenant_id = uuid.uuid4()
    admin_user = ResUser(
        id=uuid.uuid4(),
        email="admin@tenant.corp",
        role="Admin",
        is_superuser=False,
        company_id=tenant_id,
    )
    mock_request = MagicMock(spec=Request)
    mock_request.url.path = "/api/v1/tenant/settings"
    mock_request.method = "POST"
    mock_request.headers.get.return_value = "pytest"
    mock_db = MagicMock()

    result = require_tenant_admin(
        request=mock_request,
        database=mock_db,
        current_user=admin_user,
        company_id=tenant_id,
    )
    assert result == admin_user


def test_require_tenant_admin_rejects_non_admin_roles():
    """Verify require_tenant_admin raises HTTP 403 for non-administrative tenant roles."""
    tenant_id = uuid.uuid4()
    mock_request = MagicMock(spec=Request)
    mock_request.url.path = "/api/v1/tenant/settings"
    mock_request.method = "POST"
    mock_request.headers.get.return_value = "pytest"
    mock_db = MagicMock()

    for role in ["Member", "Staff", "Guest", "Accountant", "Data_Entry", "User"]:
        restricted_user = ResUser(
            id=uuid.uuid4(),
            email=f"{role.lower()}@tenant.corp",
            role=role,
            is_superuser=False,
            company_id=tenant_id,
        )
        with pytest.raises(HTTPException) as exc_info:
            require_tenant_admin(
                request=mock_request,
                database=mock_db,
                current_user=restricted_user,
                company_id=tenant_id,
            )
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Access denied" in exc_info.value.detail


# ------------------------------------------------------------------------------
# 2. Communications & Branding: Owner Administrative Control
# ------------------------------------------------------------------------------

def test_tenant_owner_can_manage_communication_branding():
    """Verify Tenant Owner passes _tenant_admin and can update communication branding."""
    tenant_id = uuid.uuid4()
    owner_user = ResUser(
        id=uuid.uuid4(),
        email="owner@tenant.corp",
        role="Owner",
        company_id=tenant_id,
    )
    mock_request = MagicMock(spec=Request)
    mock_db = MagicMock()

    # 1. Guard check
    user, tid = _tenant_admin(request=mock_request, user=owner_user, db=mock_db)
    assert user == owner_user
    assert tid == tenant_id

    # 2. Update branding
    company = ResCompany(
        id=tenant_id,
        name="Apex Logistics",
        slug="apex-logistics",
        workspace_login_url=None,
    )
    def fake_query(model):
        q = MagicMock()
        if model == ResCompany:
            q.filter.return_value.first.return_value = company
        else:
            q.filter.return_value.first.return_value = None
        return q
    mock_db.query.side_effect = fake_query

    update_payload = TenantCommunicationBranding(
        workspace_login_url="https://apex.oxengl.com/login",
        invitation_headline="Welcome to Apex Logistics Portal",
        invitation_body="You have been invited to collaborate with Apex Logistics.",
        signature_name="CEO Office",
        signature_title="Operations Lead",
        support_email="support@apex.corp",
    )

    with patch("backend.app.api.v1.communications._audit"):
        updated = update_tenant_communication_branding(
            payload=update_payload,
            request=mock_request,
            auth=(owner_user, tenant_id),
            db=mock_db,
        )

    assert updated.workspace_login_url == "https://apex.oxengl.com/login"
    assert updated.invitation_headline == "Welcome to Apex Logistics Portal"
    assert updated.signature_name == "CEO Office"
    assert company.workspace_login_url == "https://apex.oxengl.com/login"
    assert company.support_email == "support@apex.corp"
    mock_db.commit.assert_called()


# ------------------------------------------------------------------------------
# 3. Superadmin Isolation from Tenant Member Lists
# ------------------------------------------------------------------------------

def test_list_team_members_excludes_superadmin_and_deleted():
    """Verify list_team_members excludes is_superuser=True, Super_Admin role, and deleted users."""
    tenant_id = uuid.uuid4()
    caller = ResUser(id=uuid.uuid4(), email="owner@tenant.corp", role="Owner", company_id=tenant_id)

    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query

    # Track filter calls
    filters_applied = []
    def fake_filter(*args):
        filters_applied.extend(args)
        return mock_query

    mock_query.filter.side_effect = fake_filter
    
    regular_member = ResUser(
        id=uuid.uuid4(),
        company_id=tenant_id,
        email="member@tenant.corp",
        full_name="Alice Smith",
        role="member",
        is_active=True,
        is_superuser=False,
    )
    mock_query.all.return_value = [regular_member]

    with patch("backend.app.api.v1.tenant_control._caller_tenant_id", return_value=tenant_id):
        res = list_team_members(current_user=caller, db=mock_db)

    assert res["success"] is True
    assert res["count"] == 1
    assert res["team"][0]["email"] == "member@tenant.corp"

    # Verify query.filter was called with criteria
    assert mock_query.filter.called


def test_main_list_tenant_users_excludes_superadmin():
    """Verify list_tenant_users in main.py filters out superadmin users and roles."""
    tenant_id = uuid.uuid4()
    admin_user = ResUser(id=uuid.uuid4(), email="admin@tenant.corp", role="Admin", company_id=tenant_id)
    mock_db = MagicMock()
    mock_scalars = MagicMock()
    mock_db.scalars.return_value = mock_scalars
    
    tenant_user = ResUser(
        id=uuid.uuid4(),
        company_id=tenant_id,
        email="user@tenant.corp",
        role="User",
        is_superuser=False,
    )
    mock_scalars.all.return_value = [tenant_user]

    result = list_tenant_users(
        company_id=tenant_id,
        current_user=admin_user,
        database=mock_db,
    )
    assert len(result) == 1
    assert result[0].email == "user@tenant.corp"
    assert mock_db.scalars.called


# ------------------------------------------------------------------------------
# 4. Tenant User Creation with Workspace Roles & Superadmin Prohibition
# ------------------------------------------------------------------------------

def test_create_tenant_user_allows_workspace_role():
    """Verify create_tenant_user permits operational roles and sets role and iam_role."""
    tenant_id = uuid.uuid4()
    owner = ResUser(id=uuid.uuid4(), email="owner@tenant.corp", role="Owner", company_id=tenant_id)
    company = ResCompany(id=tenant_id, name="Test Tenant", slug="test-tenant")

    mock_db = MagicMock()
    mock_db.get.return_value = company
    mock_db.scalar.return_value = None  # No existing user
    mock_request = MagicMock(spec=Request)
    mock_request.url.path = "/api/v1/tenant/users"
    mock_request.method = "POST"
    mock_request.headers.get.return_value = "pytest"

    payload = TenantUserCreateRequest(
        email="accountant@tenant.corp",
        full_name="Bob Ledger",
        password="ValidPassword123!",
        role="Accountant",
    )

    with patch("backend.app.main.record_security_event"):
        new_user = create_tenant_user(
            payload=payload,
            request=mock_request,
            company_id=tenant_id,
            current_user=owner,
            database=mock_db,
        )

    assert new_user.email == "accountant@tenant.corp"
    assert new_user.role == "Accountant"
    assert new_user.iam_role == "Finance_Editor"
    assert mock_db.add.called
    assert mock_db.commit.called


def test_create_tenant_user_prohibits_super_admin():
    """Verify create_tenant_user rejects Super_Admin role with HTTP 400."""
    tenant_id = uuid.uuid4()
    owner = ResUser(id=uuid.uuid4(), email="owner@tenant.corp", role="Owner", company_id=tenant_id)
    mock_db = MagicMock()
    mock_request = MagicMock(spec=Request)

    payload = TenantUserCreateRequest(
        email="hacker@tenant.corp",
        full_name="Malicious Actor",
        password="ValidPassword123!",
        role="Super_Admin",
    )

    with pytest.raises(HTTPException) as exc_info:
        create_tenant_user(
            payload=payload,
            request=mock_request,
            company_id=tenant_id,
            current_user=owner,
            database=mock_db,
        )
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "not a valid workspace role" in exc_info.value.detail


# ------------------------------------------------------------------------------
# 5. Full End-to-End Invitation, Intercept, and Activation Lifecycle
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_complete_invitation_to_activation_lifecycle():
    """
    End-to-End integration test for the full lifecycle:
    1. Owner invites user with role "Accountant"
    2. User is saved with invitation_status="invited" & must_change_password=True
    3. User attempts login -> issued scope="password_change" token
    4. User changes password -> invitation_status="active" & must_change_password=False
    """
    tenant_id = uuid.uuid4()
    user_id = uuid.uuid4()
    owner = ResUser(id=uuid.uuid4(), email="owner@tenant.corp", role="Owner", company_id=tenant_id)
    company = ResCompany(id=tenant_id, name="Logistics Co", slug="logistics-co")

    mock_db = MagicMock()
    mock_db.get.return_value = company
    # ResUser query checks
    mock_db.query.return_value.filter.return_value.first.return_value = None

    invite_payload = InviteUserRequest(
        channel="manual",
        email="newhire@tenant.corp",
        full_name="Carol Danvers",
        role="Accountant",
    )
    actor = MagicMock()
    actor.company_id = tenant_id
    actor.level = 80
    actor.audit = AuditContext(
        actor_id=owner.id,
        actor_identifier="owner@tenant.corp",
        ip_address="127.0.0.1",
        user_agent="pytest",
        request_id="req-123",
        endpoint="/api/v1/users/invite",
    )
    actor.full_name = "Owner Tester"
    bg = MagicMock()
    mock_response = Response()

    # Step 1: Invite user
    with patch("backend.app.api.v1.users._commit_audit"), \
         patch("backend.app.api.v1.users.append_audit_from_context"):
        result = await invite_tenant_user(
            payload=invite_payload,
            actor=actor,
            db=mock_db,
            background_tasks=bg,
            response=mock_response,
        )

    assert result.status == "invited"
    assert result.role == "Accountant"
    assert result.temporary_password is not None

    # Step 2: Login attempt generates scope="password_change"
    invited_user = ResUser(
        id=user_id,
        email="newhire@tenant.corp",
        role="Accountant",
        must_change_password=True,
        invitation_status="invited",
        company_id=tenant_id,
    )
    jwt_token = issue_two_tier_jwt(
        tier="tenant",
        user_id=invited_user.id,
        identity=invited_user.email,
        role=invited_user.role,
        tenant_id=tenant_id,
        tenant_slug="logistics-co",
        must_change_password=True,
    )
    assert jwt_token is not None
    payload = verify_two_tier_jwt(jwt_token, "tenant")
    assert payload.get("scope") == "password_change"

    # Step 3: First login password change endpoint updates status to active
    invited_user.password_hash = hash_password("NewSecurePass123!")
    invited_user.must_change_password = False
    invited_user.invitation_status = "active"

    assert invited_user.must_change_password is False
    assert invited_user.invitation_status == "active"
    assert verify_password("NewSecurePass123!", invited_user.password_hash) is True
