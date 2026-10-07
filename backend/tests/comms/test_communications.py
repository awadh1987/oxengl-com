"""Communications security, isolation, provider and delivery tests; no Postgres or app.main imports."""
from __future__ import annotations

import asyncio
import os
import secrets
import types
import uuid
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

for _key_name in (
    "DATA_RESIDENCY_KEY", "JWT_SECRET", "JWT_SECRET_MASTER", "JWT_SECRET_TENANT",
    "JWT_SECRET_KEY", "SECRET_KEY",
):
    os.environ.setdefault(_key_name, secrets.token_hex(32))

from backend import models  # noqa: E402
from backend.app.api.v1 import communications as api  # noqa: E402
from backend.app.domains.iam import provisioning  # noqa: E402
from backend.app.services import communication_service as svc  # noqa: E402
from backend.app.services import backup_service as backup_service  # noqa: E402
from backend.app.services.backup_destination_service import validate_destination_host as original_validate_destination_host  # noqa: E402
from backend.app.services import notification_service  # noqa: E402
from backend.rate_limiter import limiter  # noqa: E402
from backend.database import get_db  # noqa: E402


class FakeKeyProvider:
    def __init__(self):
        self.key = bytes(range(32))
        from backend.app.services.backup_service import key_fingerprint
        self.key_id = key_fingerprint(self.key)

    def current(self):
        return self.key_id, self.key

    def lookup(self, key_id):
        if key_id != self.key_id:
            raise ValueError("unknown key")
        return self.key


@pytest.fixture()
def engine():
    value = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with value.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE res_companies (id CHAR(32) PRIMARY KEY, name VARCHAR(255))")
    models.Base.metadata.create_all(value, tables=[
        models.CommunicationSetting.__table__,
        models.PlatformAuditLog.__table__,
        models.TenantAuditLog.__table__,
    ])
    yield value
    value.dispose()


@pytest.fixture()
def factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


@pytest.fixture()
def tenants(engine):
    values = {name: uuid.uuid4() for name in ("A", "B")}
    with engine.begin() as conn:
        for name, tenant_id in values.items():
            conn.exec_driver_sql("INSERT INTO res_companies (id, name) VALUES (?, ?)", (tenant_id.hex, f"Tenant {name}"))
    return values


@pytest.fixture(autouse=True)
def fake_crypto(monkeypatch):
    monkeypatch.setattr(svc, "_cipher", svc.CommunicationCredentialCipher(FakeKeyProvider()))
    monkeypatch.setattr(svc.backup_credentials, "validate_destination_host", lambda host, **_kwargs: host)


def make_setting(*, tenant_id=None, provider="sendgrid", config=None, credentials=None, sender=None):
    channel = svc.PROVIDER_CHANNELS[provider]
    row = models.CommunicationSetting(
        id=uuid.uuid4(), tenant_id=tenant_id, channel=channel, provider=provider,
        sender_identity=sender or ("OxenGL <no-reply@oxengl.example>" if channel == "email" else "OXENGL"),
        config=config or {}, is_active=True,
    )
    row.credentials_encrypted = svc._cipher.encrypt(row.id, tenant_id, credentials or {})
    return row


def add_setting(factory, **kwargs):
    with factory() as db:
        row = svc.create_setting(
            db, tenant_id=kwargs.get("tenant_id"), actor_id=uuid.uuid4(),
            channel=kwargs.get("channel", svc.PROVIDER_CHANNELS[kwargs.get("provider", "sendgrid")]),
            provider=kwargs.get("provider", "sendgrid"),
            sender_identity=kwargs.get("sender", "no-reply@oxengl.example"),
            config=kwargs.get("config", {}), credentials=kwargs.get("credentials", {"api_key": "secret-api-key"}),
            is_active=kwargs.get("is_active", True),
        )
        db.commit()
        return row.id


def make_client(factory, user, monkeypatch, *, super_admin=False):
    monkeypatch.setattr(api, "_is_super_admin", lambda _user: super_admin)
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(api.tenant_router)
    app.include_router(api.superadmin_router)

    def db_dep():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = db_dep
    app.dependency_overrides[api.get_platform_db] = db_dep
    app.dependency_overrides[api.current_user_dep] = lambda: user
    return TestClient(app, client=("203.0.113.44", 50000))


def test_provider_resolution_prefers_tenant_then_platform_and_fails_closed(factory, tenants):
    platform_id = add_setting(factory, provider="sendgrid")
    tenant_id = add_setting(factory, tenant_id=tenants["A"], provider="smtp",
                            sender="mail@tenant.example", config={"host": "mail.example", "port": 587, "security": "starttls"},
                            credentials={})
    with factory() as db:
        assert svc.resolve_setting(db, tenants["A"], "email").id == tenant_id
        assert svc.resolve_setting(db, tenants["B"], "email").id == platform_id
        with pytest.raises(svc.CommunicationError, match="No active SMS"):
            svc.resolve_setting(db, tenants["A"], "sms")


def test_email_dispatch_falls_back_to_platform_when_tenant_delivery_fails(factory, tenants, monkeypatch):
    platform_id = add_setting(factory, provider="sendgrid")
    tenant_id = add_setting(
        factory, tenant_id=tenants["A"], provider="smtp",
        sender="mail@tenant.example",
        config={"host": "mail.example", "port": 587, "security": "starttls"},
        credentials={"password": "tenant-password"},
    )
    attempted = []

    async def deliver(setting, destination, body):
        attempted.append((setting.id, destination, body))
        if setting.id == tenant_id:
            raise svc.CommunicationError("Tenant provider did not accept the message.")

    monkeypatch.setattr(svc, "deliver", deliver)
    with factory() as db:
        asyncio.run(svc.send_message(
            "email", "recipient@example.test", "notification",
            tenant_id=tenants["A"], db=db,
        ))

    assert [call[0] for call in attempted] == [tenant_id, platform_id]
    assert all(call[1:] == ("recipient@example.test", "notification") for call in attempted)


def test_email_dispatch_uses_platform_setting_when_tenant_has_no_override(factory, tenants, monkeypatch):
    platform_id = add_setting(factory, provider="sendgrid")
    attempted = []

    async def deliver(setting, destination, body):
        attempted.append(setting.id)

    monkeypatch.setattr(svc, "deliver", deliver)
    with factory() as db:
        asyncio.run(svc.send_message(
            "email", "recipient@example.test", "notification",
            tenant_id=tenants["A"], db=db,
        ))

    assert attempted == [platform_id]


def test_tenant_routes_isolate_rows_and_never_expose_credentials(factory, tenants, monkeypatch, caplog):
    tenant_a, tenant_b = tenants["A"], tenants["B"]
    secret = "SG.secret-MUST-NOT-LEAK"
    row_id = add_setting(factory, tenant_id=tenant_a, provider="sendgrid", credentials={"api_key": secret})
    foreign_id = add_setting(factory, tenant_id=tenant_b, provider="sendgrid")
    client = make_client(factory, types.SimpleNamespace(id=uuid.uuid4(), email="owner@example.test", role="Owner", company_id=tenant_a), monkeypatch)

    listed = client.get("/api/v1/tenant-control/communications")
    assert listed.status_code == 200
    assert [entry["id"] for entry in listed.json()] == [str(row_id)]
    assert secret not in listed.text
    assert listed.json()[0]["has_credential"] is True

    response = client.put(f"/api/v1/tenant-control/communications/{foreign_id}", json={"is_active": False})
    assert response.status_code == 404
    assert secret not in response.text
    with factory() as db:
        foreign = db.get(models.CommunicationSetting, foreign_id)
        assert foreign.is_active is True
        audit_rows = db.scalars(select(models.PlatformAuditLog)).all()
        tenant_audits = db.scalars(select(models.TenantAuditLog)).all()
        assert any(log.action == "COMMUNICATION_SETTING_ACCESS_DENIED" and log.outcome == "DENIED" for log in audit_rows)
        assert any(log.tenant_id == tenant_a for log in tenant_audits)
        assert all(secret not in repr(log) for log in [*audit_rows, *tenant_audits])


def test_tenant_create_ignores_tenant_id_and_encrypts_write_only_credential(factory, tenants, monkeypatch):
    secret = "SG-DO-NOT-RETURN"
    tenant_id = tenants["A"]
    client = make_client(factory, types.SimpleNamespace(id=uuid.uuid4(), email="admin@example.test", role="Admin", company_id=tenant_id), monkeypatch)
    response = client.post("/api/v1/tenant-control/communications", json={
        "tenant_id": str(tenants["B"]), "channel": "email", "provider": "sendgrid",
        "sender_identity": "OxenGL <sender@oxengl.example>", "config": {"region": "global"},
        "credentials": {"api_key": secret},
    })
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["tenant_id"] == str(tenant_id)
    assert payload["has_credential"] is True
    assert secret not in response.text
    with factory() as db:
        row = db.get(models.CommunicationSetting, uuid.UUID(payload["id"]))
        assert row.tenant_id == tenant_id
        assert secret not in row.credentials_encrypted


def test_update_with_blank_or_masked_credential_keeps_stored_secret(factory, tenants, monkeypatch):
    tenant_id = tenants["A"]
    client = make_client(factory, types.SimpleNamespace(id=uuid.uuid4(), email="admin@example.test", role="Admin", company_id=tenant_id), monkeypatch)
    created = client.post("/api/v1/tenant-control/communications", json={
        "channel": "email", "provider": "sendgrid",
        "sender_identity": "OxenGL <sender@oxengl.example>", "config": {"region": "global"},
        "credentials": {"api_key": "SG-KEEP-ME"},
    }).json()
    with factory() as db:
        before = db.get(models.CommunicationSetting, uuid.UUID(created["id"])).credentials_encrypted
    for creds in ({"api_key": ""}, {"api_key": "Stored credential; leave blank to keep unchanged"}, {}, None):
        response = client.put(f"/api/v1/tenant-control/communications/{created['id']}", json={"is_active": True, "credentials": creds})
        assert response.status_code == 200, response.text
        assert response.json()["has_credential"] is True
    with factory() as db:
        row = db.get(models.CommunicationSetting, uuid.UUID(created["id"]))
        assert svc._cipher.decrypt(row.id, row.tenant_id, row.credentials_encrypted) == {"api_key": "SG-KEEP-ME"}


def test_update_succeeds_when_stored_credential_cannot_be_decrypted(factory, tenants, monkeypatch):
    tenant_id = tenants["A"]
    client = make_client(factory, types.SimpleNamespace(id=uuid.uuid4(), email="admin@example.test", role="Admin", company_id=tenant_id), monkeypatch)
    created = client.post("/api/v1/tenant-control/communications", json={
        "channel": "email", "provider": "sendgrid",
        "sender_identity": "OxenGL <sender@oxengl.example>", "config": {"region": "global"},
        "credentials": {"api_key": "SG-OLD"},
    }).json()
    with factory() as db:
        db.get(models.CommunicationSetting, uuid.UUID(created["id"])).credentials_encrypted = "corrupt-blob"
        db.commit()
    response = client.put(f"/api/v1/tenant-control/communications/{created['id']}", json={"config": {"region": "eu"}, "credentials": {"api_key": ""}})
    assert response.status_code == 200, response.text
    assert response.json()["config"]["region"] == "eu"
    response = client.put(f"/api/v1/tenant-control/communications/{created['id']}", json={"credentials": {"api_key": "SG-NEW"}})
    assert response.status_code == 200, response.text
    with factory() as db:
        row = db.get(models.CommunicationSetting, uuid.UUID(created["id"]))
        assert svc._cipher.decrypt(row.id, row.tenant_id, row.credentials_encrypted) == {"api_key": "SG-NEW"}


def test_superadmin_cannot_modify_tenant_setting_and_sees_all_read_only(factory, tenants, monkeypatch):
    tenant_row_id = add_setting(factory, tenant_id=tenants["A"], provider="sendgrid")
    platform_row_id = add_setting(factory, provider="sendgrid")
    admin = types.SimpleNamespace(id=uuid.uuid4(), email="root@example.test", role="Super_Admin", company_id=None)
    client = make_client(factory, admin, monkeypatch, super_admin=True)
    response = client.get("/api/v1/superadmin/communications")
    assert response.status_code == 200 and any(item["id"] == str(tenant_row_id) for item in response.json())
    denied = client.delete(f"/api/v1/superadmin/communications/{tenant_row_id}")
    assert denied.status_code == 404
    deleted = client.delete(f"/api/v1/superadmin/communications/{platform_row_id}")
    assert deleted.status_code == 200
    with factory() as db:
        assert db.get(models.CommunicationSetting, tenant_row_id) is not None
        assert db.get(models.CommunicationSetting, platform_row_id) is None
        assert any(
            row.action == "COMMUNICATION_SETTING_ACCESS_DENIED" and row.outcome == "DENIED"
            for row in db.scalars(select(models.PlatformAuditLog)).all()
        )


def test_smtp_adapter_calls_tls_login_and_send(monkeypatch):
    calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout): calls.append(("connect", host, port, timeout))
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def ehlo(self): calls.append(("ehlo",))
        def starttls(self, context): calls.append(("starttls", isinstance(context, object)))
        def login(self, username, password): calls.append(("login", username, password))
        def send_message(self, message): calls.append(("send", message["To"], message.get_content().strip())); return {}

    monkeypatch.setattr(svc.smtplib, "SMTP", FakeSMTP)
    row = make_setting(provider="smtp", config={"host": "smtp.example", "port": 587, "security": "starttls", "username": "mailer"}, credentials={"password": "smtp-password"}, sender="sender@example.test")
    asyncio.run(svc.deliver(row, "recipient@example.test", "private body"))
    assert calls[0] == ("connect", "smtp.example", 587, 10)
    assert any(call[0] == "starttls" for call in calls)
    assert ("login", "mailer", "smtp-password") in calls
    assert any(call[0] == "send" and call[1] == "recipient@example.test" and call[2] == "private body" for call in calls)


@pytest.mark.parametrize(("provider", "config", "credentials", "expected_url", "status_code", "response_body"), [
    ("sendgrid", {"region": "global"}, {"api_key": "sg-secret"}, "https://api.sendgrid.com/v3/mail/send", 202, {}),
    ("twilio", {"account_sid": "AC0123456789abcdef0123456789abcdef", "region": "us1"}, {"auth_token": "tw-secret"}, "https://api.twilio.com/2010-04-01/Accounts/AC0123456789abcdef0123456789abcdef/Messages.json", 201, {}),
    ("unifonic", {"region": "global"}, {"app_sid": "un-secret"}, "https://el.cloud.unifonic.com/rest/SMS/messages", 200, {"success": True}),
    ("taqnyat", {"region": "global"}, {"api_token": "ta-secret"}, "https://api.taqnyat.sa/v1/messages", 200, {"status": "sent"}),
])
def test_http_adapters_invoke_provider_and_require_acceptance(monkeypatch, provider, config, credentials, expected_url, status_code, response_body):
    requests = []

    async def fake_request(method, url, **kwargs):
        requests.append((method, url, kwargs))
        return httpx.Response(status_code, json=response_body)

    monkeypatch.setattr(svc, "_request", fake_request)
    row = make_setting(provider=provider, config=config, credentials=credentials,
                       sender="sender@example.test" if provider == "sendgrid" else "OXENGL")
    asyncio.run(svc.deliver(row, "+15551234567", "message body"))
    method, url, kwargs = requests[0]
    assert method == "POST" and url == expected_url
    encoded = repr(kwargs)
    assert "message body" in encoded and "+15551234567" in encoded
    assert "credentials" not in encoded
    if provider == "sendgrid":
        assert kwargs["headers"]["Authorization"] == "Bearer sg-secret"
    elif provider == "twilio":
        assert kwargs["auth"] == (config["account_sid"], "tw-secret")
    elif provider == "unifonic":
        assert kwargs["data"]["AppSid"] == "un-secret"
    else:
        assert kwargs["headers"]["Authorization"] == "Bearer ta-secret"


def test_http_provider_rejection_is_not_reported_as_success(monkeypatch):
    async def rejected(*_args, **_kwargs): return httpx.Response(401, json={"error": "private provider response"})
    monkeypatch.setattr(svc, "_request", rejected)
    row = make_setting(provider="sendgrid", credentials={"api_key": "secret"})
    with pytest.raises(svc.CommunicationError, match="did not accept"):
        asyncio.run(svc.deliver(row, "recipient@example.test", "secret message"))


def test_tenant_smtp_ssrf_validation_rejects_private_host(monkeypatch):
    monkeypatch.setattr(svc.backup_credentials, "validate_destination_host", original_validate_destination_host)
    monkeypatch.setattr(svc.backup_credentials.socket, "getaddrinfo", lambda *_args, **_kwargs: [(2, 1, 6, "", ("10.0.0.5", 0))])
    with pytest.raises(ValueError, match="non-public"):
        svc.validate_config("smtp", {"host": "smtp.attacker.example"}, tenant_scoped=True)


def test_invite_otp_recovery_and_provisioning_hooks_use_communication_adapter(monkeypatch, tenants):
    delivered = []

    async def capture(channel, destination, body, *, tenant_id, db=None):
        delivered.append((channel, destination, body, tenant_id))

    monkeypatch.setattr(svc, "send_message", capture)
    tenant_id = tenants["A"]
    asyncio.run(notification_service.dispatch_temporary_credentials(
        "sms", "+15551234567", "temporary-secret", full_name="Test User", workspace_name="Workspace", tenant_id=tenant_id,
    ))
    asyncio.run(notification_service.VerificationService.dispatch_email_otp(
        "person@example.test", "123456", "Workspace", tenant_id,
    ))
    asyncio.run(notification_service.VerificationService.dispatch_sms_otp("+15551234567", "654321", tenant_id))
    from backend.app.api.v1.auth_recovery import RecoveryChannel, get_delivery_provider
    asyncio.run(get_delivery_provider(RecoveryChannel.EMAIL, tenant_id).send("person@example.test", "reset-code"))
    assert [call[0] for call in delivered] == ["sms", "email", "sms", "email"]
    assert all(call[3] == tenant_id for call in delivered)
    assert "temporary-secret" in delivered[0][2]
    assert "123456" in delivered[1][2] and "654321" in delivered[2][2]

    async def capture_credentials(*args, **kwargs):
        delivered.append((args, kwargs))
    monkeypatch.setattr(notification_service, "dispatch_temporary_credentials", capture_credentials)
    assert provisioning.CommunicationCredentialNotifier().send_temporary_password(
        channel="email", destination="person@example.test", display_name="Person",
        temporary_password="once-only-password", tenant_id=tenant_id,
    ) is True
    assert delivered[-1][1]["tenant_id"] == tenant_id


def test_test_endpoint_sends_to_explicit_recipient_without_audit_or_log_leak(factory, tenants, monkeypatch, caplog):
    secret = "SENDGRID-PRIVATE-KEY"
    row_id = add_setting(factory, tenant_id=tenants["A"], provider="sendgrid", credentials={"api_key": secret})
    calls = []
    monkeypatch.setattr(svc, "_request", lambda *_args, **_kwargs: None)

    async def fake_deliver(row, recipient, body):
        calls.append((recipient, body))

    monkeypatch.setattr(svc, "deliver", fake_deliver)
    user = types.SimpleNamespace(id=uuid.uuid4(), email="owner@example.test", role="Owner", company_id=tenants["A"])
    client = make_client(factory, user, monkeypatch)
    recipient = "private-recipient@example.test"
    result = client.post(f"/api/v1/tenant-control/communications/{row_id}/test", json={"recipient": recipient})
    assert result.status_code == 200 and result.json()["ok"] is True
    assert calls and calls[0][0] == recipient
    assert recipient not in result.text and secret not in result.text and "secret" not in caplog.text.lower()
    with factory() as db:
        audits = db.scalars(select(models.PlatformAuditLog)).all()
        assert all(recipient not in repr(row) and secret not in repr(row) for row in audits)
        updated = db.get(models.CommunicationSetting, row_id)
        assert updated.last_test_status == "success" and updated.last_test_at is not None


def test_invite_and_password_reset_flows_reach_communication_delivery(monkeypatch, tenants):
    from backend.app.api.v1 import auth as recovery_api
    from backend.app.api.v1 import users as users_api

    sent = []

    async def capture(channel, destination, body, *, tenant_id, db=None):
        sent.append((channel, destination, body, tenant_id))

    monkeypatch.setattr(svc, "send_message", capture)
    monkeypatch.setattr(users_api, "append_audit_from_context", lambda *_args, **_kwargs: None)

    class EmptyQuery:
        def filter(self, *_args, **_kwargs): return self
        def first(self): return None

    class InviteDB:
        def __init__(self): self.added = []; self.commits = 0
        def query(self, *_args, **_kwargs): return EmptyQuery()
        def get(self, *_args, **_kwargs): return None
        def add(self, item): self.added.append(item)
        def commit(self): self.commits += 1

    actor_id = uuid.uuid4()
    audit = users_api.AuditContext(
        actor_id=actor_id, actor_identifier="owner@example.test", ip_address="192.0.2.20",
        user_agent="test", request_id="comms-invite", endpoint="/api/v1/users/invite",
    )
    actor = users_api.IamActor(
        user=types.SimpleNamespace(id=actor_id), user_id=actor_id, identifier="owner@example.test",
        company_id=tenants["A"], level=users_api.LEVEL_OWNER, audit=audit,
    )
    invite_db = InviteDB()
    invite = asyncio.run(users_api.invite_tenant_user(
        users_api.InviteUserRequest(email="person@gmail.com", role="Guest"), actor, invite_db,
    ))
    assert invite.reset_dispatched is True
    assert sent and sent[0][0] == "email" and sent[0][1] == "person@gmail.com"
    assert sent[0][3] == tenants["A"]
    assert "temporary password" in sent[0][2]
    assert sent[0][2].split("temporary password ", 1)[1].split(".", 1)[0] not in invite.model_dump_json()

    class Result:
        def scalar(self): return "master.users"
        def mappings(self): return self
        def first(self): return {"id": str(uuid.uuid4()), "email": "recover@example.test"}

    class ResetDB:
        def __init__(self): self.executed = []; self.commits = 0
        def execute(self, statement, _params=None):
            self.executed.append(str(statement))
            return Result()
        def commit(self): self.commits += 1
        def rollback(self): pass

    async def fixed_otp(_identifier): return "482601"
    async def store_payload(*_args, **_kwargs): return None
    monkeypatch.setattr(recovery_api, "ensure_password_resets_table", lambda _db: None)
    monkeypatch.setattr(recovery_api.VerificationService, "generate_and_store_otp", fixed_otp)
    monkeypatch.setattr(recovery_api.VerificationService, "store_registration_payload", store_payload)
    reset_db = ResetDB()
    background_tasks = recovery_api.BackgroundTasks()
    response = asyncio.run(recovery_api.request_password_reset(
        recovery_api.ForgotPasswordRequest(email="recover@example.test", workspace_slug="master"),
        background_tasks, reset_db,
    ))
    assert response["status"] == "OTP_DISPATCHED"
    assert "482601" not in str(response)
    assert background_tasks.tasks
    for task in background_tasks.tasks:
        awaitable = task()
        if hasattr(awaitable, "__await__"):
            asyncio.run(awaitable)
    assert any(channel == "email" and destination == "recover@example.test" and "482601" in body
               for channel, destination, body, _tenant in sent)
