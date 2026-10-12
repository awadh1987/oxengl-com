import base64
import json
import logging
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from standardwebhooks.webhooks import Webhook as StandardWebhook

from backend.api.webhooks import sync as sync_webhook
from backend.app.main import app
from backend.models import PlatformAuditLog, ResCompany, ResUser


def build_signed_event(secret: str, payload: dict) -> tuple[bytes, dict[str, str]]:
    raw_body = json.dumps(payload, separators=(",", ":")).encode()
    msg_id = f"msg_{uuid.uuid4().hex}"
    timestamp = datetime.now(timezone.utc)
    signing_key = StandardWebhook(secret)
    return raw_body, {
        "svix-id": msg_id,
        "svix-timestamp": str(int(timestamp.timestamp())),
        "svix-signature": signing_key.sign(msg_id, timestamp, raw_body.decode()),
    }


class FakeQuery:
    def __init__(self, model, company, user):
        self.model = model
        self.company = company
        self.user = user
        self.filters = ()

    def filter(self, *filters):
        self.filters = filters
        return self

    def first(self):
        return self.company if self.model is ResCompany else self.user


class FakeSession:
    def __init__(self, company, user=None):
        self.company = company
        self.user = user
        self.added = []
        self.queries = []
        self.committed = False

    def query(self, model):
        query = FakeQuery(model, self.company, self.user)
        self.queries.append(query)
        return query

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.committed = False


def install_fake_session(monkeypatch, db, captured_requests=None):
    def session_generator(request):
        if captured_requests is not None:
            captured_requests.append(request)
        yield db

    monkeypatch.setattr(sync_webhook, "get_db", session_generator)


def test_sync_webhook_rejects_invalid_signature_without_opening_database(monkeypatch):
    company_id = uuid.uuid4()
    secret = "whsec_" + base64.b64encode(b"test-sync-webhook-secret").decode()
    monkeypatch.setenv("SYNC_WEBHOOK_SECRETS_JSON", json.dumps({str(company_id): secret}))
    monkeypatch.setattr(
        sync_webhook,
        "get_db",
        lambda _request: pytest.fail("database must not be opened before signature verification"),
    )
    client = TestClient(app)

    response = client.post(
        f"/api/v1/webhooks/sync/{company_id}",
        content=b'{"type":"user.created","data":{"id":"person-1"}}',
        headers={
            "svix-id": "msg_invalid",
            "svix-timestamp": str(int(datetime.now(timezone.utc).timestamp())),
            "svix-signature": "v1,invalid",
        },
    )

    assert response.status_code == 401


def test_sync_webhook_creates_native_login_user_scoped_to_signed_tenant(
    monkeypatch,
    caplog,
):
    company_id = uuid.uuid4()
    other_company_id = uuid.uuid4()
    secret = "whsec_" + base64.b64encode(b"test-sync-webhook-secret").decode()
    monkeypatch.setenv("SYNC_WEBHOOK_SECRETS_JSON", json.dumps({str(company_id): secret}))

    db = FakeSession(company=object())
    tenant_requests = []
    install_fake_session(monkeypatch, db, tenant_requests)
    sync_context = {}
    record_audit = sync_webhook._record_sync_audit

    def capture_sync_context(db, request, bound_company_id, event_type):
        sync_context["company_id"] = request.state.company_id
        sync_context["user_role"] = request.state.sync_user_role
        record_audit(db, request, bound_company_id, event_type)

    monkeypatch.setattr(sync_webhook, "_record_sync_audit", capture_sync_context)
    payload = {
        "type": "user.created",
        "data": {
            "id": "directory-user-42",
            "email": " USER@example.com ",
            "full_name": "Synced User",
            "company_id": str(other_company_id),
            "role": "Admin",
        },
    }
    raw_body, headers = build_signed_event(secret, payload)
    caplog.set_level(logging.INFO, logger=sync_webhook.__name__)

    response = TestClient(app).post(
        f"/api/v1/webhooks/sync/{company_id}",
        content=raw_body,
        headers={**headers, "X-Company-ID": str(other_company_id), "X-Role": "Super_Admin"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "processed",
        "event": "user.created",
        "result": "created",
    }
    user = next(item for item in db.added if isinstance(item, ResUser))
    assert user.company_id == company_id
    assert user.sync_reference_id == "directory-user-42"
    assert user.email == "user@example.com"
    assert user.role == "Guest"
    assert user.is_active is False
    assert user.firebase_uid.startswith("native:")
    assert user.password_hash == ""
    assert sync_context == {"company_id": str(company_id), "user_role": "Guest"}
    assert tenant_requests[0].state.company_id == str(company_id)
    assert "x-company-id" not in tenant_requests[0].headers
    assert "x-role" not in tenant_requests[0].headers
    audit = next(item for item in db.added if isinstance(item, PlatformAuditLog))
    assert audit.company_id == company_id
    assert audit.action == "USER_SYNC_USER_CREATED"
    user_query = next(query for query in db.queries if query.model is ResUser)
    assert any(
        getattr(condition.left, "name", None) == "company_id"
        and condition.right.value == company_id
        for condition in user_query.filters
    )
    assert "Processed sync webhook event user.created" in caplog.text
    assert db.committed


def test_sync_webhook_rejects_malformed_event_type_before_database_access(monkeypatch):
    company_id = uuid.uuid4()
    secret = "whsec_" + base64.b64encode(b"test-sync-webhook-secret").decode()
    monkeypatch.setenv("SYNC_WEBHOOK_SECRETS_JSON", json.dumps({str(company_id): secret}))
    monkeypatch.setattr(
        sync_webhook,
        "get_db",
        lambda _request: pytest.fail("database must not be opened for malformed events"),
    )
    raw_body, headers = build_signed_event(secret, {"type": [], "data": {}})

    response = TestClient(app).post(
        f"/api/v1/webhooks/sync/{company_id}",
        content=raw_body,
        headers=headers,
    )

    assert response.status_code == 422


def test_sync_webhook_updates_only_the_tenant_bound_user(monkeypatch):
    company_id = uuid.uuid4()
    secret = "whsec_" + base64.b64encode(b"test-sync-webhook-secret").decode()
    monkeypatch.setenv("SYNC_WEBHOOK_SECRETS_JSON", json.dumps({str(company_id): secret}))
    existing_user = ResUser(
        id=uuid.uuid4(),
        firebase_uid="native:existing-user",
        sync_reference_id="directory-user-42",
        email="old@example.com",
        full_name="Old Name",
        company_id=company_id,
        role="Guest",
        is_active=True,
    )
    db = FakeSession(company=object(), user=existing_user)
    install_fake_session(monkeypatch, db)
    raw_body, headers = build_signed_event(
        secret,
        {
            "type": "user.updated",
            "data": {
                "id": "directory-user-42",
                "email": "NEW@example.com",
                "full_name": "New Name",
                "phone": "+15551234567",
                "is_active": False,
            },
        },
    )

    response = TestClient(app).post(
        f"/api/v1/webhooks/sync/{company_id}",
        content=raw_body,
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["result"] == "updated"
    assert existing_user.email == "new@example.com"
    assert existing_user.full_name == "New Name"
    assert existing_user.phone == "+15551234567"
    assert existing_user.is_active is False
    user_query = next(query for query in db.queries if query.model is ResUser)
    assert any(
        getattr(condition.left, "name", None) == "company_id"
        and condition.right.value == company_id
        for condition in user_query.filters
    )
    assert db.committed


def test_sync_webhook_deactivates_deleted_user(monkeypatch):
    company_id = uuid.uuid4()
    secret = "whsec_" + base64.b64encode(b"test-sync-webhook-secret").decode()
    monkeypatch.setenv("SYNC_WEBHOOK_SECRETS_JSON", json.dumps({str(company_id): secret}))
    existing_user = ResUser(
        id=uuid.uuid4(),
        firebase_uid="native:existing-user",
        sync_reference_id="directory-user-42",
        email="user@example.com",
        full_name="Existing User",
        company_id=company_id,
        role="Guest",
        is_active=True,
    )
    db = FakeSession(company=object(), user=existing_user)
    install_fake_session(monkeypatch, db)
    raw_body, headers = build_signed_event(
        secret,
        {"type": "user.deleted", "data": {"id": "directory-user-42"}},
    )

    response = TestClient(app).post(
        f"/api/v1/webhooks/sync/{company_id}",
        content=raw_body,
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["result"] == "deactivated"
    assert existing_user.is_active is False
    assert db.committed
