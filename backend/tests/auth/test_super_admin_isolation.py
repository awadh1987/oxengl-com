"""Only the designated super admin may enter the master plane; tenant identities and tokens are rejected."""
import uuid

import pytest
from fastapi import HTTPException, status

from backend.two_tier_auth import SUPER_ADMIN_EMAIL, issue_two_tier_jwt, verify_two_tier_jwt


def test_master_token_for_other_identity_rejected():
    token = issue_two_tier_jwt(tier="master", user_id=uuid.uuid4(), identity="tenant.admin@example.com", role="super_admin")
    with pytest.raises(HTTPException) as exc:
        verify_two_tier_jwt(token, expected_tier="master")
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


def test_designated_master_token_accepted():
    token = issue_two_tier_jwt(tier="master", user_id=uuid.uuid4(), identity=SUPER_ADMIN_EMAIL, role="super_admin")
    assert verify_two_tier_jwt(token, expected_tier="master")["identity"] == SUPER_ADMIN_EMAIL


def test_tenant_token_cannot_pass_master_plane():
    token = issue_two_tier_jwt(tier="tenant", user_id=uuid.uuid4(), identity=SUPER_ADMIN_EMAIL, role="admin", tenant_slug="x")
    with pytest.raises(HTTPException) as exc:
        verify_two_tier_jwt(token, expected_tier="master")
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_tenant_admin_cannot_use_master_login(async_client):
    for identity in ("abdulmajeed.ahmed@meayon.com", "muath.salaih@meayon.com", "technoyemen.ye@gmail.com"):
        r = await async_client.post("/api/auth/master/login", json={"identity": identity, "password": "Admin123!"})
        assert r.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_admin_settings_rejects_tenant_credentials(async_client):
    body = [{"key": "contact_email", "value": "x@y.z"}]
    assert (await async_client.put("/api/settings/admin", json=body)).status_code == status.HTTP_401_UNAUTHORIZED
    tenant = issue_two_tier_jwt(tier="tenant", user_id=uuid.uuid4(), identity=SUPER_ADMIN_EMAIL, role="admin", tenant_slug="x")
    r = await async_client.put("/api/settings/admin", json=body, headers={"Authorization": f"Bearer {tenant}"})
    assert r.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
