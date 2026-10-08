from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Request

from backend.app.api.v1 import billing


class EmptyScalars:
    def all(self):
        return []


class RecordingDB:
    def __init__(self):
        self.statements = []

    def scalars(self, statement):
        self.statements.append(statement)
        return EmptyScalars()

    def commit(self):
        pass


def _request(query: bytes = b"") -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/superadmin/billing/summary",
            "query_string": query,
            "headers": [],
            "client": ("192.0.2.2", 1234),
            "server": ("test", 443),
            "scheme": "https",
        }
    )


def _user(role: str, company_id=None, iam_role=None, **extra):
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="actor@example.com",
        role=role,
        iam_role=iam_role,
        company_id=company_id,
        is_superuser=False,
        access_control_list="",
        role_ids="",
        **extra,
    )


def test_owner_summary_scopes_every_query_to_session_company_and_ignores_tenant_param(monkeypatch):
    company_id = uuid.uuid4()
    foreign_company = uuid.uuid4()
    db = RecordingDB()
    audits = []
    monkeypatch.setattr(
        billing,
        "_audit_billing_summary_access",
        lambda _db, _request, _user, tenant_id, outcome: audits.append((tenant_id, outcome)),
    )

    summary = billing.get_superadmin_billing_summary(
        _request(f"tenant_id={foreign_company}".encode()),
        _user("Owner", company_id),
        db,
    )

    assert summary["active_subscribers_count"] == 0
    assert len(db.statements) == 3
    for statement in db.statements:
        compiled = statement.compile()
        assert company_id in compiled.params.values()
        assert foreign_company not in compiled.params.values()
        assert "tenant_id" in str(statement.whereclause)
    assert audits == [(company_id, "SUCCESS")]


@pytest.mark.parametrize("role,iam_role", [("CEO", None), ("Employee", "CEO")])
def test_ceo_roles_are_tenant_scoped(monkeypatch, role, iam_role):
    company_id = uuid.uuid4()
    db = RecordingDB()
    monkeypatch.setattr(billing, "_audit_billing_summary_access", lambda *args: None)
    user = _user(role, company_id, iam_role=iam_role)

    billing.get_superadmin_billing_summary(_request(), user, db)

    assert all(company_id in statement.compile().params.values() for statement in db.statements)


def test_platform_super_admin_remains_platform_wide(monkeypatch):
    db = RecordingDB()
    audits = []
    monkeypatch.setattr(
        billing,
        "_audit_billing_summary_access",
        lambda _db, _request, _user, tenant_id, outcome: audits.append((tenant_id, outcome)),
    )
    user = _user("Super_Admin")

    billing.get_superadmin_billing_summary(_request(), user, db)

    assert len(db.statements) == 3
    assert all("tenant_id" not in str(statement.whereclause) for statement in db.statements)
    assert audits == [(None, "SUCCESS")]


def test_other_tenant_roles_are_denied_and_audited(monkeypatch):
    company_id = uuid.uuid4()
    db = RecordingDB()
    audits = []
    monkeypatch.setattr(
        billing,
        "_audit_billing_summary_access",
        lambda _db, _request, _user, tenant_id, outcome: audits.append((tenant_id, outcome)),
    )

    with pytest.raises(HTTPException) as error:
        billing.get_superadmin_billing_summary(_request(), _user("Accountant", company_id), db)

    assert error.value.status_code == 403
    assert not db.statements
    assert audits == [(company_id, "DENIED")]
