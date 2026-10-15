"""
Phase 3 Test Suite: Invitation Role Selection & Initial Workspace Access
Filename: backend/tests/auth/test_phase3_role_invitation.py

Validates:
1. Role catalog resolution: Operational roles (Admin, Manager, Accountant, Staff, Member, Guest, External_Auditor)
   are permitted; privileged roles (Super_Admin, Owner) are prohibited.
2. Direct role assignment in ResUser and TenantUserRole during user invitation.
3. Rejection of privileged roles with HTTP 403 and invalid roles with HTTP 400.
4. Invitation email rendering displays the assigned operational role ("as Accountant").
5. Team member invitation in tenant_control maps roles accurately and syncs TenantUserRole.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import BackgroundTasks, HTTPException, Response, status
from jinja2 import Environment, FileSystemLoader

from backend.app.domains.hr.audit import AuditContext
from backend.app.api.v1.users import (
    InviteUserRequest,
    invite_tenant_user,
)
from backend.app.api.v1.tenant_control import (
    InviteMemberRequest,
    invite_team_member,
)
from backend.app.domains.iam.role_catalog import (
    TENANT_INVITE_ROLES,
    resolve_tenant_invite_role,
)
from backend.models import ResCompany, ResUser, TenantUser, TenantUserRole


# ------------------------------------------------------------------------------
# 1. Role Catalog Resolution Tests
# ------------------------------------------------------------------------------

def test_resolve_tenant_invite_role_operational():
    """Verify operational and external roles resolve to valid specs."""
    for role_name in ["Admin", "Manager", "Accountant", "Staff", "Member", "Guest", "External_Auditor"]:
        resolved = resolve_tenant_invite_role(role_name)
        assert resolved is not None, f"Role {role_name} should resolve"
        canonical, spec = resolved
        assert canonical == role_name
        assert "legacy_role" in spec
        assert "iam_role" in spec
        assert "abac_context" in spec


def test_resolve_tenant_invite_role_case_insensitivity_and_aliases():
    """Verify role resolution handles lowercase, uppercase, and aliases."""
    # Lowercase
    res_acc = resolve_tenant_invite_role("accountant")
    assert res_acc is not None
    assert res_acc[0] == "Accountant"
    assert res_acc[1]["legacy_role"] == "Accountant"

    # Aliases
    res_user = resolve_tenant_invite_role("user")
    assert res_user is not None
    assert res_user[0] == "Member"
    assert res_user[1]["legacy_role"] == "User"

    res_staff = resolve_tenant_invite_role("data_entry")
    assert res_staff is not None
    assert res_staff[0] == "Staff"
    assert res_staff[1]["legacy_role"] == "Data_Entry"


def test_resolve_tenant_invite_role_rejects_privileged_and_unknown():
    """Verify platform Super_Admin, Owner, and arbitrary strings are rejected."""
    assert resolve_tenant_invite_role("Super_Admin") is None
    assert resolve_tenant_invite_role("super_admin") is None
    assert resolve_tenant_invite_role("Owner") is None
    assert resolve_tenant_invite_role("owner") is None
    assert resolve_tenant_invite_role("Banana") is None
    assert resolve_tenant_invite_role("") is None


# ------------------------------------------------------------------------------
# 2. Backend Users Invite API Role Assignment Tests
# ------------------------------------------------------------------------------

def _dummy_audit_ctx(actor_id: uuid.UUID) -> AuditContext:
    return AuditContext(
        actor_id=actor_id,
        actor_identifier="admin@apex.com",
        ip_address="127.0.0.1",
        user_agent="pytest",
        request_id="req-123",
        endpoint="/api/v1/users/invite",
    )


@pytest.mark.asyncio
async def test_invite_tenant_user_assigns_accountant_role():
    """Verify inviting a user as Accountant persists role=Accountant and syncs TenantUserRole."""
    tenant_id = uuid.uuid4()
    company = ResCompany(id=tenant_id, name="Apex Logistics", slug="apex")
    admin_id = uuid.uuid4()
    
    actor = MagicMock()
    actor.company_id = tenant_id
    actor.level = 80
    actor.audit = _dummy_audit_ctx(admin_id)
    actor.full_name = "Admin Tester"

    added_objects = []
    
    class FakeQuery:
        def filter(self, *args, **kwargs):
            return self
        def first(self):
            return None

    db = MagicMock()
    db.get.side_effect = lambda model, pk: company if pk == tenant_id else None
    db.query.return_value = FakeQuery()
    db.add.side_effect = lambda obj: added_objects.append(obj)
    db.commit.return_value = None

    bg = MagicMock(spec=BackgroundTasks)
    bg.add_task = MagicMock()

    payload = InviteUserRequest(
        channel="manual",
        email="accountant@apex.com",
        role="Accountant",
        full_name="Fatima Finance",
    )

    with patch("backend.app.api.v1.users._commit_audit"), \
         patch("backend.app.api.v1.users.append_audit_from_context"):
        response = await invite_tenant_user(
            payload=payload,
            actor=actor,
            db=db,
            background_tasks=bg,
            response=Response(),
        )

    assert response.status == "invited"
    assert response.role == "Accountant"
    assert response.temporary_password is not None

    # Check created ResUser
    res_user = next((obj for obj in added_objects if isinstance(obj, ResUser)), None)
    assert res_user is not None
    assert res_user.role == "Accountant"
    assert res_user.iam_role == "Finance_Editor"
    assert res_user.must_change_password is True
    assert res_user.invitation_status == "pending"

    # Check created TenantUserRole
    tur = next((obj for obj in added_objects if isinstance(obj, TenantUserRole)), None)
    assert tur is not None
    assert tur.role == "Accountant"
    assert tur.company_id == tenant_id
    assert tur.is_active is True


@pytest.mark.asyncio
async def test_invite_tenant_user_assigns_member_role():
    """Verify inviting a user as Member persists role=User and syncs TenantUserRole."""
    tenant_id = uuid.uuid4()
    company = ResCompany(id=tenant_id, name="Apex Logistics", slug="apex")

    actor = MagicMock()
    actor.company_id = tenant_id
    actor.level = 80
    actor.audit = _dummy_audit_ctx(uuid.uuid4())
    actor.full_name = "Admin Tester"

    added_objects = []

    class FakeQuery:
        def filter(self, *args, **kwargs):
            return self
        def first(self):
            return None

    db = MagicMock()
    db.get.side_effect = lambda model, pk: company if pk == tenant_id else None
    db.query.return_value = FakeQuery()
    db.add.side_effect = lambda obj: added_objects.append(obj)

    payload = InviteUserRequest(
        channel="manual",
        email="member@apex.com",
        role="Member",
        full_name="Khalid Team",
    )

    with patch("backend.app.api.v1.users._commit_audit"), \
         patch("backend.app.api.v1.users.append_audit_from_context"):
        response = await invite_tenant_user(
            payload=payload,
            actor=actor,
            db=db,
            background_tasks=MagicMock(),
            response=Response(),
        )

    assert response.role == "Member"
    res_user = next((obj for obj in added_objects if isinstance(obj, ResUser)), None)
    assert res_user is not None
    assert res_user.role == "User"
    assert res_user.iam_role == "Employee_Self_Serve"

    tur = next((obj for obj in added_objects if isinstance(obj, TenantUserRole)), None)
    assert tur is not None
    assert tur.role == "User"


@pytest.mark.asyncio
async def test_invite_tenant_user_rejects_privileged_and_unknown_roles():
    """Verify Super_Admin is blocked with 403 and unknown role is blocked with 400."""
    tenant_id = uuid.uuid4()
    actor = MagicMock()
    actor.company_id = tenant_id
    actor.audit = MagicMock()
    db = MagicMock()

    # Super_Admin -> 403
    payload_super = InviteUserRequest(channel="manual", email="hacker@evil.com", role="Super_Admin")
    with patch("backend.app.api.v1.users._commit_audit"):
        with pytest.raises(HTTPException) as exc_super:
            await invite_tenant_user(payload=payload_super, actor=actor, db=db)
        assert exc_super.value.status_code == 403

    # Unknown role -> 400
    payload_bad = InviteUserRequest(channel="manual", email="test@apex.com", role="InvalidRoleXYZ")
    with patch("backend.app.api.v1.users._commit_audit"):
        with pytest.raises(HTTPException) as exc_bad:
            await invite_tenant_user(payload=payload_bad, actor=actor, db=db)
        assert exc_bad.value.status_code == 400


# ------------------------------------------------------------------------------
# 3. Invitation Email Template Role Rendering Tests
# ------------------------------------------------------------------------------

def test_invitation_email_template_role_rendering():
    """Verify email template correctly renders 'invited you to join [Tenant] as [Role]'."""
    env = Environment(loader=FileSystemLoader("backend/app/templates/email"))
    template = env.get_template("invite_user.html")

    context = {
        "user": {
            "first_name": "Sarah",
            "email": "sarah@apex.com",
            "role": "Accountant",
            "temp_password": "TempPassword123!",
        },
        "inviter": {"name": "Ahmed Admin"},
        "tenant": {
            "name": "Apex Logistics",
            "logo_url": "https://portal.oxengl.com/logo.png",
            "workspace_domain": "portal.oxengl.com",
            "support_email": "support@apex.com",
            "signature_name": "Apex Management",
            "signature_title": "Operations Director",
        },
        "action_url": "https://portal.oxengl.com/tenant/login",
        "expiry_hours": 48,
    }

    rendered = template.render(context)
    # Check that role is displayed prominently
    assert "invited you to join the <strong>Apex Logistics</strong> workspace on OxenGL as <strong>Accountant</strong>" in rendered
    assert "Sarah" in rendered
    assert "sarah@apex.com" in rendered
    assert "TempPassword123!" in rendered


# ------------------------------------------------------------------------------
# 4. Tenant Control Team Member Invite Tests
# ------------------------------------------------------------------------------

def test_tenant_control_invite_team_member_operational_roles():
    """Verify tenant_control.invite_team_member assigns operational roles and syncs TenantUserRole."""
    tenant_id = uuid.uuid4()
    company = ResCompany(id=tenant_id, name="Apex Logistics", slug="apex")

    caller = MagicMock(spec=ResUser)
    caller.company_id = tenant_id
    caller.role = "Admin"
    caller.full_name = "Managing Admin"

    added_objects = []

    class FakeQuery:
        def filter(self, *args, **kwargs):
            return self
        def first(self):
            return None

    db = MagicMock()
    db.query.return_value = FakeQuery()
    db.add.side_effect = lambda obj: added_objects.append(obj)
    db.commit.return_value = None
    db.refresh.side_effect = lambda obj: None

    bg = MagicMock(spec=BackgroundTasks)
    bg.add_task = MagicMock()

    payload = InviteMemberRequest(
        email="ops.manager@apex.com",
        full_name="Omar Manager",
        role="manager",
        department="Operations",
    )

    with patch("backend.app.api.v1.tenant_control._caller_tenant_id", return_value=tenant_id), \
         patch("backend.app.services.billing_service.verify_tenant_seat_limit", return_value=(True, "")), \
         patch("backend.app.services.billing_service.increment_tenant_seat_usage"):
        result = invite_team_member(
            payload=payload,
            background_tasks=bg,
            current_user=caller,
            db=db,
        )

    assert result["success"] is True
    assert result["member"]["role"] == "ops_manager"

    res_user = next((obj for obj in added_objects if isinstance(obj, ResUser)), None)
    assert res_user is not None
    assert res_user.role == "Ops_Manager"
    assert res_user.iam_role == "Ops_Manager"

    tur = next((obj for obj in added_objects if isinstance(obj, TenantUserRole)), None)
    assert tur is not None
    assert tur.role == "Ops_Manager"
    assert tur.company_id == tenant_id
