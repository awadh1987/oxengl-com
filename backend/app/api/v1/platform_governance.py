"""Unified Platform Master Governance, Dynamic Landing CMS & Broadcast Engine.
File: backend/app/api/v1/platform_governance.py

Provides:
- Public high-speed cached Landing CMS API: GET /api/v1/public/landing
- SuperAdmin Landing CMS Studio endpoints: GET/PUT /api/v1/admin/landing/sections, POST reset-default
- Unified Platform Settings API: GET/PATCH/PUT /api/v1/admin/platform/settings, POST upload-logo
- System-Wide Broadcast Engine: GET /api/v1/broadcasts/active, SSE /api/v1/broadcasts/stream, admin CRUD
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select, text
from sqlalchemy.orm import Session

from backend.database import SessionLocal, get_db
from backend.models import (
    MasterUser,
    PlatformAuditLog,
    PlatformLandingSection,
    PlatformMasterSetting,
    PlatformSetting,
    ResCompany,
    ResUser,
    SiteSetting,
    SystemBroadcast,
)
from backend.schemas import (
    LandingSectionCreate,
    LandingSectionRead,
    LandingSectionUpdate,
    PlatformMasterSettingsRead,
    PlatformMasterSettingsUpdate,
    PublicLandingResponse,
    SystemBroadcastCreate,
    SystemBroadcastRead,
    SystemBroadcastUpdate,
)
from backend.app.api.v1.branding import (
    _authenticate_branding_editor,
    _require_active_platform_admin,
)
from backend.app.domains.hr.audit import (
    append_audit_from_context,
    build_audit_context,
)
from backend.two_tier_auth import is_designated_super_admin, verify_two_tier_jwt

logger = logging.getLogger("oxengl.governance")

router = APIRouter(tags=["Platform Governance & CMS"])

# Storage configuration
LOGO_STORAGE_DIR = Path(__file__).resolve().parents[4] / "backend" / "static" / "logos"
LOGO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

_ALLOWED_LOGO_FORMATS = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
    "image/svg+xml": (".svg", lambda data: b"<svg" in data.lower() or data.strip().startswith(b"<?xml")),
    "image/x-icon": (".ico", lambda data: data.startswith(b"\x00\x00\x01\x00")),
    "image/vnd.microsoft.icon": (".ico", lambda data: data.startswith(b"\x00\x00\x01\x00")),
}

# In-memory Landing CMS cache
_landing_cache: Dict[str, Any] = {
    "data": None,
    "expires_at": 0.0,
}

def invalidate_landing_cache() -> None:
    _landing_cache["data"] = None
    _landing_cache["expires_at"] = 0.0


# In-memory Real-time Broadcast SSE subscriber queues
_broadcast_subscribers: List[asyncio.Queue] = []

async def push_broadcast_update_async(event_type: str, data: Dict[str, Any]) -> None:
    for q in list(_broadcast_subscribers):
        try:
            await q.put({"event": event_type, "data": data})
        except Exception:
            pass


def trigger_broadcast_notification(event_type: str, data: Dict[str, Any]) -> None:
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(push_broadcast_update_async(event_type, data))
    except RuntimeError:
        pass


# SuperAdmin Authorization Dependency
def require_super_admin_principal(
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Verify that caller has SuperAdmin root control plane access.

    Raises 401 if unauthenticated, 403 if non-superadmin.
    """
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization") or ""
    token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
    if not token:
        token = (request.cookies.get("oxengl_session") or request.cookies.get("oxengl_auth_jwt") or "").strip()

    if not token:
        # Check master admin provisioning bypass key if configured
        expected_key = (os.getenv("MASTER_PLATFORM_KEY") or "").strip()
        prov_header = request.headers.get("X-Master-Admin-Key") or request.headers.get("x-master-admin-key")
        if expected_key and prov_header and prov_header == expected_key:
            return {"tier": "master", "role": "super_admin", "identity": "provisioner"}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required for SuperAdmin platform governance.",
        )

    # 1. Try master-tier verification
    for tier in ("master", "tenant"):
        try:
            claims = verify_two_tier_jwt(token, expected_tier=tier)
            if claims:
                if tier == "master":
                    user = _require_active_platform_admin(claims, db)
                    return {
                        "tier": "master",
                        "role": str(user.role),
                        "identity": str(user.email),
                        "user_id": str(user.id),
                    }
                else:
                    # Tenant tokens must be explicitly super_admin
                    role = str(claims.get("role", "")).upper().replace(" ", "_")
                    if role in ("SUPER_ADMIN", "ROOT", "MASTER"):
                        return claims
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Platform administrator privileges required.",
                    )
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                raise exc
            continue

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication credentials.",
    )


# ==============================================================================
# Helper functions for Landing CMS & Settings
# ==============================================================================

DEFAULT_LANDING_SECTIONS_PAYLOAD = [
    {
        "id": "sec-hero",
        "section_key": "hero",
        "locale": "en",
        "title": "Sovereign Multi-Tenant ERP Architecture",
        "subtitle": "Sub-millisecond query isolation, cryptographic compliance, and heavy industrial logistics orchestration—engineered on bare-metal PostgreSQL 16 and FastAPI.",
        "content_data": {
            "badge_text": "v4.8 ENTERPRISE CONTROL PLANE",
            "headline": "Sovereign Multi-Tenant ERP Architecture",
            "subheadline": "Sub-millisecond query isolation, cryptographic compliance, and heavy industrial logistics orchestration—engineered on bare-metal PostgreSQL 16 and FastAPI.",
            "primary_cta_label": "Deploy Workspace",
            "primary_cta_url": "/register",
            "secondary_cta_label": "Console Sign In",
            "secondary_cta_url": "/login",
            "telemetry_node_label": "YEM-SANAA-01 [ONLINE]",
            "telemetry_db_label": "PostgreSQL 16.4 • Uptime: 99.984%",
            "badge": "v4.8 ENTERPRISE CONTROL PLANE",
            "cta_primary": {"label": "Deploy Workspace", "url": "/register"},
            "cta_secondary": {"label": "Console Sign In", "url": "/login"},
            "hero_graphic": "/hero-mesh.png",
            "stats": [
                {"label": "Query Latency", "value": "< 1.2ms"},
                {"label": "Clearance", "value": "100% Phase 2"},
                {"label": "Fleet Live Tracking", "value": "Real-time GPS"},
                {"label": "Data Isolation", "value": "RLS + Schema"}
            ]
        },
        "sort_order": 1,
        "is_visible": True,
    },
    {
        "id": "sec-features",
        "section_key": "features",
        "locale": "en",
        "title": "Engineered for Heavy Industry & Absolute Data Sovereignty",
        "subtitle": "Purpose-built modules for quarry operations, concrete batching, logistics, and regulatory compliance.",
        "content_data": {
            "items": [
                {
                    "id": "zatca",
                    "title": "ZATCA Phase 2 Cryptographic Clearance",
                    "description": "Automated XML UBL 2.1 generation, ECDSA secp256k1 signing, cryptographic stamps, and direct clearance with ZATCA Fatoora servers.",
                    "icon": "ShieldCheck",
                    "badge": "Regulatory"
                },
                {
                    "id": "logistics",
                    "title": "Quarry & Fleet Radar",
                    "description": "Real-time telemetry, automated weighbridge gross-tare-net calculation, driver dispatching, and geofenced routes.",
                    "icon": "Truck",
                    "badge": "Operations"
                },
                {
                    "id": "finance",
                    "title": "Multi-Tenant General Ledger",
                    "description": "Sub-millisecond double-entry ledger, accounts payable/receivable, real-time balance sheets, and tax audits.",
                    "icon": "Landmark",
                    "badge": "Financials"
                },
                {
                    "id": "customs",
                    "title": "Customs & Port Clearance",
                    "description": "End-to-end manifest tracking, customs duty escrow, port authority integration, and container manifests.",
                    "icon": "Ship",
                    "badge": "Trade"
                },
                {
                    "id": "hr",
                    "title": "HRMS & GOSI / WPS Payroll",
                    "description": "Saudi Labor Law compliance, automated Muqeem/Qiwa tracking, WPS bank file generation, and employee self-service.",
                    "icon": "Users",
                    "badge": "Workforce"
                },
                {
                    "id": "ai",
                    "title": "Autonomous AI Financial Auditor",
                    "description": "Continuous ledger reconciliation, anomaly detection, predictive cashflow forecasting, and automated voucher audit.",
                    "icon": "Sparkles",
                    "badge": "Intelligence"
                }
            ]
        },
        "sort_order": 2,
        "is_visible": True,
    },
    {
        "id": "sec-metrics",
        "section_key": "metrics",
        "locale": "en",
        "title": "Industrial Proven Reliability",
        "subtitle": "Handling mission-critical heavy industry workloads across Saudi Arabia.",
        "content_data": {
            "metrics": [
                {"label": "Transactions Processed", "value": "12.4M+", "change": "+28% MoM"},
                {"label": "Fleet Kilometers Monitored", "value": "8.2M km", "change": "99.98% uptime"},
                {"label": "Invoices Cleared", "value": "100%", "change": "ZATCA Phase 2"},
                {"label": "System Availability", "value": "99.99%", "change": "Zero-downtime"}
            ]
        },
        "sort_order": 3,
        "is_visible": True,
    },
    {
        "id": "sec-pricing",
        "section_key": "pricing_matrix",
        "locale": "en",
        "title": "Predictable Enterprise Subscriptions",
        "subtitle": "Transparent pricing with dedicated instances, sovereign hosting, and unlimited scalability.",
        "content_data": {
            "tiers": [
                {
                    "id": "starter",
                    "name": "Starter Industrial",
                    "tagline": "For independent quarries & logistics contractors",
                    "price_monthly": "SAR 2,499",
                    "price_annual": "SAR 24,990",
                    "badge": "Essential",
                    "features": [
                        "Up to 10 Fleet Vehicles & Weighbridge Units",
                        "ZATCA Phase 2 Invoicing & Reporting",
                        "Standard Chart of Accounts & Financial Vouchers",
                        "Multi-User RBAC (Up to 15 Seats)",
                        "Standard SLA & Email Support"
                    ],
                    "cta": {"label": "Deploy Workspace", "url": "/register?plan=starter"}
                },
                {
                    "id": "enterprise",
                    "name": "Enterprise Corporate",
                    "tagline": "For multi-branch quarry & contracting conglomerates",
                    "price_monthly": "SAR 6,999",
                    "price_annual": "SAR 69,990",
                    "badge": "Most Popular",
                    "highlighted": True,
                    "features": [
                        "Unlimited Fleet Vehicles & Weighbridge Stations",
                        "Direct ZATCA Clearance & Real-Time E-Invoicing",
                        "Advanced HRMS, WPS Payroll & GOSI Compliance",
                        "AI Financial Auditor & Anomaly Detection",
                        "Custom Domain & Dynamic White-Label Branding",
                        "Dedicated Account Manager & 99.95% SLA"
                    ],
                    "cta": {"label": "Start Enterprise Pilot", "url": "/register?plan=enterprise"}
                },
                {
                    "id": "sovereign",
                    "name": "Sovereign Dedicated",
                    "tagline": "On-premise or sovereign private cloud deployment",
                    "price_monthly": "Custom Quote",
                    "price_annual": "Contact Sales",
                    "badge": "Sovereign",
                    "features": [
                        "Isolated PostgreSQL Database Cluster in KSA",
                        "Custom ERP Core Module Extensions & APIs",
                        "Air-Gapped & Bare-Metal Hardware Deployment Option",
                        "Continuous Security Audit & Penetration Testing",
                        "24/7 Dedicated NOC Support with 15-minute SLA"
                    ],
                    "cta": {"label": "Contact Executive Sales", "url": "mailto:sales@oxengl.me"}
                }
            ]
        },
        "sort_order": 4,
        "is_visible": True,
    },
    {
        "id": "sec-testimonials",
        "section_key": "testimonials",
        "locale": "en",
        "title": "Trusted by Leaders in Heavy Industry",
        "subtitle": "What operators and CFOs say about OxenGL.",
        "content_data": {
            "items": [
                {
                    "quote": "OxenGL completely eliminated weighbridge discrepancies and brought our ZATCA Phase 2 compliance to 100% automation.",
                    "author": "Tariq Al-Harbi",
                    "role": "VP of Operations, Riyadh Aggregates Co."
                },
                {
                    "quote": "The ledger performance is extraordinary. Closing our monthly books takes minutes instead of weeks.",
                    "author": "Mona Al-Ghamdi",
                    "role": "Chief Financial Officer, Red Sea Quarrying Group"
                }
            ]
        },
        "sort_order": 5,
        "is_visible": True,
    },
    {
        "id": "sec-faq",
        "section_key": "faq",
        "locale": "en",
        "title": "Frequently Asked Questions",
        "subtitle": "Everything you need to know about OxenGL ERP and deployment.",
        "content_data": {
            "items": [
                {
                    "question": "Is OxenGL fully compliant with ZATCA Phase 2?",
                    "answer": "Yes. OxenGL generates standard UBL 2.1 XML invoices with cryptographic signatures (ECDSA secp256k1), cryptographic stamps, and communicates directly with ZATCA clearance endpoints."
                },
                {
                    "question": "Where is customer data hosted?",
                    "answer": "All tenant data is strictly hosted within the Kingdom of Saudi Arabia in compliance with National Data Management Authority (NDMA) regulations."
                },
                {
                    "question": "Can we use our own custom domain and branding?",
                    "answer": "Yes. Enterprise tenants can bind custom domains with automatic SSL provisioning and full white-label logos, colors, and email templates."
                },
                {
                    "question": "How does multi-tenant isolation work?",
                    "answer": "OxenGL utilizes PostgreSQL Row-Level Security (RLS) combined with schema/tenant isolation to guarantee zero data leakage between organizations."
                }
            ]
        },
        "sort_order": 6,
        "is_visible": True,
    },
    {
        "id": "sec-footer",
        "section_key": "footer",
        "locale": "en",
        "title": "OxenGL",
        "subtitle": "Sovereign Multi-Tenant ERP Architecture.",
        "content_data": {
            "copyright": "© 2026 OxenGL Enterprise. All rights reserved. Sovereign multi-tenant architecture.",
            "contact_email": "ops@oxengl.me",
            "contact_phone": "+967 736735733",
            "phone": "+967 736735733",
            "contact_location": "Sana'a, Yemen",
            "contact_address": "Sana'a, Yemen",
            "location_text": "Sana'a, Yemen",
            "links": [
                {"label": "Platform Console", "url": "/tenant/login"},
                {"label": "Register Workspace", "url": "/register"},
                {"label": "Security & Compliance", "url": "/compliance"},
                {"label": "Terms of Service", "url": "/terms"},
                {"label": "Privacy Policy", "url": "/privacy"}
            ]
        },
        "sort_order": 7,
        "is_visible": True,
    }
]


def _get_or_create_master_settings(db: Session) -> PlatformMasterSetting:
    try:
        db.execute(text("ALTER TABLE platform_master_settings ADD COLUMN IF NOT EXISTS enable_sovereignty_badge BOOLEAN DEFAULT TRUE NOT NULL;"))
        db.execute(text("ALTER TABLE platform_master_settings ADD COLUMN IF NOT EXISTS sovereignty_badge_title VARCHAR(255) DEFAULT 'Data Sovereignty & Infrastructure Policy' NOT NULL;"))
        db.execute(text("ALTER TABLE platform_master_settings ADD COLUMN IF NOT EXISTS sovereignty_badge_text TEXT DEFAULT 'All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure.' NOT NULL;"))
        db.commit()
    except Exception:
        db.rollback()

    setting = db.query(PlatformMasterSetting).filter(PlatformMasterSetting.id == "default").first()
    if not setting:
        setting = PlatformMasterSetting(
            id="default",
            platform_name="OxenGL Enterprise",
            platform_tagline="Sovereign Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.",
            logo_light_url="/oxengl-wordmark.svg",
            logo_dark_url="/oxengl-wordmark.svg",
            favicon_url="/favicon.ico",
            primary_color="#f97316",
            secondary_color="#0f172a",
            support_email="contact@oxengl.me",
            enable_sovereignty_badge=True,
            sovereignty_badge_title="Data Sovereignty & Infrastructure Policy",
            sovereignty_badge_text="All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure.",
            metadata_json={
                "company_name_ar": "منظومة أوكسن السحابية",
                "company_name_en": "OxenGL Enterprise Cloud",
                "support_phone": "+966 50 123 4567",
                "contact_address": "Riyadh, Saudi Arabia",
            },
        )
        db.add(setting)
        try:
            db.commit()
            db.refresh(setting)
        except Exception:
            db.rollback()
            setting = db.query(PlatformMasterSetting).filter(PlatformMasterSetting.id == "default").first()
    return setting


def _format_price_sar(val: Any, fallback: str) -> str:
    if val is None:
        return fallback
    try:
        num = float(val)
        if num <= 0:
            return fallback
        if num == int(num):
            return f"SAR {int(num):,}"
        return f"SAR {num:,.2f}"
    except (ValueError, TypeError):
        return str(val)


def _get_catalog_pricing_tiers(db: Session) -> list[dict[str, Any]]:
    """
    Builds dynamic landing tier payloads from the active SubscriptionPlan catalog (subscription_plans table).
    Ensures a unified single source of truth between tenant subscription plans and the public landing page.
    """
    try:
        from backend.app.domains.saas.models import SubscriptionPlan
        plans = (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.is_active.is_(True))
            .order_by(SubscriptionPlan.sort_order.asc(), SubscriptionPlan.monthly_price.asc())
            .all()
        )
        if not plans:
            return []

        tiers: list[dict[str, Any]] = []
        for p in plans:
            monthly_val = float(p.monthly_price or 0.0)
            annual_val = float(p.annual_price or 0.0)
            is_free = monthly_val == 0.0
            is_enterprise = "ENTERPRISE" in p.name.upper()

            features = list(p.display_features or p.features or [])

            badge = (
                "Most Popular"
                if p.is_featured
                else ("Essential" if is_free else ("Sovereign" if is_enterprise else None))
            )

            cta_label = (
                "Start Free Evaluation"
                if is_free
                else (
                    "Start Enterprise Pilot"
                    if p.is_featured
                    else ("Contact Executive Sales" if is_enterprise and annual_val == 0 else f"Select {p.display_name}")
                )
            )
            cta_url = (
                "mailto:sales@oxengl.me"
                if is_enterprise and annual_val == 0
                else f"/register?plan={p.name.lower()}"
            )

            tier = {
                "id": str(p.id),
                "plan_id": str(p.id),
                "name": p.display_name,
                "plan_name": p.display_name,
                "title": p.display_name,
                "code": p.name.lower(),
                "tagline": p.description or "",
                "description": p.description or "",
                "price_monthly": _format_price_sar(p.monthly_price, "Free" if is_free else "Custom Quote"),
                "price_annual": _format_price_sar(
                    p.annual_price,
                    "Free" if is_free else ("Contact Sales" if is_enterprise and annual_val == 0 else "Custom Quote"),
                ),
                "monthly_price": monthly_val,
                "annual_price": annual_val,
                "currency": p.currency or "SAR",
                "badge": badge,
                "is_featured": bool(p.is_featured),
                "highlighted": bool(p.is_featured),
                "featured": bool(p.is_featured),
                "features": features,
                "display_features": features,
                "cta": {"label": cta_label, "url": cta_url},
                "max_seats": p.max_seats,
                "max_vehicles": p.max_vehicles,
                "max_storage_gb": p.max_storage_gb,
                "max_monthly_transactions": p.max_monthly_transactions,
            }
            tiers.append(tier)
        return tiers
    except Exception as exc:
        logging.getLogger(__name__).warning("Could not build catalog pricing tiers: %s", exc)
        return []


def sync_pricing_sections_with_catalog(db: Session) -> None:
    """
    Synchronizes the pricing_matrix and pricing rows in platform_landing_sections
    with the current active SubscriptionPlan catalog.
    """
    catalog_tiers = _get_catalog_pricing_tiers(db)
    if not catalog_tiers:
        return

    sections = (
        db.query(PlatformLandingSection)
        .filter(PlatformLandingSection.section_key.in_(["pricing_matrix", "pricing"]))
        .all()
    )
    for s in sections:
        c = dict(s.content_data or {})
        c["tiers"] = catalog_tiers
        s.content_data = c
        s.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logging.getLogger(__name__).warning("Failed to commit synced pricing landing sections: %s", exc)

    invalidate_landing_cache()


# ==============================================================================
# SECTION 1: PUBLIC & ADMIN LANDING CMS ENDPOINTS
# ==============================================================================

@router.get("/api/v1/public/landing", response_model=PublicLandingResponse)
@router.get("/api/v1/public/content/landing", response_model=PublicLandingResponse)
def get_public_landing_tree(db: Session = Depends(get_db)):
    """Public high-speed cached endpoint returning the complete landing tree."""
    now = time.time()
    if _landing_cache["data"] is not None and now < _landing_cache["expires_at"]:
        return _landing_cache["data"]

    master = _get_or_create_master_settings(db)
    sections = (
        db.query(PlatformLandingSection)
        .filter(PlatformLandingSection.is_visible.is_(True))
        .order_by(PlatformLandingSection.sort_order.asc(), PlatformLandingSection.created_at.asc())
        .all()
    )

    # If no sections exist in DB, fallback to seed
    if not sections:
        for item in DEFAULT_LANDING_SECTIONS_PAYLOAD:
            s = PlatformLandingSection(
                id=item["id"],
                section_key=item["section_key"],
                locale=item["locale"],
                title=item["title"],
                subtitle=item["subtitle"],
                content_data=item["content_data"],
                sort_order=item["sort_order"],
                is_visible=item["is_visible"],
            )
            db.add(s)
        try:
            db.commit()
            sections = (
        db.query(PlatformLandingSection)
        .filter(PlatformLandingSection.is_visible.is_(True))
        .order_by(PlatformLandingSection.sort_order.asc())
        .all()
            )
        except Exception:
            db.rollback()

    sections_read = [LandingSectionRead.model_validate(s) for s in sections]

    # Normalize hero section content_data with safe non-crashing fallbacks
    for s in sections_read:
        if s.section_key == "hero":
            c = dict(s.content_data or {})
            cta_pri = c.get("cta_primary") if isinstance(c.get("cta_primary"), dict) else {}
            cta_sec = c.get("cta_secondary") if isinstance(c.get("cta_secondary"), dict) else {}

            badge_text = str(c.get("badge_text") or c.get("badge") or "v4.8 ENTERPRISE CONTROL PLANE")
            headline = str(c.get("headline") or s.title or "Sovereign Multi-Tenant ERP Architecture")
            subheadline = str(c.get("subheadline") or s.subtitle or "Sub-millisecond query isolation, cryptographic compliance, and heavy industrial logistics orchestration.")
            primary_cta_label = str(c.get("primary_cta_label") or cta_pri.get("label") or "Deploy Workspace")
            primary_cta_url = str(c.get("primary_cta_url") or cta_pri.get("url") or "/register")
            secondary_cta_label = str(c.get("secondary_cta_label") or cta_sec.get("label") or "Console Sign In")
            secondary_cta_url = str(c.get("secondary_cta_url") or cta_sec.get("url") or "/login")
            telemetry_node_label = str(c.get("telemetry_node_label") or "NODE-01 [ONLINE]")
            telemetry_db_label = str(c.get("telemetry_db_label") or "PostgreSQL 16.4 • Uptime: 99.984%")

            c["badge_text"] = badge_text
            c["badge"] = badge_text
            c["headline"] = headline
            c["subheadline"] = subheadline
            c["primary_cta_label"] = primary_cta_label
            c["primary_cta_url"] = primary_cta_url
            c["secondary_cta_label"] = secondary_cta_label
            c["secondary_cta_url"] = secondary_cta_url
            c["telemetry_node_label"] = telemetry_node_label
            c["telemetry_db_label"] = telemetry_db_label
            c["cta_primary"] = {"label": primary_cta_label, "url": primary_cta_url}
            c["cta_secondary"] = {"label": secondary_cta_label, "url": secondary_cta_url}

            s.content_data = c
            s.title = headline
            s.subtitle = subheadline
        elif s.section_key == "footer":
            c = dict(s.content_data or {})
            c["contact_email"] = str(c.get("contact_email") or c.get("email") or master.support_email or "ops@oxengl.me")
            c["contact_phone"] = str(c.get("contact_phone") or c.get("phone") or "+967 736735733")
            c["phone"] = c["contact_phone"]
            c["contact_location"] = str(c.get("contact_location") or c.get("location_text") or c.get("contact_address") or "Sana'a, Yemen")
            c["contact_address"] = c["contact_location"]
            c["location_text"] = c["contact_location"]
            c["copyright"] = str(c.get("copyright") or f"© {datetime.now(timezone.utc).year} {master.platform_name}. All rights reserved.")
        elif s.section_key in ("pricing_matrix", "pricing"):
            c = dict(s.content_data or {})
            cat_tiers = _get_catalog_pricing_tiers(db)
            if cat_tiers:
                c["tiers"] = cat_tiers
            s.content_data = c

    sections_map = {s.section_key: s for s in sections_read}
    cat_tiers = _get_catalog_pricing_tiers(db)
    if "pricing_matrix" not in sections_map and cat_tiers:
        pm_section = LandingSectionRead(
            id="sec-pricing",
            section_key="pricing_matrix",
            locale="en",
            title="Transparent Enterprise Licensing",
            subtitle="Predictable SaaS and sovereign infrastructure tiers for Saudi contracting, logistics, and enterprise syndicates. All prices in SAR, excluding 15% VAT.",
            content_data={"tiers": cat_tiers},
            sort_order=4,
            is_visible=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        sections_map["pricing_matrix"] = pm_section

    if "pricing_matrix" in sections_map and "pricing" not in sections_map:
        sections_map["pricing"] = sections_map["pricing_matrix"]
    elif "pricing" in sections_map and "pricing_matrix" not in sections_map:
        sections_map["pricing_matrix"] = sections_map["pricing"]

    platform_settings_dict = {
        "platform_name": master.platform_name,
        "platform_tagline": master.platform_tagline,
        "logo_light_url": master.logo_light_url,
        "logo_dark_url": master.logo_dark_url,
        "favicon_url": master.favicon_url,
        "primary_color": master.primary_color,
        "secondary_color": master.secondary_color,
        "support_email": master.support_email,
        "legal_terms_url": master.legal_terms_url,
        "privacy_policy_url": master.privacy_policy_url,
        "custom_css": master.custom_css,
        "enable_sovereignty_badge": bool(getattr(master, "enable_sovereignty_badge", True)),
        "sovereignty_badge_title": str(getattr(master, "sovereignty_badge_title", "Data Sovereignty & Infrastructure Policy") or "Data Sovereignty & Infrastructure Policy"),
        "sovereignty_badge_text": str(getattr(master, "sovereignty_badge_text", "All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure.") or "All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure."),
        "metadata": master.metadata_json or {},
    }

    response_payload = PublicLandingResponse(
        platform_settings=platform_settings_dict,
        sections=sections_read,
        sections_map=sections_map,
        cached_at=datetime.now(timezone.utc),
    )

    _landing_cache["data"] = response_payload
    _landing_cache["expires_at"] = now + 5.0  # short TTL: invalidation is per-process, so keep workers near-consistent
    return response_payload


@router.get("/api/v1/admin/landing/sections", response_model=List[LandingSectionRead])
def get_admin_landing_sections(
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """SuperAdmin management endpoint returning all landing sections."""
    sections = (
        db.query(PlatformLandingSection)
        .order_by(PlatformLandingSection.sort_order.asc(), PlatformLandingSection.section_key.asc())
        .all()
    )
    if not sections:
        # Auto seed if empty
        for item in DEFAULT_LANDING_SECTIONS_PAYLOAD:
            s = PlatformLandingSection(
                id=item["id"],
                section_key=item["section_key"],
                locale=item["locale"],
                title=item["title"],
                subtitle=item["subtitle"],
                content_data=item["content_data"],
                sort_order=item["sort_order"],
                is_visible=item["is_visible"],
            )
            db.add(s)
        db.commit()
        sections = (
            db.query(PlatformLandingSection)
            .order_by(PlatformLandingSection.sort_order.asc())
            .all()
        )
    return [LandingSectionRead.model_validate(s) for s in sections]


@router.put("/api/v1/admin/landing/sections/{section_key}", response_model=LandingSectionRead)
@router.put("/api/v1/platform/landing/sections/{section_key}", response_model=LandingSectionRead)
@router.patch("/api/v1/platform/landing/sections/{section_key}", response_model=LandingSectionRead)
def update_admin_landing_section(
    section_key: str,
    payload: LandingSectionUpdate,
    request: Request,
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """Update section copy, badges, CTA URLs, icons, and matrices."""
    # If section is hero, keep content_data and top-level fields bi-directionally aligned
    if section_key == "hero" and payload.content_data is not None:
        c = dict(payload.content_data)
        if c.get("headline") and not payload.title:
            payload.title = str(c["headline"])
        elif payload.title and not c.get("headline"):
            c["headline"] = payload.title

        if c.get("subheadline") and not payload.subtitle:
            payload.subtitle = str(c["subheadline"])
        elif payload.subtitle and not c.get("subheadline"):
            c["subheadline"] = payload.subtitle

        if c.get("badge_text") and not c.get("badge"):
            c["badge"] = c["badge_text"]
        elif c.get("badge") and not c.get("badge_text"):
            c["badge_text"] = c["badge"]

        if c.get("primary_cta_label") or c.get("primary_cta_url"):
            pri = c.get("cta_primary") if isinstance(c.get("cta_primary"), dict) else {}
            c["cta_primary"] = {
                "label": c.get("primary_cta_label") or pri.get("label") or "Deploy Workspace",
                "url": c.get("primary_cta_url") or pri.get("url") or "/register",
            }
        if c.get("secondary_cta_label") or c.get("secondary_cta_url"):
            sec = c.get("cta_secondary") if isinstance(c.get("cta_secondary"), dict) else {}
            c["cta_secondary"] = {
                "label": c.get("secondary_cta_label") or sec.get("label") or "Console Sign In",
                "url": c.get("secondary_cta_url") or sec.get("url") or "/login",
            }
        payload.content_data = c
    elif section_key == "footer" and payload.content_data is not None:
        c = dict(payload.content_data)
        if c.get("contact_phone") and not c.get("phone"):
            c["phone"] = c["contact_phone"]
        elif c.get("phone") and not c.get("contact_phone"):
            c["contact_phone"] = c["phone"]

        loc = c.get("contact_location") or c.get("contact_address") or c.get("location_text")
        if loc:
            c["contact_location"] = loc
            c["contact_address"] = loc
            c["location_text"] = loc
        payload.content_data = c
    elif section_key in ("pricing_matrix", "pricing") and payload.content_data is not None:
        c = dict(payload.content_data)
        cat_tiers = _get_catalog_pricing_tiers(db)
        if cat_tiers:
            c["tiers"] = cat_tiers
        payload.content_data = c

    section = (
        db.query(PlatformLandingSection)
        .filter(PlatformLandingSection.section_key == section_key)
        .first()
    )
    if not section:
        # Create dynamically if not exists
        section = PlatformLandingSection(
            id=f"sec-{section_key}-{secrets_id()}",
            section_key=section_key,
            locale=payload.locale or "en",
            title=payload.title,
            subtitle=payload.subtitle,
            content_data=payload.content_data or {},
            sort_order=payload.sort_order if payload.sort_order is not None else 0,
            is_visible=payload.is_visible if payload.is_visible is not None else True,
        )
        db.add(section)
    else:
        if payload.title is not None:
            section.title = payload.title
        if payload.subtitle is not None:
            section.subtitle = payload.subtitle
        if payload.content_data is not None:
            section.content_data = payload.content_data
        if payload.sort_order is not None:
            section.sort_order = payload.sort_order
        if payload.is_visible is not None:
            section.is_visible = payload.is_visible
        if payload.locale is not None:
            section.locale = payload.locale
        section.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(section)

    # Invalidate cache
    invalidate_landing_cache()

    # Append audit log
    try:
        append_audit_from_context(
            db,
            build_audit_context(
                request,
                actor_id=uuid.UUID(admin["user_id"]) if admin.get("user_id") else None,
                actor_identifier=admin.get("identity") or "superadmin",
            ),
            action=f"UPDATE_LANDING_SECTION_{section_key.upper()}",
            outcome="SUCCESS",
            tenant_id=None,
        )
        db.commit()
    except Exception:
        db.rollback()

    return LandingSectionRead.model_validate(section)


@router.post("/api/v1/admin/landing/reset-default", response_model=List[LandingSectionRead])
def reset_landing_sections_to_default(
    request: Request,
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """Seed or restore initial production landing values."""
    for item in DEFAULT_LANDING_SECTIONS_PAYLOAD:
        existing = (
            db.query(PlatformLandingSection)
            .filter(PlatformLandingSection.section_key == item["section_key"])
            .first()
        )
        if existing:
            existing.title = str(item["title"])
            existing.subtitle = str(item["subtitle"])
            existing.content_data = dict(item["content_data"])  # type: ignore[assignment]
            existing.sort_order = int(item["sort_order"])
            existing.is_visible = bool(item["is_visible"])
            existing.locale = str(item["locale"])
            existing.updated_at = datetime.now(timezone.utc)
        else:
            s = PlatformLandingSection(
                id=str(item["id"]),
                section_key=str(item["section_key"]),
                locale=str(item["locale"]),
                title=str(item["title"]),
                subtitle=str(item["subtitle"]),
                content_data=dict(item["content_data"]),  # type: ignore[assignment]
                sort_order=int(item["sort_order"]),
                is_visible=bool(item["is_visible"]),
            )
            db.add(s)

    db.commit()
    invalidate_landing_cache()

    # Audit
    try:
        append_audit_from_context(
            db,
            build_audit_context(
                request,
                actor_id=uuid.UUID(admin["user_id"]) if admin.get("user_id") else None,
                actor_identifier=admin.get("identity") or "superadmin",
            ),
            action="RESET_LANDING_SECTIONS_FACTORY_DEFAULT",
            outcome="SUCCESS",
            tenant_id=None,
        )
        db.commit()
    except Exception:
        db.rollback()

    sections = (
        db.query(PlatformLandingSection)
        .order_by(PlatformLandingSection.sort_order.asc())
        .all()
    )
    return [LandingSectionRead.model_validate(s) for s in sections]


def secrets_id() -> str:
    return uuid.uuid4().hex[:8]


# ==============================================================================
# SECTION 2: UNIFIED PLATFORM MASTER SETTINGS & LOGO UPLOAD API
# ==============================================================================

def _serialize_master_settings(setting: PlatformMasterSetting) -> PlatformMasterSettingsRead:
    return PlatformMasterSettingsRead(
        id=str(setting.id),
        platform_name=str(setting.platform_name),
        platform_tagline=str(setting.platform_tagline) if setting.platform_tagline else None,
        logo_light_url=str(setting.logo_light_url) if setting.logo_light_url else None,
        logo_dark_url=str(setting.logo_dark_url) if setting.logo_dark_url else None,
        favicon_url=str(setting.favicon_url) if setting.favicon_url else None,
        primary_color=str(setting.primary_color),
        secondary_color=str(setting.secondary_color),
        support_email=str(setting.support_email) if setting.support_email else None,
        legal_terms_url=str(setting.legal_terms_url) if setting.legal_terms_url else None,
        privacy_policy_url=str(setting.privacy_policy_url) if setting.privacy_policy_url else None,
        custom_css=str(setting.custom_css) if setting.custom_css else None,
        enable_sovereignty_badge=bool(getattr(setting, "enable_sovereignty_badge", True)),
        sovereignty_badge_title=str(getattr(setting, "sovereignty_badge_title", "Data Sovereignty & Infrastructure Policy") or "Data Sovereignty & Infrastructure Policy"),
        sovereignty_badge_text=str(getattr(setting, "sovereignty_badge_text", "All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure.") or "All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure."),
        metadata=dict(setting.metadata_json) if setting.metadata_json else {},
        updated_at=setting.updated_at,
        updated_by=str(setting.updated_by) if setting.updated_by else None,
    )


@router.get("/api/v1/admin/platform/settings", response_model=PlatformMasterSettingsRead)
@router.get("/api/v1/platform/master-settings", response_model=PlatformMasterSettingsRead)
def get_unified_platform_settings(
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """Retrieve unified platform master governance settings."""
    setting = _get_or_create_master_settings(db)
    return _serialize_master_settings(setting)


@router.patch("/api/v1/admin/platform/settings", response_model=PlatformMasterSettingsRead)
@router.put("/api/v1/admin/platform/settings", response_model=PlatformMasterSettingsRead)
@router.put("/api/v1/platform/master-settings", response_model=PlatformMasterSettingsRead)
@router.patch("/api/v1/platform/master-settings", response_model=PlatformMasterSettingsRead)
def update_unified_platform_settings(
    payload: PlatformMasterSettingsUpdate,
    request: Request,
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """Update unified platform branding, global defaults, and white-label rules."""
    setting = _get_or_create_master_settings(db)

    if payload.platform_name is not None:
        setting.platform_name = payload.platform_name.strip()
    if payload.platform_tagline is not None:
        setting.platform_tagline = payload.platform_tagline.strip()
    if payload.logo_light_url is not None:
        setting.logo_light_url = payload.logo_light_url.strip()
    if payload.logo_dark_url is not None:
        setting.logo_dark_url = payload.logo_dark_url.strip()
    if payload.favicon_url is not None:
        setting.favicon_url = payload.favicon_url.strip()
    if payload.primary_color is not None:
        setting.primary_color = payload.primary_color.strip()
    if payload.secondary_color is not None:
        setting.secondary_color = payload.secondary_color.strip()
    if payload.support_email is not None:
        setting.support_email = payload.support_email.strip()
    if payload.legal_terms_url is not None:
        setting.legal_terms_url = payload.legal_terms_url.strip()
    if payload.privacy_policy_url is not None:
        setting.privacy_policy_url = payload.privacy_policy_url.strip()
    if payload.custom_css is not None:
        setting.custom_css = payload.custom_css
    if payload.enable_sovereignty_badge is not None:
        setting.enable_sovereignty_badge = payload.enable_sovereignty_badge
    if payload.sovereignty_badge_title is not None:
        setting.sovereignty_badge_title = payload.sovereignty_badge_title.strip()
    if payload.sovereignty_badge_text is not None:
        setting.sovereignty_badge_text = payload.sovereignty_badge_text.strip()
    if payload.metadata is not None:
        current_meta = dict(setting.metadata_json or {})
        current_meta.update(payload.metadata)
        setting.metadata_json = current_meta

    setting.updated_at = datetime.now(timezone.utc)
    setting.updated_by = admin.get("identity")

    # Sync to legacy site_settings and platform_settings for 100% backwards compatibility
    try:
        legacy_sync = {
            "site_name": setting.platform_name,
            "site_tagline": setting.platform_tagline or "",
            "site_description": setting.platform_tagline or "",
            "site_logo": setting.logo_light_url or "/oxengl-wordmark.svg",
            "contact_email": setting.support_email or "contact@oxengl.me",
        }
        for k, v in legacy_sync.items():
            s_row = db.query(SiteSetting).filter(SiteSetting.key == k).first()
            if s_row:
                s_row.value = str(v)
            else:
                db.add(SiteSetting(key=k, value=str(v)))

        # Sync platform_settings['branding']
        p_row = db.query(PlatformSetting).filter(PlatformSetting.setting_key == "branding").first()
        b_val = {
            "platform_name": setting.platform_name,
            "brand_name": setting.platform_name,
            "default_logo": setting.logo_light_url or "/oxengl-logo.svg",
            "logo_url": setting.logo_light_url or "/oxengl-logo.svg",
            "default_favicon": setting.favicon_url or "/favicon.ico",
            "favicon_url": setting.favicon_url or "/favicon.ico",
            "primary_color": setting.primary_color,
            "accent_color": setting.secondary_color,
            "support_email": setting.support_email,
        }
        if p_row:
            p_row.setting_value = b_val
        else:
            db.add(PlatformSetting(setting_key="branding", setting_value=b_val))
    except Exception as exc:
        logger.warning("Legacy sync warning: %s", exc)

    db.commit()
    db.refresh(setting)
    invalidate_landing_cache()

    # Append audit
    try:
        append_audit_from_context(
            db,
            build_audit_context(
                request,
                actor_id=uuid.UUID(admin["user_id"]) if admin.get("user_id") else None,
                actor_identifier=admin.get("identity") or "superadmin",
            ),
            action="UPDATE_PLATFORM_MASTER_SETTINGS",
            outcome="SUCCESS",
            tenant_id=None,
        )
        db.commit()
    except Exception:
        db.rollback()

    return _serialize_master_settings(setting)


class LogoUploadBody(BaseModel):
    asset_type: Optional[str] = "primary_logo"
    fileName: Optional[str] = None
    fileBuffer: Optional[str] = None


@router.post("/api/v1/admin/platform/upload-logo")
async def upload_platform_logo(
    request: Request,
    file: Optional[UploadFile] = File(None),
    asset_type: Optional[str] = Query(None),
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """S3/local file upload handler for primary logo, light/dark logos, and favicon."""
    raw_bytes: bytes = b""
    original_filename: str = "logo.png"
    target_type: str = asset_type or "primary_logo"

    # Check multipart file
    if file is not None:
        raw_bytes = await file.read()
        original_filename = file.filename or "uploaded_logo.png"
    else:
        # Check if sent as JSON base64
        try:
            body = await request.json()
            if isinstance(body, dict):
                target_type = body.get("asset_type") or target_type
                original_filename = body.get("fileName") or original_filename
                buffer_str = body.get("fileBuffer") or ""
                if "," in buffer_str:
                    buffer_str = buffer_str.split(",", 1)[1]
                if buffer_str:
                    raw_bytes = base64.b64decode(buffer_str)
        except Exception:
            pass

    if not raw_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid file payload received.")

    if len(raw_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds 5MB limit.")

    # Validate file type
    matched_ext: Optional[str] = None
    for content_type, (ext, validator) in _ALLOWED_LOGO_FORMATS.items():
        if validator(raw_bytes):
            matched_ext = ext
            break

    if not matched_ext:
        # Fallback inspection by filename
        ext_lower = Path(original_filename).suffix.lower()
        if ext_lower in (".jpg", ".jpeg", ".png", ".webp", ".svg", ".ico"):
            matched_ext = ext_lower
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported image format. Allowed: PNG, JPEG, WebP, SVG, ICO.",
            )

    # Save to storage
    file_id = f"logo-{uuid.uuid4().hex[:12]}{matched_ext}"
    dest_path = LOGO_STORAGE_DIR / file_id
    with open(dest_path, "wb") as f:
        f.write(raw_bytes)

    logo_url = f"/api/v1/platform/logo/{file_id}"

    # Update platform_master_settings
    setting = _get_or_create_master_settings(db)
    norm_type = (target_type or "").lower().replace("-", "_")

    if norm_type in ("logo_light", "light", "light_logo"):
        setting.logo_light_url = logo_url
    elif norm_type in ("logo_dark", "dark", "dark_logo"):
        setting.logo_dark_url = logo_url
    elif norm_type in ("favicon", "icon", "default_favicon"):
        setting.favicon_url = logo_url
    else:  # primary_logo or logo
        setting.logo_light_url = logo_url
        setting.logo_dark_url = logo_url

    setting.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(setting)
    invalidate_landing_cache()

    return {
        "success": True,
        "url": logo_url,
        "asset_type": target_type,
        "filename": file_id,
        "size_bytes": len(raw_bytes),
    }


@router.get("/api/v1/platform/logo/{filename}")
def serve_platform_logo(filename: str):
    """Serve uploaded platform branding assets with caching headers."""
    safe_name = Path(filename).name
    file_path = LOGO_STORAGE_DIR / safe_name
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found")

    ext = file_path.suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
    }
    return FileResponse(
        str(file_path),
        media_type=media_types.get(ext, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ==============================================================================
# SECTION 3: BROADCAST & ANNOUNCEMENT SUBSYSTEM
# ==============================================================================

@router.get("/api/v1/broadcasts/active", response_model=List[SystemBroadcastRead])
def get_active_broadcasts(db: Session = Depends(get_db)):
    """Public/Authenticated tenant endpoint for live platform announcement banners."""
    now = datetime.now(timezone.utc)
    broadcasts = (
        db.query(SystemBroadcast)
        .filter(
            SystemBroadcast.is_active.is_(True),
            SystemBroadcast.starts_at <= now,
            or_(SystemBroadcast.expires_at.is_(None), SystemBroadcast.expires_at >= now),
        )
        .order_by(
            # Critical and maintenance first
            desc(SystemBroadcast.severity == "critical"),
            desc(SystemBroadcast.severity == "maintenance"),
            desc(SystemBroadcast.severity == "warning"),
            desc(SystemBroadcast.starts_at),
        )
        .all()
    )
    return [SystemBroadcastRead.model_validate(b) for b in broadcasts]


@router.get("/api/v1/admin/broadcasts", response_model=List[SystemBroadcastRead])
def list_admin_broadcasts(
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """SuperAdmin management endpoint listing all system broadcasts."""
    broadcasts = (
        db.query(SystemBroadcast)
        .order_by(desc(SystemBroadcast.created_at))
        .all()
    )
    return [SystemBroadcastRead.model_validate(b) for b in broadcasts]


@router.post("/api/v1/admin/broadcasts", response_model=SystemBroadcastRead)
def create_system_broadcast(
    payload: SystemBroadcastCreate,
    request: Request,
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """SuperAdmin create and activate a new platform broadcast announcement."""
    broadcast = SystemBroadcast(
        id=payload.id or f"broadcast-{uuid.uuid4().hex[:10]}",
        title=payload.title.strip(),
        message=payload.message.strip(),
        severity=payload.severity or "info",
        is_active=payload.is_active if payload.is_active is not None else True,
        starts_at=payload.starts_at or datetime.now(timezone.utc),
        expires_at=payload.expires_at,
        is_dismissible=payload.is_dismissible if payload.is_dismissible is not None else True,
        target_scope=payload.target_scope or "all",
        created_at=datetime.now(timezone.utc),
        created_by=admin.get("identity"),
    )
    db.add(broadcast)
    db.commit()
    db.refresh(broadcast)

    # Broadcast event via SSE
    trigger_broadcast_notification("broadcast_created", SystemBroadcastRead.model_validate(broadcast).model_dump(mode="json"))

    # Audit
    try:
        append_audit_from_context(
            db,
            build_audit_context(
                request,
                actor_id=uuid.UUID(admin["user_id"]) if admin.get("user_id") else None,
                actor_identifier=admin.get("identity") or "superadmin",
            ),
            action=f"CREATE_BROADCAST_{broadcast.severity.upper()}",
            outcome="SUCCESS",
            tenant_id=None,
        )
        db.commit()
    except Exception:
        db.rollback()

    return SystemBroadcastRead.model_validate(broadcast)


@router.patch("/api/v1/admin/broadcasts/{broadcast_id}", response_model=SystemBroadcastRead)
@router.put("/api/v1/admin/broadcasts/{broadcast_id}", response_model=SystemBroadcastRead)
def update_system_broadcast(
    broadcast_id: str,
    payload: SystemBroadcastUpdate,
    request: Request,
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """SuperAdmin update or toggle a platform alert."""
    broadcast = db.query(SystemBroadcast).filter(SystemBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Broadcast not found")

    if payload.title is not None:
        broadcast.title = payload.title.strip()
    if payload.message is not None:
        broadcast.message = payload.message.strip()
    if payload.severity is not None:
        broadcast.severity = payload.severity
    if payload.is_active is not None:
        broadcast.is_active = payload.is_active
    if payload.starts_at is not None:
        broadcast.starts_at = payload.starts_at
    if payload.expires_at is not None:
        broadcast.expires_at = payload.expires_at
    if payload.is_dismissible is not None:
        broadcast.is_dismissible = payload.is_dismissible
    if payload.target_scope is not None:
        broadcast.target_scope = payload.target_scope

    db.commit()
    db.refresh(broadcast)

    # Broadcast event via SSE
    trigger_broadcast_notification("broadcast_updated", SystemBroadcastRead.model_validate(broadcast).model_dump(mode="json"))

    return SystemBroadcastRead.model_validate(broadcast)


@router.delete("/api/v1/admin/broadcasts/{broadcast_id}")
def delete_system_broadcast(
    broadcast_id: str,
    request: Request,
    admin: Dict[str, Any] = Depends(require_super_admin_principal),
    db: Session = Depends(get_db),
):
    """SuperAdmin delete a platform alert."""
    broadcast = db.query(SystemBroadcast).filter(SystemBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Broadcast not found")

    db.delete(broadcast)
    db.commit()

    trigger_broadcast_notification("broadcast_deleted", {"id": broadcast_id})
    return {"success": True, "deleted_id": broadcast_id}


@router.get("/api/v1/broadcasts/stream")
async def broadcast_event_stream(request: Request):
    """Server-Sent Events (SSE) streaming endpoint for instantaneous broadcast pushes."""
    subscriber_queue: asyncio.Queue = asyncio.Queue()
    _broadcast_subscribers.append(subscriber_queue)

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # Welcome handshake event
            yield f"event: connected\ndata: {json.dumps({'status': 'stream_active', 'timestamp': time.time()})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(subscriber_queue.get(), timeout=20.0)
                    evt = msg.get("event", "broadcast")
                    payload_json = json.dumps(msg.get("data", {}))
                    yield f"event: {evt}\ndata: {payload_json}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat comment to keep HTTP connection alive
                    yield ": keep-alive\n\n"
        finally:
            if subscriber_queue in _broadcast_subscribers:
                _broadcast_subscribers.remove(subscriber_queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
