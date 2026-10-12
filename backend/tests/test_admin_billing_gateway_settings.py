"""Phase 1 -- Super Admin billing gateway settings: encryption at rest, validation, strict RBAC."""

from __future__ import annotations

import json
import secrets
import uuid
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.api.v1 import admin_billing_settings as api
from backend.app.core import auth as core_auth
from backend.app.core import secret_vault
from backend.app.domains.saas.models import PaymentGatewaySettings
from backend.database import get_db, get_platform_db

STRIPE_SK = "sk_test_" + "A1b2C3d4E5f6G7h8I9j0"
STRIPE_PK = "pk_test_" + "Z9y8X7w6V5u4T3s2R1q0"
STRIPE_WH = "whsec_" + "abcDEF1234567890"
MOYASAR_SK = "sk_live_" + "M0yasarSecretKey1234"
MOYASAR_PK = "pk_live_" + "M0yasarPublicKey5678"
VALID_SA_IBAN = "SA0380000000608010167519"  # mod-97 valid sample


@pytest.fixture(autouse=True)
def vault_key(monkeypatch):
    monkeypatch.setenv(secret_vault.KEY_ENV, secrets.token_hex(32))
    monkeypatch.delenv(secret_vault.PREVIOUS_KEYS_ENV, raising=False)
    secret_vault._multifernet.cache_clear()
    yield
    secret_vault._multifernet.cache_clear()


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    PaymentGatewaySettings.__table__.create(engine)  # type: ignore[attr-defined]  # Table at runtime
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _user(role: str, company_id=None, email="actor@oxengl.com"):
    return SimpleNamespace(id=uuid.uuid4(), email=email, role=role, company_id=company_id,
                           is_superuser=False, access_control_list="", role_ids="")


def _client(session_factory, user) -> TestClient:
    app = FastAPI()
    app.include_router(api.router)

    def _db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_platform_db] = _db
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[core_auth.get_authenticated_user] = lambda: user
    return TestClient(app)


URL = "/api/v1/admin/settings/billing"


# ------------------------------------------------------------------ crypto
def test_vault_roundtrip_and_field_binding():
    token = secret_vault.encrypt_secret("stripe_secret_key", STRIPE_SK)
    assert token and token != STRIPE_SK and STRIPE_SK not in token
    assert secret_vault.decrypt_secret("stripe_secret_key", token) == STRIPE_SK
    # A token moved into another column must fail authentication (HKDF per-field subkey).
    with pytest.raises(secret_vault.SecretDecryptionError):
        secret_vault.decrypt_secret("moyasar_api_key", token)


def test_vault_key_rotation(monkeypatch):
    old = secrets.token_hex(32)
    monkeypatch.setenv(secret_vault.KEY_ENV, old)
    token = secret_vault.encrypt_secret("stripe_secret_key", STRIPE_SK)
    monkeypatch.setenv(secret_vault.KEY_ENV, secrets.token_hex(32))
    monkeypatch.setenv(secret_vault.PREVIOUS_KEYS_ENV, old)
    assert secret_vault.decrypt_secret("stripe_secret_key", token) == STRIPE_SK
    rotated = secret_vault.reencrypt("stripe_secret_key", token)
    monkeypatch.delenv(secret_vault.PREVIOUS_KEYS_ENV)
    assert secret_vault.decrypt_secret("stripe_secret_key", rotated) == STRIPE_SK
    with pytest.raises(secret_vault.SecretDecryptionError):
        secret_vault.decrypt_secret("stripe_secret_key", token)


def test_vault_refuses_missing_or_weak_key(monkeypatch):
    monkeypatch.delenv(secret_vault.KEY_ENV)
    assert secret_vault.is_configured() is False
    monkeypatch.setenv(secret_vault.KEY_ENV, "short")
    with pytest.raises(secret_vault.SecretVaultUnavailable):
        secret_vault.encrypt_secret("stripe_secret_key", STRIPE_SK)


# ------------------------------------------------------------------ RBAC
@pytest.mark.parametrize("user", [
    _user("Accountant", company_id=uuid.uuid4()),
    _user("Admin", company_id=uuid.uuid4()),
    _user("Admin", company_id=None, email="admin@oxengl.com"),  # dev-mode fallback must NOT pass
])
def test_non_super_admins_are_denied(session_factory, user, monkeypatch):
    monkeypatch.setenv("OXENGL_DEV_MODE", "true")
    client = _client(session_factory, user)
    assert client.get(URL).status_code == 403
    assert client.put(URL, json={"is_stripe_enabled": False}).status_code == 403


def test_master_key_header_does_not_unlock_billing_settings(session_factory, monkeypatch):
    monkeypatch.setenv("MASTER_PLATFORM_KEY", "k" * 40)
    monkeypatch.setenv("OXENGL_DEV_MODE", "false")
    client = _client(session_factory, _user("Accountant", company_id=uuid.uuid4()))
    assert client.get(URL, headers={"X-Master-Admin-Key": "k" * 40}).status_code == 403


# ------------------------------------------------------------------ behaviour
def test_get_defaults_without_writing(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    res = client.get(URL)
    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["version"] == 0 and body["is_stripe_enabled"] is False
    assert body["stripe_secret_key"] == {"is_set": False, "hint": None, "decryption_error": False}
    assert session_factory().query(PaymentGatewaySettings).count() == 0


def test_put_encrypts_at_rest_and_never_returns_secrets(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    res = client.put(URL, json={
        "stripe_secret_key": STRIPE_SK, "stripe_publishable_key": STRIPE_PK,
        "stripe_webhook_secret": STRIPE_WH, "is_stripe_enabled": True,
        "moyasar_api_key": MOYASAR_SK, "moyasar_publishable_key": MOYASAR_PK, "is_moyasar_enabled": True,
        "local_bank_instructions": [{"bank_name": "Al Rajhi", "account_name": "OxenGL LLC",
                                     "iban": "sa03 8000 0000 6080 1016 7519", "swift": "rjhisari",
                                     "branch": "Riyadh", "currency": "sar"}],
        "digital_wallet_instructions": [{"provider": "ONE Cash", "wallet_number": "+967 777 123 456",
                                         "account_name": "OxenGL Yemen", "qr_code_url": "/uploads/qr/one.png"}],
    })
    assert res.status_code == 200, res.text
    body = res.json()
    raw_response = json.dumps(body)
    for secret in (STRIPE_SK, STRIPE_WH, MOYASAR_SK):
        assert secret not in raw_response
    assert body["stripe_secret_key"]["is_set"] is True
    assert body["stripe_secret_key"]["hint"].startswith("sk_test_") and body["stripe_secret_key"]["hint"].endswith("I9j0")
    assert body["stripe_publishable_key"] == STRIPE_PK  # public key returned in full
    assert body["stripe_mode"] == "test" and body["moyasar_mode"] == "live"
    assert body["version"] == 1 and body["updated_by"] == "actor@oxengl.com"
    bank = body["local_bank_instructions"][0]
    assert bank["iban"] == VALID_SA_IBAN and bank["swift"] == "RJHISARI" and bank["currency"] == "SAR" and bank["id"]

    row = session_factory().get(PaymentGatewaySettings, 1)
    for column, plain in (("stripe_secret_key_encrypted", STRIPE_SK), ("stripe_publishable_key_encrypted", STRIPE_PK),
                          ("stripe_webhook_secret_encrypted", STRIPE_WH), ("moyasar_api_key_encrypted", MOYASAR_SK),
                          ("moyasar_publishable_key_encrypted", MOYASAR_PK)):
        stored = getattr(row, column)
        assert stored and plain not in stored and stored.startswith("gAAAA")


def test_omitted_secret_is_kept_and_empty_string_clears(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    client.put(URL, json={"stripe_secret_key": STRIPE_SK, "stripe_webhook_secret": STRIPE_WH})
    res = client.put(URL, json={"stripe_webhook_secret": "", "expected_version": 1})
    body = res.json()
    assert body["stripe_secret_key"]["is_set"] is True
    assert body["stripe_webhook_secret"]["is_set"] is False
    assert body["version"] == 2


def test_optimistic_concurrency_conflict(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    client.put(URL, json={"stripe_secret_key": STRIPE_SK})
    assert client.put(URL, json={"is_stripe_enabled": False, "expected_version": 99}).status_code == 409


def test_uninitialized_expected_version_zero_allowed(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    res = client.put(URL, json={"is_stripe_enabled": False, "expected_version": 0})
    assert res.status_code == 200


@pytest.mark.parametrize("payload", [
    {"is_stripe_enabled": True},                                              # no keys
    {"stripe_secret_key": STRIPE_SK, "stripe_publishable_key": "pk_live_" + "x" * 20},  # live/test mismatch
    {"stripe_secret_key": "not-a-key"},
    {"stripe_publishable_key": STRIPE_SK},                                    # secret pasted into public field
    {"local_bank_instructions": [{"bank_name": "X Bank", "account_name": "Acme", "iban": "SA0000000000000000000000"}]},
    {"local_bank_instructions": [{"bank_name": "X Bank", "account_name": "Acme"}]},  # no iban / account no
    {"digital_wallet_instructions": [{"provider": "Jawali", "wallet_number": "777123456",
                                      "account_name": "Acme", "qr_code_url": "javascript:alert(1)"}]},
    {"digital_wallet_instructions": [{"provider": "Jawali", "wallet_number": "777123456",
                                      "account_name": "Acme", "qr_code_url": "//evil.example/qr.png"}]},
    {"unknown_field": True},
])
def test_invalid_payloads_rejected(session_factory, payload):
    client = _client(session_factory, _user("Super_Admin"))
    assert client.put(URL, json=payload).status_code == 422


def test_put_returns_503_when_vault_not_configured(session_factory, monkeypatch):
    monkeypatch.delenv(secret_vault.KEY_ENV)
    client = _client(session_factory, _user("Super_Admin"))
    assert client.put(URL, json={"stripe_secret_key": STRIPE_SK}).status_code == 503


# ------------------------------------------------------------------ QR Upload
QR_URL = "/api/v1/admin/settings/billing/wallet-qr"
SAMPLE_PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 30
SAMPLE_JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 30
SAMPLE_WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 30


def test_upload_wallet_qr_success_png(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    files = {"file": ("wallet_qr.png", SAMPLE_PNG_BYTES, "image/png")}
    res = client.post(QR_URL, files=files)
    assert res.status_code == 201, res.text
    body = res.json()
    assert "qr_code_url" in body
    assert body["qr_code_url"].startswith("/static/uploads/wallets/")
    assert body["qr_code_url"].endswith(".png")


def test_upload_wallet_qr_success_jpeg_and_webp(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    # JPEG
    res_jpeg = client.post(QR_URL, files={"file": ("code.jpg", SAMPLE_JPEG_BYTES, "image/jpeg")})
    assert res_jpeg.status_code == 201
    assert res_jpeg.json()["qr_code_url"].endswith(".jpg")

    # WebP
    res_webp = client.post(QR_URL, files={"file": ("code.webp", SAMPLE_WEBP_BYTES, "image/webp")})
    assert res_webp.status_code == 201
    assert res_webp.json()["qr_code_url"].endswith(".webp")


def test_upload_wallet_qr_rejects_oversized_file(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    # 1 MB + 10 bytes
    oversized = SAMPLE_PNG_BYTES + b"0" * (1 * 1024 * 1024)
    files = {"file": ("huge.png", oversized, "image/png")}
    res = client.post(QR_URL, files=files)
    assert res.status_code in (400, 413)


def test_upload_wallet_qr_rejects_empty_file(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    files = {"file": ("empty.png", b"", "image/png")}
    res = client.post(QR_URL, files=files)
    assert res.status_code == 400


def test_upload_wallet_qr_rejects_spoofed_mime_or_invalid_magic_bytes(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    # Claims to be PNG but is plaintext
    files = {"file": ("fake.png", b"Hello world! Not a real image", "image/png")}
    res = client.post(QR_URL, files=files)
    assert res.status_code == 400
    assert "Invalid image format" in res.text


def test_upload_wallet_qr_rejects_executable_and_path_traversal(session_factory):
    client = _client(session_factory, _user("Super_Admin"))
    # Executable extension disguised with image bytes
    res_exe = client.post(QR_URL, files={"file": ("payload.exe", SAMPLE_PNG_BYTES, "image/png")})
    assert res_exe.status_code == 400

    # Path traversal in filename
    res_trav = client.post(QR_URL, files={"file": ("../../etc/passwd.png", SAMPLE_PNG_BYTES, "image/png")})
    assert res_trav.status_code == 400


def test_upload_wallet_qr_requires_strict_super_admin(session_factory, monkeypatch):
    monkeypatch.setenv("OXENGL_DEV_MODE", "true")
    # Non-super admin should receive 403
    client = _client(session_factory, _user("Admin", company_id=uuid.uuid4()))
    files = {"file": ("qr.png", SAMPLE_PNG_BYTES, "image/png")}
    assert client.post(QR_URL, files=files).status_code == 403

