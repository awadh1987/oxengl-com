"""
OxenGL ERP - Backup destination & run-log APIs.
Filename: backend/app/api/v1/backup_destinations.py

  /api/v1/tenant-control/backups/...   tenant Admin / Owner: the caller's OWN destinations and run logs
  /api/v1/superadmin/backups/...       platform super admin: oversight of every destination / log, plus CRUD
                                       for platform-wide destinations (tenant_id NULL)

Security properties
  * The tenant is ALWAYS the authenticated user's own ``company_id``. Request bodies and query strings cannot
    select, override or widen it (``tenant_id`` in a tenant payload is ignored; tenant routes expose no tenant
    filter). A destination in another scope answers 404 exactly like a missing one, and the probe is audited.
  * Tenants can never create / modify tenant_id NULL destinations and can never choose a credential reference.
  * Responses never contain credential material (only ``has_credential``). Credentials are write-only.
  * Every mutation, test and denied access is written to ``platform_audit_logs`` (real client IP through the
    trusted-proxy resolver) and, for tenant-scoped events, ``tenant_audit_logs``, in the same transaction.
  * Authentication / role dependencies are resolved lazily so this module imports without the full app.
"""

from __future__ import annotations

import dataclasses
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from backend.app.domains.hr.audit import append_audit_from_context, build_audit_context
from backend.app.services import backup_destination_service as svc
from backend.database import SessionLocal, get_db, get_platform_db
from backend.models import BackupDestination, TenantAuditLog

tenant_router = APIRouter(prefix="/api/v1/tenant-control/backups", tags=["Tenant Backups"])
superadmin_router = APIRouter(prefix="/api/v1/superadmin/backups", tags=["Super Admin Backups"])

TENANT_ADMIN_ROLES = frozenset({"ADMIN", "OWNER"})


# =============================================================================================
# Schemas (no credential material in any response model)
# =============================================================================================


class DestinationCreate(BaseModel):
    """Create payload. ``credentials`` is WRITE-ONLY and is validated by the service (typed ``Any`` so a
    validation error can never echo secret values back). Unknown keys (e.g. ``tenant_id``) are ignored."""

    provider_type: str = ""
    name: str = ""
    config: Dict[str, Any] = Field(default_factory=dict)
    credentials: Any = Field(default=None, repr=False)
    is_active: bool = True


class DestinationUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    credentials: Any = Field(default=None, repr=False)
    is_active: Optional[bool] = None


class PlatformDestinationCreate(DestinationCreate):
    credential_ref: Optional[str] = Field(default=None, repr=False)  # write-only environment reference


class PlatformDestinationUpdate(DestinationUpdate):
    credential_ref: Optional[str] = Field(default=None, repr=False)


class DestinationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: Optional[uuid.UUID] = None
    tenant_name: Optional[str] = None
    scope: str
    provider_type: str
    name: str
    config: Dict[str, Any]
    is_active: bool
    has_credential: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None
    last_backup_at: Optional[datetime] = None
    last_status: Optional[str] = None


class RunLogOut(BaseModel):
    id: uuid.UUID
    destination_id: Optional[uuid.UUID] = None
    destination_name: Optional[str] = None
    provider_type: Optional[str] = None
    tenant_id: Optional[uuid.UUID] = None
    tenant_name: Optional[str] = None
    scope: str
    status: str
    file_size_bytes: Optional[int] = None
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None


class DestinationPage(BaseModel):
    items: List[DestinationOut]
    total: int
    page: int
    page_size: int


class RunLogPage(BaseModel):
    items: List[RunLogOut]
    total: int
    page: int
    page_size: int


class TestResult(BaseModel):
    ok: bool
    message: str


# =============================================================================================
# Dependencies
# =============================================================================================


def current_user_dep(request: Request, db: Session = Depends(get_db)) -> Any:
    from backend.app.core.auth import get_authenticated_user

    return get_authenticated_user(request, db)


def _normalize_role(role: Any) -> str:
    return str(role or "").strip().upper().replace("-", "_").replace(" ", "_")


def _is_super_admin(user: Any) -> bool:
    from backend.app.core.auth import is_super_admin_authorized

    # request=None: the X-Master-Admin-Key provisioning bypass is deliberately not honoured here.
    return bool(is_super_admin_authorized(user, None))


@dataclasses.dataclass(frozen=True)
class TenantContext:
    user: Any
    tenant_id: uuid.UUID


def _audit(
    db: Session,
    request: Request,
    user: Any,
    *,
    action: str,
    outcome: str,
    tenant_id: Optional[uuid.UUID],
    destination_id: Optional[uuid.UUID] = None,
    details: str = "",
) -> None:
    """platform_audit_logs (+ tenant_audit_logs for tenant-scoped events). Never contains secrets; the caller commits."""
    context = build_audit_context(
        request,
        actor_id=getattr(user, "id", None),
        actor_identifier=getattr(user, "email", None),
    )
    if destination_id is not None:
        context = dataclasses.replace(context, endpoint=f"{context.endpoint}#destination={destination_id}"[:255])
    append_audit_from_context(db, context, action=action, outcome=outcome, tenant_id=tenant_id)
    if tenant_id is not None:
        db.add(
            TenantAuditLog(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                action_type=action[:50],
                actor=str(getattr(user, "email", None) or "unknown")[:100],
                details=f"{details} ip={context.ip_address or 'unknown'} outcome={outcome}".strip(),
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
        )


def tenant_admin_dep(
    request: Request,
    user: Any = Depends(current_user_dep),
    db: Session = Depends(get_db),
) -> TenantContext:
    """Admin / Owner (or platform super admin) acting on their OWN company. Tenant comes from the user record."""
    company_id = getattr(user, "company_id", None)
    allowed = _normalize_role(getattr(user, "role", None)) in TENANT_ADMIN_ROLES or _is_super_admin(user)
    tenant_id: Optional[uuid.UUID] = None
    if company_id:
        try:
            tenant_id = company_id if isinstance(company_id, uuid.UUID) else uuid.UUID(str(company_id))
        except ValueError:
            tenant_id = None
    if not allowed or tenant_id is None:
        _audit(
            db, request, user,
            action="BACKUP_ACCESS_DENIED", outcome="DENIED", tenant_id=tenant_id,
            details="reason=" + ("role" if not allowed else "no_tenant_binding"),
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Owner role bound to a tenant workspace is required for backup management.",
        )
    return TenantContext(user=user, tenant_id=tenant_id)


def super_admin_dep(
    request: Request,
    user: Any = Depends(current_user_dep),
    db: Session = Depends(get_db),
) -> Any:
    if not _is_super_admin(user):
        _audit(
            db, request, user,
            action="BACKUP_SUPERADMIN_DENIED", outcome="DENIED",
            tenant_id=getattr(user, "company_id", None), details="reason=not_super_admin",
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform Super_Admin role required.")
    request.state.platform_db_authorized = True
    return user


def _parse_id(raw: str) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError):
        return None


def _load_scoped_or_404(
    db: Session, request: Request, user: Any, raw_id: str, tenant_id: Optional[uuid.UUID]
) -> BackupDestination:
    """Fetch inside ``tenant_id``'s scope (None = platform) or answer 404. A destination that exists in another
    scope gets the same 404 (no existence leak) and a DENIED audit row."""
    destination_id = _parse_id(raw_id)
    row = svc.get_destination(db, destination_id, tenant_id) if destination_id else None
    if row is None:
        if destination_id is not None and db.get(BackupDestination, destination_id) is not None:
            _audit(
                db, request, user,
                action="BACKUP_DESTINATION_ACCESS_DENIED", outcome="DENIED", tenant_id=tenant_id,
                destination_id=destination_id, details="reason=out_of_scope",
            )
            db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup destination not found.")
    return row


def _validation_error(err: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(err))


def _out(row: BackupDestination, db: Session, *, tenant_name: Optional[str] = None) -> Dict[str, Any]:
    last = svc.last_runs(db, [row.id]).get(row.id)
    return svc.serialize_destination(row, last, tenant_name)


def _provider() -> svc.StoredCredentialProvider:
    return svc.StoredCredentialProvider(SessionLocal)


# =============================================================================================
# Tenant routes: /api/v1/tenant-control/backups
# =============================================================================================


@tenant_router.get("/destinations", response_model=DestinationPage)
def list_my_destinations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(tenant_admin_dep),
    db: Session = Depends(get_db),
):
    items, total = svc.list_destinations(db, tenant_id=ctx.tenant_id, page=page, page_size=page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@tenant_router.post("/destinations", response_model=DestinationOut, status_code=status.HTTP_201_CREATED)
def create_my_destination(
    payload: DestinationCreate,
    request: Request,
    ctx: TenantContext = Depends(tenant_admin_dep),
    db: Session = Depends(get_db),
):
    try:
        row = svc.create_destination(
            db,
            tenant_id=ctx.tenant_id,  # always the caller's own company; never None for tenants
            actor_id=getattr(ctx.user, "id", None),
            provider_type=payload.provider_type,
            name=payload.name,
            config=payload.config,
            credentials=payload.credentials,
            is_active=payload.is_active,
        )
        _audit(
            db, request, ctx.user,
            action="BACKUP_DESTINATION_CREATED", outcome="SUCCESS", tenant_id=ctx.tenant_id,
            destination_id=row.id,
            details=f"destination={row.id} provider={row.provider_type} has_credential={bool(row.credential_ref)}",
        )
        db.commit()
    except svc.DestinationValidationError as err:
        db.rollback()
        raise _validation_error(err)
    db.refresh(row)
    return _out(row, db)


@tenant_router.put("/destinations/{destination_id}", response_model=DestinationOut)
def update_my_destination(
    destination_id: str,
    payload: DestinationUpdate,
    request: Request,
    ctx: TenantContext = Depends(tenant_admin_dep),
    db: Session = Depends(get_db),
):
    row = _load_scoped_or_404(db, request, ctx.user, destination_id, ctx.tenant_id)
    try:
        changes = svc.update_destination(
            db, row,
            name=payload.name, config=payload.config, credentials=payload.credentials, is_active=payload.is_active,
        )
        _audit(
            db, request, ctx.user,
            action="BACKUP_DESTINATION_UPDATED", outcome="SUCCESS", tenant_id=ctx.tenant_id,
            destination_id=row.id,
            details=f"destination={row.id} fields={','.join(changes.fields) or 'none'} "
                    f"credentials_updated={changes.credentials_updated}",
        )
        db.commit()
    except svc.DestinationValidationError as err:
        db.rollback()
        raise _validation_error(err)
    db.refresh(row)
    return _out(row, db)


@tenant_router.delete("/destinations/{destination_id}", status_code=status.HTTP_200_OK)
def delete_my_destination(
    destination_id: str,
    request: Request,
    ctx: TenantContext = Depends(tenant_admin_dep),
    db: Session = Depends(get_db),
):
    row = _load_scoped_or_404(db, request, ctx.user, destination_id, ctx.tenant_id)
    deleted_id, provider = row.id, row.provider_type
    svc.delete_destination(db, row)
    _audit(
        db, request, ctx.user,
        action="BACKUP_DESTINATION_DELETED", outcome="SUCCESS", tenant_id=ctx.tenant_id,
        destination_id=deleted_id, details=f"destination={deleted_id} provider={provider}",
    )
    db.commit()
    return {"success": True, "id": str(deleted_id)}


@tenant_router.post("/destinations/{destination_id}/test", response_model=TestResult)
def test_my_destination(
    destination_id: str,
    request: Request,
    ctx: TenantContext = Depends(tenant_admin_dep),
    db: Session = Depends(get_db),
):
    row = _load_scoped_or_404(db, request, ctx.user, destination_id, ctx.tenant_id)
    ok, message = svc.check_destination_connection(row, _provider())
    _audit(
        db, request, ctx.user,
        action="BACKUP_DESTINATION_TESTED", outcome="SUCCESS" if ok else "FAILED", tenant_id=ctx.tenant_id,
        destination_id=row.id, details=f"destination={row.id} provider={row.provider_type}",
    )
    db.commit()
    return {"ok": ok, "message": message}


@tenant_router.get("/logs", response_model=RunLogPage)
def list_my_run_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    destination_id: Optional[uuid.UUID] = Query(None),
    ctx: TenantContext = Depends(tenant_admin_dep),
    db: Session = Depends(get_db),
):
    try:
        items, total = svc.list_run_logs(
            db, tenant_id=ctx.tenant_id, page=page, page_size=page_size,
            status=status_filter, destination_id=destination_id,
        )
    except svc.DestinationValidationError as err:
        raise _validation_error(err)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# =============================================================================================
# Super-admin routes: /api/v1/superadmin/backups
# =============================================================================================


@superadmin_router.get("/destinations", response_model=DestinationPage)
def admin_list_destinations(
    request: Request,
    tenant_id: Optional[uuid.UUID] = Query(None),
    scope: Optional[str] = Query(None, pattern="^(platform|tenant)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: Any = Depends(super_admin_dep),
    db: Session = Depends(get_platform_db),
):
    items, total = svc.list_destinations(
        db, tenant_id=None, all_scopes=True, tenant_filter=tenant_id, scope=scope, page=page, page_size=page_size
    )
    _audit(
        db, request, user,
        action="BACKUP_OVERSIGHT_DESTINATIONS_VIEWED", outcome="SUCCESS", tenant_id=None,
        details=f"filter_tenant={tenant_id or 'all'} scope={scope or 'all'}",
    )
    db.commit()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@superadmin_router.get("/logs", response_model=RunLogPage)
def admin_list_logs(
    request: Request,
    tenant_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    scope: Optional[str] = Query(None, pattern="^(platform|tenant)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: Any = Depends(super_admin_dep),
    db: Session = Depends(get_platform_db),
):
    try:
        items, total = svc.list_run_logs(
            db, tenant_id=None, all_scopes=True, tenant_filter=tenant_id, scope=scope,
            status=status_filter, page=page, page_size=page_size,
        )
    except svc.DestinationValidationError as err:
        raise _validation_error(err)
    _audit(
        db, request, user,
        action="BACKUP_OVERSIGHT_LOGS_VIEWED", outcome="SUCCESS", tenant_id=None,
        details=f"filter_tenant={tenant_id or 'all'} status={status_filter or 'all'} scope={scope or 'all'}",
    )
    db.commit()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@superadmin_router.post("/destinations", response_model=DestinationOut, status_code=status.HTTP_201_CREATED)
def admin_create_platform_destination(
    payload: PlatformDestinationCreate,
    request: Request,
    user: Any = Depends(super_admin_dep),
    db: Session = Depends(get_platform_db),
):
    """Platform-wide destination (tenant_id NULL): receives the PLATFORM archive only."""
    try:
        row = svc.create_destination(
            db,
            tenant_id=None,
            actor_id=getattr(user, "id", None),
            provider_type=payload.provider_type,
            name=payload.name,
            config=payload.config,
            credentials=payload.credentials,
            platform_credential_ref=payload.credential_ref,
            is_active=payload.is_active,
        )
        _audit(
            db, request, user,
            action="BACKUP_PLATFORM_DESTINATION_CREATED", outcome="SUCCESS", tenant_id=None,
            destination_id=row.id,
            details=f"destination={row.id} provider={row.provider_type}",
        )
        db.commit()
    except svc.DestinationValidationError as err:
        db.rollback()
        raise _validation_error(err)
    db.refresh(row)
    return _out(row, db)


@superadmin_router.put("/destinations/{destination_id}", response_model=DestinationOut)
def admin_update_platform_destination(
    destination_id: str,
    payload: PlatformDestinationUpdate,
    request: Request,
    user: Any = Depends(super_admin_dep),
    db: Session = Depends(get_platform_db),
):
    row = _load_scoped_or_404(db, request, user, destination_id, None)
    try:
        changes = svc.update_destination(
            db, row,
            name=payload.name, config=payload.config, credentials=payload.credentials,
            platform_credential_ref=payload.credential_ref, is_active=payload.is_active,
        )
        _audit(
            db, request, user,
            action="BACKUP_PLATFORM_DESTINATION_UPDATED", outcome="SUCCESS", tenant_id=None,
            destination_id=row.id,
            details=f"destination={row.id} fields={','.join(changes.fields) or 'none'}",
        )
        db.commit()
    except svc.DestinationValidationError as err:
        db.rollback()
        raise _validation_error(err)
    db.refresh(row)
    return _out(row, db)


@superadmin_router.delete("/destinations/{destination_id}", status_code=status.HTTP_200_OK)
def admin_delete_platform_destination(
    destination_id: str,
    request: Request,
    user: Any = Depends(super_admin_dep),
    db: Session = Depends(get_platform_db),
):
    row = _load_scoped_or_404(db, request, user, destination_id, None)
    deleted_id = row.id
    svc.delete_destination(db, row)
    _audit(
        db, request, user,
        action="BACKUP_PLATFORM_DESTINATION_DELETED", outcome="SUCCESS", tenant_id=None,
        destination_id=deleted_id, details=f"destination={deleted_id}",
    )
    db.commit()
    return {"success": True, "id": str(deleted_id)}


@superadmin_router.post("/destinations/{destination_id}/test", response_model=TestResult)
def admin_test_platform_destination(
    destination_id: str,
    request: Request,
    user: Any = Depends(super_admin_dep),
    db: Session = Depends(get_platform_db),
):
    row = _load_scoped_or_404(db, request, user, destination_id, None)
    ok, message = svc.check_destination_connection(row, _provider())
    _audit(
        db, request, user,
        action="BACKUP_PLATFORM_DESTINATION_TESTED", outcome="SUCCESS" if ok else "FAILED", tenant_id=None,
        destination_id=row.id, details=f"destination={row.id}",
    )
    db.commit()
    return {"ok": ok, "message": message}
