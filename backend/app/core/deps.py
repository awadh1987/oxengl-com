"""
FastAPI Security & Tenant Isolation Dependencies for OxenGL Master Platform.
Location: backend/app/core/deps.py
"""

from __future__ import annotations

import uuid
from typing import Any, Optional, Union

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.database import get_db
import backend.models as models
from backend.models import ResCompany, ResUser, User
from backend.api.dependencies import (
    ADMIN,
    ACCOUNTANT,
    READ_ONLY,
    STANDARD_ROLES,
    SUPER_ADMIN,
    RoleChecker,
    TenantContext,
    get_current_user,
    get_current_active_user,
    normalize_role,
    require_role,
    get_tenant_context,
    get_active_company_id as api_get_active_company_id,
)
from backend.app.core.auth import (
    is_super_admin_authorized,
    require_super_admin,
    get_current_active_superuser,
    verify_super_admin_role,
)


def get_active_company_id(
    request: Request,
    x_company_id: Optional[str] = Header(default=None),
    x_tenant_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> uuid.UUID:
    """
    Extracts and validates active company UUID with Super Admin bypass,
    dynamic context injection, and graceful fallback for NULL company IDs.
    """
    user_role = str(getattr(current_user, "role", "")).lower().replace(" ", "_")
    is_super_admin = (
        getattr(current_user, "is_superuser", False) is True
        or getattr(current_user, "is_super_admin", False) is True
        or user_role in ["super_admin", "superadmin", "root", "master"]
        or is_super_admin_authorized(current_user, request)
    )

    cid_str = (
        x_company_id
        or x_tenant_id
        or request.headers.get("x-company-id")
        or request.headers.get("x-tenant-id")
        or request.headers.get("x-target-company-id")
        or request.query_params.get("company_id")
        or request.query_params.get("tenant_id")
        or (str(getattr(request.state, "company_id", None)) if getattr(request.state, "company_id", None) else None)
        or (str(getattr(request.state, "tenant_company_id", None)) if getattr(request.state, "tenant_company_id", None) else None)
    )

    requested_uuid: Optional[uuid.UUID] = None
    if cid_str:
        try:
            requested_uuid = uuid.UUID(str(cid_str).strip())
        except (ValueError, TypeError) as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Company-ID must be a valid UUID",
            ) from err

    # Graceful fallback for NULL user.company_id
    if current_user.company_id is None:
        target_to_assign = requested_uuid
        if not target_to_assign:
            raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
            if raw_host:
                try:
                    from backend.app.core.middleware import resolve_tenant_from_host
                    tmeta = resolve_tenant_from_host(raw_host, db=db)
                    if tmeta and tmeta.get("company_id"):
                        target_to_assign = uuid.UUID(str(tmeta["company_id"]))
                except Exception:
                    pass
        if not target_to_assign:
            first_comp = db.query(ResCompany).order_by(ResCompany.created_at.asc()).first()
            if first_comp:
                target_to_assign = first_comp.id

        if target_to_assign:
            comp_obj = db.get(ResCompany, target_to_assign)
            if comp_obj:
                try:
                    current_user.company_id = comp_obj.id
                    db.commit()
                    db.refresh(current_user)
                except Exception:
                    db.rollback()
                    current_user.company_id = comp_obj.id

    if requested_uuid:
        comp = db.get(ResCompany, requested_uuid)
        if comp is None:
            from backend.models import MasterTenant
            req_master = db.get(MasterTenant, requested_uuid)
            if req_master:
                comp = db.query(ResCompany).filter(
                    (ResCompany.slug == req_master.slug)
                    | (ResCompany.domain_slug == req_master.slug)
                ).first()

        if comp is None:
            if is_super_admin:
                first_row = db.query(ResCompany.id).order_by(ResCompany.created_at.asc()).first()
                effective_id = current_user.company_id or (first_row[0] if first_row else None)
                if not effective_id:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Active company was not found",
                    )
                cid = effective_id
            elif not request.query_params.get("company_id") and not request.query_params.get("tenant_id") and current_user.company_id:
                cid = current_user.company_id
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Active company was not found",
                )
        else:
            cid = comp.id
    else:
        if current_user.company_id:
            cid = current_user.company_id
        else:
            first_comp = db.query(ResCompany).order_by(ResCompany.created_at.asc()).first()
            if first_comp:
                current_user.company_id = first_comp.id
                try:
                    db.commit()
                    db.refresh(current_user)
                except Exception:
                    db.rollback()
                cid = first_comp.id
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="X-Company-ID or X-Tenant-ID header is required",
                )

    is_exec_role = (
        is_super_admin
        or user_role in ["super_admin", "superadmin", "owner", "tenant_owner", "company_owner", "admin", "ceo", "executive"]
    )
    if not is_exec_role and current_user.company_id and cid != current_user.company_id:
        user_comp = db.get(ResCompany, current_user.company_id)
        is_same = False
        if user_comp and comp:
            if user_comp.id == comp.id or user_comp.slug == comp.slug or user_comp.domain_slug == comp.domain_slug:
                is_same = True
        if not is_same:
            if not request.query_params.get("company_id") and not request.query_params.get("tenant_id"):
                cid = current_user.company_id
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Authenticated user is not authorized for this company",
                )

    # Dynamic Context Injection into request.state
    request.state.company_id = cid
    request.state.tenant_company_id = cid
    request.state.tenant_id = str(cid)

    return cid
