"""
Authoritative FastAPI router for Tenant Human Resources module.
Filename: backend/app/api/v1/tenant_hr.py

Provides:
- POST /api/v1/tenant/hr/employees: Transactional employee registration pipeline linking ResUser IAM and HrEmployee.
- GET  /api/v1/tenant/hr/employees: Lists employees strictly isolated by company_id and tenant RLS.
"""
from __future__ import annotations

import logging
from pathlib import Path
import secrets
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request, status
from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models
from backend.two_tier_auth import hash_password
from backend.app.core.auth import get_authenticated_user, is_super_admin_authorized
from backend.app.domains.iam.role_catalog import (
    ALLOWED_RES_USER_ROLES,
    WORKSPACE_ASSIGNABLE_ROLES,
    normalize_role_token,
)

logger = logging.getLogger("oxengl.tenant_hr")

router = APIRouter(tags=["Tenant Human Resources"])

TENANT_ADMIN_ROLES = frozenset({
    "OWNER",
    "ADMIN",
    "ADMINISTRATOR",
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "COMPANY_OWNER",
    "COMPANY_ADMIN",
    "CEO",
    "COO",
    "HR_ADMIN",
    "HR_MANAGER",
    "SUPER_ADMIN",
    "SUPERADMIN",
})


def _caller_tenant_id(user: models.ResUser, request: Optional[Request] = None) -> uuid.UUID:
    """Derive active company ID for user, allowing Super Admin header bypass."""
    if is_super_admin_authorized(user, request) and request:
        req_cid = (
            request.headers.get("x-company-id")
            or request.headers.get("x-tenant-id")
            or request.headers.get("x-target-company-id")
            or request.query_params.get("company_id")
            or request.query_params.get("tenant_id")
        )
        if req_cid:
            try:
                return uuid.UUID(str(req_cid).strip())
            except (ValueError, TypeError):
                pass

    cid = getattr(user, "company_id", None)
    if not cid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated user is not bound to a tenant workspace.",
        )
    return cid if isinstance(cid, uuid.UUID) else uuid.UUID(str(cid))


def require_tenant_admin(
    request: Request,
    current_user: models.ResUser = Depends(get_authenticated_user),
) -> models.ResUser:
    """Enforce that caller has tenant administrative or HR management rights."""
    user_role = str(getattr(current_user, "role", "") or "").strip().upper().replace("-", "_").replace(" ", "_")
    if user_role not in TENANT_ADMIN_ROLES and not is_super_admin_authorized(current_user, request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant administrator or HR Manager permissions required.",
        )
    return current_user


# ------------------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------------------

class RegisterEmployeeRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255, description="Full name of the employee")
    email: EmailStr = Field(..., description="Corporate or personal email for login")
    role: str = Field(default="Standard", description="Internal IAM role: 'Manager', 'Standard', 'Admin', etc.")
    password: Optional[str] = Field(default=None, description="Initial password; auto-generated if omitted")
    phone: Optional[str] = Field(default=None, description="Mobile contact number")

    job_title: str = Field(default="Staff", description="Job title")
    department: Optional[str] = Field(default=None, description="Department name or category")
    department_id: Optional[str] = Field(default=None, description="Department ID")
    employee_id: Optional[str] = Field(default=None, description="Employee code; generated if omitted")
    hire_date: Optional[date] = Field(default=None, description="Hire date; default today")
    employment_status: Optional[str] = Field(default="ACTIVE", description="ACTIVE, ON_LEAVE, etc.")
    base_salary: Optional[Decimal] = Field(default=Decimal("0.00"), description="Base salary (SAR)")
    manager_id: Optional[uuid.UUID] = Field(default=None, description="Direct manager HrEmployee UUID")

    # Flexible compatibility aliases
    name: Optional[str] = None
    name_ar: Optional[str] = None
    name_en: Optional[str] = None

    @field_validator("full_name", mode="before")
    @classmethod
    def _coerce_name(cls, value: Any, values: Any) -> str:
        if value:
            return str(value).strip()
        data = getattr(values, "data", {}) if hasattr(values, "data") else {}
        fallback = data.get("name") or data.get("name_en") or data.get("name_ar") or "Staff Member"
        return str(fallback).strip()


class HrEmployeeRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    company_id: uuid.UUID
    employee_id: str
    department_id: Optional[str] = None
    department: Optional[str] = None
    job_title: str
    hire_date: date
    employment_status: str
    status: str
    base_salary: float
    manager_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    # IAM Profile Details
    full_name: str
    email: str
    phone: Optional[str] = None
    role: str
    iam_role: Optional[str] = None
    is_active: bool
    must_change_password: bool

    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# Notification & SMTP Dispatch Pipeline
# ------------------------------------------------------------------------------

async def dispatch_employee_welcome_email(
    *,
    email: str,
    full_name: str,
    temporary_password: str,
    company_id: uuid.UUID,
    company_name: Optional[str] = None,
    job_title: Optional[str] = None,
    role: Optional[str] = None,
    db: Optional[Session] = None,
) -> bool:
    """
    Renders standard notification template and dispatches SMTP welcome/password-reset email.
    """
    subject = f"Welcome to {company_name or 'OxenGL'} - Your Staff Account Credentials"
    workspace_label = company_name or "Workspace"
    first_name = full_name.split()[0] if full_name else "there"

    from backend.app.services.email_service import (
        dispatch_user_invitation,
        construct_workspace_login_url,
        resolve_tenant_logo_url,
    )
    from backend.models import ResCompany

    company = db.get(ResCompany, company_id) if (db and company_id) else None
    tenant_logo = resolve_tenant_logo_url(company)
    action_url = construct_workspace_login_url(company)

    tenant_ctx = {
        "name": company.name if company else workspace_label,
        "logo_url": tenant_logo,
        "workspace_domain": (getattr(company, "workspace_domain", None) or "portal.oxengl.com"),
        "support_email": (getattr(company, "support_email", None) or "support@oxengl.com"),
        "signature_name": (getattr(company, "signature_name", None) or f"{company.name if company else workspace_label} Administration"),
        "signature_title": (getattr(company, "signature_title", None) or "Human Resources"),
    }
    custom_smtp = getattr(company, "custom_smtp_settings", None) if company else None

    dispatched = await dispatch_user_invitation(
        recipient_email=email,
        first_name=first_name,
        role=role or "Staff",
        action_url=action_url,
        inviter_name=f"{tenant_ctx['name']} HR Team",
        tenant=tenant_ctx,
        temp_password=temporary_password,
        expiry_hours=48,
        custom_smtp=custom_smtp,
    )
    if dispatched:
        logger.info("Dispatched employee welcome credentials via dispatch_user_invitation to %s", email)
    return dispatched


def _resolve_roles(requested_role: str) -> tuple[str, str]:
    """
    Returns (legacy_role, iam_role) ensuring db CHECK constraint ck_res_user_role is satisfied.
    """
    token = (requested_role or "Standard").strip()
    norm = token.lower()

    if norm in ("manager", "mgr", "operations_manager"):
        return "Ops_Manager", "Manager"
    if norm in ("standard", "employee", "staff", "user"):
        return "User", "Standard"
    if norm in ("admin", "administrator"):
        return "Admin", "Admin"
    if norm in ("hr_manager", "hrm"):
        return "HR_Manager", "HR_Manager"
    if norm in ("finance_manager", "fm"):
        return "Finance_Manager", "Finance_Manager"

    # Search existing allowed catalog
    for allowed in ALLOWED_RES_USER_ROLES:
        if allowed.lower() == norm:
            return allowed, token

    return "User", token


# ------------------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------------------

@router.post("/employees", response_model=HrEmployeeRead, status_code=status.HTTP_201_CREATED)
async def register_employee(
    payload: RegisterEmployeeRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: models.ResUser = Depends(require_tenant_admin),
    database: Session = Depends(get_db),
):
    """
    Transactional pipeline:
    1. Creates foundational ResUser IAM record (assigning internal roles like 'Manager' or 'Standard').
    2. Creates TenantUserRole for tenant authorization.
    3. Generates linked HrEmployee profile with 1-to-1 linkage and strict RLS tenant isolation.
    4. Triggers SMTP welcome/password-reset email dispatch.
    """
    company_id = _caller_tenant_id(current_user, request)
    company = database.get(models.ResCompany, company_id)
    company_name = company.name if company else "Workspace"

    email_clean = payload.email.lower().strip()
    existing_user = database.scalar(
        select(models.ResUser).where(func.lower(models.ResUser.email) == email_clean)
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A user with email '{email_clean}' is already registered.",
        )

    # 1. Credentials
    raw_password = payload.password or secrets.token_urlsafe(16)
    password_hash = hash_password(raw_password)

    legacy_role, iam_role = _resolve_roles(payload.role)
    user_id = uuid.uuid4()
    hr_emp_id = uuid.uuid4()

    new_user = models.ResUser(
        id=user_id,
        firebase_uid=f"native:{email_clean}",
        email=email_clean,
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        password_hash=password_hash,
        company_id=company_id,
        role=legacy_role,
        iam_role=iam_role,
        must_change_password=True,
        is_active=True,
    )
    database.add(new_user)
    database.flush()

    # 2. Relational tenant membership role
    tur = models.TenantUserRole(
        id=uuid.uuid4(),
        user_id=new_user.id,
        company_id=company_id,
        role=legacy_role,
        is_active=True,
    )
    database.add(tur)

    # 3. Employee ID sequence
    emp_code = (payload.employee_id or "").strip()
    if not emp_code:
        try:
            from backend.app.services.sequence_service import SequenceService
            emp_code = SequenceService.get_next_sequence(database, company_id, "employee")
        except Exception:
            emp_code = f"EMP-{secrets.token_hex(3).upper()}"

    dept = (payload.department_id or payload.department or "General").strip()

    # 4. HrEmployee profile
    hr_emp = models.HrEmployee(
        id=hr_emp_id,
        user_id=new_user.id,
        company_id=company_id,
        employee_id=emp_code,
        department_id=dept,
        job_title=payload.job_title.strip() or "Staff",
        hire_date=payload.hire_date or date.today(),
        employment_status=(payload.employment_status or "ACTIVE").upper(),
        base_salary=payload.base_salary if payload.base_salary is not None else Decimal("0.00"),
        manager_id=payload.manager_id,
    )
    database.add(hr_emp)



    # Commit the transaction atomically
    database.commit()
    database.refresh(hr_emp)
    database.refresh(new_user)

    # 6. Dispatch SMTP welcome/password-reset email
    # Awaited so unit tests and callers can verify delivery
    await dispatch_employee_welcome_email(
        email=email_clean,
        full_name=new_user.full_name,
        temporary_password=raw_password,
        company_id=company_id,
        company_name=company_name,
        job_title=hr_emp.job_title,
        role=iam_role,
        db=database,
    )

    return HrEmployeeRead(
        id=hr_emp.id,
        user_id=hr_emp.user_id,
        company_id=hr_emp.company_id,
        employee_id=hr_emp.employee_id,
        department_id=hr_emp.department_id,
        department=hr_emp.department_id,
        job_title=hr_emp.job_title,
        hire_date=hr_emp.hire_date,
        employment_status=hr_emp.employment_status,
        status=hr_emp.employment_status,
        base_salary=float(hr_emp.base_salary),
        manager_id=hr_emp.manager_id,
        created_at=hr_emp.created_at,
        updated_at=hr_emp.updated_at,
        full_name=new_user.full_name,
        email=new_user.email,
        phone=new_user.phone,
        role=new_user.role,
        iam_role=new_user.iam_role,
        is_active=new_user.is_active,
        must_change_password=new_user.must_change_password,
    )


@router.get("/employees", response_model=List[HrEmployeeRead])
def list_employees(
    request: Request,
    department: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: models.ResUser = Depends(require_tenant_admin),
    database: Session = Depends(get_db),
):
    """
    List HR staff for the authenticated tenant with RLS enforcement.
    """
    company_id = _caller_tenant_id(current_user, request)

    query = (
        database.query(models.HrEmployee)
        .join(models.ResUser, models.HrEmployee.user_id == models.ResUser.id)
        .filter(models.HrEmployee.company_id == company_id)
    )

    if department:
        query = query.filter(models.HrEmployee.department_id == department)

    if status_filter:
        query = query.filter(models.HrEmployee.employment_status == status_filter.upper())

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.HrEmployee.employee_id.ilike(s),
                models.HrEmployee.job_title.ilike(s),
                models.ResUser.full_name.ilike(s),
                models.ResUser.email.ilike(s),
            )
        )

    records = query.order_by(models.HrEmployee.created_at.desc()).all()

    return [
        HrEmployeeRead(
            id=emp.id,
            user_id=emp.user_id,
            company_id=emp.company_id,
            employee_id=emp.employee_id,
            department_id=emp.department_id,
            department=emp.department_id,
            job_title=emp.job_title,
            hire_date=emp.hire_date,
            employment_status=emp.employment_status,
            status=emp.employment_status,
            base_salary=float(emp.base_salary),
            manager_id=emp.manager_id,
            created_at=emp.created_at,
            updated_at=emp.updated_at,
            full_name=emp.user.full_name if emp.user else "Staff",
            email=emp.user.email if emp.user else "",
            phone=emp.user.phone if emp.user else None,
            role=emp.user.role if emp.user else "Standard",
            iam_role=emp.user.iam_role if emp.user else None,
            is_active=emp.user.is_active if emp.user else True,
            must_change_password=emp.user.must_change_password if emp.user else False,
        )
        for emp in records
    ]
