"""
Phase 2 Test Suite: Mandatory First-Login Password Change & Acceptance Status Transition
Filename: backend/tests/auth/test_phase2_mandatory_password_change.py

Validates:
1. ResUser model attributes (must_change_password, invitation_status).
2. JWT generation with scoped claims (scope="password_change" when must_change_password is True).
3. First-login password change validation (mismatched confirm, length < 8, reuse current password, wrong current password).
4. Successful status transition (must_change_password -> False, invitation_status -> "active").
5. Workspace endpoint access blocking for users with pending password change.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException, status
from pydantic import ValidationError

from backend.app.api.v1.auth import (
    FirstLoginPasswordChangeRequest,
    first_login_password_change,
)
from backend.models import ResCompany, ResUser, TenantUser
from backend.two_tier_auth import (
    hash_password,
    issue_two_tier_jwt,
    verify_password,
    verify_two_tier_jwt,
)


def test_user_model_attributes_presence():
    """Verify ResUser has must_change_password and invitation_status."""
    uid = uuid.uuid4()
    cid = uuid.uuid4()
    user = ResUser(
        id=uid,
        email="invited_user@example.com",
        full_name="Invited User",
        company_id=cid,
        role="Admin",
        password_hash=hash_password("TempPass123!"),
        must_change_password=True,
        invitation_status="pending",
        is_active=True,
    )
    assert user.must_change_password is True
    assert user.invitation_status == "pending"


def test_jwt_issuance_scopes_when_must_change_password():
    """Verify issue_two_tier_jwt assigns scope='password_change' when must_change_password is True."""
    uid = uuid.uuid4()
    cid = uuid.uuid4()
    
    # Scoped token for first-time login
    token_scoped = issue_two_tier_jwt(
        tier="tenant",
        user_id=uid,
        identity="temp_user@acme.com",
        role="admin",
        tenant_id=cid,
        tenant_slug="acme",
        must_change_password=True,
    )
    decoded_scoped = verify_two_tier_jwt(token_scoped, expected_tier="tenant")
    assert decoded_scoped["must_change_password"] is True
    assert decoded_scoped["scope"] == "password_change"

    # Full access token after password is updated
    token_full = issue_two_tier_jwt(
        tier="tenant",
        user_id=uid,
        identity="temp_user@acme.com",
        role="admin",
        tenant_id=cid,
        tenant_slug="acme",
        must_change_password=False,
    )
    decoded_full = verify_two_tier_jwt(token_full, expected_tier="tenant")
    assert decoded_full["must_change_password"] is False
    assert decoded_full["scope"] == "full"


def test_first_login_password_change_request_validation():
    """Verify FirstLoginPasswordChangeRequest requires minimum length and non-empty passwords."""
    # Min length 8
    with pytest.raises(ValidationError):
        FirstLoginPasswordChangeRequest(
            current_password="TempPass123!",
            new_password="short",
            confirm_password="short",
        )

    # Valid schema
    req = FirstLoginPasswordChangeRequest(
        current_password="TempPass123!",
        new_password="NewSecurePassword123!",
        confirm_password="NewSecurePassword123!",
    )
    assert req.new_password == "NewSecurePassword123!"


@pytest.mark.asyncio
async def test_first_login_password_change_rejects_mismatch():
    """Verify endpoint rejects when new_password and confirm_password differ."""
    payload = FirstLoginPasswordChangeRequest(
        current_password="OldPassword123!",
        new_password="NewPassword123!",
        confirm_password="DifferentPassword123!",
    )
    req = MagicMock()
    db = MagicMock()
    with pytest.raises(HTTPException) as exc_info:
        await first_login_password_change(payload, req, db)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "do not match" in exc_info.value.detail


@pytest.mark.asyncio
async def test_first_login_password_change_rejects_reusing_temporary_password():
    """Verify endpoint rejects when new password is identical to temporary password."""
    payload = FirstLoginPasswordChangeRequest(
        current_password="SamePassword123!",
        new_password="SamePassword123!",
        confirm_password="SamePassword123!",
    )
    req = MagicMock()
    db = MagicMock()
    with pytest.raises(HTTPException) as exc_info:
        await first_login_password_change(payload, req, db)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "different from the temporary password" in exc_info.value.detail


@pytest.mark.asyncio
async def test_first_login_password_change_rejects_incorrect_current_password():
    """Verify endpoint verifies current password and rejects invalid attempts."""
    uid = uuid.uuid4()
    cid = uuid.uuid4()
    user = ResUser(
        id=uid,
        email="test_user@acme.com",
        full_name="Test User",
        company_id=cid,
        role="Admin",
        password_hash=hash_password("CorrectTempPassword123!"),
        must_change_password=True,
        invitation_status="pending",
        is_active=True,
    )

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user

    req = MagicMock()
    req.headers = {}
    req.cookies = {}

    payload = FirstLoginPasswordChangeRequest(
        current_password="WrongCurrentPassword!",
        new_password="BrandNewPassword123!",
        confirm_password="BrandNewPassword123!",
        email="test_user@acme.com",
    )

    with pytest.raises(HTTPException) as exc_info:
        await first_login_password_change(payload, req, db)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "Current temporary password is incorrect" in exc_info.value.detail


@pytest.mark.asyncio
async def test_first_login_password_change_success_and_status_transition():
    """Verify successful password update transitions status to 'active' and clears must_change_password."""
    uid = uuid.uuid4()
    cid = uuid.uuid4()
    initial_temp_pw = "TempPass123!"
    user = ResUser(
        id=uid,
        email="accepted_user@acme.com",
        full_name="Accepted Member",
        company_id=cid,
        role="Admin",
        password_hash=hash_password(initial_temp_pw),
        must_change_password=True,
        invitation_status="pending",
        is_active=True,
    )
    company = ResCompany(
        id=cid,
        name="Acme Corp",
        slug="acme",
    )

    def mock_query(model):
        q = MagicMock()
        if model == ResUser:
            q.filter.return_value.first.return_value = user
        elif model == ResCompany:
            q.filter.return_value.first.return_value = company
        elif model == TenantUser:
            q.filter.return_value.first.return_value = None
        else:
            q.filter.return_value.first.return_value = None
        return q

    db = MagicMock()
    db.query.side_effect = mock_query

    req = MagicMock()
    req.headers = {}
    req.cookies = {}

    payload = FirstLoginPasswordChangeRequest(
        current_password=initial_temp_pw,
        new_password="BrandNewSecurePassword123!",
        confirm_password="BrandNewSecurePassword123!",
        email="accepted_user@acme.com",
    )

    result = await first_login_password_change(payload, req, db)

    # 1. Verify response structure
    assert result["status"] == "success"
    assert result["must_change_password"] is False
    assert result["invitation_status"] == "active"
    assert result["scope"] == "full"
    assert "access_token" in result

    # 2. Verify database entity transitions
    assert user.must_change_password is False
    assert user.invitation_status == "active"
    assert verify_password("BrandNewSecurePassword123!", user.password_hash) is True
    assert db.commit.called

    # 3. Verify issued JWT is full access
    decoded = verify_two_tier_jwt(result["access_token"], expected_tier="tenant")
    assert decoded["must_change_password"] is False
    assert decoded["scope"] == "full"


def test_access_blocked_when_must_change_password():
    """Verify get_authenticated_user blocks non-password-change endpoints when user has must_change_password=True."""
    from backend.app.main import get_authenticated_user

    uid = uuid.uuid4()
    cid = uuid.uuid4()
    user = ResUser(
        id=uid,
        email="pending_user@acme.com",
        company_id=cid,
        role="Admin",
        password_hash=hash_password("Temp1234!"),
        must_change_password=True,
        invitation_status="pending",
        is_active=True,
    )
    token = issue_two_tier_jwt(
        tier="tenant",
        user_id=uid,
        identity="pending_user@acme.com",
        role="Admin",
        tenant_id=cid,
        tenant_slug="acme",
        must_change_password=True,
        scope="password_change",
    )

    db = MagicMock()
    db.scalar.return_value = user
    db.get.return_value = None

    # Restricted endpoint request (e.g. /api/v1/users) -> MUST RAISE 403
    restricted_req = MagicMock()
    restricted_req.cookies = {}
    restricted_req.headers = {"Authorization": f"Bearer {token}"}
    restricted_req.url.path = "/api/v1/users"

    with pytest.raises(HTTPException) as exc_info:
        get_authenticated_user(restricted_req, db)
    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert "Password change required before accessing workspace" in exc_info.value.detail

    # Allowed endpoint request (e.g. /api/v1/auth/first-login-password-change) -> MUST SUCCEED
    allowed_req = MagicMock()
    allowed_req.cookies = {}
    allowed_req.headers = {"Authorization": f"Bearer {token}"}
    allowed_req.url.path = "/api/v1/auth/first-login-password-change"

    res = get_authenticated_user(allowed_req, db)
    assert res.id == user.id

