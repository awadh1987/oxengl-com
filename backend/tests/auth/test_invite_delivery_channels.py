from __future__ import annotations

import asyncio
import secrets
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.api.v1 import users
from backend.app.services import notification_service
from backend.two_tier_auth import verify_password


class FakeQuery:
    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None


class FakeDB:
    def __init__(self):
        self.added = []
        self.commits = 0

    def query(self, *args, **kwargs):
        return FakeQuery()

    def get(self, *args, **kwargs):
        return None

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.commits += 1


def _actor(company_id: uuid.UUID) -> users.IamActor:
    actor_id = uuid.uuid4()
    audit = users.AuditContext(
        actor_id=actor_id,
        actor_identifier="owner@example.com",
        ip_address="192.0.2.1",
        user_agent="test",
        request_id="invite-test",
        endpoint="/api/v1/users/invite",
    )
    return users.IamActor(
        user=SimpleNamespace(id=actor_id),
        user_id=actor_id,
        identifier="owner@example.com",
        company_id=company_id,
        level=users.LEVEL_OWNER,
        audit=audit,
    )


def test_delivery_request_validates_email_and_normalizes_saudi_mobile():
    assert users.InviteUserRequest(email="  Person@Gmail.com ").email == "person@gmail.com"
    sms = users.InviteUserRequest(channel="sms", phone="05 0123 4567")
    assert sms.phone == "+966501234567"
    assert users.InviteUserRequest(channel="sms", phone="+1 (202) 555-0100").phone == "+12025550100"

    with pytest.raises(ValidationError):
        users.InviteUserRequest(email="not-an-email")
    with pytest.raises(ValidationError):
        users.InviteUserRequest(channel="sms", phone="12345")
    with pytest.raises(ValidationError):
        users.InviteUserRequest(channel="sms")
    with pytest.raises(ValidationError):
        users.InviteUserRequest(channel="", email="person@gmail.com")


def test_sms_invite_sends_secret_but_only_stores_hash_and_audits_channel(monkeypatch):
    company_id = uuid.uuid4()
    db = FakeDB()
    audits = []
    sent = {}
    monkeypatch.setattr(
        users,
        "append_audit_from_context",
        lambda _db, _context, **event: audits.append(event),
    )

    async def capture_delivery(channel, destination, temporary_password, **kwargs):
        sent.update(channel=channel, destination=destination, password=temporary_password, **kwargs)

    monkeypatch.setattr(users, "dispatch_temporary_credentials", capture_delivery)
    request = users.InviteUserRequest(channel="sms", phone="0501234567", role="Guest")
    response = asyncio.run(users.invite_tenant_user(request, _actor(company_id), db))

    stored_user = next(value for value in db.added if isinstance(value, users.ResUser))
    assert sent["channel"] == "sms" and sent["destination"] == "+966501234567"
    assert stored_user.phone == sent["destination"]
    assert stored_user.email.endswith("@sms-invite.oxengl.invalid")
    assert stored_user.password_hash != sent["password"]
    assert verify_password(sent["password"], stored_user.password_hash)
    assert stored_user.must_change_password is True
    assert response.phone == sent["destination"] and response.email is None
    assert sent["password"] not in response.model_dump_json()
    assert any("channel=sms" in event["action"] for event in audits)
    assert sent["password"] not in repr(audits)


def test_email_invite_dispatches_to_email_and_returns_no_credential(monkeypatch):
    company_id = uuid.uuid4()
    db = FakeDB()
    audits = []
    sent = {}
    monkeypatch.setattr(
        users,
        "append_audit_from_context",
        lambda _db, _context, **event: audits.append(event),
    )

    async def capture_delivery(channel, destination, temporary_password, **kwargs):
        sent.update(channel=channel, destination=destination, password=temporary_password)

    monkeypatch.setattr(users, "dispatch_temporary_credentials", capture_delivery)
    request = users.InviteUserRequest(email="Invitee@outlook.com", role="External_Auditor")
    response = asyncio.run(users.invite_tenant_user(request, _actor(company_id), db))

    stored_user = next(value for value in db.added if isinstance(value, users.ResUser))
    assert sent["channel"] == "email" and sent["destination"] == "invitee@outlook.com"
    assert stored_user.email == "invitee@outlook.com" and stored_user.phone is None
    assert verify_password(sent["password"], stored_user.password_hash)
    assert response.email == sent["destination"] and response.phone is None
    assert sent["password"] not in response.model_dump_json()
    assert any("channel=email" in event["action"] for event in audits)


def test_force_reset_for_sms_account_uses_sms_provider_and_keeps_secret_private(monkeypatch):
    company_id = uuid.uuid4()
    target = SimpleNamespace(
        id=uuid.uuid4(),
        email=users._sms_placeholder_email(uuid.uuid4()),
        phone="+966501234567",
        full_name="External Guest",
        company_id=company_id,
        password_hash="old-hash",
        must_change_password=False,
    )
    db = FakeDB()
    audits = []
    sent = {}
    monkeypatch.setattr(users, "_load_target", lambda *args: target)
    monkeypatch.setattr(users, "_revoke_sessions", lambda *args: None)
    monkeypatch.setattr(
        users,
        "append_audit_from_context",
        lambda _db, _context, **event: audits.append(event),
    )

    async def capture_delivery(channel, destination, temporary_password, **kwargs):
        sent.update(channel=channel, destination=destination, password=temporary_password)

    monkeypatch.setattr(users, "dispatch_temporary_credentials", capture_delivery)
    response = asyncio.run(
        users.force_password_reset(str(target.id), users.BackgroundTasks(), _actor(company_id), db)
    )

    assert sent["channel"] == "sms" and sent["destination"] == target.phone
    assert verify_password(sent["password"], target.password_hash)
    assert target.must_change_password is True and response.reset_dispatched is True
    assert sent["password"] not in response.model_dump_json()
    assert any("IAM_FORCE_PASSWORD_RESET:channel=sms" == event["action"] for event in audits)


def test_registered_delivery_provider_receives_selected_channel_and_address(monkeypatch):
    delivered = {}

    class Provider:
        async def send_credentials(self, destination, temporary_password, **kwargs):
            delivered.update(destination=destination, password=temporary_password, **kwargs)
            return True

    monkeypatch.setattr(notification_service, "_temporary_credential_delivery_providers", {"email": Provider()})
    temporary_password = secrets.token_urlsafe(18)
    asyncio.run(
        notification_service.dispatch_temporary_credentials(
            "email",
            "guest@example.com",
            temporary_password,
            full_name="External Guest",
            workspace_name="Workspace A",
        )
    )

    assert delivered == {
        "destination": "guest@example.com",
        "password": temporary_password,
        "full_name": "External Guest",
        "workspace_name": "Workspace A",
    }

    class NoAcknowledgementProvider:
        async def send_credentials(self, destination, temporary_password, **kwargs):
            return None

    monkeypatch.setattr(
        notification_service,
        "_temporary_credential_delivery_providers",
        {"email": NoAcknowledgementProvider()},
    )
    with pytest.raises(notification_service.NotificationDeliveryError, match="EMAIL credential delivery failed"):
        asyncio.run(
            notification_service.dispatch_temporary_credentials(
                "email", "guest@example.com", temporary_password, full_name="Guest", workspace_name="Workspace"
            )
        )


def test_unavailable_sms_provider_fails_closed_without_creating_user(monkeypatch):
    company_id = uuid.uuid4()
    db = FakeDB()
    audits = []
    monkeypatch.setattr(notification_service, "_temporary_credential_delivery_providers", {})
    monkeypatch.setattr(
        users,
        "append_audit_from_context",
        lambda _db, _context, **event: audits.append(event),
    )

    with pytest.raises(notification_service.NotificationDeliveryError, match="No SMS credential delivery provider is configured"):
        asyncio.run(
            notification_service.dispatch_temporary_credentials(
                "sms", "+966501234567", secrets.token_urlsafe(18), full_name="Guest", workspace_name="Workspace"
            )
        )

    class LeakyProvider:
        async def send_credentials(self, destination, temporary_password, **kwargs):
            raise RuntimeError(f"provider failure {temporary_password}")

    secret = secrets.token_urlsafe(18)
    monkeypatch.setattr(notification_service, "_temporary_credential_delivery_providers", {"sms": LeakyProvider()})
    with pytest.raises(notification_service.NotificationDeliveryError) as delivery_error:
        asyncio.run(
            notification_service.dispatch_temporary_credentials(
                "sms", "+966501234567", secret, full_name="Guest", workspace_name="Workspace"
            )
        )
    assert secret not in str(delivery_error.value)

    async def no_provider(*args, **kwargs):
        raise notification_service.NotificationDeliveryError("No SMS credential delivery provider is configured.")

    monkeypatch.setattr(users, "dispatch_temporary_credentials", no_provider)
    request = users.InviteUserRequest(channel="sms", phone="0501234567")
    with pytest.raises(HTTPException) as error:
        asyncio.run(users.invite_tenant_user(request, _actor(company_id), db))

    assert error.value.status_code == 503
    assert "SMS" in error.value.detail
    assert not any(isinstance(value, users.ResUser) for value in db.added)
    assert any(event["outcome"] == "FAILED" and "channel=sms" in event["action"] for event in audits)


def test_manual_invite_skips_dispatch_and_returns_password_once(monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(users, "append_audit_from_context", lambda *_a, **_k: None)

    async def must_not_dispatch(*_a, **_k):
        raise AssertionError("manual channel must not dispatch")

    monkeypatch.setattr(users, "dispatch_temporary_credentials", must_not_dispatch)
    request = users.InviteUserRequest(channel="manual", email="Vendor@Gmail.com", role="Guest")
    response = asyncio.run(users.invite_tenant_user(request, _actor(uuid.uuid4()), db))

    stored = next(value for value in db.added if isinstance(value, users.ResUser))
    assert response.channel == "manual" and response.temporary_password
    assert verify_password(response.temporary_password, stored.password_hash)
    assert stored.password_hash != response.temporary_password
    assert stored.must_change_password is True


def test_manual_request_needs_an_identifier_and_other_channels_never_return_password(monkeypatch):
    with pytest.raises(ValidationError):
        users.InviteUserRequest(channel="manual")
    assert users.InviteUserRequest(channel="manual", phone="0501234567").phone == "+966501234567"

    db = FakeDB()
    monkeypatch.setattr(users, "append_audit_from_context", lambda *_a, **_k: None)

    async def ok(*_a, **_k):
        return None

    monkeypatch.setattr(users, "dispatch_temporary_credentials", ok)
    response = asyncio.run(
        users.invite_tenant_user(users.InviteUserRequest(email="a@gmail.com"), _actor(uuid.uuid4()), db)
    )
    assert response.temporary_password is None
    assert "temporary_password\":null" in response.model_dump_json().replace(" ", "")


def test_owner_is_an_assignable_privileged_role():
    from backend.app.domains.iam.role_catalog import HR_PROVISIONED_ROLES, PRIVILEGED_IAM_ROLES, resolve_internal_role

    assert resolve_internal_role("owner") == "Owner"
    assert "Owner" in PRIVILEGED_IAM_ROLES and "Owner" not in HR_PROVISIONED_ROLES
    assert users._mirror_role("Owner", "Owner") == "Owner"
    assert "Owner" in users.WORKSPACE_ASSIGNABLE_ROLES
