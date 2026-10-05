"""Backup destinations: tenant isolation, secret redaction, SSRF / path validation, worker selection + run logs.

Runs without PostgreSQL or the full app (SQLite in-memory, FastAPI TestClient with dependency overrides,
fake connectors for uploads)."""

import os
import secrets as _secrets
import types
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

for _name in ("JWT_SECRET", "JWT_SECRET_MASTER", "JWT_SECRET_TENANT", "DATA_RESIDENCY_KEY"):
    os.environ.setdefault(_name, _secrets.token_hex(32))

from backend import models  # noqa: E402
from backend.app.api.v1 import backup_destinations as api  # noqa: E402
from backend.app.services import backup_destination_service as svc  # noqa: E402
from backend.app.services import backup_service as bs  # noqa: E402
from backend.app.services import backup_worker as worker  # noqa: E402
from backend.database import get_db  # noqa: E402

KEY = bytes(range(32))
SSH_KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nSUPERSECRETKEYMATERIAL0123456789\n-----END OPENSSH PRIVATE KEY-----"
HOST_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPublicHostKeyOnly0123456789abcdefghijklmn"
CLIENT_IP = "203.0.113.9"


class FakeKeyProvider:
    def current(self):
        return bs.key_fingerprint(KEY), KEY

    def lookup(self, key_id):
        if key_id != bs.key_fingerprint(KEY):
            raise bs.BackupError("unknown key id")
        return KEY


def public_resolver(host, *_a, **_k):
    return [(2, 1, 6, "", ("93.184.216.34", 0))]


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------


@pytest.fixture()
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with eng.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE res_companies (id CHAR(32) PRIMARY KEY, name VARCHAR(255))")
    models.Base.metadata.create_all(
        eng,
        tables=[
            models.BackupDestination.__table__,
            models.BackupRunLog.__table__,
            models.PlatformAuditLog.__table__,
            models.TenantAuditLog.__table__,
        ],
    )
    yield eng
    eng.dispose()


@pytest.fixture()
def factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


@pytest.fixture()
def tenants(engine):
    ids = {"A": uuid.uuid4(), "B": uuid.uuid4()}
    with engine.begin() as conn:
        for label, tid in ids.items():
            conn.exec_driver_sql(
                "INSERT INTO res_companies (id, name) VALUES (?, ?)", (tid.hex, f"Tenant {label}")
            )
    return ids


@pytest.fixture(autouse=True)
def fake_crypto(monkeypatch):
    monkeypatch.setattr(svc, "_default_cipher", svc.CredentialCipher(FakeKeyProvider()))
    # The default resolver would hit real DNS; tenant SFTP hosts in tests are public IP literals or stubbed.
    monkeypatch.setattr(svc.socket, "getaddrinfo", public_resolver)


def make_user(company_id, role="Admin", is_super=False, email=None):
    return types.SimpleNamespace(
        id=uuid.uuid4(), email=email or f"{role.lower()}-{uuid.uuid4().hex[:6]}@example.com",
        role=role, company_id=company_id, is_super=is_super,
    )


@pytest.fixture()
def client_for(factory, monkeypatch):
    """Returns ``as_user(user) -> TestClient`` (authenticated through the dependency override)."""
    monkeypatch.setattr(api, "_is_super_admin", lambda user: bool(getattr(user, "is_super", False)))

    def as_user(user):
        app = FastAPI()
        app.include_router(api.tenant_router)
        app.include_router(api.superadmin_router)

        def _db():
            db = factory()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _db
        app.dependency_overrides[api.current_user_dep] = lambda: user
        return TestClient(app, client=(CLIENT_IP, 50000))

    return as_user


SFTP_CREATE = {
    "provider_type": "sftp",
    "name": "Offsite SFTP",
    "config": {"host": "93.184.216.34", "port": 22, "username": "backup", "base_path": "/vault", "pinned_host_key": HOST_KEY},
    "credentials": {"private_key": SSH_KEY},
    "is_active": True,
}
GDRIVE_CREATE = {
    "provider_type": "gdrive",
    "name": "Company Drive",
    "config": {"folder_id": "folder_123"},
    "credentials": {"client_id": "cid-abc", "client_secret": "csecret-VALUE", "refresh_token": "1//refresh-VALUE-token"},
}


def create(client, body=None):
    response = client.post("/api/v1/tenant-control/backups/destinations", json=body or SFTP_CREATE)
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------------------
# Tenant isolation
# --------------------------------------------------------------------------------------


def test_tenant_lists_only_own_destinations_and_logs(client_for, factory, tenants):
    a = client_for(make_user(tenants["A"]))
    b = client_for(make_user(tenants["B"]))
    dest_a = create(a)
    dest_b = create(b, {**SFTP_CREATE, "name": "B's SFTP"})
    with factory() as db:
        for tid, dest in ((tenants["A"], dest_a), (tenants["B"], dest_b)):
            db.add(models.BackupRunLog(
                id=uuid.uuid4(), destination_id=uuid.UUID(dest["id"]), tenant_id=tid, status="success",
                started_at=datetime.now(timezone.utc),
            ))
        db.add(models.BackupRunLog(id=uuid.uuid4(), tenant_id=None, status="failed", started_at=datetime.now(timezone.utc)))
        db.commit()

    listed = a.get("/api/v1/tenant-control/backups/destinations").json()
    assert [d["id"] for d in listed["items"]] == [dest_a["id"]] and listed["total"] == 1
    logs = a.get("/api/v1/tenant-control/backups/logs").json()
    assert logs["total"] == 1 and logs["items"][0]["tenant_id"] == str(tenants["A"])
    # a tenant_id query parameter cannot widen the scope
    spoof = a.get(f"/api/v1/tenant-control/backups/logs?tenant_id={tenants['B']}").json()
    assert spoof["total"] == 1 and spoof["items"][0]["tenant_id"] == str(tenants["A"])


def test_cross_tenant_read_update_delete_test_are_404_and_audited(client_for, factory, tenants):
    a = client_for(make_user(tenants["A"]))
    b = client_for(make_user(tenants["B"]))
    dest_a = create(a)
    base = "/api/v1/tenant-control/backups/destinations/" + dest_a["id"]

    assert b.put(base, json={"name": "hijacked", "is_active": False}).status_code == 404
    assert b.delete(base).status_code == 404
    assert b.post(base + "/test").status_code == 404
    assert b.get("/api/v1/tenant-control/backups/destinations").json()["total"] == 0

    with factory() as db:
        row = db.get(models.BackupDestination, uuid.UUID(dest_a["id"]))
        assert row is not None and row.name == "Offsite SFTP" and row.is_active is True
        denied = db.scalars(
            select(models.PlatformAuditLog).where(models.PlatformAuditLog.action == "BACKUP_DESTINATION_ACCESS_DENIED")
        ).all()
        assert len(denied) == 3
        assert {d.outcome for d in denied} == {"DENIED"}
        assert {d.ip_address for d in denied} == {CLIENT_IP}  # real client IP
        assert {d.tenant_id for d in denied} == {tenants["B"]}
    # the owner is unaffected
    assert a.put(base, json={"name": "renamed"}).json()["name"] == "renamed"


def test_malformed_destination_id_is_404(client_for, tenants):
    a = client_for(make_user(tenants["A"]))
    assert a.delete("/api/v1/tenant-control/backups/destinations/not-a-uuid").status_code == 404


def test_tenant_cannot_create_or_touch_platform_destinations(client_for, factory, tenants):
    a = client_for(make_user(tenants["A"]))
    admin = client_for(make_user(None, role="Super_Admin", is_super=True))
    platform = admin.post(
        "/api/v1/superadmin/backups/destinations",
        json={**SFTP_CREATE, "name": "Platform SFTP", "config": {**SFTP_CREATE["config"], "host": "10.1.2.3"}},
    )
    assert platform.status_code == 201 and platform.json()["tenant_id"] is None
    platform_id = platform.json()["id"]

    # body-supplied tenant_id / scope hints are ignored: the row is bound to the caller's company
    body = {**GDRIVE_CREATE, "tenant_id": None, "company_id": str(tenants["B"]), "scope": "platform", "credential_ref": "PLATFORM_REF"}
    created = create(a, body)
    assert created["tenant_id"] == str(tenants["A"]) and created["scope"] == "tenant"
    with factory() as db:
        row = db.get(models.BackupDestination, uuid.UUID(created["id"]))
        assert row.tenant_id == tenants["A"]
        assert row.credential_ref == f"db:{row.id}"  # tenants cannot choose a (platform env) credential reference

    # tenants cannot read / modify / delete / test the platform destination
    base = "/api/v1/tenant-control/backups/destinations/" + platform_id
    assert a.put(base, json={"name": "x"}).status_code == 404
    assert a.delete(base).status_code == 404
    assert a.post(base + "/test").status_code == 404
    assert all(d["id"] != platform_id for d in a.get("/api/v1/tenant-control/backups/destinations").json()["items"])
    # and have no access to the super-admin API at all
    assert a.get("/api/v1/superadmin/backups/destinations").status_code == 403
    assert a.get("/api/v1/superadmin/backups/logs").status_code == 403
    assert a.post("/api/v1/superadmin/backups/destinations", json=SFTP_CREATE).status_code == 403
    with factory() as db:
        assert db.get(models.BackupDestination, uuid.UUID(platform_id)) is not None
        assert db.scalars(select(models.PlatformAuditLog).where(models.PlatformAuditLog.action == "BACKUP_SUPERADMIN_DENIED")).all()


def test_non_admin_roles_and_unbound_users_are_refused(client_for, factory, tenants):
    for user in (make_user(tenants["A"], role="User"), make_user(tenants["A"], role="Accountant"), make_user(None, role="Admin")):
        c = client_for(user)
        assert c.get("/api/v1/tenant-control/backups/destinations").status_code == 403
        assert c.post("/api/v1/tenant-control/backups/destinations", json=SFTP_CREATE).status_code == 403
    with factory() as db:
        assert db.scalars(select(models.BackupDestination)).all() == []
        assert db.scalars(select(models.PlatformAuditLog).where(models.PlatformAuditLog.action == "BACKUP_ACCESS_DENIED")).all()


def test_owner_role_allowed(client_for, tenants):
    assert client_for(make_user(tenants["A"], role="Owner")).get("/api/v1/tenant-control/backups/destinations").status_code == 200


def test_mutations_are_audited_with_ip_and_no_secrets(client_for, factory, tenants):
    a = client_for(make_user(tenants["A"], email="owner@example.com"))
    dest = create(a)
    a.put("/api/v1/tenant-control/backups/destinations/" + dest["id"],
          json={"name": "Renamed", "credentials": {"private_key": SSH_KEY.replace("0123", "9999")}})
    assert a.delete("/api/v1/tenant-control/backups/destinations/" + dest["id"]).status_code == 200
    with factory() as db:
        platform = db.scalars(select(models.PlatformAuditLog).order_by(models.PlatformAuditLog.created_at)).all()
        actions = [p.action for p in platform]
        assert actions == ["BACKUP_DESTINATION_CREATED", "BACKUP_DESTINATION_UPDATED", "BACKUP_DESTINATION_DELETED"]
        assert all(p.ip_address == CLIENT_IP and p.actor_email == "owner@example.com" and p.outcome == "SUCCESS" for p in platform)
        assert all(p.tenant_id == tenants["A"] for p in platform)
        tenant_rows = db.scalars(select(models.TenantAuditLog)).all()
        assert len(tenant_rows) == 3
        blob = " ".join(f"{p.endpoint_accessed} {p.action}" for p in platform) + " ".join(t.details for t in tenant_rows)
        assert "SUPERSECRET" not in blob and "9999" not in blob and "PRIVATE KEY" not in blob
        assert "credentials_updated=True" in blob


# --------------------------------------------------------------------------------------
# Secret handling / redaction
# --------------------------------------------------------------------------------------


def test_responses_never_contain_credential_material(client_for, factory, tenants):
    a = client_for(make_user(tenants["A"]))
    g = create(a, GDRIVE_CREATE)
    s = create(a)
    assert g["has_credential"] is True and s["has_credential"] is True
    listing = a.get("/api/v1/tenant-control/backups/destinations")
    for text in (str(g), str(s), listing.text):
        for forbidden in ("csecret-VALUE", "refresh-VALUE", "SUPERSECRET", "PRIVATE KEY", "credential_ref",
                          "credentials_encrypted", "db:", "client_secret", "refresh_token", "private_key"):
            assert forbidden not in text
    assert set(g) >= {"id", "provider_type", "name", "config", "is_active", "has_credential", "last_backup_at"}
    # update responses too
    updated = a.put("/api/v1/tenant-control/backups/destinations/" + g["id"], json={"credentials": GDRIVE_CREATE["credentials"]})
    assert "csecret-VALUE" not in updated.text and updated.json()["has_credential"] is True
    with factory() as db:
        row = db.get(models.BackupDestination, uuid.UUID(g["id"]))
        assert "csecret-VALUE" not in (row.credentials_encrypted or "") and "csecret" not in str(row.config)
        assert row.credentials_encrypted.startswith("v1:")


def test_credentials_are_encrypted_at_rest_and_aad_bound(client_for, factory, tenants):
    a = client_for(make_user(tenants["A"]))
    b = client_for(make_user(tenants["B"]))
    dest_a, dest_b = create(a), create(b)
    provider = svc.StoredCredentialProvider(factory)
    with factory() as db:
        row_a = db.get(models.BackupDestination, uuid.UUID(dest_a["id"]))
        assert SSH_KEY.split("\n")[1] not in row_a.credentials_encrypted
        assert provider.get(row_a.credential_ref)["private_key"].startswith("-----BEGIN OPENSSH PRIVATE KEY-----")
        # a ciphertext transplanted onto another tenant's row must not decrypt
        row_b = db.get(models.BackupDestination, uuid.UUID(dest_b["id"]))
        row_b.credentials_encrypted = row_a.credentials_encrypted
        db.commit()
    with pytest.raises(bs.BackupError):
        provider.get(f"db:{dest_b['id']}")
    # rotated OAuth tokens are re-encrypted and persisted
    provider.update(f"db:{dest_a['id']}", {"private_key": "rotated-value-xyz"})
    assert provider.get(f"db:{dest_a['id']}")["private_key"] == "rotated-value-xyz"


def test_validation_errors_do_not_echo_secrets(client_for, tenants):
    a = client_for(make_user(tenants["A"]))
    url = "/api/v1/tenant-control/backups/destinations"
    bad_bodies = [
        {**GDRIVE_CREATE, "credentials": {"client_id": "x", "client_secret": "LEAKME-secret", "refresh_token": "", "extra": "LEAKME-extra"}},
        {**SFTP_CREATE, "credentials": {"private_key": "LEAKME-not-a-pem"}},
        {**SFTP_CREATE, "credentials": "LEAKME-as-string"},
        {**SFTP_CREATE, "name": "", "credentials": {"private_key": "LEAKME"}},
        {"credentials": {"private_key": "LEAKME"}},
    ]
    for body in bad_bodies:
        response = a.post(url, json=body)
        assert response.status_code == 422, response.text
        assert "LEAKME" not in response.text


def test_redact_secrets_scrubs_and_truncates():
    msg = (
        "sftp failed client_secret=abc123456 Authorization: Bearer abcdefghijkl1234 "
        f"{SSH_KEY} token: 'topsecretvalue' known-secret-value "
        + "A" * 80
    )
    out = bs.redact_secrets(msg, ["known-secret-value"])
    for leak in ("abc123456", "abcdefghijkl1234", "SUPERSECRETKEYMATERIAL", "topsecretvalue", "known-secret-value", "A" * 40):
        assert leak not in out
    assert len(bs.redact_secrets("x " * 1000)) <= 500


def test_serialize_log_redacts_legacy_unsafe_rows(factory):
    with factory() as db:
        log = models.BackupRunLog(
            id=uuid.uuid4(), status="failed", started_at=datetime.now(timezone.utc),
            error_message="boom password=hunter2hunter2 " + "z" * 60,
        )
        db.add(log)
        db.commit()
        out = svc.serialize_log(log)
    assert "hunter2" not in out["error_message"] and "z" * 40 not in out["error_message"]


# --------------------------------------------------------------------------------------
# Validation: SSRF + paths
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "host",
    ["127.0.0.1", "10.0.0.5", "192.168.1.10", "172.16.0.9", "169.254.169.254", "100.64.0.1", "0.0.0.0",
     "::1", "fe80::1", "::ffff:10.0.0.1", "localhost", "db.internal", "printer.local", "intranet", "bad host", "-oProxyCommand=x"],
)
def test_tenant_sftp_blocks_internal_and_malformed_hosts(client_for, tenants, host):
    a = client_for(make_user(tenants["A"]))
    body = {**SFTP_CREATE, "config": {**SFTP_CREATE["config"], "host": host}}
    assert a.post("/api/v1/tenant-control/backups/destinations", json=body).status_code == 422


def test_tenant_sftp_blocks_hostnames_resolving_to_private_space(client_for, tenants, monkeypatch):
    monkeypatch.setattr(svc.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("10.1.1.1", 0))])
    a = client_for(make_user(tenants["A"]))
    body = {**SFTP_CREATE, "config": {**SFTP_CREATE["config"], "host": "rebind.example.com"}}
    assert a.post("/api/v1/tenant-control/backups/destinations", json=body).status_code == 422
    # mixed answers (one public, one private) are refused too
    monkeypatch.setattr(svc.socket, "getaddrinfo",
                        lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 0)), (2, 1, 6, "", ("169.254.169.254", 0))])
    assert a.post("/api/v1/tenant-control/backups/destinations", json=body).status_code == 422


def test_public_hostname_and_platform_internal_host_allowed(client_for, tenants):
    a = client_for(make_user(tenants["A"]))
    ok = {**SFTP_CREATE, "config": {**SFTP_CREATE["config"], "host": "sftp.example.com"}}
    assert a.post("/api/v1/tenant-control/backups/destinations", json=ok).status_code == 201
    admin = client_for(make_user(None, role="Super_Admin", is_super=True))
    internal = {**SFTP_CREATE, "config": {**SFTP_CREATE["config"], "host": "10.9.8.7"}}
    assert admin.post("/api/v1/superadmin/backups/destinations", json=internal).status_code == 201


@pytest.mark.parametrize("path", ["../etc", "/a/../b", "/a/./b", "relative/path", "/bad path", "/semi;colon", "/x" * 200])
def test_base_path_traversal_and_charset_rejected(client_for, tenants, path):
    a = client_for(make_user(tenants["A"]))
    body = {**GDRIVE_CREATE, "config": {"folder_id": "root", "base_path": path}}
    assert a.post("/api/v1/tenant-control/backups/destinations", json=body).status_code == 422


def test_config_whitelist_rejects_unknown_keys_and_secrets_in_config(client_for, tenants):
    a = client_for(make_user(tenants["A"]))
    for extra in ({"ca_bundle": "/etc/passwd"}, {"client_secret": "oops"}, {"timeout": "1"}):
        body = {**GDRIVE_CREATE, "config": {"folder_id": "root", **extra}}
        assert a.post("/api/v1/tenant-control/backups/destinations", json=body).status_code == 422
    assert a.post("/api/v1/tenant-control/backups/destinations", json={**GDRIVE_CREATE, "provider_type": "s3"}).status_code == 422
    sftp_no_pin = {**SFTP_CREATE, "config": {k: v for k, v in SFTP_CREATE["config"].items() if k != "pinned_host_key"}}
    assert a.post("/api/v1/tenant-control/backups/destinations", json=sftp_no_pin).status_code == 422


def test_provider_to_destination_type_mapping():
    assert svc.PROVIDER_TO_DESTINATION == {
        "gdrive": bs.DestinationType.GOOGLE_DRIVE,
        "onedrive": bs.DestinationType.ONEDRIVE,
        "sftp": bs.DestinationType.SFTP,
    }


def test_db_constraints_reject_unknown_provider_and_status(factory):
    from sqlalchemy.exc import IntegrityError  # SQLite enforces the portable CHECKs

    with factory() as db:
        db.add(models.BackupRunLog(id=uuid.uuid4(), status="weird", started_at=datetime.now(timezone.utc)))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        db.add(models.BackupDestination(id=uuid.uuid4(), provider_type="ftp", name="x", config={}))
        with pytest.raises(IntegrityError):
            db.commit()


# --------------------------------------------------------------------------------------
# Super admin oversight
# --------------------------------------------------------------------------------------


def test_superadmin_sees_all_with_filters_and_credentials_stay_hidden(client_for, factory, tenants):
    a = client_for(make_user(tenants["A"]))
    b = client_for(make_user(tenants["B"]))
    admin = client_for(make_user(None, role="Super_Admin", is_super=True))
    dest_a, dest_b = create(a), create(b, GDRIVE_CREATE)
    plat = admin.post(
        "/api/v1/superadmin/backups/destinations",
        json={"provider_type": "onedrive", "name": "Platform OD", "config": {"tenant": "common"}, "credential_ref": "PLATFORM_OD"},
    )
    assert plat.status_code == 201
    assert plat.json()["has_credential"] is True and "PLATFORM_OD" not in plat.text
    now = datetime.now(timezone.utc)
    with factory() as db:
        for i, (tid, status_, dest) in enumerate(
            [(tenants["A"], "success", dest_a), (tenants["B"], "failed", dest_b), (None, "success", plat.json())]
        ):
            db.add(models.BackupRunLog(
                id=uuid.uuid4(), destination_id=uuid.UUID(dest["id"]), tenant_id=tid, status=status_,
                started_at=now - timedelta(minutes=i), error_message="x" if status_ == "failed" else None,
            ))
        db.commit()

    allv = admin.get("/api/v1/superadmin/backups/destinations").json()
    assert allv["total"] == 3
    assert {i["tenant_name"] for i in allv["items"]} == {"Tenant A", "Tenant B", None}
    assert "SUPERSECRET" not in str(allv) and "csecret" not in str(allv) and "PLATFORM_OD" not in str(allv)
    assert admin.get(f"/api/v1/superadmin/backups/destinations?tenant_id={tenants['A']}").json()["total"] == 1
    assert admin.get("/api/v1/superadmin/backups/destinations?scope=platform").json()["total"] == 1
    assert admin.get("/api/v1/superadmin/backups/destinations?scope=tenant").json()["total"] == 2
    logs = admin.get("/api/v1/superadmin/backups/logs").json()
    assert logs["total"] == 3
    assert admin.get("/api/v1/superadmin/backups/logs?status=failed").json()["total"] == 1
    assert admin.get(f"/api/v1/superadmin/backups/logs?tenant_id={tenants['B']}").json()["items"][0]["tenant_name"] == "Tenant B"
    assert admin.get("/api/v1/superadmin/backups/logs?scope=platform").json()["total"] == 1
    assert admin.get("/api/v1/superadmin/backups/logs?status=bogus").status_code == 422
    assert admin.get("/api/v1/superadmin/backups/logs?page_size=2&page=2").json()["items"].__len__() == 1

    # super admin CRUD is limited to platform destinations; tenant-owned ones answer 404
    assert admin.put("/api/v1/superadmin/backups/destinations/" + dest_a["id"], json={"name": "x"}).status_code == 404
    assert admin.delete("/api/v1/superadmin/backups/destinations/" + dest_a["id"]).status_code == 404
    assert admin.put("/api/v1/superadmin/backups/destinations/" + plat.json()["id"], json={"name": "Renamed", "is_active": False}).json()["is_active"] is False
    assert admin.delete("/api/v1/superadmin/backups/destinations/" + plat.json()["id"]).status_code == 200
    with factory() as db:
        actions = {p.action for p in db.scalars(select(models.PlatformAuditLog))}
        assert {"BACKUP_PLATFORM_DESTINATION_CREATED", "BACKUP_PLATFORM_DESTINATION_UPDATED",
                "BACKUP_PLATFORM_DESTINATION_DELETED", "BACKUP_OVERSIGHT_LOGS_VIEWED"} <= actions
        # deleting a destination keeps its history (destination_id nulled, name snapshot kept on new rows)
        assert db.scalars(select(models.BackupRunLog).where(models.BackupRunLog.tenant_id.is_(None))).one().destination_id is None


def test_platform_credential_ref_rules(client_for, tenants):
    admin = client_for(make_user(None, role="Super_Admin", is_super=True))
    base = {"provider_type": "onedrive", "name": "P", "config": {}}
    assert admin.post("/api/v1/superadmin/backups/destinations", json={**base, "credential_ref": "db:abc"}).status_code == 422
    assert admin.post("/api/v1/superadmin/backups/destinations", json={**base, "credential_ref": "../x"}).status_code == 422
    both = {**base, "credential_ref": "REF1", "credentials": {"client_id": "c", "refresh_token": "r"}}
    assert admin.post("/api/v1/superadmin/backups/destinations", json=both).status_code == 422


# --------------------------------------------------------------------------------------
# Worker: destination selection + run logs (fake uploads)
# --------------------------------------------------------------------------------------


def seed_destination(factory, tenant_id, *, name, provider="sftp", active=True, with_credentials=True, ref=None, host="93.184.216.34"):
    dest_id = uuid.uuid4()
    config = {"base_path": "/vault", "host": host, "port": 22, "username": "backup", "pinned_host_key": HOST_KEY} if provider == "sftp" \
        else {"base_path": "/vault", "folder_id": "root"}
    row = models.BackupDestination(id=dest_id, tenant_id=tenant_id, provider_type=provider, name=name, config=config, is_active=active)
    if with_credentials:
        blob = {"private_key": SSH_KEY + "\n"} if provider == "sftp" else {"client_id": "c", "client_secret": "s", "refresh_token": "r"}
        row.credentials_encrypted = svc.default_cipher().encrypt(dest_id, tenant_id, blob)
        row.credential_ref = f"db:{dest_id}"
    if ref:
        row.credential_ref = ref
    with factory() as db:
        db.add(row)
        db.commit()
    return dest_id


def test_worker_selects_platform_vs_tenant_destinations_strictly(factory, tenants):
    platform_1 = seed_destination(factory, None, name="platform-1")
    seed_destination(factory, None, name="platform-inactive", active=False)
    a_1 = seed_destination(factory, tenants["A"], name="a-1")
    a_2 = seed_destination(factory, tenants["A"], name="a-2", provider="gdrive")
    b_1 = seed_destination(factory, tenants["B"], name="b-1")
    provider = svc.StoredCredentialProvider(factory)

    plat = worker.load_policy_destinations(factory, None, provider)
    assert [c.id for c in plat.configs] == [platform_1]
    ta = worker.load_policy_destinations(factory, tenants["A"], provider)
    assert {c.id for c in ta.configs} == {a_1, a_2}
    tb = worker.load_policy_destinations(factory, tenants["B"], provider)
    assert [c.id for c in tb.configs] == [b_1]
    assert {c.type for c in ta.configs} == {bs.DestinationType.SFTP, bs.DestinationType.GOOGLE_DRIVE}
    cfg = next(c for c in ta.configs if c.id == a_1)
    assert (cfg.host, cfg.port, cfg.username, cfg.base_path, cfg.pinned_host_key) == ("93.184.216.34", 22, "backup", "/vault", HOST_KEY)
    assert cfg.credential_ref == f"db:{a_1}"
    # a tenant with no destinations gets none (and never the platform's)
    assert worker.load_policy_destinations(factory, uuid.uuid4(), provider).configs == []


class FakeService:
    """Stands in for BackupService: records policies, returns scripted per-destination outcomes."""

    def __init__(self, outcomes=None, artifact=True, error=None):
        self.policies = []
        self.outcomes = outcomes or {}
        self.artifact = artifact
        self.error = error
        self.output_dir = Path("/nonexistent-oxengl-test")

    def run_policy(self, policy, kind, **_):
        self.policies.append(policy)
        start = datetime.now(timezone.utc)
        run = bs.BackupRun(policy_id=policy.id, kind=kind, started_at=start, finished_at=start + timedelta(seconds=3))
        if self.artifact:
            run.artifact = bs.BackupArtifact(
                path=Path("/tmp/x.tar.gz.enc"), scope=policy.scope, kind=kind, tenant_id=policy.tenant_id,
                sha256="0" * 64, size_bytes=4242,
            )
        for cfg in policy.destinations if self.artifact else []:  # no archive -> nothing is uploaded
            outcome = self.outcomes.get(cfg.name, "ok")
            ok = outcome == "ok"
            run.uploads.append(bs.UploadResult(
                destination_id=cfg.id, ok=ok, error=None if ok else outcome,
                started_at=start + timedelta(seconds=1), finished_at=start + timedelta(seconds=2),
            ))
        oks = [u.ok for u in run.uploads]
        run.status = bs.BackupRunStatus.PARTIAL if not oks else (
            bs.BackupRunStatus.SUCCEEDED if all(oks) else bs.BackupRunStatus.PARTIAL if any(oks) else bs.BackupRunStatus.FAILED)
        if not self.artifact:
            run.status, run.error = bs.BackupRunStatus.FAILED, self.error or "pg_dump failed"
        return run


def run_worker(monkeypatch, factory, service, tenant_ids):
    monkeypatch.setattr(worker, "get_active_tenants", lambda db: [{"id": str(t), "name": f"T{i}", "slug": ""} for i, t in enumerate(tenant_ids)])
    monkeypatch.setattr(worker, "prune_local_artifacts", lambda *a, **k: 0)
    return worker.execute_scheduled_backups(service=service, session_factory=factory)


def logs(factory):
    with factory() as db:
        return db.scalars(select(models.BackupRunLog).order_by(models.BackupRunLog.started_at)).all()


def test_worker_writes_one_log_per_destination_and_isolates_failures(monkeypatch, factory, tenants):
    plat = seed_destination(factory, None, name="platform-1")
    a_ok = seed_destination(factory, tenants["A"], name="a-ok")
    a_bad = seed_destination(factory, tenants["A"], name="a-bad")
    a_ok2 = seed_destination(factory, tenants["A"], name="a-ok2", provider="gdrive")
    b_1 = seed_destination(factory, tenants["B"], name="b-1")
    leak = "BackupError: sftp upload failed (exit 255): client_secret=LEAK123456 " + "q" * 900
    service = FakeService(outcomes={"a-bad": leak})

    results = run_worker(monkeypatch, factory, service, [tenants["A"], tenants["B"]])

    by_scope = {(p.scope, p.tenant_id): {c.id for c in p.destinations} for p in service.policies}
    assert by_scope == {
        (bs.BackupScope.PLATFORM, None): {plat},
        (bs.BackupScope.TENANT, tenants["A"]): {a_ok, a_bad, a_ok2},
        (bs.BackupScope.TENANT, tenants["B"]): {b_1},
    }
    rows = {r.destination_id: r for r in logs(factory)}
    assert len(rows) == 5 and len(logs(factory)) == 5  # exactly one per destination
    assert rows[plat].tenant_id is None and rows[b_1].tenant_id == tenants["B"]
    assert {rows[i].status for i in (plat, a_ok, a_ok2, b_1)} == {"success"}  # one failure never stops the others
    bad = rows[a_bad]
    assert bad.status == "failed" and bad.tenant_id == tenants["A"]
    assert "LEAK123456" not in bad.error_message and len(bad.error_message) <= 500
    assert rows[a_ok].file_size_bytes == 4242 and rows[a_ok].error_message is None
    assert rows[a_ok].destination_name == "a-ok" and rows[a_ok].provider_type == "sftp"
    assert rows[a_ok].started_at is not None and rows[a_ok].completed_at >= rows[a_ok].started_at
    assert all(r.tenant_id != tenants["A"] for r in (rows[plat], rows[b_1]))
    assert results["platform_backup"] and len(results["tenant_backups"]) == 2


def test_worker_logs_failure_for_missing_or_unresolvable_credentials(monkeypatch, factory, tenants):
    no_cred = seed_destination(factory, tenants["A"], name="no-cred", with_credentials=False)
    env_ref = seed_destination(factory, tenants["A"], name="env-ref", with_credentials=False, ref="PLATFORM_SECRET")
    good = seed_destination(factory, tenants["A"], name="good")
    ssrf = seed_destination(factory, tenants["A"], name="internal-host", host="10.0.0.9")
    monkeypatch.setenv("OXENGL_BACKUP_CRED_PLATFORM_SECRET", '{"private_key": "PLATFORM-PRIVATE-VALUE"}')
    service = FakeService()

    run_worker(monkeypatch, factory, service, [tenants["A"]])

    tenant_policy = next(p for p in service.policies if p.tenant_id == tenants["A"])
    assert [c.id for c in tenant_policy.destinations] == [good]  # unresolvable ones are never attempted
    rows = {r.destination_id: r for r in logs(factory)}
    assert rows[good].status == "success"
    for dest_id in (no_cred, env_ref, ssrf):
        assert rows[dest_id].status == "failed" and rows[dest_id].error_message
        assert "PLATFORM-PRIVATE-VALUE" not in rows[dest_id].error_message
    assert "no credentials configured" in rows[no_cred].error_message
    assert "only use their own stored credentials" in rows[env_ref].error_message
    assert "non-public" in rows[ssrf].error_message or "publicly routable" in rows[ssrf].error_message


def test_platform_destination_may_use_env_reference(monkeypatch, factory, tenants):
    monkeypatch.setenv("OXENGL_BACKUP_CRED_PLATFORM_SECRET", '{"private_key": "x"}')
    dest = seed_destination(factory, None, name="env-platform", with_credentials=False, ref="PLATFORM_SECRET", host="10.1.1.1")
    prepared = svc.prepare_destinations(factory(), None, svc.StoredCredentialProvider(factory))
    assert [c.id for c in prepared.configs] == [dest] and not prepared.failures


def test_worker_logs_failures_when_archive_cannot_be_produced(monkeypatch, factory, tenants):
    a_1 = seed_destination(factory, tenants["A"], name="a-1")
    service = FakeService(artifact=False, error="pg_dump failed password=hunter2hunter2")
    results = run_worker(monkeypatch, factory, service, [tenants["A"]])
    row = logs(factory)[0]
    assert row.destination_id == a_1 and row.status == "failed" and row.file_size_bytes is None
    assert "hunter2" not in row.error_message and "not uploaded" in row.error_message
    assert results["status"] in {"FAILED", "PARTIAL_FAILURE"}


def test_worker_keeps_local_archive_when_every_destination_fails(monkeypatch, factory, tenants):
    seed_destination(factory, tenants["A"], name="a-1")
    service = FakeService(outcomes={"a-1": "BackupError: unreachable"})
    results = run_worker(monkeypatch, factory, service, [tenants["A"]])
    assert results["tenant_backups"] and results["tenant_backups"][0]["archive_name"] == "x.tar.gz.enc"
    assert results["status"] == "PARTIAL_FAILURE"
    assert logs(factory)[0].status == "failed"


def test_worker_still_backs_up_locally_without_destinations(monkeypatch, factory, tenants):
    service = FakeService()
    results = run_worker(monkeypatch, factory, service, [tenants["A"]])
    assert logs(factory) == [] and results["status"] == "SUCCESS"
    assert all(p.destinations == [] for p in service.policies)


def test_worker_survives_destination_load_failure(monkeypatch, factory, tenants):
    def boom(*a, **k):
        raise RuntimeError("db down")

    monkeypatch.setattr(worker, "load_policy_destinations", boom)
    service = FakeService()
    results = run_worker(monkeypatch, factory, service, [tenants["A"]])
    assert results["platform_backup"] is not None and results["status"] == "PARTIAL_FAILURE"


# --------------------------------------------------------------------------------------
# End to end through the real BackupService.run_policy fan-out (fake connectors)
# --------------------------------------------------------------------------------------


class _FakeConnector:
    def __init__(self, cfg, creds):
        self.cfg, self.creds = cfg, creds

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None

    def upload(self, artifact):
        secret = self.creds.get(self.cfg.credential_ref)["private_key"] if self.cfg.type is bs.DestinationType.SFTP else ""
        if self.cfg.name == "explodes":
            raise bs.BackupError(f"sftp put failed: {secret}")
        return bs.UploadResult(destination_id=self.cfg.id, ok=True, remote_path="/ok", verified="size")

    def prune(self, *a, **k):
        return 0


def test_real_backup_service_fan_out_records_per_destination_outcomes(monkeypatch, factory, tenants, tmp_path):
    seed_destination(factory, tenants["A"], name="explodes")
    seed_destination(factory, tenants["A"], name="fine", provider="gdrive")
    provider = svc.StoredCredentialProvider(factory)
    monkeypatch.setattr(bs, "build_destination", lambda cfg, creds=None: _FakeConnector(cfg, provider))

    class Service(bs.BackupService):
        def dump_tenant(self, tenant_id, kind, **kw):
            return types.SimpleNamespace(warnings=[], cleanup=lambda: None)

        def dump_platform(self, kind, **kw):
            return types.SimpleNamespace(warnings=[], cleanup=lambda: None)

        def package_and_encrypt(self, staged):
            path = tmp_path / "oxengl-tenant-full-20261005T000000Z-abcdef12.tar.gz.enc"
            path.write_bytes(b"x" * 10)
            return bs.BackupArtifact(path=path, scope=bs.BackupScope.TENANT, kind=bs.BackupKind.FULL,
                                     tenant_id=tenants["A"], sha256="0" * 64, size_bytes=10)

    service = Service(
        work_dir=tmp_path / "work", layout=types.SimpleNamespace(), database=types.SimpleNamespace(),
        key_provider=FakeKeyProvider(), credentials=provider, audit_sink=lambda e: None,
        upload_attempts=1, keep_local_artifacts=True,
    )
    monkeypatch.setattr(worker, "get_active_tenants", lambda db: [{"id": str(tenants["A"]), "name": "A", "slug": ""}])
    monkeypatch.setattr(worker, "prune_local_artifacts", lambda *a, **k: 0)
    worker.execute_scheduled_backups(scopes=["tenants"], service=service, session_factory=factory)

    rows = {r.destination_name: r for r in logs(factory)}
    assert rows["explodes"].status == "failed" and rows["fine"].status == "success"
    assert "SUPERSECRETKEYMATERIAL" not in rows["explodes"].error_message  # credential scrubbed from the error
    assert rows["fine"].file_size_bytes == 10 and rows["fine"].completed_at >= rows["fine"].started_at
