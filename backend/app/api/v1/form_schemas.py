"""Tenant dynamic form schema API: inspect, register and configure custom field definitions.

Mounted under ``/api/v1/tenant`` (and ``/api/tenant``) => ``/api/v1/tenant/form-schemas``.
Every query is scoped to the authenticated caller's own ``company_id``; request-supplied tenant ids are ignored.
"""

from __future__ import annotations

import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend import models
from backend.app.api.v1.tenant_control import (
    _caller_tenant_id,
    enforce_caller_tenant_scope,
    require_tenant_admin,
)
from backend.app.core.auth import get_authenticated_user
from backend.app.services.custom_fields import DATA_TYPES, canonical_entity, slugify_key
from backend.database import get_db

router = APIRouter(
    prefix="/form-schemas",
    tags=["Tenant Dynamic Form Schemas"],
    dependencies=[Depends(get_authenticated_user), Depends(enforce_caller_tenant_scope)],
)


class FieldBase(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    label_ar: Optional[str] = Field(default=None, max_length=255)
    data_type: str = "text"
    options: Optional[List[str]] = None
    is_visible: bool = True
    is_required: bool = False
    sort_order: int = 0


class FieldCreate(FieldBase):
    entity: str
    field_key: str = Field(min_length=1, max_length=96)


class FieldUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=255)
    label_ar: Optional[str] = Field(default=None, max_length=255)
    data_type: Optional[str] = None
    options: Optional[List[str]] = None
    is_visible: Optional[bool] = None
    is_required: Optional[bool] = None
    sort_order: Optional[int] = None


class FieldRead(FieldBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    entity: str
    field_key: str
    source: str


def _check_type(data_type: str) -> str:
    if data_type not in DATA_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"data_type must be one of {list(DATA_TYPES)}")
    return data_type


def _entity_or_422(entity: str) -> str:
    canon = canonical_entity(entity)
    if not canon:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown target entity '{entity}'")
    return canon


def _audit(db: Session, request: Request, user: Any, action: str, company_id: uuid.UUID) -> None:
    from backend.app.main import get_request_id, record_platform_audit, resolve_client_ip

    record_platform_audit(
        db,
        actor_email=str(getattr(user, "email", "unknown")),
        action=action,
        endpoint=request.url.path,
        ip_address=resolve_client_ip(request),
        company_id=company_id,
        outcome="SUCCESS",
        request_id=get_request_id(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.get("", response_model=List[FieldRead])
def list_fields(
    entity: Optional[str] = None,
    visible_only: bool = False,
    db: Session = Depends(get_db),
    user: Any = Depends(get_authenticated_user),
):
    company_id = _caller_tenant_id(user)
    stmt = select(models.CustomFieldDefinition).where(models.CustomFieldDefinition.company_id == company_id)
    if entity:
        stmt = stmt.where(models.CustomFieldDefinition.entity == _entity_or_422(entity))
    if visible_only:
        stmt = stmt.where(models.CustomFieldDefinition.is_visible.is_(True))
    stmt = stmt.order_by(models.CustomFieldDefinition.sort_order, models.CustomFieldDefinition.label)
    return db.scalars(stmt).all()


@router.post("", response_model=FieldRead, status_code=status.HTTP_201_CREATED)
def register_field(
    payload: FieldCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: Any = Depends(require_tenant_admin),
):
    company_id = _caller_tenant_id(user)
    key = slugify_key(payload.field_key)
    if not key:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid field_key")
    row = models.CustomFieldDefinition(
        company_id=company_id,
        entity=_entity_or_422(payload.entity),
        field_key=key,
        source="manual",
        **payload.model_dump(exclude={"entity", "field_key"}),
    )
    _check_type(row.data_type)
    try:
        db.add(row)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A field with this key already exists for the entity")
    db.refresh(row)
    _audit(db, request, user, "CUSTOM_FIELD_CREATED", company_id)
    return row


def _get_owned(db: Session, company_id: uuid.UUID, field_id: uuid.UUID) -> models.CustomFieldDefinition:
    row = db.scalar(
        select(models.CustomFieldDefinition).where(
            models.CustomFieldDefinition.id == field_id,
            models.CustomFieldDefinition.company_id == company_id,
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Custom field not found")
    return row


@router.patch("/{field_id}", response_model=FieldRead)
def configure_field(
    field_id: uuid.UUID,
    payload: FieldUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: Any = Depends(require_tenant_admin),
):
    company_id = _caller_tenant_id(user)
    row = _get_owned(db, company_id, field_id)
    changes = payload.model_dump(exclude_unset=True)
    if "data_type" in changes:
        _check_type(changes["data_type"])
    for name, value in changes.items():
        if value is None and name in ("label", "data_type", "is_visible", "is_required", "sort_order"):
            continue
        setattr(row, name, value)
    db.commit()
    db.refresh(row)
    _audit(db, request, user, "CUSTOM_FIELD_UPDATED", company_id)
    return row


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field(
    field_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: Any = Depends(require_tenant_admin),
):
    company_id = _caller_tenant_id(user)
    db.delete(_get_owned(db, company_id, field_id))
    db.commit()
    _audit(db, request, user, "CUSTOM_FIELD_DELETED", company_id)
