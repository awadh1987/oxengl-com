from __future__ import annotations

import uuid
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import backend.two_tier_auth as tta
from backend.two_tier_auth import hash_password


class _Rows:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row


class FakeTenantDB:
    def __init__(self, user, flags):
        self.user, self.flags = user, flags

    def scalar(self, *_a, **_k):
        return self.user

    def execute(self, stmt, *_a, **_k):
        return _Rows(self.flags)

    def begin_nested(self):
        @contextmanager
        def cm():
            yield

        return cm()

    def commit(self):
        pass

    def merge(self, _u):
        pass


class FakeMasterDB:
    def __init__(self, tenant):
        self.tenant = tenant

    def scalar(self, *_a, **_k):
        return self.tenant

    def query(self, *_a, **_k):
        return SimpleNamespace(filter=lambda *a, **k: SimpleNamespace(first=lambda: None))

    def get_bind(self):
        return None


def _login(monkeypatch, password_ok, flags):
    tenant = SimpleNamespace(id=uuid.uuid4(), slug="acme", status="active", custom_domain=None)
    user = SimpleNamespace(
        id=uuid.uuid4(), email="guest@example.com", mobile_number="+966501234567",
        first_name="Guest", last_name="User", role="guest", is_active=True,
        locked_until=None, failed_login_attempts=0, last_login_at=None,
        password_hash=hash_password("Temp-Pass-123"),
    )
    tdb = FakeTenantDB(user, flags)

    class FakeMgr:
        def __init__(self, *_a, **_k):
            pass

        @contextmanager
        def session_scope(self, *_a, **_k):
            yield tdb

    monkeypatch.setattr(tta, "TenantConnectionManager", FakeMgr)
    monkeypatch.setattr(tta.limiter, "enabled", False, raising=False)
    payload = tta.TenantLoginRequest(
        identity="guest@example.com", password=password_ok, workspace_slug="acme"
    )
    request = SimpleNamespace(state=SimpleNamespace(), headers={}, client=SimpleNamespace(host="127.0.0.1"))
    fn = getattr(tta.tenant_login, "__wrapped__", tta.tenant_login)
    return fn(request, payload, FakeMasterDB(tenant))


def test_invited_user_gets_token_and_must_change_flag(monkeypatch):
    res = _login(
        monkeypatch, "Temp-Pass-123",
        {"must_change_password": True, "is_active": True, "deleted_at": None},
    )
    assert res["access_token"]
    assert res["must_change_password"] is True
    assert res["user"]["must_change_password"] is True


def test_changed_password_clears_flag(monkeypatch):
    res = _login(
        monkeypatch, "Temp-Pass-123",
        {"must_change_password": False, "is_active": True, "deleted_at": None},
    )
    assert res["must_change_password"] is False


def test_deactivated_res_user_cannot_login(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        _login(
            monkeypatch, "Temp-Pass-123",
            {"must_change_password": True, "is_active": False, "deleted_at": None},
        )
    assert exc.value.status_code == 401
