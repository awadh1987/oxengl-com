"""IAM Control Panel (/api/v1/users): roles catalog, external-only invites, role edits, suspend, force reset."""

import json
import os
import secrets as _secrets
import types
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

for _name in ("JWT_SECRET", "JWT_SECRET_MASTER", "JWT_SECRET_TENANT", "DATA_RESIDENCY_KEY"):
    os.environ.setdefault(_name, _secrets.token_hex(32))

from backend import models  # noqa: E402
from backend.api.dependencies import TenantContext, get_current_user, get_tenant_context  # noqa: E402
from backend.app.api.v1 import users as users_api  # noqa: E402
from backend.app.domains.iam.role_catalog import (  # noqa: E402
    ALLOWED_RES_USER_ROLES,
    EXTERNAL_INVITE_ROLES,
    HR_PROVISIONED_ROLES,
    HR_REGISTRATION_REQUIRED_MESSAGE,
)
from backend.database import get_db  # noqa: E402

EXPECTED_ROLES = [
    "Super_Admin", "Operations_Admin", "Finance_Admin", "System_Admin", "General_Manager", "Ops_Manager",
    "Finance_Manager", "HR_Manager", "Fleet_Manager", "Procurement_Manager", "Warehouse_Manager",
    "Dispatch_Manager", "Finance_Editor", "Ops_Editor", "HR_Editor", "Procurement_Editor", "IT_Support",
    "Admin_Viewer", "Data_Entry", "Dispatch_Operator", "Field_Operator", "WMS_Operator",
    "Maintenance_Operator", "Security_Operator", "Employee_Self_Serve",
]


@compiles(JSONB, "sqlite")
def _jsonb_sqlite(type_, compiler, **kw):  # test-only DDL shim
    return "JSON"


RES_COMPANY_STUB_COLUMNS = ['parent_id', 'name', 'slug', 'domain_slug', 'custom_domain', 'tax_id', 'commercial_registration', 'currency', 'fiscal_calendar', 'fiscal_year_start_month', 'tax_regime', 'subscription_tier', 'license_key', 'license_expires_at', 'max_cost_centers', 'theme_mode', 'ui_primary_color', 'ui_logo_url', 'features_override', 'logo_url', 'is_active', 'status', 'primary_color', 'secondary_color', 'wallpaper_url', 'background_url', 'created_at', 'updated_at']


@pytest.fixture()
def factory():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with eng.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE res_companies (id CHAR(32) PRIMARY KEY, %s)" % ", ".join(RES_COMPANY_STUB_COLUMNS)
        )
    models.Base.metadata.create_all(
        eng, tables=[models.ResUser.__table__, models.PlatformAuditLog.__table__, models.TenantUser.__table__]
    )
    yield sessionmaker(bind=eng, expire_on_commit=False, autoflush=False)
    eng.dispose()


class Harness:
    def __init__(self, factory):
        self.factory = factory
        self.company = uuid.uuid4()
        self.other_company = uuid.uuid4()
        self.revoked = []
        self.reset_calls = []
        self.actor_id = None
        with factory() as db:
            db.connection().exec_driver_sql(
                "INSERT INTO res_companies (id, name, slug) VALUES (?, 'Acme', 'acme'), (?, 'Other', 'other')",
                (self.company.hex, self.other_company.hex),
            )
            db.commit()
        self.app = FastAPI()
        self.app.include_router(users_api.router)
        self.app.dependency_overrides[get_db] = self._db
        self.app.dependency_overrides[get_current_user] = self._current
        self.app.dependency_overrides[get_tenant_context] = self._context
        self.client = TestClient(self.app)

    def _db(self):
        db = self.factory()
        try:
            yield db
        finally:
            db.close()

    def _current(self):
        return types.SimpleNamespace(id=self.actor_id, email="actor@example.com")

    def _context(self):
        with self.factory() as db:
            u = db.get(models.ResUser, self.actor_id)
            return TenantContext(
                tenant_id=u.company_id, company_id=u.company_id, user=u, role=u.role, is_super_admin=False
            )

    def add_user(self, role="Admin", iam_role=None, company=None, active=True, **kw) -> uuid.UUID:
        uid = uuid.uuid4()
        with self.factory() as db:
            db.add(
                models.ResUser(
                    id=uid, email=f"{uid.hex[:10]}@example.com", full_name="U " + uid.hex[:4],
                    password_hash="original-hash", company_id=company or self.company, role=role,
                    iam_role=iam_role, is_active=active, firebase_uid=f"native:{uid}", **kw,
                )
            )
            db.commit()
        return uid

    def login_as(self, uid):
        self.actor_id = uid

    def audit(self):
        with self.factory() as db:
            return list(db.execute(select(models.PlatformAuditLog)).scalars())

    def user(self, uid):
        with self.factory() as db:
            return db.get(models.ResUser, uid)


@pytest.fixture()
def h(factory, monkeypatch):
    harness = Harness(factory)
    monkeypatch.setattr(users_api, "_revoke_sessions", lambda db, uid, reason: harness.revoked.append((uid, reason)))

    async def fake_dispatch(db, bg, email, company_id):
        harness.reset_calls.append((email, company_id))
        return True

    monkeypatch.setattr(users_api, "_dispatch_existing_reset_flow", fake_dispatch)
    monkeypatch.setattr(users_api, "hash_password", lambda p: "hashed::" + _secrets.token_hex(8))
    harness.login_as(harness.add_user("Admin"))
    return harness


# ----------------------------------------------------------------------------- catalog

def test_catalog_is_exactly_the_25_standard_roles_and_accepted_by_db_constraint():
    assert list(HR_PROVISIONED_ROLES) == EXPECTED_ROLES
    assert set(EXPECTED_ROLES) <= set(ALLOWED_RES_USER_ROLES)


def test_roles_endpoint_returns_exact_catalog(h):
    body = h.client.get("/api/v1/users/roles").json()
    assert [r["value"] for r in body["roles"]] == EXPECTED_ROLES + ["Owner"]
    assert [r["value"] for r in body["external_roles"]] == list(EXTERNAL_INVITE_ROLES) == ["Guest", "External_Auditor"]
    assert body["can_manage_users"] is True and body["can_assign_privileged"] is False


# ----------------------------------------------------------------------------- authorization

@pytest.mark.parametrize("role", ["Data_Entry", "Accountant", "User", "Guest", "Finance_Manager"])
def test_non_admins_are_denied_and_audited(h, role):
    """Data_Entry is aliased to ADMIN by normalize_role; this router must not honour that alias."""
    h.login_as(h.add_user(role, iam_role=role))
    target = h.add_user("Guest")
    for method, path, body in [
        ("get", "/api/v1/users", None),
        ("put", f"/api/v1/users/{target}/role", {"role": "Ops_Editor"}),
        ("post", f"/api/v1/users/{target}/suspend", None),
        ("post", f"/api/v1/users/{target}/force-password-reset", None),
        ("post", "/api/v1/users/invite", {"email": "x@gmail.com", "role": "Guest"}),
    ]:
        resp = getattr(h.client, method)(path, **({"json": body} if body else {}))
        assert resp.status_code == 403, path
    assert h.user(target).role == "Guest" and h.user(target).is_active
    assert {a.action for a in h.audit()} == {"IAM_ACCESS_DENIED:insufficient_role"}


def test_list_is_tenant_scoped_and_has_iam_fields(h):
    mine = h.add_user("Finance_Manager", iam_role="Finance_Manager")
    foreign = h.add_user("Admin", company=h.other_company)
    rows = h.client.get("/api/v1/users").json()
    ids = {r["id"] for r in rows}
    assert str(mine) in ids and str(foreign) not in ids
    row = next(r for r in rows if r["id"] == str(mine))
    assert row["iam_role"] == "Finance_Manager" and row["must_change_password"] is False


# ----------------------------------------------------------------------------- invite

@pytest.mark.parametrize("role", ["Super_Admin", "Finance_Manager", "Employee_Self_Serve", "Admin", "Owner", "Data_Entry", "CEO"])
def test_invite_rejects_internal_roles_server_side(h, role):
    resp = h.client.post("/api/v1/users/invite", json={"email": "new.person@gmail.com", "role": role})
    assert resp.status_code == 403
    assert resp.json()["detail"] == HR_REGISTRATION_REQUIRED_MESSAGE
    with h.factory() as db:
        assert db.query(models.ResUser).filter_by(email="new.person@gmail.com").count() == 0
    assert any(a.action.startswith("IAM_INVITE_DENIED") and a.outcome == "DENIED" for a in h.audit())


def test_invite_unknown_role_is_rejected(h):
    assert h.client.post("/api/v1/users/invite", json={"email": "a@gmail.com", "role": "Banana"}).status_code == 400


@pytest.mark.parametrize("role", ["Guest", "External_Auditor", "External Auditor", "guest"])
def test_invite_external_creates_least_privilege_account_without_password_leak(h, role, monkeypatch):
    async def fake_dispatch(*_args, **_kwargs):
        return None

    monkeypatch.setattr(users_api, "dispatch_temporary_credentials", fake_dispatch)
    resp = h.client.post("/api/v1/users/invite", json={"email": "Contractor@Outlook.com", "role": role})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert not any("password" in key and key != "must_change_password" for key in body)
    assert body.get("temporary_password") is None and body["reset_dispatched"] is True
    user = h.user(uuid.UUID(body["user_id"]))
    assert user.role == "Guest" and user.iam_role in EXTERNAL_INVITE_ROLES
    assert user.company_id == h.company and user.email == "contractor@outlook.com"
    assert user.must_change_password is True and user.password_hash.startswith("hashed::")
    assert user.abac_context["read_only"] is True and user.abac_context["external_identity"] is True
    assert any(a.action.startswith("IAM_USER_INVITED") and a.outcome == "SUCCESS" and a.tenant_id == h.company for a in h.audit())


def test_invite_duplicate_does_not_reveal_other_workspace(h):
    other = h.add_user("Guest", company=h.other_company)
    with h.factory() as db:
        email = db.get(models.ResUser, other).email
    resp = h.client.post("/api/v1/users/invite", json={"email": email, "role": "Guest"})
    assert resp.status_code == 409 and "another workspace" not in resp.text


# ----------------------------------------------------------------------------- role edit

@pytest.mark.parametrize("role", [r for r in EXPECTED_ROLES if r != "Super_Admin"])
def test_edit_access_accepts_every_standard_role(h, role):
    target = h.add_user("Guest", iam_role="Guest", abac_context={"read_only": True, "approval_limit": 5})
    resp = h.client.put(f"/api/v1/users/{target}/role", json={"role": role.lower()})
    assert resp.status_code == 200, resp.text
    user = h.user(target)
    assert user.role == role and user.iam_role == role
    assert user.abac_context == {"approval_limit": 5}
    assert (target, "role_changed") in h.revoked
    assert any(a.action.startswith("IAM_ROLE_CHANGED") and a.outcome == "SUCCESS" for a in h.audit())


@pytest.mark.parametrize("role", ["Admin", "Guest", "COO", "External_Auditor", "root", "", "DROP TABLE"])
def test_edit_access_rejects_non_catalog_roles(h, role):
    target = h.add_user("Guest")
    assert h.client.put(f"/api/v1/users/{target}/role", json={"role": role}).status_code == 400
    assert h.user(target).role == "Guest"


def test_owner_role_is_assignable_only_by_an_owner(h):
    target = h.add_user("Guest")
    assert h.client.put(f"/api/v1/users/{target}/role", json={"role": "Owner"}).status_code == 403
    assert h.user(target).role == "Guest"
    h.login_as(h.add_user("Owner"))
    assert h.client.put(f"/api/v1/users/{target}/role", json={"role": "owner"}).status_code == 200
    user = h.user(target)
    assert (user.role, user.iam_role, user.company_id, user.is_superuser) == ("Owner", "Owner", h.company, False)


def test_tenant_admin_cannot_escalate_to_super_admin(h):
    target = h.add_user("Guest")
    resp = h.client.put(f"/api/v1/users/{target}/role", json={"role": "Super_Admin"})
    assert resp.status_code == 403
    assert h.user(target).role == "Guest"
    assert any(a.action.startswith("IAM_PRIVILEGED_ROLE_DENIED") for a in h.audit())


def test_owner_can_assign_super_admin_but_it_stays_tenant_scoped(h):
    h.login_as(h.add_user("Owner"))
    target = h.add_user("Finance_Manager", iam_role="Finance_Manager")
    assert h.client.put(f"/api/v1/users/{target}/role", json={"role": "Super_Admin"}).status_code == 200
    user = h.user(target)
    assert (user.role, user.iam_role, user.company_id, user.is_superuser) == ("CEO", "Super_Admin", h.company, False)
    assert any(a.action.startswith("IAM_PRIVILEGED_ROLE_ASSIGNED") for a in h.audit())


def test_admin_cannot_modify_higher_authority_or_platform_accounts_or_self(h):
    owner = h.add_user("Owner")
    platform = h.add_user("Super_Admin")
    flagged = h.add_user("Admin", is_superuser=True)
    for victim in (owner, platform, flagged):
        assert h.client.put(f"/api/v1/users/{victim}/role", json={"role": "Ops_Editor"}).status_code == 403
        assert h.client.post(f"/api/v1/users/{victim}/suspend").status_code == 403
        assert h.client.post(f"/api/v1/users/{victim}/force-password-reset").status_code == 403
    assert h.client.put(f"/api/v1/users/{h.actor_id}/role", json={"role": "Ops_Editor"}).status_code == 400
    assert h.client.post(f"/api/v1/users/{h.actor_id}/suspend").status_code == 400


def test_cross_tenant_target_is_forbidden_and_audited(h):
    foreign = h.add_user("Guest", company=h.other_company)
    for method, path, body in [
        ("put", f"/api/v1/users/{foreign}/role", {"role": "Ops_Editor"}),
        ("post", f"/api/v1/users/{foreign}/suspend", None),
        ("post", f"/api/v1/users/{foreign}/reactivate", None),
        ("post", f"/api/v1/users/{foreign}/force-password-reset", None),
        ("delete", f"/api/v1/users/{foreign}", None),
    ]:
        resp = getattr(h.client, method)(path, **({"json": body} if body else {}))
        assert resp.status_code == 403, path
    after = h.user(foreign)
    assert after.role == "Guest" and after.is_active and after.password_hash == "original-hash"
    denied = [a for a in h.audit() if a.action.startswith("IAM_TENANT_ACCESS_DENIED")]
    assert len(denied) == 5 and all(a.tenant_id == h.company for a in denied)


# ----------------------------------------------------------------------------- suspend / reset

def test_suspend_and_reactivate_are_audited_and_revoke_sessions(h):
    target = h.add_user("Finance_Manager", iam_role="Finance_Manager")
    assert h.client.post(f"/api/v1/users/{target}/suspend").json()["is_active"] is False
    assert h.user(target).is_active is False and (target, "account_suspended") in h.revoked
    assert h.client.post(f"/api/v1/users/{target}/reactivate").json()["is_active"] is True
    assert h.user(target).is_active is True
    actions = [a.action for a in h.audit()]
    assert "IAM_USER_SUSPENDED" in actions and "IAM_USER_REACTIVATED" in actions


def test_force_password_reset_invalidates_credential_and_never_returns_secrets(h):
    target = h.add_user("Finance_Manager", iam_role="Finance_Manager")
    resp = h.client.post(f"/api/v1/users/{target}/force-password-reset")
    assert resp.status_code == 200
    body = resp.json()
    assert body["must_change_password"] is True and body["reset_dispatched"] is True
    assert not ({"password", "temporary_password", "token", "otp"} & set(body))
    user = h.user(target)
    assert user.must_change_password is True
    assert user.password_hash != "original-hash" and user.password_hash.startswith("hashed::")
    assert (target, "forced_password_reset") in h.revoked
    assert h.reset_calls and h.reset_calls[0][0] == user.email
    entry = next(a for a in h.audit() if a.action == "IAM_FORCE_PASSWORD_RESET")
    assert entry.outcome == "SUCCESS" and entry.tenant_id == h.company
    assert entry.actor_email == h.user(h.actor_id).email and entry.actor_id == h.actor_id and str(target) in entry.endpoint_accessed


def test_unknown_or_malformed_target(h):
    assert h.client.post(f"/api/v1/users/{uuid.uuid4()}/suspend").status_code == 404
    assert h.client.post("/api/v1/users/not-a-uuid/suspend").status_code == 400
