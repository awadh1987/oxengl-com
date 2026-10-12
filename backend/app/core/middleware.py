"""
OxenGL Correlation Context and Request Tracking Middleware.
Provides unified X-Correlation-ID tracing across API requests, background workers,
and database audit logs.
"""

from __future__ import annotations

import contextvars
import logging
import threading
import uuid
from typing import Any, Callable, Dict, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("oxengl.middleware.correlation")

# Context variable for request correlation tracking
correlation_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default=""
)


def get_correlation_id() -> str:
    """Retrieve the current request correlation ID from context, or generate one."""
    cid = correlation_id_ctx.get()
    if not cid:
        cid = str(uuid.uuid4())
        correlation_id_ctx.set(cid)
    return cid


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Standard request-level middleware that captures or generates an
    X-Correlation-ID header for every inbound client API cycle.
    Propagates this ID into request state, contextvars, and response headers.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        header_cid = request.headers.get("X-Correlation-ID") or request.headers.get("x-correlation-id")
        cid = header_cid if header_cid else str(uuid.uuid4())

        # Set into request state and context variable
        request.state.correlation_id = cid
        token = correlation_id_ctx.set(cid)

        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = cid
            return response
        finally:
            correlation_id_ctx.reset(token)


def dispatch_async_audit(
    actor_email: str,
    action: str,
    endpoint_accessed: str,
    outcome: str = "SUCCESS",
    correlation_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Safely dispatches audit event to Celery worker if available;
    falls back cleanly if Celery broker is currently unavailable.
    """
    from backend.app.core.tasks import emit_audit_log

    cid = correlation_id or get_correlation_id()
    try:
        emit_audit_log.delay(
            actor_email=actor_email,
            action=action,
            endpoint_accessed=endpoint_accessed,
            outcome=outcome,
            correlation_id=cid,
            tenant_id=tenant_id,
            details=details,
        )
    except Exception as e:
        logger.warning(
            "Celery async queue unavailable (%s); executing audit log synchronously",
            e,
        )
        try:
            emit_audit_log(
                actor_email=actor_email,
                action=action,
                endpoint_accessed=endpoint_accessed,
                outcome=outcome,
                correlation_id=cid,
                tenant_id=tenant_id,
                details=details,
            )
        except Exception as inner_e:
            logger.error("Failed synchronous fallback audit logging: %s", inner_e)


# ==============================================================================
# Host-Header Interception & Zero-Slug Routing Subsystem
# ==============================================================================

PLATFORM_BASE_HOSTS = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "testserver",
    "oxengl.me",
    "app.oxengl.me",
    "api.oxengl.me",
    "admin.oxengl.me",
    "domains.oxengl.me",
    "www.oxengl.me",
}

_DOMAIN_CACHE: dict[str, Optional[dict[str, Any]]] = {}
_DOMAIN_CACHE_LOCK = threading.Lock()


def invalidate_domain_cache(domain: Optional[str] = None) -> None:
    """Evicts cached domain mappings across the platform."""
    with _DOMAIN_CACHE_LOCK:
        if domain:
            _DOMAIN_CACHE.pop(domain.lower().strip(), None)
        else:
            _DOMAIN_CACHE.clear()


def resolve_tenant_from_host(raw_host: str, db: Optional[Any] = None) -> Optional[dict[str, Any]]:
    """
    Resolves tenant configuration and company metadata from an incoming Host/X-Forwarded-Host header.
    Supports both custom enterprise domains (e.g. 'myon-contract.cloud')
    and tenant subdomains (e.g. 'tenant-a.oxengl.me').
    Authoritatively queries MasterTenant, ResCompany, and Tenant using PlatformSessionLocal
    to safely resolve tenant routing before RLS session variables are established.
    """
    if not raw_host:
        return None

    clean_host = raw_host.strip().lower()
    if "//" in clean_host:
        clean_host = clean_host.split("//")[-1]
    clean_host = clean_host.split("/")[0].split(":")[0].strip().lower()

    if clean_host in PLATFORM_BASE_HOSTS:
        return None

    with _DOMAIN_CACHE_LOCK:
        if clean_host in _DOMAIN_CACHE:
            return _DOMAIN_CACHE[clean_host]

    should_close_db = False
    if db is None:
        try:
            from backend.database import PlatformSessionLocal, SessionLocal
            if PlatformSessionLocal is not None:
                db = PlatformSessionLocal()
            else:
                db = SessionLocal()
            should_close_db = True
        except Exception as init_err:
            logger.warning(f"Could not initialize DB session for domain resolution: {init_err}")
            return None

    try:
        from sqlalchemy import func
        from backend.models import MasterTenant, ResCompany, Tenant

        # 1. Custom Domain / Workspace Domain Match on MasterTenant
        master = db.query(MasterTenant).filter(
            (func.lower(func.trim(MasterTenant.custom_domain)) == clean_host) |
            (func.lower(func.trim(MasterTenant.workspace_domain)) == clean_host)
        ).first()
        company = None

        # 2. Custom Domain / Workspace Domain Match on ResCompany
        if not master:
            company = db.query(ResCompany).filter(
                (func.lower(func.trim(ResCompany.custom_domain)) == clean_host) |
                (func.lower(func.trim(ResCompany.workspace_domain)) == clean_host) |
                (func.lower(func.trim(ResCompany.domain_slug)) == clean_host)
            ).first()

        # 3. Custom Domain / Workspace Domain Match on Tenant
        tenant_obj = None
        if not master and not company:
            tenant_obj = db.query(Tenant).filter(
                (func.lower(func.trim(Tenant.workspace_domain)) == clean_host) |
                (func.lower(func.trim(Tenant.schema_name)) == clean_host)
            ).first()

        # 4. Subdomain extraction for *.oxengl.me
        if not master and not company and not tenant_obj and clean_host.endswith(".oxengl.me"):
            subdomain = clean_host.split(".")[0]
            if subdomain not in {"www", "app", "api", "admin", "domains"}:
                master = db.query(MasterTenant).filter(MasterTenant.slug == subdomain).first()
                if not master:
                    company = db.query(ResCompany).filter(
                        (ResCompany.slug == subdomain) | (ResCompany.domain_slug == subdomain)
                    ).first()
                if not master and not company:
                    tenant_obj = db.query(Tenant).filter(Tenant.schema_name == subdomain).first()

        # 5. Fallback direct slug match
        if not master and not company and not tenant_obj:
            master = db.query(MasterTenant).filter(MasterTenant.slug == clean_host).first()
            if not master:
                company = db.query(ResCompany).filter(
                    (ResCompany.slug == clean_host) | (ResCompany.domain_slug == clean_host)
                ).first()
            if not master and not company:
                tenant_obj = db.query(Tenant).filter(Tenant.schema_name == clean_host).first()

        # 6. Fallback platform check if caller passed an RLS-restricted session
        if not master and not company and not tenant_obj and not should_close_db:
            try:
                from backend.database import PlatformSessionLocal
                if PlatformSessionLocal is not None and db != PlatformSessionLocal:
                    with PlatformSessionLocal() as platform_db:
                        return resolve_tenant_from_host(raw_host, db=platform_db)
            except Exception:
                pass

        # 7. Dynamic reconciliation from Tenant model
        if tenant_obj and not master and not company:
            master = db.query(MasterTenant).filter(
                (MasterTenant.id == tenant_obj.id) | (MasterTenant.slug == tenant_obj.schema_name)
            ).first()
            if not master:
                company = db.query(ResCompany).filter(
                    (ResCompany.id == tenant_obj.id) | (ResCompany.slug == tenant_obj.schema_name)
                ).first()
            if not master and not company:
                canonical_id = str(tenant_obj.id)
                result = {
                    "tenant_id": canonical_id,
                    "company_id": canonical_id,
                    "tenant_slug": tenant_obj.schema_name,
                    "name": tenant_obj.company_name,
                    "custom_domain": clean_host,
                    "is_custom_domain": not clean_host.endswith(".oxengl.me"),
                    "logo_url": tenant_obj.logo_url,
                    "primary_color": None,
                    "subscription_tier": "standard",
                    "status": "active" if tenant_obj.is_active else "inactive",
                }
                with _DOMAIN_CACHE_LOCK:
                    _DOMAIN_CACHE[clean_host] = result
                return result

        # 8. Dynamic reconciliation between ResCompany and MasterTenant
        if company and not master:
            try:
                master = MasterTenant(
                    id=company.id,
                    name=company.name,
                    slug=company.slug or company.domain_slug or clean_host.split(".")[0],
                    custom_domain=company.custom_domain or clean_host,
                    owner_full_name=company.name,
                    owner_email=getattr(company, "admin_email", None) or f"admin@{clean_host}",
                    owner_mobile="+966500000000",
                    status="active",
                    subscription_tier=getattr(company, "subscription_tier", "standard") or "standard",
                    max_users=10,
                    max_storage_gb=25,
                )
                db.add(master)
                db.commit()
            except Exception:
                db.rollback()

        if master:
            if not company:
                company = db.query(ResCompany).filter(
                    (ResCompany.id == master.id)
                    | (ResCompany.slug == master.slug)
                    | (ResCompany.domain_slug == master.slug)
                    | (func.lower(func.trim(ResCompany.custom_domain)) == func.lower(func.trim(clean_host)))
                ).first()

            if company and master.custom_domain and not company.custom_domain:
                try:
                    company.custom_domain = master.custom_domain
                    db.commit()
                except Exception:
                    db.rollback()

            canonical_id = str(company.id if company else master.id)
            result = {
                "tenant_id": canonical_id,
                "company_id": canonical_id,
                "tenant_slug": master.slug,
                "name": company.name if company else master.name,
                "custom_domain": clean_host,
                "is_custom_domain": not clean_host.endswith(".oxengl.me"),
                "logo_url": company.ui_logo_url or company.logo_url if company else None,
                "primary_color": company.ui_primary_color or company.primary_color if company else None,
                "subscription_tier": master.subscription_tier or (company.subscription_tier if company else "ENTERPRISE"),
                "status": master.status,
            }
            with _DOMAIN_CACHE_LOCK:
                _DOMAIN_CACHE[clean_host] = result
            return result

        if company:
            result = {
                "tenant_id": str(company.id),
                "company_id": str(company.id),
                "tenant_slug": company.slug,
                "name": company.name,
                "custom_domain": clean_host,
                "is_custom_domain": not clean_host.endswith(".oxengl.me"),
                "logo_url": company.ui_logo_url or company.logo_url,
                "primary_color": company.ui_primary_color or company.primary_color,
                "subscription_tier": company.subscription_tier,
                "status": getattr(company, "status", "active"),
            }
            with _DOMAIN_CACHE_LOCK:
                _DOMAIN_CACHE[clean_host] = result
            return result

        # Negative cache only when resolution cleanly found no match
        with _DOMAIN_CACHE_LOCK:
            _DOMAIN_CACHE[clean_host] = None
        return None

    except Exception as exc:
        logger.warning(f"Error resolving tenant from host '{clean_host}': {exc}")
        return None
    finally:
        if should_close_db and db:
            db.close()


class HostHeaderMiddleware(BaseHTTPMiddleware):
    """
    Interception middleware that inspects incoming Host and X-Forwarded-Host headers.
    When a request matches a custom domain or tenant subdomain, it resolves the tenant partition
    and binds tenant_company_id, company_id, and tenant_slug to request.state.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        clean_host = raw_host.strip().lower()
        if "//" in clean_host:
            clean_host = clean_host.split("//")[-1]
        clean_host = clean_host.split("/")[0].split(":")[0].strip().lower()

        # Initialize defaults
        request.state.tenant_company_id = getattr(request.state, "tenant_company_id", None)
        request.state.company_id = getattr(request.state, "company_id", None)
        request.state.tenant_slug = getattr(request.state, "tenant_slug", None)
        request.state.custom_domain = None
        request.state.is_custom_domain = False
        request.state.tenant_meta = None

        tenant_meta = resolve_tenant_from_host(clean_host) if clean_host else None

        if tenant_meta:
            tenant_uuid = uuid.UUID(tenant_meta["tenant_id"])
            request.state.tenant_id = str(tenant_uuid)
            request.state.tenant_company_id = tenant_uuid
            request.state.company_id = tenant_uuid
            request.state.tenant_slug = tenant_meta["tenant_slug"]
            request.state.tenant_name = tenant_meta["name"]
            request.state.custom_domain = clean_host
            request.state.is_custom_domain = tenant_meta.get("is_custom_domain", False)
            request.state.tenant_meta = tenant_meta
        else:
            header_or_query_cid = (
                request.headers.get("x-company-id")
                or request.headers.get("x-tenant-id")
                or request.headers.get("x-target-company-id")
                or request.query_params.get("company_id")
                or request.query_params.get("tenant_id")
            )
            if header_or_query_cid and not request.state.company_id:
                try:
                    parsed_cid = uuid.UUID(str(header_or_query_cid).strip())
                    request.state.requested_company_id = parsed_cid
                    request.state.company_id = parsed_cid
                    request.state.tenant_company_id = parsed_cid
                    request.state.tenant_id = str(parsed_cid)
                except (ValueError, TypeError):
                    pass

        response = await call_next(request)

        if tenant_meta:
            response.headers["X-Resolved-Tenant"] = tenant_meta["tenant_slug"]
            if tenant_meta.get("is_custom_domain"):
                response.headers["X-Custom-Domain"] = clean_host
        elif getattr(request.state, "company_id", None):
            response.headers["X-Active-Company-ID"] = str(request.state.company_id)

        return response

