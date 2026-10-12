"""Comprehensive unit & integration tests for OxenGL Unified Platform Governance,
Headless Landing CMS Studio, and System Broadcast Engine.

Tests:
1. Public Landing CMS tree endpoint (GET /api/v1/public/landing).
2. SuperAdmin Landing CMS section updates and factory reset.
3. Unified Platform Settings GET and PATCH operations with legacy sync.
4. Logo upload handler with format validation.
5. System Broadcasts active retrieval, creation, updating, and deletion.
6. Strict SuperAdmin authorization enforcement (401 / 403 on protected routes).
"""
import base64
import os
import uuid
import pytest
from starlette.testclient import TestClient

from backend.app.main import app
from backend.database import SessionLocal
from backend.two_tier_auth import SUPER_ADMIN_EMAIL, issue_two_tier_jwt
import backend.models as models

client = TestClient(app)

_ORIGINAL_MASTER_STATE = {}


def _get_superadmin_token():
    db = SessionLocal()
    try:
        user = db.query(models.MasterUser).filter(models.MasterUser.email == SUPER_ADMIN_EMAIL).first()
        if user is None:
            user = models.MasterUser(
                id=uuid.uuid4(),
                email=SUPER_ADMIN_EMAIL,
                full_name="Platform Root SuperAdmin",
                password_hash="!test_hash",
                role="super_admin",
                is_active=True,
            )
            db.add(user)
            _ORIGINAL_MASTER_STATE[user.id] = None
        else:
            _ORIGINAL_MASTER_STATE.setdefault(user.id, (user.role, user.is_active))
            user.role = "super_admin"
            user.is_active = True
        db.commit()
        db.refresh(user)
        token = issue_two_tier_jwt(tier="master", user_id=user.id, identity=user.email, role="super_admin")
        return user.id, token
    finally:
        db.close()


def _get_tenant_user_token():
    db = SessionLocal()
    try:
        # Create or fetch regular tenant user
        tenant_user = db.query(models.ResUser).filter(models.ResUser.email == "tenant_user@example.com").first()
        if not tenant_user:
            company = db.query(models.ResCompany).first()
            tenant_user = models.ResUser(
                id=uuid.uuid4(),
                email="tenant_user@example.com",
                password_hash="!test_hash",
                role="User",
                company_id=company.id if company else None,
            )
            db.add(tenant_user)
            db.commit()
            db.refresh(tenant_user)
        token = issue_two_tier_jwt(
            tier="tenant",
            user_id=tenant_user.id,
            identity=tenant_user.email,
            role="User",
        )
        return tenant_user.id, token
    finally:
        db.close()


@pytest.fixture
def superadmin_auth():
    user_id, token = _get_superadmin_token()
    yield {"Authorization": f"Bearer {token}"}


@pytest.fixture
def tenant_auth():
    user_id, token = _get_tenant_user_token()
    yield {"Authorization": f"Bearer {token}"}


# ==============================================================================
# TEST SUITE 1: PUBLIC LANDING CMS ENDPOINTS
# ==============================================================================

def test_public_landing_tree_success():
    """GET /api/v1/public/landing returns hierarchical sections and platform settings."""
    res = client.get("/api/v1/public/landing")
    assert res.status_code == 200, res.text
    data = res.json()
    assert "platform_settings" in data
    assert "sections" in data
    assert "sections_map" in data
    assert len(data["sections"]) >= 4

    # Check key sections exist
    sec_map = data["sections_map"]
    assert "hero" in sec_map
    assert "features" in sec_map
    assert "pricing_matrix" in sec_map
    assert sec_map["hero"]["is_visible"] is True


def test_public_landing_tree_alias():
    """GET /api/v1/public/content/landing returns exact same structure."""
    res = client.get("/api/v1/public/content/landing")
    assert res.status_code == 200
    data = res.json()
    assert "sections_map" in data


# ==============================================================================
# TEST SUITE 2: RBAC ENFORCEMENT ON PROTECTED ADMIN ENDPOINTS
# ==============================================================================

def test_admin_endpoints_require_authentication():
    """Admin landing and settings endpoints reject unauthenticated requests with 401."""
    res_cms = client.get("/api/v1/admin/landing/sections")
    assert res_cms.status_code == 401

    res_settings = client.get("/api/v1/admin/platform/settings")
    assert res_settings.status_code == 401

    res_broadcasts = client.get("/api/v1/admin/broadcasts")
    assert res_broadcasts.status_code == 401


def test_admin_endpoints_reject_tenant_users(tenant_auth):
    """Admin endpoints reject non-superadmin tenant users with 403."""
    res_cms = client.get("/api/v1/admin/landing/sections", headers=tenant_auth)
    assert res_cms.status_code == 403

    res_settings = client.get("/api/v1/admin/platform/settings", headers=tenant_auth)
    assert res_settings.status_code == 403

    res_broadcasts = client.get("/api/v1/admin/broadcasts", headers=tenant_auth)
    assert res_broadcasts.status_code == 403


# ==============================================================================
# TEST SUITE 3: SUPERADMIN LANDING CMS CRUD & FACTORY RESET
# ==============================================================================

def test_admin_landing_crud(superadmin_auth):
    """SuperAdmin can inspect, modify, and reset landing sections."""
    # 1. List sections
    res = client.get("/api/v1/admin/landing/sections", headers=superadmin_auth)
    assert res.status_code == 200
    sections = res.json()
    assert len(sections) >= 4

    # 2. Update Hero section
    new_title = "Modern Sovereign Cloud Platform - Saudi Arabia"
    update_res = client.put(
        "/api/v1/admin/landing/sections/hero",
        headers=superadmin_auth,
        json={
            "title": new_title,
            "subtitle": "Updated via SuperAdmin Landing CMS Engine test.",
            "content_data": {
                "badge": "PRODUCTION READY",
                "cta_primary": {"label": "Start Now", "url": "/register"},
            },
        },
    )
    assert update_res.status_code == 200
    updated_sec = update_res.json()
    assert updated_sec["title"] == new_title

    # 3. Verify public endpoint immediately reflects updated title (cache invalidated)
    pub_res = client.get("/api/v1/public/landing")
    assert pub_res.status_code == 200
    assert pub_res.json()["sections_map"]["hero"]["title"] == new_title

    # 4. Reset to factory defaults
    reset_res = client.post("/api/v1/admin/landing/reset-default", headers=superadmin_auth)
    assert reset_res.status_code == 200
    reset_sections = reset_res.json()
    assert len(reset_sections) >= 7

    # 5. Verify public endpoint reflects factory default
    pub_reset = client.get("/api/v1/public/landing")
    assert pub_reset.json()["sections_map"]["hero"]["title"] == (
        "Sovereign Multi-Tenant ERP Architecture"
    )


# ==============================================================================
# TEST SUITE 4: UNIFIED PLATFORM MASTER SETTINGS
# ==============================================================================

def test_unified_platform_settings_read_and_patch(superadmin_auth):
    """SuperAdmin can query and update unified platform master settings."""
    # 1. Read
    res = client.get("/api/v1/admin/platform/settings", headers=superadmin_auth)
    assert res.status_code == 200
    settings = res.json()
    assert "platform_name" in settings
    assert "primary_color" in settings

    # 2. Patch
    patch_res = client.patch(
        "/api/v1/admin/platform/settings",
        headers=superadmin_auth,
        json={
            "platform_name": "OxenGL Sovereign Enterprise",
            "platform_tagline": "Root Control Plane for Logistics & Finance",
            "primary_color": "#ea580c",
            "secondary_color": "#020617",
            "support_email": "root-governance@oxengl.me",
            "metadata": {
                "custom_header_tag": "OXENGL_ENTERPRISE_2026",
            },
        },
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["platform_name"] == "OxenGL Sovereign Enterprise"
    assert updated["primary_color"] == "#ea580c"
    assert updated["support_email"] == "root-governance@oxengl.me"
    assert updated["metadata"]["custom_header_tag"] == "OXENGL_ENTERPRISE_2026"

    # 3. Verify public landing contains updated platform name
    pub_res = client.get("/api/v1/public/landing")
    assert pub_res.json()["platform_settings"]["platform_name"] == "OxenGL Sovereign Enterprise"


def test_platform_logo_upload(superadmin_auth):
    """SuperAdmin can upload branding logos via base64 or multipart."""
    # 1x1 transparent PNG base64
    tiny_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

    res = client.post(
        "/api/v1/admin/platform/upload-logo?asset_type=primary_logo",
        headers=superadmin_auth,
        json={
            "fileName": "test_brand_logo.png",
            "fileBuffer": tiny_png_b64,
        },
    )
    assert res.status_code == 200, res.text
    result = res.json()
    assert result["success"] is True
    assert result["url"].startswith("/api/v1/platform/logo/")

    # Verify logo is accessible
    logo_res = client.get(result["url"])
    assert logo_res.status_code == 200
    assert logo_res.headers["content-type"] == "image/png"


# ==============================================================================
# TEST SUITE 5: SYSTEM BROADCAST ENGINE
# ==============================================================================

def test_system_broadcast_lifecycle(superadmin_auth):
    """Full lifecycle: create broadcast, view active, toggle/update, and delete."""
    # 1. Create a critical alert
    broadcast_payload = {
        "title": "Scheduled Database Maintenance",
        "message": "Routine zero-downtime maintenance window scheduled tonight at 02:00 UTC.",
        "severity": "maintenance",
        "is_active": True,
        "is_dismissible": True,
        "target_scope": "all",
    }
    create_res = client.post("/api/v1/admin/broadcasts", headers=superadmin_auth, json=broadcast_payload)
    assert create_res.status_code == 200, create_res.text
    created = create_res.json()
    broadcast_id = created["id"]
    assert created["severity"] == "maintenance"

    # 2. Check public active broadcasts
    active_res = client.get("/api/v1/broadcasts/active")
    assert active_res.status_code == 200
    active_list = active_res.json()
    matching = [b for b in active_list if b["id"] == broadcast_id]
    assert len(matching) == 1
    assert matching[0]["title"] == "Scheduled Database Maintenance"

    # 3. Toggle broadcast to inactive
    update_res = client.patch(
        f"/api/v1/admin/broadcasts/{broadcast_id}",
        headers=superadmin_auth,
        json={"is_active": False, "severity": "info"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["is_active"] is False

    # 4. Verify no longer in active broadcasts
    active_res_after = client.get("/api/v1/broadcasts/active")
    matching_after = [b for b in active_res_after.json() if b["id"] == broadcast_id]
    assert len(matching_after) == 0

    # 5. Delete broadcast
    del_res = client.delete(f"/api/v1/admin/broadcasts/{broadcast_id}", headers=superadmin_auth)
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True


def test_sovereignty_compliance_policy_endpoints(superadmin_auth):
    """Test GET and PUT /api/v1/platform/master-settings with configurable compliance policy."""
    # 1. Fetch current settings via /api/v1/platform/master-settings
    res = client.get("/api/v1/platform/master-settings", headers=superadmin_auth)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "enable_sovereignty_badge" in data
    assert "sovereignty_badge_title" in data
    assert "sovereignty_badge_text" in data

    # 2. Update compliance policy
    update_payload = {
        "enable_sovereignty_badge": True,
        "sovereignty_badge_title": "Republic of Yemen Sovereign Control & Data Residency",
        "sovereignty_badge_text": "All tenant schemas, cryptographic keys, and fleet telemetry logs are strictly persisted on sovereign infrastructure inside Yemen.",
    }
    put_res = client.put("/api/v1/platform/master-settings", headers=superadmin_auth, json=update_payload)
    assert put_res.status_code == 200, put_res.text
    put_data = put_res.json()
    assert put_data["enable_sovereignty_badge"] is True
    assert put_data["sovereignty_badge_title"] == "Republic of Yemen Sovereign Control & Data Residency"
    assert "Yemen" in put_data["sovereignty_badge_text"]

    # 3. Verify in public landing endpoint
    pub_res = client.get("/api/v1/public/landing")
    assert pub_res.status_code == 200
    pub_settings = pub_res.json()["platform_settings"]
    assert pub_settings["enable_sovereignty_badge"] is True
    assert pub_settings["sovereignty_badge_title"] == "Republic of Yemen Sovereign Control & Data Residency"


def test_dynamic_landing_hero_cms_full_schema(superadmin_auth):
    """Test PUT /api/v1/platform/landing/sections/hero with all 9 attributes."""
    hero_payload = {
        "title": "Sovereign Multi-Tenant ERP Architecture for the Republic of Yemen",
        "subtitle": "National heavy industry, quarry logistics, and sovereign enterprise resource planning.",
        "content_data": {
            "badge_text": "v5.0 SOVEREIGN ARCHITECTURE",
            "headline": "Sovereign Multi-Tenant ERP Architecture for the Republic of Yemen",
            "subheadline": "National heavy industry, quarry logistics, and sovereign enterprise resource planning.",
            "primary_cta_label": "Deploy Sovereign Workspace",
            "primary_cta_url": "/register?region=yem",
            "secondary_cta_label": "Direct Console Access",
            "secondary_cta_url": "/login",
            "telemetry_node_label": "YEM-SANAA-01 [ONLINE]",
            "telemetry_db_label": "PostgreSQL 16.4 • Uptime: 99.999%",
        },
        "is_visible": True,
    }

    put_res = client.put("/api/v1/platform/landing/sections/hero", headers=superadmin_auth, json=hero_payload)
    assert put_res.status_code == 200, put_res.text
    section = put_res.json()
    assert section["section_key"] == "hero"
    assert section["content_data"]["badge_text"] == "v5.0 SOVEREIGN ARCHITECTURE"
    assert section["content_data"]["telemetry_node_label"] == "YEM-SANAA-01 [ONLINE]"
    assert section["content_data"]["primary_cta_label"] == "Deploy Sovereign Workspace"

    # Verify public landing tree reflects this immediately (cache invalidated)
    pub_res = client.get("/api/v1/public/landing")
    assert pub_res.status_code == 200
    hero_public = pub_res.json()["sections_map"]["hero"]
    assert hero_public["content_data"]["headline"] == "Sovereign Multi-Tenant ERP Architecture for the Republic of Yemen"
    assert hero_public["content_data"]["telemetry_node_label"] == "YEM-SANAA-01 [ONLINE]"
    assert hero_public["content_data"]["telemetry_db_label"] == "PostgreSQL 16.4 • Uptime: 99.999%"


def test_dynamic_landing_footer_contacts_and_whatsapp(superadmin_auth):
    """Test updating footer section with dynamic contact info & phone."""
    footer_payload = {
        "title": "OxenGL Sovereign Platform",
        "subtitle": "Sovereign Multi-Tenant ERP Architecture.",
        "content_data": {
            "contact_email": "admin@oxengl.me",
            "contact_phone": "+967 736735733",
            "contact_location": "Sana'a, Yemen",
            "copyright": "© 2026 OxenGL Sovereign Enterprise. All rights reserved.",
        },
        "is_visible": True,
    }

    put_res = client.put("/api/v1/platform/landing/sections/footer", headers=superadmin_auth, json=footer_payload)
    assert put_res.status_code == 200, put_res.text
    section = put_res.json()
    assert section["section_key"] == "footer"
    assert section["content_data"]["contact_phone"] == "+967 736735733"
    assert section["content_data"]["phone"] == "+967 736735733"
    assert section["content_data"]["contact_email"] == "admin@oxengl.me"
    assert section["content_data"]["contact_location"] == "Sana'a, Yemen"

    # Verify public landing endpoint returns normalized footer
    pub_res = client.get("/api/v1/public/landing")
    assert pub_res.status_code == 200
    footer_public = pub_res.json()["sections_map"]["footer"]
    assert footer_public["content_data"]["contact_phone"] == "+967 736735733"
    assert footer_public["content_data"]["contact_email"] == "admin@oxengl.me"
    assert footer_public["content_data"]["contact_location"] == "Sana'a, Yemen"


