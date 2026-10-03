"""
OxenGL Standardized Two-Tier Dynamic Branding & Platform Settings Router.
File: backend/app/api/v1/branding.py

Tier 1: Global Platform Admin Portal Level (platform_settings)
Tier 2: Tenant Workspace Level (tenant_branding & organizations)
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.database import SessionLocal, get_db
from backend.models import MasterTenant, MasterUser, Organization, PlatformSetting, ResCompany, ResUser, TenantBranding
from backend.schemas import (
    PlatformBrandingResponse,
    PlatformBrandingUpdate,
    TenantBrandingResponse,
    TenantBrandingUpdate,
)
from backend.app.core.middleware import resolve_tenant_from_host
from backend.two_tier_auth import verify_two_tier_jwt

logger = logging.getLogger("oxengl.branding")

router = APIRouter(tags=["Dynamic Branding"])

DEFAULT_GLOBAL_BRANDING = {
    "platform_name": "OxenGL Enterprise",
    "brand_name": "OxenGL Enterprise",
    "default_logo": "/oxengl-logo.svg",
    "logo_url": "/oxengl-logo.svg",
    "default_favicon": "/favicon.ico",
    "favicon_url": "/favicon.ico",
    "primary_color": "#f97316",
    "accent_color": "#0f172a",
    "company_name_ar": "منظومة أوكسن السحابية",
    "company_name_en": "OxenGL Enterprise Cloud",
    "support_email": "contact@oxengl.me",
    "support_phone": "+966 50 123 4567",
}

# Phase 4: Tenant Custom Landing Engine fields on tenant_branding
LANDING_FIELDS = (
    "landing_hero_title",
    "landing_hero_subtitle",
    "landing_cta_label",
    "landing_cta_url",
    "landing_theme_mode",
)


def _landing_fields(branding: Any) -> Dict[str, Any]:
    """Extract landing page content from a TenantBranding row (None-safe)."""
    return {field: getattr(branding, field, None) for field in LANDING_FIELDS}


# ==============================================================================
# Write authorization for tenant branding
# ==============================================================================

# Master (control-plane) roles, as stored in master_users.role (CHECK: super_admin | admin | user),
# that may administer platform branding and ANY tenant's branding. 'user' is excluded.
_PLATFORM_ADMIN_ROLES = {"super_admin", "admin"}
# Tenant-plane roles allowed to edit THEIR OWN tenant's branding.
# Deliberately explicit: does not reuse normalize_role(), which maps e.g. data_entry -> Admin.
_TENANT_ADMIN_ROLES = {
    "OWNER",
    "ADMIN",
    "ADMINISTRATOR",
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "COMPANY_OWNER",
    "COMPANY_ADMIN",
}


def _norm_role(raw: Any) -> str:
    return str(raw or "").strip().upper().replace(" ", "_").replace("-", "_")


def _authenticate_branding_editor(request: Request, action: str = "modify tenant branding") -> Dict[str, Any]:
    """Validate the caller's JWT (Bearer header or oxengl_session cookie). Raises 401 if absent/invalid.

    ``action`` only customises the 401 message (e.g. "issue platform licenses").
    """
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization") or ""
    token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
    if not token:
        token = (request.cookies.get("oxengl_session") or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Authentication required to {action}.")

    claims: Optional[Dict[str, Any]] = None
    for tier in ("master", "tenant"):
        try:
            claims = verify_two_tier_jwt(token, expected_tier=tier)
            break
        except HTTPException:
            continue
    if not claims:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired authentication token.")

    # Short-lived 2FA handshake tokens share the tenant secret; they must never authorize writes.
    if claims.get("purpose"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Handshake tokens cannot be used for this operation.")
    return claims


def _require_active_platform_admin(claims: Dict[str, Any], db: Session) -> MasterUser:
    """
    Given verified claims, require a master-plane token whose user is ACTIVE in master_users with a
    platform admin role. Role/active status are read from the database, not trusted from the token,
    so demotions and deactivations take effect immediately. Raises 403 otherwise.
    """
    if claims.get("tier") != "master":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform administrator token required.")
    try:
        user_id = uuid.UUID(str(claims.get("sub")))
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject.")

    user = db.scalar(select(MasterUser).where(MasterUser.id == user_id, MasterUser.is_active.is_(True)))
    if not user or str(user.role or "").strip().lower() not in _PLATFORM_ADMIN_ROLES:
        logger.warning("Denied platform-admin action: sub=%s role=%s", claims.get("sub"), getattr(user, "role", None))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform administrator privileges required.")
    return user


def _authorize_tenant_branding_write(
    claims: Dict[str, Any],
    org: Optional[Organization],
    company: Optional[ResCompany],
    db: Session,
) -> None:
    """Allow active platform admins (DB-verified), or tenant-plane admins bound to the target tenant. Raises 403 otherwise."""
    role = _norm_role(claims.get("role"))
    tier = claims.get("tier")

    if tier == "master":
        _require_active_platform_admin(claims, db)
        return

    if tier != "tenant" or role not in _TENANT_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only tenant owners or administrators can modify branding.")

    target_ids = {str(x).lower() for x in ((org.company_id if org else None), (company.id if company else None)) if x}
    claim_id = str(claims.get("tenant_id") or claims.get("company_id") or "").strip().lower()
    if claim_id:
        if claim_id in target_ids:
            return
    else:
        target_slugs = {
            str(s).lower()
            for s in ((org.slug if org else None), (company.slug if company else None), (company.domain_slug if company else None))
            if s
        }
        claim_slug = str(claims.get("tenant_slug") or claims.get("domain_slug") or "").strip().lower()
        if claim_slug and claim_slug in target_slugs:
            return

    logger.warning(
        "Denied cross-tenant branding write: sub=%s claim_tenant=%s target=%s",
        claims.get("sub"), claim_id or claims.get("tenant_slug"), sorted(target_ids),
    )
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to modify this tenant's branding.")


def _resolve_tenant_entity(
    request: Request,
    tenant_identifier: Optional[str] = None,
    db: Session = None,
) -> Optional[tuple[Organization, Optional[ResCompany]]]:
    """
    Robust resolver for tenant organization and linked ResCompany from:
    1. Explicit identifier (int id, UUID string, or slug)
    2. Request headers (X-Tenant-ID, X-Company-ID, X-Tenant-Slug, X-Subdomain)
    3. Query parameters (tenant_id, company_id, slug)
    4. Subdomain or custom domain via Host / X-Forwarded-Host header
    5. Authorization JWT Bearer token claims
    """
    raw_target = (tenant_identifier or "").strip()

    # 1. Inspect headers if no explicit parameter
    if not raw_target:
        raw_target = (
            request.headers.get("X-Tenant-ID")
            or request.headers.get("x-tenant-id")
            or request.headers.get("X-Company-ID")
            or request.headers.get("x-company-id")
            or request.headers.get("X-Tenant-Slug")
            or request.headers.get("x-tenant-slug")
            or request.headers.get("X-Subdomain")
            or request.headers.get("x-subdomain")
            or request.query_params.get("tenant_id")
            or request.query_params.get("company_id")
            or request.query_params.get("slug")
            or ""
        ).strip()

    # 2. Inspect JWT Bearer Token if present
    if not raw_target:
        auth_header = request.headers.get("Authorization") or request.headers.get("authorization") or ""
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
            try:
                try:
                    claims = verify_two_tier_jwt(token, expected_tier="tenant")
                except Exception:
                    claims = verify_two_tier_jwt(token, expected_tier="master")
                raw_target = str(claims.get("tenant_id") or claims.get("company_id") or claims.get("tenant_slug") or "")
            except Exception:
                pass

    # 3. Inspect Host / Subdomain
    if not raw_target:
        raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        if raw_host:
            host_tenant = resolve_tenant_from_host(raw_host, db=db)
            if host_tenant:
                raw_target = host_tenant.get("tenant_id") or host_tenant.get("company_id") or host_tenant.get("tenant_slug") or ""

    if not raw_target:
        return None

    # Try resolving via Integer ID on organizations table
    try:
        int_id = int(raw_target)
        org = db.query(Organization).filter(Organization.id == int_id).first()
        if org:
            company = db.query(ResCompany).filter(ResCompany.id == org.company_id).first() if org.company_id else None
            return org, company
    except (ValueError, TypeError):
        pass

    # Try resolving via UUID on company_id / res_companies
    try:
        target_uuid = uuid.UUID(raw_target)
        company = db.query(ResCompany).filter(ResCompany.id == target_uuid).first()
        org = db.query(Organization).filter(Organization.company_id == target_uuid).first()
        if not org and company:
            # Auto-sync Organization boundary for ResCompany
            org = Organization(
                name=company.name,
                slug=company.slug or company.domain_slug or f"company-{company.id}",
                company_id=company.id,
            )
            db.add(org)
            db.commit()
            db.refresh(org)
        if org:
            return org, company
    except (ValueError, TypeError):
        pass

    # Try resolving via Slug or Custom Domain on Organization and ResCompany
    clean_slug = raw_target.lower()
    org = db.query(Organization).filter(
        or_(
            func.lower(Organization.slug) == clean_slug,
            func.lower(Organization.slug) == clean_slug.replace("_", "-"),
            func.lower(Organization.slug) == clean_slug.replace("-", "_"),
        )
    ).first()

    company = db.query(ResCompany).filter(
        or_(
            func.lower(ResCompany.slug) == clean_slug,
            func.lower(ResCompany.domain_slug) == clean_slug,
            func.lower(ResCompany.custom_domain) == clean_slug,
        )
    ).first()

    if not org and company:
        org = db.query(Organization).filter(Organization.company_id == company.id).first()
        if not org:
            org = Organization(
                name=company.name,
                slug=company.slug or company.domain_slug or f"company-{company.id}",
                company_id=company.id,
            )
            db.add(org)
            db.commit()
            db.refresh(org)

    if org:
        if not company and org.company_id:
            company = db.query(ResCompany).filter(ResCompany.id == org.company_id).first()
        return org, company

    return None


# ==============================================================================
# Tier 1: Platform Level Global Dynamic Branding
# ==============================================================================

@router.get("/api/v1/platform/branding", response_model=PlatformBrandingResponse)
def get_platform_branding(db: Session = Depends(get_db)):
    """
    Public Tier 1 endpoint: Returns global platform branding defaults.
    Accessible publicly without authentication for landing page and login portals.
    """
    try:
        setting = db.query(PlatformSetting).filter(PlatformSetting.setting_key == "global_branding").first()
    except Exception as exc:
        logger.warning("Failed to query platform_settings from current session: %s. Falling back to SessionLocal().", exc)
        try:
            db.rollback()
        except Exception:
            pass
        with SessionLocal() as central_sess:
            setting = central_sess.query(PlatformSetting).filter(PlatformSetting.setting_key == "global_branding").first()

    if setting and setting.setting_value:
        merged = {**DEFAULT_GLOBAL_BRANDING, **setting.setting_value}
        return PlatformBrandingResponse(**merged)

    return PlatformBrandingResponse(**DEFAULT_GLOBAL_BRANDING)


@router.put("/api/v1/platform/branding", response_model=PlatformBrandingResponse)
@router.put("/api/v1/admin/platform/branding", response_model=PlatformBrandingResponse)
def update_platform_branding(
    payload: PlatformBrandingUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Platform Admin Tier: Updates global platform settings & default branding.
    Requires an authenticated, active platform administrator (master plane, role super_admin/admin).
    """
    claims = _authenticate_branding_editor(request, action="modify platform branding")
    _require_active_platform_admin(claims, db)

    from sqlalchemy.orm.attributes import flag_modified

    setting = db.query(PlatformSetting).filter(PlatformSetting.setting_key == "global_branding").first()
    current_vals = dict(setting.setting_value) if setting and setting.setting_value else dict(DEFAULT_GLOBAL_BRANDING)

    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        if v is not None:
            current_vals[k] = v
            if k == "logo_url" and "default_logo" not in updates:
                current_vals["default_logo"] = v
            elif k == "default_logo" and "logo_url" not in updates:
                current_vals["logo_url"] = v
            elif k == "favicon_url" and "default_favicon" not in updates:
                current_vals["default_favicon"] = v
            elif k == "default_favicon" and "favicon_url" not in updates:
                current_vals["favicon_url"] = v
            elif k == "platform_name" and "brand_name" not in updates:
                current_vals["brand_name"] = v
            elif k == "brand_name" and "platform_name" not in updates:
                current_vals["platform_name"] = v

    if not setting:
        setting = PlatformSetting(
            setting_key="global_branding",
            setting_value=dict(current_vals),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(setting)
    else:
        setting.setting_value = dict(current_vals)
        flag_modified(setting, "setting_value")
        setting.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(setting)


    merged = {**DEFAULT_GLOBAL_BRANDING, **setting.setting_value}
    return PlatformBrandingResponse(**merged)


# ==============================================================================
# Tier 2: Tenant Workspace Level Dynamic Branding
# ==============================================================================

@router.get("/api/v1/tenant/branding", response_model=TenantBrandingResponse)
def get_tenant_branding(
    request: Request,
    tenant_id: Optional[str] = Query(None, description="Optional tenant UUID, organization ID, or slug"),
    db: Session = Depends(get_db),
):
    """
    Tier 2 endpoint: Tenant-scoped branding retrieval.
    Resolves tenant context via:
    1. Subdomain context or Host header (e.g. client.oxengl.me)
    2. Headers: X-Tenant-ID, X-Company-ID, X-Tenant-Slug
    3. Query parameter: ?tenant_id=...
    4. Authenticated JWT token claims
    """
    resolved = _resolve_tenant_entity(request, tenant_identifier=tenant_id, db=db)
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant workspace context not found. Subdomain, X-Tenant-ID header, or authentication required.",
        )

    org, company = resolved
    target_tenant_uuid = (org.company_id if org and org.company_id else None) or (company.id if company else None)

    # Query tenant_branding table
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == target_tenant_uuid).first()

    if not branding:
        # Auto-seed tenant_branding from ResCompany or defaults
        brand_name = (company.name if company else None) or org.name
        logo_url = (company.ui_logo_url or company.logo_url if company else None) or "/oxengl-logo.svg"
        primary_color = (company.ui_primary_color or company.primary_color if company else None) or "#f97316"
        accent_color = (company.secondary_color if company else None) or "#0f172a"
        custom_domain = (company.custom_domain or company.domain_slug or company.slug if company else None) or org.slug

        branding = TenantBranding(
            tenant_id=target_tenant_uuid,
            brand_name=brand_name,
            logo_url=logo_url,
            favicon_url="/favicon.ico",
            primary_color=primary_color,
            accent_color=accent_color,
            custom_domain=custom_domain,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        try:
            db.add(branding)
            db.commit()
            db.refresh(branding)
        except Exception:
            db.rollback()
            branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == target_tenant_uuid).first()

    return TenantBrandingResponse(
        id=branding.id,
        tenant_id=str(branding.tenant_id) if branding.tenant_id else str(target_tenant_uuid or ""),
        brand_name=branding.brand_name,
        logo_url=branding.logo_url,
        favicon_url=branding.favicon_url,
        primary_color=branding.primary_color,
        accent_color=branding.accent_color,
        custom_domain=branding.custom_domain,
        created_at=branding.created_at,
        updated_at=branding.updated_at,
        **_landing_fields(branding),
    )


@router.get("/api/v1/admin/tenant/{tenant_id}/branding", response_model=TenantBrandingResponse)
@router.get("/api/v1/tenants/{tenant_id}/branding", response_model=TenantBrandingResponse)
def get_specific_tenant_branding(
    tenant_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Lookup branding for a specific tenant ID (integer, UUID, or slug).
    """
    resolved = _resolve_tenant_entity(request, tenant_identifier=tenant_id, db=db)
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant workspace '{tenant_id}' not found.",
        )

    org, company = resolved
    target_tenant_uuid = (org.company_id if org and org.company_id else None) or (company.id if company else None)
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == target_tenant_uuid).first()

    if not branding:
        brand_name = (company.name if company else None) or org.name
        logo_url = (company.ui_logo_url or company.logo_url if company else None) or "/oxengl-logo.svg"
        primary_color = (company.ui_primary_color or company.primary_color if company else None) or "#f97316"
        accent_color = (company.secondary_color if company else None) or "#0f172a"
        custom_domain = (company.custom_domain or company.domain_slug or company.slug if company else None) or org.slug

        branding = TenantBranding(
            tenant_id=target_tenant_uuid,
            brand_name=brand_name,
            logo_url=logo_url,
            favicon_url="/favicon.ico",
            primary_color=primary_color,
            accent_color=accent_color,
            custom_domain=custom_domain,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        try:
            db.add(branding)
            db.commit()
            db.refresh(branding)
        except Exception:
            db.rollback()
            branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == target_tenant_uuid).first()

    return TenantBrandingResponse(
        id=branding.id,
        tenant_id=str(branding.tenant_id) if branding.tenant_id else str(target_tenant_uuid or ""),
        brand_name=branding.brand_name,
        logo_url=branding.logo_url,
        favicon_url=branding.favicon_url,
        primary_color=branding.primary_color,
        accent_color=branding.accent_color,
        custom_domain=branding.custom_domain,
        created_at=branding.created_at,
        updated_at=branding.updated_at,
        **_landing_fields(branding),
    )


@router.put("/api/v1/admin/tenant/{tenant_id}/branding", response_model=TenantBrandingResponse)
@router.put("/api/v1/tenants/{tenant_id}/branding", response_model=TenantBrandingResponse)
def update_tenant_branding(
    tenant_id: str,
    payload: TenantBrandingUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Tier 2 Admin Endpoint: Update or override a specific tenant's visual identity.
    Accepts tenant integer ID, company UUID, or slug.
    Synchronizes across tenant_branding and linked ResCompany record.

    Authorization: master-plane super admin, or a tenant-plane owner/admin of THIS tenant.
    """
    # Authenticate before resolving: resolution may persist Organization sync rows.
    claims = _authenticate_branding_editor(request)

    resolved = _resolve_tenant_entity(request, tenant_identifier=tenant_id, db=db)
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target tenant workspace '{tenant_id}' not found.",
        )

    org, company = resolved
    _authorize_tenant_branding_write(claims, org, company, db)
    target_tenant_uuid = (org.company_id if org and org.company_id else None) or (company.id if company else None)
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == target_tenant_uuid).first()

    now = datetime.now(timezone.utc)
    if not branding:
        branding = TenantBranding(
            tenant_id=target_tenant_uuid,
            brand_name=payload.brand_name or ((company.name if company else None) or org.name),
            logo_url=payload.logo_url or ((company.ui_logo_url or company.logo_url if company else None) or "/oxengl-logo.svg"),
            favicon_url=payload.favicon_url or "/favicon.ico",
            primary_color=payload.primary_color or ((company.ui_primary_color or company.primary_color if company else None) or "#f97316"),
            accent_color=payload.accent_color or ((company.secondary_color if company else None) or "#0f172a"),
            custom_domain=payload.custom_domain or ((company.custom_domain or company.slug if company else None) or org.slug),
            created_at=now,
            updated_at=now,
        )
        db.add(branding)
    else:
        if payload.brand_name is not None:
            branding.brand_name = payload.brand_name
        if payload.logo_url is not None:
            branding.logo_url = payload.logo_url
        if payload.favicon_url is not None:
            branding.favicon_url = payload.favicon_url
        if payload.primary_color is not None:
            branding.primary_color = payload.primary_color
        if payload.accent_color is not None:
            branding.accent_color = payload.accent_color
        if payload.custom_domain is not None:
            branding.custom_domain = payload.custom_domain
        branding.updated_at = now

    # Landing content: only fields explicitly sent are applied; explicit null clears.
    for field in LANDING_FIELDS:
        if field in payload.model_fields_set:
            setattr(branding, field, getattr(payload, field))

    # Also synchronize values back to linked ResCompany if present
    if company:
        if payload.brand_name:
            company.name = payload.brand_name
        if payload.logo_url:
            company.logo_url = payload.logo_url
            company.ui_logo_url = payload.logo_url
        if payload.primary_color:
            company.primary_color = payload.primary_color
            company.ui_primary_color = payload.primary_color
        if payload.accent_color:
            company.secondary_color = payload.accent_color
        if payload.custom_domain:
            company.custom_domain = payload.custom_domain

    db.commit()
    db.refresh(branding)

    return TenantBrandingResponse(
        id=branding.id,
        tenant_id=str(branding.tenant_id) if branding.tenant_id else str(target_tenant_uuid or ""),
        brand_name=branding.brand_name,
        logo_url=branding.logo_url,
        favicon_url=branding.favicon_url,
        primary_color=branding.primary_color,
        accent_color=branding.accent_color,
        custom_domain=branding.custom_domain,
        created_at=branding.created_at,
        updated_at=branding.updated_at,
        **_landing_fields(branding),
    )
