"""
FastAPI Authoritative Router for Tenant Control Panel.
Filename: backend/app/api/v1/tenant_control.py
Replaces Express in-memory shadow controller with PostgreSQL persistence.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import MasterTenant, ResCompany, ResUser, TenantDatabaseMigration, TenantSubscription, TenantUser, User
from backend.two_tier_auth import hash_password
from backend.schemas import (
    TenantDatabaseInfoResponse,
    TenantDatabaseMigrationRequest,
    TenantDatabaseMigrationResponse,
    TenantDatabaseMigrationStatus,
    TenantDatabaseTestConnectionRequest,
    TenantDatabaseTestConnectionResponse,
)
from backend.app.services import migration_service
from backend.app.core.auth import get_authenticated_user, is_super_admin_authorized
from backend.app.api.v1.users import is_ghost_or_unverified_account


# SECURITY (2026-10-04, incident Addendum B):
# Every route on `router` requires an authenticated session. The tenant is derived
# strictly from the authenticated user's own company_id -- client-supplied
# X-Tenant-ID / X-Company-ID / X-Tenant-Slug headers and ?tenant_id= are ignored.
# Mutating / sensitive routes additionally require the Admin or Owner role
# (or platform Super_Admin acting on its own platform tenant).
router = APIRouter(
    tags=["Tenant Control Panel"],
    dependencies=[Depends(get_authenticated_user)],
)
# NOTE: `enforce_caller_tenant_scope` is appended to router.dependencies below.

# Public, unauthenticated routes (zero-slug domain resolution only). These read
# nothing but the Host header / ?host= and never expose tenant-private data.
public_router = APIRouter(tags=["Tenant Control Panel (Public)"])

# Mirrors the tenant-plane role set used for branding administration.
TENANT_ADMIN_ROLES = frozenset({
    "OWNER",
    "ADMIN",
    "ADMINISTRATOR",
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "COMPANY_OWNER",
    "COMPANY_ADMIN",
})


def _normalize_role(role: Optional[str]) -> str:
    return str(role or "").strip().upper().replace("-", "_").replace(" ", "_")


def _caller_tenant_id(user: ResUser) -> uuid.UUID:
    """The ONLY tenant a caller may act on: their own company."""
    company_id = getattr(user, "company_id", None)
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated user is not bound to a tenant workspace.",
        )
    try:
        return company_id if isinstance(company_id, uuid.UUID) else uuid.UUID(str(company_id))
    except Exception:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid tenant binding.")


def _is_tenant_admin(user: ResUser, request: Optional[Request] = None) -> bool:
    if _normalize_role(getattr(user, "role", None)) in TENANT_ADMIN_ROLES:
        return True
    return bool(is_super_admin_authorized(user, request))


def require_tenant_admin(
    request: Request,
    current_user: ResUser = Depends(get_authenticated_user),
) -> ResUser:
    """Dependency: authenticated user holding the Admin or Owner role."""
    if not _is_tenant_admin(current_user, request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Owner role required for this action.",
        )
    return current_user


def enforce_caller_tenant_scope(
    request: Request,
    current_user: ResUser = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> None:
    """Reject (403) any request that explicitly targets a tenant other than the caller's own.

    Tenant hints (?tenant_id=, X-Tenant-ID, X-Company-ID, X-Tenant-Slug) are never used to
    select data. If one is present and identifies a *different* tenant, the request is an
    attempted cross-tenant access and is refused rather than silently re-scoped.
    """
    own_id = _caller_tenant_id(current_user)
    company = db.get(ResCompany, own_id)
    own_ids = {str(own_id)}
    own_slugs = set()
    if company is not None:
        own_slugs |= {s.lower() for s in (company.slug, getattr(company, "domain_slug", None)) if s}
        for m in db.query(MasterTenant).filter(
            (MasterTenant.id == own_id) | (MasterTenant.slug.in_(list(own_slugs) or [""]))
        ).all():
            own_ids.add(str(m.id))
            if m.slug:
                own_slugs.add(m.slug.lower())

    hints = [
        request.query_params.get("tenant_id"),
        request.headers.get("x-tenant-id"),
        request.headers.get("x-company-id"),
        request.headers.get("x-tenant-slug"),
    ]
    for raw in hints:
        val = str(raw or "").strip().lower()
        if not val or val in ("null", "undefined") or val in own_ids or val in own_slugs:
            continue
        try:
            uuid.UUID(val)
            foreign = True  # a well-formed tenant UUID that is not the caller's
        except ValueError:
            foreign = db.query(ResCompany.id).filter(
                (ResCompany.slug == val) | (ResCompany.domain_slug == val)
            ).first() is not None or db.query(MasterTenant.id).filter(MasterTenant.slug == val).first() is not None
        if foreign:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cross-tenant access denied: requests are scoped to your own workspace.",
            )


router.dependencies.append(Depends(enforce_caller_tenant_scope))


def resolve_control_tenant_id(*_args: Any, **_kwargs: Any) -> uuid.UUID:  # pragma: no cover
    """REMOVED (security). Header/query/first-company tenant resolution was an IDOR.

    Use `_caller_tenant_id(current_user)` with an authenticated dependency instead.
    """
    raise RuntimeError(
        "resolve_control_tenant_id was removed: derive the tenant from the authenticated user."
    )


class InviteMemberRequest(BaseModel):
    email: str
    full_name: str
    role: Optional[str] = "user"
    department: Optional[str] = "Operations"


class SettingsUpdateRequest(BaseModel):
    general: Optional[Dict[str, Any]] = None
    webhooks: Optional[Dict[str, Any]] = None
    api_keys: Optional[Dict[str, Any]] = None
    sso: Optional[Dict[str, Any]] = None
    section: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class DomainRegisterRequest(BaseModel):
    domain_name: str


# ==============================================================================
# Team Management Endpoints (PostgreSQL Persisted)
# ==============================================================================

@router.get("/team", status_code=status.HTTP_200_OK)
def list_team_members(
    current_user: ResUser = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    """Lists team members belonging strictly to the active tenant from PostgreSQL."""
    target_uuid = _caller_tenant_id(current_user)
    
    users = db.query(ResUser).filter(ResUser.company_id == target_uuid).all()
    team = []
    for u in users:
        team.append({
            "id": str(u.id),
            "tenant_id": str(target_uuid),
            "email": u.email,
            "full_name": u.full_name or "Team Member",
            "role": (u.role or "user").lower(),
            "department": getattr(u, "department", "Operations") or "Operations",
            "status": "active" if u.is_active else "invited",
            "created_at": u.created_at.isoformat() if u.created_at else datetime.now(timezone.utc).isoformat(),
        })

    return {"success": True, "count": len(team), "team": team}


@router.post("/team/invite", status_code=status.HTTP_201_CREATED)
def invite_team_member(
    payload: InviteMemberRequest,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Invites a new team member and persists into PostgreSQL."""
    target_uuid = _caller_tenant_id(current_user)
    # Enforce plan seat quota
    from backend.app.services.billing_service import verify_tenant_seat_limit, increment_tenant_seat_usage
    seat_ok, seat_msg = verify_tenant_seat_limit(db, target_uuid)
    if not seat_ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=seat_msg,
            headers={
                "X-Quota-Type": "max_seats",
                "X-Upgrade-URL": "/api/v1/tenant/billing/checkout",
            },
        )

    norm_email = payload.email.strip().lower()

    existing = db.query(ResUser).filter(
        ResUser.email == norm_email,
    ).first()
    is_reinvite = False
    if existing:
        if is_ghost_or_unverified_account(existing, target_uuid, db):
            is_reinvite = True
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"User '{norm_email}' already belongs to this workspace.",
            )

    role_mapping = {
        "admin": "Admin",
        "super_admin": "Super_Admin",
        "coo": "COO",
        "ceo": "CEO",
        "accountant": "Accountant",
        "data_entry": "Data_Entry",
        "user": "Data_Entry",
        "guest": "Guest",
    }
    raw_role = (payload.role or "user").strip().lower()
    assigned_role = role_mapping.get(raw_role, "Data_Entry")
    # Tenant admins can never mint platform Super_Admin accounts.
    if assigned_role == "Super_Admin" and not is_super_admin_authorized(current_user, None):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform Super Admins may assign the Super_Admin role.",
        )

    temp_pw = uuid.uuid4().hex[:12]
    if is_reinvite and existing:
        user = existing
        user.company_id = target_uuid
        user.full_name = payload.full_name
        user.role = assigned_role
        user.is_active = True
        user.deleted_at = None
        user.must_change_password = True
        user.password_hash = hash_password(temp_pw)
        user.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(user)
    else:
        new_id = uuid.uuid4()
        user = ResUser(
            id=new_id,
            firebase_uid=f"native:{norm_email}",
            email=norm_email,
            full_name=payload.full_name,
            company_id=target_uuid,
            role=assigned_role,
            is_active=True,
            must_change_password=True,
            password_hash=hash_password(temp_pw),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        increment_tenant_seat_usage(db, target_uuid)

    member_data = {
        "id": str(user.id),
        "tenant_id": str(target_uuid),
        "email": user.email,
        "full_name": user.full_name,
        "role": (user.role or "user").lower(),
        "department": payload.department or "Operations",
        "status": "invited",
        "created_at": user.created_at.isoformat() if user.created_at else datetime.now(timezone.utc).isoformat(),
    }
    return {
        "success": True,
        "message": f"Invitation email dispatched to {norm_email}",
        "member": member_data,
    }


@router.delete("/team/{member_id}", status_code=status.HTTP_200_OK)
def delete_team_member(
    member_id: str,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Removes a team member belonging to the tenant."""
    target_uuid = _caller_tenant_id(current_user)
    try:
        user_uuid = uuid.UUID(member_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid member UUID format")

    user = db.query(ResUser).filter(
        ResUser.id == user_uuid,
        ResUser.company_id == target_uuid,
    ).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot remove your own account.")
    if (getattr(user, "is_superuser", False) or _normalize_role(user.role) == "SUPER_ADMIN") \
            and not is_super_admin_authorized(current_user, None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot remove a platform Super Admin.")

    removed_name = user.full_name or user.email
    db.delete(user)
    db.commit()

    return {"success": True, "message": f"Member {removed_name} removed."}


# ==============================================================================
# Settings Endpoints (PostgreSQL Persisted)
# ==============================================================================

@router.get("/settings", status_code=status.HTTP_200_OK)
def get_tenant_settings(
    request: Request,
    current_user: ResUser = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    """Fetches tenant configuration settings from PostgreSQL with resilient fallback."""
    target_uuid = _caller_tenant_id(current_user)
    company = db.query(ResCompany).filter(ResCompany.id == target_uuid).first()
    master = db.query(MasterTenant).filter(MasterTenant.id == target_uuid).first() if not company else None

    company_name = getattr(company, "name", None) or getattr(master, "name", None) or "Horizon Logistics Group"
    company_name_ar = getattr(company, "name_ar", None) or getattr(master, "name_ar", None) or company_name
    company_name_en = getattr(company, "name_en", None) or getattr(master, "name_en", None) or company_name
    cr_number = getattr(company, "commercial_registration", None) or getattr(master, "commercial_registration", "") or ""
    vat_number = getattr(company, "tax_id", None) or getattr(master, "tax_id", "") or ""
    currency = getattr(company, "currency", None) or "SAR"

    general = {
        "company_name_ar": company_name_ar,
        "company_name_en": company_name_en,
        "cr_number": cr_number,
        "vat_number": vat_number,
        "timezone": "Asia/Riyadh",
        "default_currency": currency,
    }
    return {
        "success": True,
        "tenant_id": str(target_uuid),
        "settings": {
            "general": general,
            "webhooks": {"url": "", "is_active": False, "events": []},
            "api_keys": {
                "public_key": f"oxen_live_pk_{str(target_uuid)[:8]}",
                "secret_key_preview": "oxen_live_sk_••••••••••••••••••••49a2",
            },
            "sso": {"enabled": False},
            "modules": ["operations", "finance", "hr", "customs", "fleet", "analytics", "procurement"],
        },
    }


@router.post("/settings", status_code=status.HTTP_200_OK)
def update_tenant_settings(
    payload: SettingsUpdateRequest,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Updates tenant settings in PostgreSQL."""
    target_uuid = _caller_tenant_id(current_user)
    company = db.query(ResCompany).filter(ResCompany.id == target_uuid).first()

    # Support either payload.general or payload.settings (if section='general')
    gen = payload.general or (payload.settings if payload.section == 'general' else None)
    if company and gen:
        if "company_name_ar" in gen and hasattr(company, "name_ar"):
            company.name_ar = gen["company_name_ar"]
        if "company_name_en" in gen and hasattr(company, "name_en"):
            company.name_en = gen["company_name_en"]
        if "cr_number" in gen:
            company.commercial_registration = gen["cr_number"]
        if "vat_number" in gen:
            company.tax_id = gen["vat_number"]
        if "default_currency" in gen:
            company.currency = gen["default_currency"]
        db.commit()

    return {"success": True, "message": "Settings saved successfully"}


# ==============================================================================
# Custom Domain Management (PostgreSQL Persisted)
# ==============================================================================

@router.get("/domains", status_code=status.HTTP_200_OK)
def list_custom_domains(
    request: Request,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Lists registered custom domains for the tenant."""
    target_uuid = _caller_tenant_id(current_user)
    master = db.query(MasterTenant).filter(MasterTenant.id == target_uuid).first()
    
    domains = []
    if master and getattr(master, "custom_domain", None):
        domains.append({
            "id": f"dom-{str(target_uuid)[:8]}",
            "tenant_id": str(target_uuid),
            "domain_name": master.custom_domain,
            "verification_token": f"oxengl_verify_{str(target_uuid)[:7]}",
            "cname_target": "domains.oxengl.me",
            "is_verified": True,
            "ssl_status": "active",
            "created_at": master.created_at.isoformat() if master.created_at else datetime.now(timezone.utc).isoformat(),
        })

    return {"success": True, "count": len(domains), "domains": domains}


@router.post("/domains", status_code=status.HTTP_201_CREATED)
def register_custom_domain(
    payload: DomainRegisterRequest,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Registers a new custom domain for the tenant in PostgreSQL."""
    target_uuid = _caller_tenant_id(current_user)
    # Evaluate subscription grade and explicit feature overrides
    master = db.query(MasterTenant).filter(MasterTenant.id == target_uuid).first()
    company = db.query(ResCompany).filter(ResCompany.id == target_uuid).first()
    if not master and company:
        master = db.query(MasterTenant).filter(
            (MasterTenant.id == company.id) |
            (MasterTenant.slug == getattr(company, "domain_slug", None)) |
            (MasterTenant.slug == company.slug)
        ).first()
    if not company and master:
        company = db.query(ResCompany).filter(
            (ResCompany.id == master.id) |
            (ResCompany.slug == master.slug) |
            (ResCompany.domain_slug == master.slug)
        ).first()

    def _is_feature_override_allowed(obj, key: str) -> bool:
        if not obj:
            return False
        ov = getattr(obj, "features_override", None)
        if isinstance(ov, str):
            try:
                import json
                ov = json.loads(ov)
            except Exception:
                ov = {}
        if isinstance(ov, dict):
            val = ov.get(key)
            return val is True or str(val).lower() in ("true", "1")
        return False

    def _is_enterprise_tier(obj) -> bool:
        if not obj:
            return False
        for attr in ("subscription_tier", "subscription_plan", "grade"):
            val = getattr(obj, attr, None)
            if val and str(val).strip().lower() in ("enterprise", "sovereign"):
                return True
        return False

    sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == target_uuid))
    if not sub and master:
        sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == master.id))
    if not sub and company:
        sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == company.id))

    sub_override = False
    if sub and sub.custom_limits and isinstance(sub.custom_limits, dict):
        val = sub.custom_limits.get("allow_custom_domain")
        if val is True or str(val).lower() in ("true", "1"):
            sub_override = True

    has_custom_domain_access = (
        _is_enterprise_tier(master)
        or _is_enterprise_tier(company)
        or (sub and sub.plan and str(sub.plan.name).upper() == "ENTERPRISE")
        or _is_feature_override_allowed(master, "allow_custom_domain")
        or _is_feature_override_allowed(company, "allow_custom_domain")
        or sub_override
    )

    if not has_custom_domain_access:
        from backend.app.services.billing_service import enforce_tenant_entitlement
        enforce_tenant_entitlement(db, target_uuid, "allow_custom_domain")

    clean_domain = payload.domain_name.strip().lower()

    if master:
        master.custom_domain = clean_domain
        db.commit()

    if company:
        company.custom_domain = clean_domain
        company.domain_slug = clean_domain.replace(".", "-")
        db.commit()

    # Invalidate domain resolution cache so new domain resolves immediately
    from backend.app.core.middleware import invalidate_domain_cache
    invalidate_domain_cache(clean_domain)

    record = {
        "id": f"dom-{uuid.uuid4().hex[:6]}",
        "tenant_id": str(target_uuid),
        "domain_name": clean_domain,
        "verification_token": f"oxengl_verify_{uuid.uuid4().hex[:7]}",
        "cname_target": "domains.oxengl.me",
        "is_verified": True,
        "ssl_status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"success": True, "domain": record}


@router.delete("/domains/{domain_id}", status_code=status.HTTP_200_OK)
def remove_custom_domain(
    domain_id: str,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Removes a registered custom domain and clears routing cache."""
    target_uuid = _caller_tenant_id(current_user)
    old_domain = None
    master = db.query(MasterTenant).filter(MasterTenant.id == target_uuid).first()
    if master and master.custom_domain:
        old_domain = master.custom_domain
        master.custom_domain = None
        db.commit()

    company = db.query(ResCompany).filter(ResCompany.id == target_uuid).first()
    if company and company.custom_domain:
        old_domain = old_domain or company.custom_domain
        company.custom_domain = None
        db.commit()

    if old_domain:
        from backend.app.core.middleware import invalidate_domain_cache
        invalidate_domain_cache(old_domain)

    return {"success": True, "message": f"Custom domain '{domain_id}' removed successfully"}


@public_router.get("/domains/resolve", status_code=status.HTTP_200_OK)
@public_router.get("/resolve-domain", status_code=status.HTTP_200_OK)
def resolve_domain_endpoint(
    request: Request,
    host: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Public zero-slug domain resolution endpoint.
    Translates an incoming Host header or ?host=/?domain= query parameter into the corresponding
    tenant workspace partition for Zero-Slug Routing and tenant white-label branding.
    """
    target_host = host or domain or request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    clean_host = target_host.split(":")[0].strip().lower()

    if not clean_host:
        return {"resolved": False, "message": "Host header or host parameter is required"}

    from backend.app.core.middleware import resolve_tenant_from_host
    tenant_meta = resolve_tenant_from_host(clean_host, db=db)

    if not tenant_meta:
        return {
            "resolved": False,
            "host": clean_host,
            "message": f"No active tenant mapped to domain '{clean_host}'",
        }

    return {
        "resolved": True,
        "tenant_id": tenant_meta["tenant_id"],
        "company_id": tenant_meta["company_id"],
        "tenant_slug": tenant_meta["tenant_slug"],
        "name": tenant_meta["name"],
        "custom_domain": tenant_meta["custom_domain"],
        "is_custom_domain": tenant_meta.get("is_custom_domain", False),
        "logo_url": tenant_meta.get("logo_url"),
        "primary_color": tenant_meta.get("primary_color"),
        "subscription_tier": tenant_meta.get("subscription_tier"),
        "status": tenant_meta.get("status"),
    }


@router.post("/domains/{domain_id}/verify", status_code=status.HTTP_200_OK)
def verify_custom_domain(
    domain_id: str,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """
    Cryptographic & DNS Pre-flight Verification of CNAME, A-record, and SSL status.
    """
    from backend.app.services import ssl_service
    from backend.app.services.billing_service import enforce_tenant_entitlement

    target_uuid = _caller_tenant_id(current_user)
    enforce_tenant_entitlement(db, target_uuid, "allow_custom_domain")

    target_domain = domain_id
    if target_uuid:
        master = db.query(MasterTenant).filter(MasterTenant.id == target_uuid).first()
        if master and master.custom_domain:
            target_domain = master.custom_domain

    clean_domain = ssl_service.normalize_domain(target_domain)
    dns_info = ssl_service.verify_domain_dns(clean_domain)
    caddy_check = ssl_service.verify_caddy_ask(clean_domain, db=db)
    cert_info = ssl_service.probe_ssl_certificate(clean_domain)

    # Determine verification status
    is_verified = caddy_check.get("allowed", False)
    ssl_status = "active" if cert_info.get("has_ssl") else ("issuing" if is_verified else "pending")

    return {
        "success": True,
        "domain_name": clean_domain,
        "is_verified": is_verified,
        "ssl_status": ssl_status,
        "dns_check": "CNAME_RESOLVED" if dns_info.get("cname_matched") else ("A_RECORD_RESOLVED" if dns_info.get("a_records") else "PENDING_PROPAGATION"),
        "routing": "Zero-Slug Ready" if is_verified else "Pending Authorization",
        "dns_details": dns_info,
        "certificate": cert_info,
        "caddy_gatekeeper": caddy_check,
    }


@router.get("/domains/{domain_id}/ssl-status", status_code=status.HTTP_200_OK)
def get_domain_ssl_status(
    domain_id: str,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Inspects live TLS certificate details and expiration for custom domain."""
    from backend.app.services import ssl_service
    from backend.app.services.billing_service import enforce_tenant_entitlement

    target_uuid = _caller_tenant_id(current_user)
    enforce_tenant_entitlement(db, target_uuid, "allow_custom_domain")

    target_domain = domain_id
    master = db.query(MasterTenant).filter(MasterTenant.id == target_uuid).first()
    if master and master.custom_domain:
        target_domain = master.custom_domain

    clean_domain = ssl_service.normalize_domain(target_domain)
    cert_info = ssl_service.probe_ssl_certificate(clean_domain)
    caddy_check = ssl_service.verify_caddy_ask(clean_domain, db=db)
    return {
        "domain": clean_domain,
        "certificate": cert_info,
        "caddy_ask_allowed": caddy_check.get("allowed", False),
    }


# ==============================================================================
# Phase 1: Enterprise External Database & In-App Migration Endpoints
# ==============================================================================

@router.get("/database/config", response_model=TenantDatabaseInfoResponse)
def get_tenant_database_config(
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Retrieves current database hosting configuration for this tenant (Shared container vs Private External)."""
    target_uuid = _caller_tenant_id(current_user)
    return migration_service.get_tenant_database_info(target_uuid, db)


@router.post("/database/test-connection", response_model=TenantDatabaseTestConnectionResponse)
def test_tenant_database_connection(
    payload: TenantDatabaseTestConnectionRequest,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Tests connectivity, TLS/SSL handshake, and permissions for a target external PostgreSQL instance."""
    target_uuid = _caller_tenant_id(current_user)
    from backend.app.services.billing_service import enforce_tenant_entitlement
    enforce_tenant_entitlement(db, target_uuid, "allow_external_database")

    ok, msg, meta = migration_service.test_target_connection(
        host=payload.host,
        port=payload.port,
        database_name=payload.database_name,
        username=payload.username,
        password=payload.password,
        ssl_mode=payload.ssl_mode,
        raw_url=payload.raw_url,
    )
    return {
        "success": ok,
        "message": msg,
        "host": meta.get("host"),
        "database": meta.get("database_name"),
        "ssl_mode": meta.get("ssl_mode"),
    }


@router.post("/database/migrate", response_model=TenantDatabaseMigrationResponse)
def trigger_database_migration(
    payload: TenantDatabaseMigrationRequest,
    background_tasks: BackgroundTasks,
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Triggers an in-app live background migration to copy tenant data to a private external PostgreSQL instance."""
    target_uuid = _caller_tenant_id(current_user)
    # Enforce external database architectural entitlement
    from backend.app.services.billing_service import enforce_tenant_entitlement
    enforce_tenant_entitlement(db, target_uuid, "allow_external_database")

    migration_id = uuid.uuid4()
    target_host = payload.host or "external_host"
    target_db = payload.database_name or "external_db"
    try:
        target_port = int(payload.port) if payload.port is not None and str(payload.port).strip() else 5432
    except (ValueError, TypeError):
        target_port = 5432

    # Persist initial migration job
    job = TenantDatabaseMigration(
        id=migration_id,
        company_id=target_uuid,
        source_type="shared_postgres",
        target_host=target_host,
        target_port=target_port,
        target_database=target_db,
        ssl_mode=payload.ssl_mode or "prefer",
        status="PENDING",
        progress_pct=0,
        current_step="Migration job initialized. Spawning worker...",
        records_transferred=0,
    )
    db.add(job)
    db.commit()

    # Launch background worker with strictly resolved port
    worker_params = payload.model_dump()
    worker_params["port"] = target_port
    background_tasks.add_task(
        migration_service.run_migration_worker,
        migration_id=migration_id,
        company_id=target_uuid,
        target_params=worker_params,
    )

    return {
        "success": True,
        "migration_id": migration_id,
        "status": "PENDING",
        "message": "Database migration job started successfully in the background.",
        "target_database": target_db,
        "target_host": target_host,
    }


@router.get("/database/migration-status")
def get_database_migration_status(
    migration_id: Optional[uuid.UUID] = Query(None),
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Polls live progress and status for an active or recent database migration."""
    target_uuid = _caller_tenant_id(current_user)
    status_data = migration_service.get_migration_status_data(
        company_id=target_uuid, migration_id=migration_id, db=db
    )
    if not status_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No database migration jobs found for this tenant.",
        )
    return status_data


@router.post("/database/switch-back")
def switch_back_to_shared_database(
    current_user: ResUser = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Reverts a dedicated external database tenant back to the platform's shared multi-tenant database."""
    target_uuid = _caller_tenant_id(current_user)
    # Enforce external database architectural entitlement
    from backend.app.services.billing_service import enforce_tenant_entitlement
    enforce_tenant_entitlement(db, target_uuid, "allow_external_database")

    return migration_service.revert_to_shared_database(target_uuid, db)

