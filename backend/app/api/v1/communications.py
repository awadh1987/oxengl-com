"""Tenant and platform management APIs for transactional email and SMS settings."""
from __future__ import annotations

import dataclasses
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.domains.hr.audit import append_audit_from_context, build_audit_context
from backend.app.services import communication_service as svc
from backend.app.database import get_db
from backend.database import get_platform_db
from backend.models import CommunicationSetting, ResCompany, TenantAuditLog

try:
    from backend.rate_limiter import limiter
except (ImportError, ValueError):
    from rate_limiter import limiter


tenant_router = APIRouter(prefix="/api/v1/tenant-control/communications", tags=["Tenant Communications"])
superadmin_router = APIRouter(prefix="/api/v1/superadmin/communications", tags=["Super Admin Communications"])


class SettingCreate(BaseModel):
    channel: str
    provider: str
    sender_identity: str
    config: dict[str, Any] = Field(default_factory=dict)
    credentials: Any = Field(default=None, repr=False)
    is_active: bool = True


class SettingUpdate(BaseModel):
    channel: str | None = None
    provider: str | None = None
    sender_identity: str | None = None
    config: dict[str, Any] | None = None
    credentials: Any = Field(default=None, repr=False)
    is_active: bool | None = None


class SettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID | None
    scope: str
    tenant_name: str | None = None
    channel: str
    provider: str
    sender_identity: str
    config: dict[str, Any]
    is_active: bool
    has_credential: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
    created_by: uuid.UUID | None = None
    last_test_at: datetime | None = None
    last_test_status: str | None = None
    last_test_error: str | None = None


class TestRequest(BaseModel):
    recipient: str = Field(min_length=3, max_length=320, repr=False)


class TestResult(BaseModel):
    ok: bool
    message: str


def current_user_dep(request: Request, db: Session = Depends(get_db)) -> Any:
    from backend.app.core.auth import get_authenticated_user
    return get_authenticated_user(request, db)


def _normalize_role(value: Any) -> str:
    return str(value or "").strip().upper().replace("-", "_").replace(" ", "_")


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


def _is_super_admin(user: Any) -> bool:
    from backend.app.core.auth import is_super_admin_authorized
    return bool(is_super_admin_authorized(user, None))


def _audit(
    db: Session, request: Request, user: Any, *, action: str, outcome: str,
    tenant_id: uuid.UUID | None, setting_id: uuid.UUID | None = None,
) -> None:
    context = build_audit_context(
        request,
        actor_id=_uuid(getattr(user, "id", None)),
        actor_identifier=getattr(user, "email", None),
    )
    if setting_id:
        context = dataclasses.replace(context, endpoint=f"{context.endpoint}#communication={setting_id}"[:255])
    append_audit_from_context(db, context, action=action, outcome=outcome, tenant_id=tenant_id)
    if tenant_id is not None:
        db.add(TenantAuditLog(
            id=str(uuid.uuid4()), tenant_id=tenant_id, action_type=action[:50],
            actor=str(getattr(user, "email", None) or "unknown")[:100],
            details=f"communication_setting={setting_id or 'none'} ip={context.ip_address or 'unknown'} outcome={outcome}",
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))


def _tenant_admin(request: Request, user: Any = Depends(current_user_dep), db: Session = Depends(get_db)) -> tuple[Any, uuid.UUID]:
    tenant_id = _uuid(getattr(user, "company_id", None))
    if _normalize_role(getattr(user, "role", None)) not in {"ADMIN", "OWNER"} or tenant_id is None:
        _audit(db, request, user, action="COMMUNICATION_ACCESS_DENIED", outcome="DENIED", tenant_id=tenant_id)
        db.commit()
        raise HTTPException(status_code=403, detail="Tenant Owner or Admin role is required.")
    return user, tenant_id


def _super_admin(request: Request, user: Any = Depends(current_user_dep), db: Session = Depends(get_db)) -> Any:
    if not _is_super_admin(user):
        tenant_id = _uuid(getattr(user, "company_id", None))
        _audit(db, request, user, action="COMMUNICATION_SUPERADMIN_DENIED", outcome="DENIED", tenant_id=tenant_id)
        db.commit()
        raise HTTPException(status_code=403, detail="Platform Super Admin role is required.")
    request.state.platform_db_authorized = True
    return user


def _setting_or_404(db: Session, request: Request, user: Any, raw_id: str, tenant_id: uuid.UUID | None) -> CommunicationSetting:
    setting_id = _uuid(raw_id)
    row = None
    if setting_id is not None:
        row = db.scalar(select(CommunicationSetting).where(
            CommunicationSetting.id == setting_id,
            CommunicationSetting.tenant_id == tenant_id if tenant_id is not None else CommunicationSetting.tenant_id.is_(None),
        ))
    if row is None:
        _audit(
            db, request, user,
            action="COMMUNICATION_SETTING_ACCESS_DENIED",
            outcome="DENIED",
            tenant_id=tenant_id,
            setting_id=setting_id,
        )
        db.commit()
        raise HTTPException(status_code=404, detail="Communication setting not found.")
    return row


def _safe_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


def _setting_payload(row: CommunicationSetting, tenant_name: str | None = None) -> dict[str, Any]:
    return {**svc.serialize_setting(row), "tenant_name": tenant_name}


def _create(
    db: Session, request: Request, user: Any, tenant_id: uuid.UUID | None, payload: SettingCreate,
) -> dict[str, Any]:
    try:
        row = svc.create_setting(
            db, tenant_id=tenant_id, actor_id=_uuid(getattr(user, "id", None)),
            channel=payload.channel, provider=payload.provider, sender_identity=payload.sender_identity,
            config=payload.config, credentials=payload.credentials, is_active=payload.is_active,
        )
        _audit(db, request, user, action="COMMUNICATION_SETTING_CREATED", outcome="SUCCESS", tenant_id=tenant_id, setting_id=row.id)
        db.commit()
        db.refresh(row)
        return _setting_payload(row)
    except (ValueError, svc.CommunicationError) as exc:
        db.rollback()
        _audit(db, request, user, action="COMMUNICATION_SETTING_CREATE_DENIED", outcome="DENIED", tenant_id=tenant_id)
        db.commit()
        raise _safe_error(exc) from None
    except IntegrityError:
        db.rollback()
        _audit(db, request, user, action="COMMUNICATION_SETTING_CREATE_FAILED", outcome="FAILED", tenant_id=tenant_id)
        db.commit()
        raise HTTPException(status_code=409, detail="An active setting already exists for this channel.") from None


def _update(db: Session, request: Request, user: Any, tenant_id: uuid.UUID | None, row: CommunicationSetting, payload: SettingUpdate) -> dict[str, Any]:
    try:
        svc.update_setting(db, row, payload.model_dump(exclude_unset=True))
        _audit(db, request, user, action="COMMUNICATION_SETTING_UPDATED", outcome="SUCCESS", tenant_id=tenant_id, setting_id=row.id)
        db.commit()
        db.refresh(row)
        return _setting_payload(row)
    except (ValueError, svc.CommunicationError) as exc:
        db.rollback()
        _audit(db, request, user, action="COMMUNICATION_SETTING_UPDATE_DENIED", outcome="DENIED", tenant_id=tenant_id, setting_id=row.id)
        db.commit()
        raise _safe_error(exc) from None
    except IntegrityError:
        db.rollback()
        _audit(db, request, user, action="COMMUNICATION_SETTING_UPDATE_FAILED", outcome="FAILED", tenant_id=tenant_id, setting_id=row.id)
        db.commit()
        raise HTTPException(status_code=409, detail="An active setting already exists for this channel.") from None


def _validate_test_recipient(row: CommunicationSetting, recipient: str) -> None:
    value = recipient.strip()
    if row.channel == "email":
        import re
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise HTTPException(status_code=422, detail="A valid test email recipient is required.")
    elif not __import__("re").fullmatch(r"\+?[0-9][0-9 ()-]{6,24}", value):
        raise HTTPException(status_code=422, detail="A valid test SMS recipient is required.")


async def _test(db: Session, request: Request, user: Any, tenant_id: uuid.UUID | None, row: CommunicationSetting, recipient: str) -> dict[str, Any]:
    try:
        _validate_test_recipient(row, recipient)
    except HTTPException:
        _audit(db, request, user, action="COMMUNICATION_SETTING_TEST_DENIED", outcome="DENIED", tenant_id=tenant_id, setting_id=row.id)
        db.commit()
        raise
    ok, message = await svc.test_setting(db, row, recipient.strip())
    _audit(
        db, request, user,
        action="COMMUNICATION_SETTING_TESTED",
        outcome="SUCCESS" if ok else "FAILED",
        tenant_id=tenant_id,
        setting_id=row.id,
    )
    db.commit()
    return {"ok": ok, "message": message}


@tenant_router.get("", response_model=list[SettingOut])
def list_tenant_settings(ctx: tuple[Any, uuid.UUID] = Depends(_tenant_admin), db: Session = Depends(get_db)):
    user, tenant_id = ctx
    rows = db.scalars(select(CommunicationSetting).where(CommunicationSetting.tenant_id == tenant_id).order_by(CommunicationSetting.channel)).all()
    return [_setting_payload(row) for row in rows]


@tenant_router.post("", response_model=SettingOut, status_code=status.HTTP_201_CREATED)
def create_tenant_setting(payload: SettingCreate, request: Request, ctx: tuple[Any, uuid.UUID] = Depends(_tenant_admin), db: Session = Depends(get_db)):
    user, tenant_id = ctx
    return _create(db, request, user, tenant_id, payload)


@tenant_router.put("/{setting_id}", response_model=SettingOut)
def update_tenant_setting(setting_id: str, payload: SettingUpdate, request: Request, ctx: tuple[Any, uuid.UUID] = Depends(_tenant_admin), db: Session = Depends(get_db)):
    user, tenant_id = ctx
    row = _setting_or_404(db, request, user, setting_id, tenant_id)
    return _update(db, request, user, tenant_id, row, payload)


@tenant_router.delete("/{setting_id}")
def delete_tenant_setting(setting_id: str, request: Request, ctx: tuple[Any, uuid.UUID] = Depends(_tenant_admin), db: Session = Depends(get_db)):
    user, tenant_id = ctx
    row = _setting_or_404(db, request, user, setting_id, tenant_id)
    deleted_id = svc.delete_setting(db, row)
    _audit(db, request, user, action="COMMUNICATION_SETTING_DELETED", outcome="SUCCESS", tenant_id=tenant_id, setting_id=deleted_id)
    db.commit()
    return {"success": True, "id": str(deleted_id)}


@tenant_router.post("/{setting_id}/test", response_model=TestResult)
@limiter.limit("5/minute")
async def test_tenant_setting(setting_id: str, payload: TestRequest, request: Request, ctx: tuple[Any, uuid.UUID] = Depends(_tenant_admin), db: Session = Depends(get_db)):
    user, tenant_id = ctx
    row = _setting_or_404(db, request, user, setting_id, tenant_id)
    return await _test(db, request, user, tenant_id, row, payload.recipient)


@superadmin_router.get("", response_model=list[SettingOut])
def list_all_settings(
    request: Request,
    channel: str | None = Query(None, pattern="^(email|sms)$"),
    provider: str | None = Query(None, pattern="^(smtp|sendgrid|twilio|unifonic|taqnyat)$"),
    scope: str | None = Query(None, pattern="^(platform|tenant)$"),
    tenant_id: uuid.UUID | None = Query(None),
    user: Any = Depends(_super_admin),
    db: Session = Depends(get_platform_db),
):
    query = select(CommunicationSetting)
    if channel:
        query = query.where(CommunicationSetting.channel == channel)
    if provider:
        query = query.where(CommunicationSetting.provider == provider)
    if scope == "platform":
        query = query.where(CommunicationSetting.tenant_id.is_(None))
    elif scope == "tenant":
        query = query.where(CommunicationSetting.tenant_id.is_not(None))
    if tenant_id is not None:
        query = query.where(CommunicationSetting.tenant_id == tenant_id)
    rows = db.scalars(query.order_by(CommunicationSetting.tenant_id, CommunicationSetting.channel)).all()
    tenant_ids = {row.tenant_id for row in rows if row.tenant_id is not None}
    names = {}
    if tenant_ids:
        names = dict(db.execute(select(ResCompany.id, ResCompany.name).where(ResCompany.id.in_(tenant_ids))).all())
    _audit(db, request, user, action="COMMUNICATION_OVERSIGHT_VIEWED", outcome="SUCCESS", tenant_id=None)
    db.commit()
    return [_setting_payload(row, names.get(row.tenant_id)) for row in rows]


@superadmin_router.post("", response_model=SettingOut, status_code=status.HTTP_201_CREATED)
def create_platform_setting(payload: SettingCreate, request: Request, user: Any = Depends(_super_admin), db: Session = Depends(get_platform_db)):
    return _create(db, request, user, None, payload)


@superadmin_router.put("/{setting_id}", response_model=SettingOut)
def update_platform_setting(setting_id: str, payload: SettingUpdate, request: Request, user: Any = Depends(_super_admin), db: Session = Depends(get_platform_db)):
    row = _setting_or_404(db, request, user, setting_id, None)
    return _update(db, request, user, None, row, payload)


@superadmin_router.delete("/{setting_id}")
def delete_platform_setting(setting_id: str, request: Request, user: Any = Depends(_super_admin), db: Session = Depends(get_platform_db)):
    parsed_id = _uuid(setting_id)
    row = db.get(CommunicationSetting, parsed_id) if parsed_id is not None else None
    if row is None or row.tenant_id is not None:
        _audit(
            db, request, user,
            action="COMMUNICATION_SETTING_ACCESS_DENIED",
            outcome="DENIED",
            tenant_id=None,
            setting_id=parsed_id,
        )
        db.commit()
        raise HTTPException(status_code=404, detail="Communication setting not found.")
    deleted_id = svc.delete_setting(db, row)
    _audit(db, request, user, action="COMMUNICATION_SETTING_DELETED", outcome="SUCCESS", tenant_id=None, setting_id=deleted_id)
    db.commit()
    return {"success": True, "id": str(deleted_id)}


@superadmin_router.post("/{setting_id}/test", response_model=TestResult)
@limiter.limit("5/minute")
async def test_platform_setting(setting_id: str, payload: TestRequest, request: Request, user: Any = Depends(_super_admin), db: Session = Depends(get_platform_db)):
    row = _setting_or_404(db, request, user, setting_id, None)
    return await _test(db, request, user, None, row, payload.recipient)
