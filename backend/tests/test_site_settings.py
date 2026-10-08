"""Unit and integration tests for dynamic platform site settings and logo upload."""
from __future__ import annotations

import base64
import os
import secrets
import uuid
from typing import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

for _key_name in (
    "DATA_RESIDENCY_KEY",
    "JWT_SECRET",
    "JWT_SECRET_MASTER",
    "JWT_SECRET_TENANT",
):
    os.environ.setdefault(_key_name, secrets.token_hex(32))

from backend import models
from backend.app.api.v1.site_settings import (
    DEFAULT_SITE_SETTINGS,
    LOGO_STORAGE_DIR,
    router as site_settings_router,
)
from backend.database import get_db
from backend.two_tier_auth import issue_two_tier_jwt


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(
        engine,
        tables=[
            models.SiteSetting.__table__,
            models.MasterUser.__table__,
            models.PlatformAuditLog.__table__,
        ],
    )
    session_factory = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> TestClient:
    app = FastAPI()
    app.include_router(site_settings_router)

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


@pytest.fixture()
def admin_user(db_session: Session) -> tuple[models.MasterUser, str]:
    admin_id = uuid.uuid4()
    admin = models.MasterUser(
        id=admin_id,
        email="superadmin@oxengl.com",
        full_name="Platform Super Administrator",
        password_hash="test_password_hash_xyz",
        role="super_admin",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()

    token = issue_two_tier_jwt(
        tier="master",
        user_id=admin.id,
        identity=admin.email,
        role="super_admin",
    )
    return admin, token


def test_public_settings_defaults(client: TestClient):
    """GET /api/settings/public returns full default configuration if DB is empty."""
    res = client.get("/api/settings/public")
    assert res.status_code == 200
    data = res.json()
    assert data["site_name"] == "OxenGL"
    assert data["site_logo"] == "/oxengl-wordmark.svg"
    assert "Sovereign Saudi-first" in data["site_description"]
    assert "Sovereign Saudi-first" in data["site_tagline"]
    assert "Sovereign Multi-Tenant ERP Architecture" in data["landing_headline"]


def test_public_settings_merged_with_database(client: TestClient, db_session: Session):
    """GET /api/settings/public accurately merges rows saved in DB."""
    setting = models.SiteSetting(
        key="site_description",
        value="Custom dynamic tagline for enterprise quarries.",
    )
    db_session.add(setting)
    db_session.commit()

    res = client.get("/api/settings/public")
    assert res.status_code == 200
    data = res.json()
    assert data["site_description"] == "Custom dynamic tagline for enterprise quarries."
    assert data["site_tagline"] == "Custom dynamic tagline for enterprise quarries."
    assert data["site_name"] == "OxenGL"


def test_admin_update_requires_auth(client: TestClient):
    """PUT /api/settings/admin rejects unauthenticated requests with 401."""
    res = client.put(
        "/api/settings/admin",
        json=[{"key": "site_name", "value": "New Platform Brand"}],
    )
    assert res.status_code == 401


def test_admin_update_success(client: TestClient, admin_user: tuple[models.MasterUser, str]):
    """PUT /api/settings/admin updates settings when authenticated as master admin."""
    _admin, token = admin_user
    headers = {"Authorization": f"Bearer {token}"}

    updates = [
        {"key": "site_name", "value": "OxenGL Next-Gen"},
        {"key": "site_logo", "value": "/assets/custom-logo.svg"},
        {
            "key": "site_description",
            "value": "Sovereign Saudi-first ERP platform updated dynamically via admin panel.",
        },
    ]
    res = client.put("/api/settings/admin", json=updates, headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "success"

    # Verify public settings reflect the updates
    pub = client.get("/api/settings/public")
    assert pub.status_code == 200
    pub_data = pub.json()
    assert pub_data["site_name"] == "OxenGL Next-Gen"
    assert pub_data["site_logo"] == "/assets/custom-logo.svg"
    assert pub_data["site_description"] == "Sovereign Saudi-first ERP platform updated dynamically via admin panel."
    assert pub_data["site_tagline"] == "Sovereign Saudi-first ERP platform updated dynamically via admin panel."


def test_upload_logo_requires_auth(client: TestClient):
    """POST /api/settings/upload-logo rejects unauthenticated requests with 401."""
    res = client.post(
        "/api/settings/upload-logo",
        files={"file": ("logo.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
    )
    assert res.status_code == 401


def test_upload_logo_rejects_unsupported_format(client: TestClient, admin_user: tuple[models.MasterUser, str]):
    """POST /api/settings/upload-logo rejects invalid non-image MIME types."""
    _admin, token = admin_user
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post(
        "/api/settings/upload-logo",
        files={"file": ("malicious.exe", b"MZ\x90\x00\x03", "application/x-msdownload")},
        headers=headers,
    )
    assert res.status_code == 415


def test_upload_logo_success_and_serving(client: TestClient, admin_user: tuple[models.MasterUser, str]):
    """POST /api/settings/upload-logo successfully saves image and serves via GET /api/settings/logo/{filename}."""
    _admin, token = admin_user
    headers = {"Authorization": f"Bearer {token}"}

    # 1x1 transparent PNG binary
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00"
        b"\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    res = client.post(
        "/api/settings/upload-logo",
        files={"file": ("platform_logo.png", png_bytes, "image/png")},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    logo_url = data["logo_url"]
    assert logo_url.startswith("/api/settings/logo/site_logo_")
    assert logo_url.endswith(".png")

    # Verify site_settings was automatically updated with the new logo URL
    pub = client.get("/api/settings/public")
    assert pub.status_code == 200
    assert pub.json()["site_logo"] == logo_url

    # Test serving the uploaded file via GET /api/settings/logo/{filename}
    filename = logo_url.split("/")[-1]
    served = client.get(f"/api/settings/logo/{filename}")
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content == png_bytes


def test_upload_logo_base64_success(client: TestClient, admin_user: tuple[models.MasterUser, str]):
    """POST /api/settings/logo-base64 accepts data URL and updates site_logo."""
    _admin, token = admin_user
    headers = {"Authorization": f"Bearer {token}"}

    svg_content = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><text y="20">OxenGL</text></svg>'
    b64_svg = base64.b64encode(svg_content.encode("utf-8")).decode("utf-8")
    data_url = f"data:image/svg+xml;base64,{b64_svg}"

    res = client.post(
        "/api/settings/logo-base64",
        json={"fileName": "logo.svg", "fileBuffer": data_url},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["logo_url"].startswith("/api/settings/logo/site_logo_")
    assert data["logo_url"].endswith(".svg")


def test_serve_logo_path_traversal_prevention(client: TestClient):
    """GET /api/settings/logo/{filename} rejects path traversal attempts."""
    res = client.get("/api/settings/logo/../../etc/passwd")
    assert res.status_code in (400, 404)
