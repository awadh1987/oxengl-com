"""HR -> IAM provisioning: mapping matrix, ABAC payload, idempotency, secrets, background safety."""

import os
import re
import secrets as _secrets
import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

for _name in ("JWT_SECRET", "JWT_SECRET_MASTER", "JWT_SECRET_TENANT", "DATA_RESIDENCY_KEY"):
    os.environ.setdefault(_name, _secrets.token_hex(32))

from backend import models  # noqa: E402
from backend.app.domains.hr.audit import AuditContext  # noqa: E402
from backend.app.domains.hr.models import Employee  # noqa: E402
from backend.app.domains.hr.schemas import JOB_TITLE_DIRECTORY  # noqa: E402
from backend.app.domains.iam import provisioning as prov  # noqa: E402
from backend.app.domains.iam.role_catalog import (  # noqa: E402
    ALLOWED_RES_USER_ROLES,
    HR_PROVISIONED_ROLES,
)

ALL_TITLES = [title for titles in JOB_TITLE_DIRECTORY.values() for title in titles]
MANDOOB_FULL = "HR Generalist / Government Relations Officer (Mandoob)"


@compiles(JSONB, "sqlite")
def _jsonb_sqlite(type_, compiler, **kw):  # test-only DDL shim
    return "JSON"


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------

@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    with eng.begin() as conn:
        # Minimal stand-in: the real table uses PostgreSQL-only defaults; only `id` is queried.
        conn.exec_driver_sql("CREATE TABLE res_companies (id CHAR(32) PRIMARY KEY)")
    models.Base.metadata.create_all(
        eng,
        tables=[
            models.ResUser.__table__,
            Employee.__table__,
            models.PlatformAuditLog.__table__,
        ],
    )
    yield eng
    eng.dispose()


@pytest.fixture()
def factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=True, autoflush=False)


@pytest.fixture()
def tenant_id():
    return uuid.uuid4()


AUDIT = AuditContext(
    actor_id=uuid.uuid4(),
    actor_identifier="hr.admin@example.com",
    ip_address="203.0.113.9",
    user_agent="pytest",
    request_id="req-1",
    endpoint="/api/v1/hr/employees",
)


def fast_hasher(password: str) -> str:
    return "test-hash::" + password[::-1]  # deterministic, obviously not the plain text


def make_employee(factory, tenant_id, **overrides) -> uuid.UUID:
    values = dict(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        employee_code=f"EMP-{uuid.uuid4().hex[:8]}",
        first_name="Ahmed",
        last_name="Tamimi",
        department="Operations",
        base_salary=1000,
        hire_date=date(2026, 10, 4),
        is_active=True,
        job_title="Operations Manager",
        personal_email="Ahmed.T@Gmail.com",
    )
    values.update(overrides)
    with factory() as db:
        db.add(Employee(**values))
        db.commit()
    return values["id"]


class CapturingNotifier:
    def __init__(self, delivered=True, raises=False):
        self.calls = []
        self.delivered = delivered
        self.raises = raises

    def send_temporary_password(self, **kwargs):
        self.calls.append(kwargs)
        if self.raises:
            raise RuntimeError("provider down")
        return self.delivered


def audit_actions(factory):
    with factory() as db:
        rows = db.execute(select(models.PlatformAuditLog)).scalars().all()
        return [(r.action, r.outcome, r.tenant_id, r.ip_address, r.actor_email) for r in rows]


# --------------------------------------------------------------------------------------
# Mapping matrix
# --------------------------------------------------------------------------------------

def test_every_directory_title_is_mapped_without_fallback():
    assert len(ALL_TITLES) == 28
    for title in ALL_TITLES:
        resolved = prov.resolve_title(title)
        assert resolved.matched, title
        assert resolved.role in HR_PROVISIONED_ROLES, title


def test_mandoob_blueprint_and_directory_titles_both_match():
    short = prov.resolve_title("HR Generalist / Mandoob")
    full = prov.resolve_title(MANDOOB_FULL)
    assert short.matched and full.matched
    assert (short.role, dict(short.constraints)) == (full.role, dict(full.constraints)) == (
        "HR_Editor", {"ip_restricted": True},
    )


def test_matrix_matches_blueprint_document_exactly():
    """Parse the blueprint table (read-only) and compare it with the in-code matrix."""
    doc = Path(__file__).resolve().parents[3] / "docs" / "oxengl_hr_iam_provisioning_blueprint.md"
    if not doc.exists():
        pytest.skip("blueprint document not present in this checkout")
    rows = {}
    for line in doc.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if line.startswith("|") and len(cells) == 3 and not cells[0].startswith((":", "HR Job")):
            rows[cells[0]] = cells
    assert len(rows) == 28
    for title, (_, role, rules) in rows.items():
        expected = {}
        for part in rules.split(","):
            key, value = (p.strip() for p in part.split(":", 1))
            expected[key] = (
                True if value == "true" else value.strip("'") if value.startswith("'") else int(value)
            )
        mapping = prov.HR_TITLE_IAM_MATRIX[title]
        assert mapping.role == role, title
        assert dict(mapping.constraints) == expected, title
    assert set(rows) == set(prov.HR_TITLE_IAM_MATRIX)


@pytest.mark.parametrize("title", [None, "", "Unlisted Role", "ceo", "Chief Executive Officer"])
def test_unknown_titles_fall_back_to_least_privilege(title):
    resolved = prov.resolve_title(title)
    assert not resolved.matched
    assert resolved.role == "Employee_Self_Serve"
    assert dict(resolved.constraints) == {"hr_portal_only": True}
    assert prov.build_abac_context(title)["approval_limit"] == 0


def test_role_catalog_is_allowed_by_db_constraint_and_migration():
    constraint = next(c for c in models.ResUser.__table__.constraints if c.name == "ck_res_user_role")
    for role in HR_PROVISIONED_ROLES:
        assert f"'{role}'" in str(constraint.sqltext)
    migration = (
        Path(__file__).resolve().parents[2] / "alembic" / "versions" / "202610040002_hr_iam_provisioning.py"
    ).read_text(encoding="utf-8")
    assert 'down_revision: Union[str, Sequence[str], None] = "202610040001"' in migration
    for role in ALLOWED_RES_USER_ROLES:
        assert f'"{role}"' in migration, role


# --------------------------------------------------------------------------------------
# ABAC payload
# --------------------------------------------------------------------------------------

def test_abac_payload_schema_types_and_values():
    cfo = prov.build_abac_context("Chief Financial Officer (CFO)")
    assert cfo == {
        "approval_limit": 0, "shift_locked": False, "ip_restricted": False, "requires_mfa": True,
        "master_ledger_auth": True,
    }
    fin = prov.build_abac_context("Finance Manager")
    assert fin["approval_limit"] == 500000 and isinstance(fin["approval_limit"], int)
    assert fin["ip_restricted"] is True and fin["requires_mfa"] is False
    assert prov.build_abac_context("Dispatch Supervisor")["shift_locked"] is True
    assert prov.build_abac_context("General Manager")["geo_fence"] == "KSA"
    assert prov.build_abac_context("Warehouse Supervisor")["max_stock_variance_percent"] == 5
    for title in ALL_TITLES:
        payload = prov.build_abac_context(title)
        assert isinstance(payload["approval_limit"], int)
        assert all(isinstance(payload[k], bool) for k in ("shift_locked", "ip_restricted", "requires_mfa"))


def test_abac_payload_is_a_fresh_copy_and_matrix_is_immutable():
    payload = prov.build_abac_context("Operations Manager")
    payload["approval_limit"] = 10**9
    assert prov.build_abac_context("Operations Manager")["approval_limit"] == 100000
    with pytest.raises(TypeError):
        prov.HR_TITLE_IAM_MATRIX["Operations Manager"].constraints["approval_limit"] = 1  # type: ignore[index]


def test_temporary_password_is_random_and_strong():
    pwds = {prov.generate_temporary_password() for _ in range(50)}
    assert len(pwds) == 50
    for pwd in pwds:
        assert len(pwd) >= 20
        assert re.search(r"[A-Z]", pwd) and re.search(r"[a-z]", pwd)
        assert re.search(r"\d", pwd) and re.search(r"[^A-Za-z0-9]", pwd)


# --------------------------------------------------------------------------------------
# Provisioning: creation, hashing, linkage, idempotency, tenant scoping
# --------------------------------------------------------------------------------------

def test_provisions_user_with_hashed_password_role_abac_and_link(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id)
    with factory() as db:
        outcome = prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=fast_hasher)
    assert outcome.status == "PROVISIONED"
    secret = outcome.temporary_password
    assert secret and secret not in repr(outcome)

    with factory() as db:
        user = db.execute(select(models.ResUser)).scalar_one()
        emp = db.get(Employee, emp_id)
        assert emp.user_id == user.id
        assert user.company_id == tenant_id
        assert user.email == "ahmed.t@gmail.com"
        assert user.role == user.iam_role == "Ops_Manager"
        assert user.abac_context["approval_limit"] == 100000
        assert user.must_change_password is True
        assert user.is_superuser is False
        assert user.password_hash == fast_hasher(secret) and user.password_hash != secret
        assert secret not in user.password_hash.replace(secret[::-1], "")
        assert user.firebase_uid.startswith("native:")


def test_real_platform_hasher_is_used_by_default(factory, tenant_id):
    from backend.two_tier_auth import verify_password

    emp_id = make_employee(factory, tenant_id)
    notifier = CapturingNotifier()
    prov.run_employee_user_provisioning(
        emp_id, tenant_id, AUDIT, session_factory=lambda t: factory(), notifier=notifier
    )
    secret = notifier.calls[0]["temporary_password"]
    with factory() as db:
        user = db.execute(select(models.ResUser)).scalar_one()
    assert user.password_hash.startswith(("$argon2", "$2b$", "$pbkdf2"))
    assert secret not in user.password_hash
    assert verify_password(secret, user.password_hash)


def test_mobile_is_login_identifier_when_no_email(factory, tenant_id):
    emp_id = make_employee(
        factory, tenant_id, personal_email=None, personal_mobile="050 123 4567",
        job_title="Heavy Vehicle Driver",
    )
    with factory() as db:
        outcome = prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=fast_hasher)
        user = db.execute(select(models.ResUser)).scalar_one()
    assert outcome.login_identifier == user.email == "+966501234567"
    assert user.phone == "+966501234567"
    assert user.role == "Field_Operator"


def test_ceo_gets_blueprint_role_with_mfa_but_not_platform_super_admin_and_is_audited(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id, job_title="Chief Executive Officer (CEO)")
    with factory() as db:
        prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=fast_hasher)
        user = db.execute(select(models.ResUser)).scalar_one()
    assert user.iam_role == "Super_Admin"
    assert user.abac_context["requires_mfa"] is True and user.abac_context["unrestricted_access"] is True
    # The legacy column must not carry the platform-wide 'Super_Admin' marker.
    assert user.role == "CEO" and user.is_superuser is False
    actions = [a[0] for a in audit_actions(factory)]
    assert "IAM_PRIVILEGED_ROLE_PROVISIONED" in actions
    assert "IAM_ROLE_ASSIGNED:Super_Admin" in actions
    assert "IAM_MFA_REQUIRED:true" in actions


def test_unknown_title_uses_least_privilege_and_is_audited(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id, job_title=None)
    with factory() as db:
        prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=fast_hasher)
        user = db.execute(select(models.ResUser)).scalar_one()
    assert user.role == user.iam_role == "Employee_Self_Serve"
    assert user.abac_context["hr_portal_only"] is True
    assert "IAM_PROVISIONING_FALLBACK_ROLE" in [a[0] for a in audit_actions(factory)]


def test_idempotent_when_employee_already_linked(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id, user_id=uuid.uuid4())
    with factory() as db:
        outcome = prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=fast_hasher)
    assert (outcome.status, outcome.reason) == ("SKIPPED", "ALREADY_LINKED")
    with factory() as db:
        assert db.execute(select(models.ResUser)).first() is None
    assert ("IAM_USER_PROVISIONING_SKIPPED:ALREADY_LINKED", "SKIPPED") in [a[:2] for a in audit_actions(factory)]


def test_second_run_is_a_no_op(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id)
    with factory() as db:
        assert prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=fast_hasher).status == "PROVISIONED"
    with factory() as db:
        again = prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=fast_hasher)
    assert again.reason == "ALREADY_LINKED" and again.temporary_password is None
    with factory() as db:
        assert len(db.execute(select(models.ResUser)).scalars().all()) == 1


def test_skips_when_login_identifier_exists_without_touching_existing_user(factory, tenant_id):
    other_tenant = uuid.uuid4()
    with factory() as db:
        db.add(models.ResUser(
            email="ahmed.t@gmail.com", full_name="Existing", password_hash="x",
            company_id=other_tenant, role="User",
        ))
        db.commit()
    emp_id = make_employee(factory, tenant_id)
    with factory() as db:
        outcome = prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=fast_hasher)
    assert outcome.reason == "LOGIN_IDENTIFIER_EXISTS" and outcome.temporary_password is None
    with factory() as db:
        assert db.get(Employee, emp_id).user_id is None
        assert db.execute(select(models.ResUser)).scalar_one().company_id == other_tenant


def test_skips_without_any_login_identifier(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id, personal_email=None, personal_mobile=None)
    with factory() as db:
        outcome = prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=fast_hasher)
    assert outcome.reason == "NO_LOGIN_IDENTIFIER"


def test_cross_tenant_employee_is_never_provisioned(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id)
    attacker_tenant = uuid.uuid4()
    with factory() as db:
        outcome = prov.provision_employee_user(db, emp_id, attacker_tenant, AUDIT, hasher=fast_hasher)
    assert outcome.reason == "EMPLOYEE_NOT_FOUND"
    with factory() as db:
        assert db.execute(select(models.ResUser)).first() is None
        assert db.get(Employee, emp_id).user_id is None
    rows = audit_actions(factory)
    assert rows and all(r[2] == attacker_tenant for r in rows)


def test_audit_rows_carry_actor_tenant_ip_and_outcome_but_no_secret(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id)
    notifier = CapturingNotifier()
    prov.run_employee_user_provisioning(
        emp_id, tenant_id, AUDIT, session_factory=lambda t: factory(), notifier=notifier, hasher=fast_hasher
    )
    secret = notifier.calls[0]["temporary_password"]
    with factory() as db:
        rows = db.execute(select(models.PlatformAuditLog)).scalars().all()
    by_action = {r.action: r for r in rows}
    assert {"IAM_USER_PROVISIONED", "IAM_CREDENTIAL_DELIVERY"} <= set(by_action)
    provisioned = by_action["IAM_USER_PROVISIONED"]
    assert provisioned.outcome == "SUCCESS" and provisioned.tenant_id == tenant_id
    assert provisioned.ip_address == "203.0.113.9" and provisioned.actor_email == "hr.admin@example.com"
    assert provisioned.actor_id == AUDIT.actor_id
    assert by_action["IAM_CREDENTIAL_DELIVERY"].outcome == "SUCCESS"
    blob = " ".join(
        str(getattr(r, c.name)) for r in rows for c in models.PlatformAuditLog.__table__.columns
    )
    assert secret not in blob


# --------------------------------------------------------------------------------------
# Background task safety
# --------------------------------------------------------------------------------------

def test_background_task_opens_and_closes_its_own_session(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id)
    request_session = factory()
    opened = []

    class TrackedSession:
        def __init__(self, inner):
            self.inner = inner
            self.closed = False

        def __getattr__(self, name):
            return getattr(self.inner, name)

        def close(self):
            self.closed = True
            self.inner.close()

    def session_factory(received_tenant):
        assert received_tenant == tenant_id
        tracked = TrackedSession(factory())
        opened.append(tracked)
        return tracked

    prov.run_employee_user_provisioning(
        emp_id, tenant_id, AUDIT, session_factory=session_factory, notifier=CapturingNotifier(),
        hasher=fast_hasher,
    )
    assert len(opened) == 1 and opened[0].closed
    assert opened[0].inner is not request_session
    request_session.close()


def test_background_entrypoint_signature_takes_ids_and_plain_audit_only():
    import inspect

    params = list(inspect.signature(prov.run_employee_user_provisioning).parameters)
    assert params[:3] == ["employee_id", "tenant_id", "audit"]
    assert "db" not in params and "session" not in params and "employee" not in params


def test_hasher_failure_is_audited_and_swallowed(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id)

    def boom(_password):
        raise RuntimeError("hasher exploded")

    prov.run_employee_user_provisioning(
        emp_id, tenant_id, AUDIT, session_factory=lambda t: factory(), notifier=CapturingNotifier(),
        hasher=boom,
    )  # must not raise
    with factory() as db:
        assert db.execute(select(models.ResUser)).first() is None
        assert db.get(Employee, emp_id).user_id is None
    assert ("IAM_USER_PROVISIONING_FAILED:RuntimeError", "FAILURE", tenant_id) in [
        a[:3] for a in audit_actions(factory)
    ]


def test_session_factory_failure_is_swallowed():
    def no_db(_tenant):
        raise ConnectionError("db down")

    prov.run_employee_user_provisioning(uuid.uuid4(), uuid.uuid4(), AUDIT, session_factory=no_db)


def test_notifier_failure_keeps_user_and_audits_delivery_failure(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id)
    prov.run_employee_user_provisioning(
        emp_id, tenant_id, AUDIT, session_factory=lambda t: factory(),
        notifier=CapturingNotifier(raises=True), hasher=fast_hasher,
    )
    with factory() as db:
        assert db.execute(select(models.ResUser)).scalar_one() is not None
    assert ("IAM_CREDENTIAL_DELIVERY", "FAILURE") in [a[:2] for a in audit_actions(factory)]


def test_stub_notifier_does_not_log_the_secret(caplog):
    caplog.set_level("DEBUG")
    delivered = prov.StubCredentialNotifier().send_temporary_password(
        channel="email", destination="a@b.com", display_name="A", temporary_password="S3cret!Value"
    )
    assert delivered is False
    assert "S3cret!Value" not in caplog.text and "a@b.com" not in caplog.text


def test_integrity_race_on_identifier_is_skipped_not_failed(factory, tenant_id):
    emp_id = make_employee(factory, tenant_id)

    def racing_hasher(password):
        # Runs after the pre-check but before the INSERT: a concurrent request wins the identifier.
        with factory() as other:
            other.add(models.ResUser(
                email="ahmed.t@gmail.com", full_name="Racer", password_hash="x",
                company_id=uuid.uuid4(), role="User",
            ))
            other.commit()
        return fast_hasher(password)

    with factory() as db:
        outcome = prov.provision_employee_user(db, emp_id, tenant_id, AUDIT, hasher=racing_hasher)
    assert (outcome.status, outcome.reason) == ("SKIPPED", "LOGIN_IDENTIFIER_EXISTS")
    with factory() as db:
        assert db.get(Employee, emp_id).user_id is None
        assert len(db.execute(select(models.ResUser)).scalars().all()) == 1


# --------------------------------------------------------------------------------------
# Route integration: provisioning runs only after a successful commit, never breaks the response
# --------------------------------------------------------------------------------------

@pytest.fixture()
def hr_client(engine, factory, tenant_id, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from backend.app.api.v1 import hr as hr_routes
    from backend.app.security.abac import ABACUserContext, get_abac_user_context
    from backend.database import get_db

    app = FastAPI()
    app.include_router(hr_routes.router, prefix="/api/v1/hr")

    def override_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    actor = uuid.uuid4()
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_abac_user_context] = lambda: ABACUserContext(
        user_id=actor, tenant_id=tenant_id, role="ADMIN"
    )
    notifier = CapturingNotifier()
    monkeypatch.setattr(prov, "open_provisioning_session", lambda t: factory())
    monkeypatch.setattr(prov, "_default_hasher", fast_hasher)
    monkeypatch.setattr(prov, "_notifier", notifier)
    client = TestClient(app, client=("198.51.100.20", 5000))
    client.notifier = notifier
    return client


def _payload(**overrides):
    body = {
        "employee_code": f"EMP-{uuid.uuid4().hex[:8]}",
        "name_en": "Sara Alharbi",
        "department": "Finance",
        "base_salary": "9000",
        "job_title": "Senior Financial Accountant",
        "personal_email": "sara@outlook.com",
    }
    body.update(overrides)
    return body


def test_register_route_provisions_after_commit_and_response_has_no_secret(hr_client, factory, tenant_id):
    response = hr_client.post("/api/v1/hr/employees", json=_payload())
    assert response.status_code == 201, response.text
    employee_id = uuid.UUID(response.json()["employee_id"])
    secret = hr_client.notifier.calls[0]["temporary_password"]
    assert secret not in response.text

    with factory() as db:
        user = db.execute(select(models.ResUser)).scalar_one()
        assert db.get(Employee, employee_id).user_id == user.id
        assert user.iam_role == "Finance_Editor" and user.company_id == tenant_id
    rows = audit_actions(factory)
    assert any(r[0] == "EMPLOYEE_REGISTERED" for r in rows)
    provisioned = [r for r in rows if r[0] == "IAM_USER_PROVISIONED"]
    assert provisioned and provisioned[0][2] == tenant_id and provisioned[0][3] == "198.51.100.20"


def test_registration_succeeds_even_if_provisioning_blows_up(hr_client, factory, monkeypatch):
    def broken_session(_tenant):
        raise ConnectionError("provisioning db unavailable")

    monkeypatch.setattr(prov, "open_provisioning_session", broken_session)
    response = hr_client.post("/api/v1/hr/employees", json=_payload())
    assert response.status_code == 201
    with factory() as db:
        assert db.execute(select(Employee)).scalar_one().user_id is None
        assert db.execute(select(models.ResUser)).first() is None


def test_provisioning_not_scheduled_when_registration_is_rejected(hr_client, factory):
    response = hr_client.post("/api/v1/hr/employees", json=_payload(employee_code="EMP-ERR-OVERCAP"))
    assert response.status_code == 422
    assert hr_client.notifier.calls == []
    with factory() as db:
        assert db.execute(select(models.ResUser)).first() is None


def test_schedule_passes_only_ids_and_plain_audit_data():
    class FakeBackground:
        def __init__(self):
            self.tasks = []

        def add_task(self, fn, *args, **kwargs):
            self.tasks.append((fn, args, kwargs))

    class FakeRequest:
        client = type("C", (), {"host": "192.0.2.77"})()
        headers = {"user-agent": "ua"}
        url = type("U", (), {"path": "/x"})()

    bg, emp_id, ten_id = FakeBackground(), uuid.uuid4(), uuid.uuid4()
    prov.schedule_employee_provisioning(
        bg, FakeRequest(), employee_id=emp_id, tenant_id=ten_id, actor_id=None, actor_identifier="a@b.c"
    )
    fn, args, kwargs = bg.tasks[0]
    assert fn is prov.run_employee_user_provisioning and kwargs == {}
    assert args[0] == emp_id and args[1] == ten_id and isinstance(args[2], AuditContext)
    assert args[2].ip_address == "192.0.2.77"


def test_schedule_swallows_errors():
    class Broken:
        def add_task(self, *a, **k):
            raise RuntimeError("queue closed")

    prov.schedule_employee_provisioning(
        Broken(), object(), employee_id=uuid.uuid4(), tenant_id=uuid.uuid4(), actor_id=None, actor_identifier=None
    )
