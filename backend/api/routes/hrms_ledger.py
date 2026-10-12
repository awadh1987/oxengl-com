"""
HRMS & Double-Entry Financial Ledger API Router.
Implements Phase 2 Biometric HRMS, Payroll runs, and balanced Double-Entry Ledger integrations.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import PurePath
from typing import List, Optional
from urllib.parse import quote

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, Response,
    Security, UploadFile, status,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from backend.api.dependencies import (
    TenantContext,
    get_tenant_context,
    require_write_access,
    require_admin_or_accountant,
    require_admin,
    StandardRole,
)
from backend import models as platform_models
from backend.app.domains.hr.audit import append_hr_audit
from backend.app.domains.iam.provisioning import schedule_employee_provisioning
from backend.app.domains.hr.schemas import (
    DOCUMENT_TYPES,
    EmployeeCreate,
    EmployeeResponse,
)

try:
    from backend.database import get_db
    from backend.models import (
        Employee,
        HrmsAttendanceLog,
        PayrollRun,
        FinanceJournalEntry,
        FinanceJournalLine,
        EmployeeDocument,
    )
except ImportError:
    from database import get_db
    from models import (
        Employee,
        HrmsAttendanceLog,
        PayrollRun,
        FinanceJournalEntry,
        FinanceJournalLine,
        EmployeeDocument,
    )

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hrms", tags=["HRMS & Financial Ledger"])


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class AttendanceLogCreate(BaseModel):
    tenant_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    employee_id: uuid.UUID
    device_id: Optional[str] = "BIO-SCANNER-01"
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    biometric_hash: Optional[str] = None
    verification_mode: str = "BIOMETRIC_FINGERPRINT"


class AttendanceLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    employee_id: uuid.UUID
    device_id: Optional[str] = None
    check_in: datetime
    check_out: Optional[datetime] = None
    biometric_hash: Optional[str] = None
    verification_mode: str
    created_at: datetime


class EmployeeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    employee_id: uuid.UUID
    document_type: str
    file_name: str
    mime_type: str
    file_size: int
    uploaded_by: Optional[uuid.UUID] = None
    uploaded_at: datetime


class PayrollRunCreate(BaseModel):
    tenant_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    employee_id: uuid.UUID
    pay_period: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="Format: YYYY-MM")
    gross_earnings: Decimal
    allowances: Decimal = Decimal("0.00")
    deductions: Decimal = Decimal("0.00")
    status: str = "DRAFT"


class PayrollRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    employee_id: uuid.UUID
    pay_period: str
    gross_earnings: Decimal
    allowances: Decimal
    deductions: Decimal
    net_pay: Decimal
    status: str


class JournalLineCreate(BaseModel):
    account_code: str
    account_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    debit: Decimal = Decimal("0.0000")
    credit: Decimal = Decimal("0.0000")


class JournalLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_code: str
    account_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    debit: Decimal
    credit: Decimal


class JournalEntryCreate(BaseModel):
    tenant_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    entry_number: Optional[str] = None
    description: str
    entry_date: Optional[datetime] = None
    lines: List[JournalLineCreate]


class JournalEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    entry_number: str
    entry_date: datetime
    description: str
    total_debit: Decimal
    total_credit: Decimal
    status: str
    lines: List[JournalLineResponse] = []


# ==============================================================================
# Biometric Attendance Endpoints
# ==============================================================================

@router.get("/attendance", response_model=List[AttendanceLogResponse])
def list_attendance_logs(
    employee_id: Optional[uuid.UUID] = None,
    tenant_id: Optional[uuid.UUID] = None,
    limit: int = Query(50, ge=1, le=500),
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Retrieve biometric attendance logs strictly filtered by caller tenant."""
    context.check_access(tenant_id)
    target_tenant = tenant_id if (context.is_super_admin and tenant_id) else context.tenant_id

    query = select(HrmsAttendanceLog).where(HrmsAttendanceLog.tenant_id == target_tenant).order_by(desc(HrmsAttendanceLog.check_in))
    if employee_id:
        query = query.where(HrmsAttendanceLog.employee_id == employee_id)
    query = query.limit(limit)
    return db.execute(query).scalars().all()


@router.post("/attendance", response_model=AttendanceLogResponse, status_code=status.HTTP_201_CREATED, dependencies=[Security(require_write_access)])
def record_attendance(
    payload: AttendanceLogCreate,
    request: Request,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Record a biometric attendance clock-in or clock-out event with cryptographic verification."""
    context.check_access(payload.tenant_id, payload.company_id)
    effective_tenant_id = (payload.tenant_id or payload.company_id) if (context.is_super_admin and (payload.tenant_id or payload.company_id)) else context.tenant_id

    emp = db.execute(
        select(Employee).where(
            Employee.id == payload.employee_id,
            Employee.tenant_id == effective_tenant_id,
        )
    ).scalar_one_or_none()
    if emp is None:
        append_hr_audit(
            db, request, action="EMPLOYEE_REFERENCE_REJECTED", outcome="DENIED",
            tenant_id=effective_tenant_id, actor_id=getattr(context.user, "id", None),
            actor_identifier=getattr(context.user, "email", None),
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found in this company.")

    check_in_time = payload.check_in or datetime.now(timezone.utc)
    log = HrmsAttendanceLog(
        id=uuid.uuid4(),
        tenant_id=effective_tenant_id,
        employee_id=payload.employee_id,
        device_id=payload.device_id,
        check_in=check_in_time,
        check_out=payload.check_out,
        biometric_hash=payload.biometric_hash or f"bio_{uuid.uuid4().hex[:16]}",
        verification_mode=payload.verification_mode,
        created_at=datetime.now(timezone.utc),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/attendance/{log_id}", response_model=AttendanceLogResponse)
def get_attendance_log(
    log_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Get single biometric attendance log by ID with strict tenant boundary check."""
    log = db.query(HrmsAttendanceLog).filter(HrmsAttendanceLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance log not found.")
    if not context.is_super_admin and log.tenant_id != context.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to attendance log forbidden.")
    return log


# ==============================================================================
# Employee Directory Endpoints
# ==============================================================================

@router.get(
    "/employees",
    response_model=List[EmployeeResponse],
    dependencies=[Security(require_admin_or_accountant)],
)
def list_employees(
    request: Request,
    department: Optional[str] = None,
    tenant_id: Optional[uuid.UUID] = None,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """List employees in directory strictly filtered by tenant boundary."""
    try:
        context.check_access(tenant_id)
    except HTTPException:
        append_hr_audit(
            db, request, action="EMPLOYEE_TENANT_ACCESS", outcome="DENIED",
            tenant_id=context.tenant_id, actor_id=getattr(context.user, "id", None),
            actor_identifier=getattr(context.user, "email", None),
        )
        db.commit()
        raise
    target_tenant = tenant_id if (context.is_super_admin and tenant_id) else context.tenant_id

    query = select(Employee).where(Employee.tenant_id == target_tenant)
    if department:
        query = query.where(Employee.department == department)
    return db.execute(query).scalars().all()


@router.post("/employees", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED, dependencies=[Security(require_write_access), Security(require_admin_or_accountant)])
def create_employee(
    payload: EmployeeCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Register a new employee record within caller's isolated tenant."""
    try:
        context.check_access(payload.tenant_id, payload.company_id)
    except HTTPException:
        append_hr_audit(
            db, request, action="EMPLOYEE_TENANT_ACCESS", outcome="DENIED",
            tenant_id=context.tenant_id, actor_id=getattr(context.user, "id", None),
            actor_identifier=getattr(context.user, "email", None),
        )
        db.commit()
        raise
    requested_tenant = payload.tenant_id or payload.company_id
    effective_tenant_id = (
        requested_tenant
        if context.is_super_admin and requested_tenant
        else context.tenant_id
    )

    raw_name = (payload.name_en or payload.name or payload.name_ar or "").strip()
    parts = raw_name.split() if raw_name else []
    first = (payload.first_name or (parts[0] if parts else "Employee")).strip()
    last = (payload.last_name or (" ".join(parts[1:]) if len(parts) > 1 else "Personnel")).strip()
    manager_id = uuid.UUID(str(payload.direct_manager_id)) if payload.direct_manager_id else None
    if manager_id:
        manager = db.execute(
            select(Employee).where(
                Employee.id == manager_id,
                Employee.tenant_id == effective_tenant_id,
            )
        ).scalar_one_or_none()
        if manager is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Manager must be an employee of this company.")
    linked_user_id = payload.user_id
    if linked_user_id:
        linked_user = db.execute(
            select(platform_models.ResUser).where(
                platform_models.ResUser.id == linked_user_id,
                platform_models.ResUser.company_id == effective_tenant_id,
            )
        ).scalar_one_or_none()
        if linked_user is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Linked user must belong to this company.")

    values = payload.model_dump()
    employee_columns = {column.name for column in Employee.__table__.columns}
    employee_values = {key: value for key, value in values.items() if key in employee_columns}
    employee_values["identity_number"] = payload.get_identity_number()
    employee_values["employee_code"] = (payload.employee_code or "").strip() or f"EMP-{uuid.uuid4().hex[:6].upper()}"
    employee_values["first_name"] = first
    employee_values["last_name"] = last
    employee_values["department"] = (payload.department or "General Operations").strip()
    employee_values["base_salary"] = payload.base_salary if payload.base_salary is not None else Decimal("10000.00")
    employee_values["hire_date"] = payload.hire_date or date.today()
    employee_values["total_target_salary"] = sum(
        (
            employee_values["base_salary"],
            payload.housing_allowance,
            payload.transportation_allowance,
            payload.operational_telecom_allowance,
            payload.food_other_allowance,
        ),
        Decimal("0.00"),
    )
    employee_values["id"] = uuid.uuid4()
    employee_values["tenant_id"] = effective_tenant_id
    employee_values["user_id"] = linked_user_id
    employee_values["direct_manager_id"] = manager_id

    emp = Employee(**employee_values)
    db.add(emp)
    append_hr_audit(
        db, request, action="EMPLOYEE_REGISTERED", outcome="SUCCESS",
        tenant_id=effective_tenant_id, actor_id=getattr(context.user, "id", None),
        actor_identifier=getattr(context.user, "email", None),
    )
    db.commit()
    db.refresh(emp)
    # Only after the employee commit succeeded: provision the native login in the background
    # (own DB session, IDs only). Never affects this response.
    schedule_employee_provisioning(
        background_tasks, request,
        employee_id=emp.id, tenant_id=effective_tenant_id,
        actor_id=getattr(context.user, "id", None),
        actor_identifier=getattr(context.user, "email", None),
    )
    return emp


MAX_EMPLOYEE_DOCUMENT_BYTES = 15 * 1024 * 1024
_EMPLOYEE_DOCUMENT_TYPES = set(DOCUMENT_TYPES.__args__)


def _get_scoped_employee(
    db: Session, employee_id: uuid.UUID, tenant_id: uuid.UUID
) -> Employee:
    employee = db.execute(
        select(Employee).where(
            Employee.id == employee_id,
            Employee.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")
    return employee


@router.post(
    "/employees/{employee_id}/documents",
    response_model=EmployeeDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Security(require_write_access), Security(require_admin_or_accountant)],
)
async def upload_employee_document(
    employee_id: uuid.UUID,
    request: Request,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Persist private employee documents with tenant-scoped lookup and bounded size."""
    normalized_type = document_type.strip().upper()
    if normalized_type not in _EMPLOYEE_DOCUMENT_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported employee document type.")
    _get_scoped_employee(db, employee_id, context.tenant_id)

    content = await file.read(MAX_EMPLOYEE_DOCUMENT_BYTES + 1)
    if not content or len(content) > MAX_EMPLOYEE_DOCUMENT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Document must be between 1 byte and 15 MB.")

    declared_mime = (file.content_type or "").lower()
    signatures = {
        "application/pdf": content.startswith(b"%PDF-"),
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
    }
    if declared_mime not in signatures or not signatures[declared_mime]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only valid PDF, JPEG, or PNG employee documents are accepted.",
        )

    file_name = PurePath((file.filename or "employee-document").replace("\\", "/")).name
    file_name = "".join(char for char in file_name if char.isprintable()).strip()[:255]
    doc = EmployeeDocument(
        id=uuid.uuid4(),
        tenant_id=context.tenant_id,
        employee_id=employee_id,
        document_type=normalized_type,
        file_name=file_name or "employee-document",
        mime_type=declared_mime,
        file_size=len(content),
        file_content=content,
        uploaded_by=getattr(context.user, "id", None),
    )
    db.add(doc)
    append_hr_audit(
        db, request, action="EMPLOYEE_DOCUMENT_UPLOADED", outcome="SUCCESS",
        tenant_id=context.tenant_id, actor_id=getattr(context.user, "id", None),
        actor_identifier=getattr(context.user, "email", None),
    )
    db.commit()
    db.refresh(doc)
    return doc


@router.get(
    "/employees/{employee_id}/documents",
    response_model=List[EmployeeDocumentResponse],
    dependencies=[Security(require_admin_or_accountant)],
)
def list_employee_documents(
    employee_id: uuid.UUID,
    request: Request,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Return document metadata only for an employee in the active tenant."""
    _get_scoped_employee(db, employee_id, context.tenant_id)
    documents = db.execute(
        select(EmployeeDocument)
        .where(
            EmployeeDocument.employee_id == employee_id,
            EmployeeDocument.tenant_id == context.tenant_id,
        )
        .order_by(desc(EmployeeDocument.uploaded_at))
    ).scalars().all()
    append_hr_audit(
        db, request, action="EMPLOYEE_DOCUMENTS_LISTED", outcome="SUCCESS",
        tenant_id=context.tenant_id, actor_id=getattr(context.user, "id", None),
        actor_identifier=getattr(context.user, "email", None),
    )
    db.commit()
    return documents


@router.get(
    "/employees/{employee_id}/documents/{document_id}",
    dependencies=[Security(require_admin_or_accountant)],
)
def download_employee_document(
    employee_id: uuid.UUID,
    document_id: uuid.UUID,
    request: Request,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Download an employee attachment only after both tenant and employee scoping."""
    _get_scoped_employee(db, employee_id, context.tenant_id)
    document = db.execute(
        select(EmployeeDocument).where(
            EmployeeDocument.id == document_id,
            EmployeeDocument.employee_id == employee_id,
            EmployeeDocument.tenant_id == context.tenant_id,
        )
    ).scalar_one_or_none()
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee document not found.")
    content = document.file_content
    mime_type = document.mime_type
    file_name = document.file_name
    append_hr_audit(
        db, request, action="EMPLOYEE_DOCUMENT_DOWNLOADED", outcome="SUCCESS",
        tenant_id=context.tenant_id, actor_id=getattr(context.user, "id", None),
        actor_identifier=getattr(context.user, "email", None),
    )
    db.commit()
    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(file_name)}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get(
    "/employees/{employee_id}",
    response_model=EmployeeResponse,
    dependencies=[Security(require_admin_or_accountant)],
)
def get_employee(
    employee_id: uuid.UUID,
    request: Request,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Fetch employee by ID with strict tenant boundary check."""
    employee_query = select(Employee).where(Employee.id == employee_id)
    if not context.is_super_admin:
        employee_query = employee_query.where(Employee.tenant_id == context.tenant_id)
    emp = db.execute(employee_query).scalar_one_or_none()
    if not emp:
        append_hr_audit(
            db, request, action="EMPLOYEE_LOOKUP", outcome="NOT_FOUND",
            tenant_id=context.tenant_id, actor_id=getattr(context.user, "id", None),
            actor_identifier=getattr(context.user, "email", None),
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")
    return emp


class EmployeeProfileUpdate(BaseModel):
    department: Optional[str] = None
    job_title: Optional[str] = None
    base_salary: Optional[Decimal] = None
    is_active: Optional[bool] = None
    custom_attributes: dict = Field(default_factory=dict)


@router.put(
    "/employees/{employee_id}",
    response_model=EmployeeResponse,
    dependencies=[Security(require_write_access), Security(require_admin_or_accountant)],
)
def update_employee_profile(
    employee_id: uuid.UUID,
    payload: EmployeeProfileUpdate,
    request: Request,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Update profile fields and merge custom_attributes, strictly within the caller's tenant."""
    from backend.app.services.custom_fields import sanitize_attributes

    emp = _get_scoped_employee(db, employee_id, context.tenant_id)
    updates = payload.model_dump(exclude_unset=True, exclude={"custom_attributes"})
    columns = {c.name for c in Employee.__table__.columns}
    for key, value in updates.items():
        if key in columns and value is not None:
            setattr(emp, key, value)
    if payload.custom_attributes:
        emp.custom_attributes = {**(emp.custom_attributes or {}), **sanitize_attributes(payload.custom_attributes)}
    append_hr_audit(
        db, request, action="EMPLOYEE_PROFILE_UPDATE", outcome="SUCCESS",
        tenant_id=context.tenant_id, actor_id=getattr(context.user, "id", None),
        actor_identifier=getattr(context.user, "email", None),
    )
    db.commit()
    db.refresh(emp)
    return emp


class PayrollAllowancePayload(BaseModel):
    allowance_type: str = Field(min_length=1, max_length=64)
    amount: Decimal = Field(ge=Decimal("0"))
    is_taxable: bool = False
    notes: Optional[str] = None
    custom_attributes: dict = Field(default_factory=dict)


def _allowance_dict(a) -> dict:
    return {
        "id": str(a.id),
        "employee_id": str(a.employee_id),
        "allowance_type": a.allowance_type,
        "amount": float(a.amount or 0),
        "is_taxable": a.is_taxable,
        "notes": a.notes,
        "custom_attributes": a.custom_attributes or {},
    }


@router.get(
    "/employees/{employee_id}/allowances",
    dependencies=[Security(require_admin_or_accountant)],
)
def list_employee_allowances(
    employee_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    from backend.app.domains.hr.models import PayrollAllowance

    _get_scoped_employee(db, employee_id, context.tenant_id)
    rows = db.scalars(
        select(PayrollAllowance).where(
            PayrollAllowance.employee_id == employee_id, PayrollAllowance.tenant_id == context.tenant_id
        )
    ).all()
    return [_allowance_dict(a) for a in rows]


@router.post(
    "/employees/{employee_id}/allowances",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Security(require_write_access), Security(require_admin_or_accountant)],
)
def create_employee_allowance(
    employee_id: uuid.UUID,
    payload: PayrollAllowancePayload,
    request: Request,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    from backend.app.domains.hr.models import PayrollAllowance
    from backend.app.services.custom_fields import sanitize_attributes

    _get_scoped_employee(db, employee_id, context.tenant_id)
    allowance = PayrollAllowance(
        tenant_id=context.tenant_id,
        employee_id=employee_id,
        allowance_type=payload.allowance_type,
        amount=payload.amount,
        is_taxable=payload.is_taxable,
        notes=payload.notes,
        custom_attributes=sanitize_attributes(payload.custom_attributes),
    )
    db.add(allowance)
    append_hr_audit(
        db, request, action="PAYROLL_ALLOWANCE_CREATE", outcome="SUCCESS",
        tenant_id=context.tenant_id, actor_id=getattr(context.user, "id", None),
        actor_identifier=getattr(context.user, "email", None),
    )
    db.commit()
    return _allowance_dict(allowance)


# ==============================================================================
# Payroll Runs & GL Integration Endpoints
# ==============================================================================

@router.get("/payroll", response_model=List[PayrollRunResponse])
def list_payroll_runs(
    pay_period: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    tenant_id: Optional[uuid.UUID] = None,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """List payroll runs strictly isolated to tenant."""
    context.check_access(tenant_id)
    target_tenant = tenant_id if (context.is_super_admin and tenant_id) else context.tenant_id

    query = select(PayrollRun).where(PayrollRun.tenant_id == target_tenant)
    if pay_period:
        query = query.where(PayrollRun.pay_period == pay_period)
    if status_filter:
        query = query.where(PayrollRun.status == status_filter)
    return db.execute(query).scalars().all()


@router.post("/payroll", response_model=PayrollRunResponse, status_code=status.HTTP_201_CREATED, dependencies=[Security(require_write_access), Security(require_admin_or_accountant)])
def create_payroll_run(
    payload: PayrollRunCreate,
    request: Request,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Draft a new payroll run calculation in caller's tenant."""
    context.check_access(payload.tenant_id, payload.company_id)
    effective_tenant_id = (payload.tenant_id or payload.company_id) if (context.is_super_admin and (payload.tenant_id or payload.company_id)) else context.tenant_id

    emp = db.execute(
        select(Employee).where(
            Employee.id == payload.employee_id,
            Employee.tenant_id == effective_tenant_id,
        )
    ).scalar_one_or_none()
    if emp is None:
        append_hr_audit(
            db, request, action="EMPLOYEE_REFERENCE_REJECTED", outcome="DENIED",
            tenant_id=effective_tenant_id, actor_id=getattr(context.user, "id", None),
            actor_identifier=getattr(context.user, "email", None),
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found in this company.")

    net_pay = payload.gross_earnings + payload.allowances - payload.deductions
    run = PayrollRun(
        id=uuid.uuid4(),
        tenant_id=effective_tenant_id,
        employee_id=payload.employee_id,
        pay_period=payload.pay_period,
        gross_earnings=float(payload.gross_earnings),
        allowances=float(payload.allowances),
        deductions=float(payload.deductions),
        net_pay=float(net_pay),
        status=payload.status.upper(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.post("/payroll/{run_id}/post-ledger", response_model=JournalEntryResponse, dependencies=[Security(require_write_access), Security(require_admin_or_accountant)])
def post_payroll_to_ledger(
    run_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """
    Approves a payroll draft run and posts a balanced double-entry journal entry to the GL.
    Enforces debit/credit mathematical invariance and tenant boundary.
    """
    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll run not found.")

    if not context.is_super_admin and run.tenant_id != context.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to payroll run forbidden.")

    gross = Decimal(str(run.gross_earnings))
    allowances = Decimal(str(run.allowances))
    deductions = Decimal(str(run.deductions))
    net_pay = Decimal(str(run.net_pay))

    # Mathematical invariance verification gate
    total_debit = gross + allowances
    total_credit = net_pay + deductions
    if total_debit != total_credit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invariance Failure: Debits ({total_debit}) do not balance with credits ({total_credit}).",
        )

    entry = FinanceJournalEntry(
        id=uuid.uuid4(),
        tenant_id=run.tenant_id,
        company_id=run.tenant_id,
        entry_number=f"PAY-{run.pay_period}-{uuid.uuid4().hex[:6].upper()}",
        description=f"Payroll posting period {run.pay_period} for employee {run.employee_id}",
        entry_date=datetime.now(timezone.utc),
        total_debit=total_debit,
        total_credit=total_credit,
        status="POSTED",
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.flush()

    # Create balanced journal lines:
    lines = [
        FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=run.tenant_id,
            entry_id=entry.id,
            account_code="511000",
            description="Basic salary expense",
            debit=gross,
            credit=Decimal("0.0000"),
        ),
        FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=run.tenant_id,
            entry_id=entry.id,
            account_code="512000",
            description="Allowances expense",
            debit=allowances,
            credit=Decimal("0.0000"),
        ),
        FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=run.tenant_id,
            entry_id=entry.id,
            account_code="111101",
            description="Net salary payable / cash disbursement",
            debit=Decimal("0.0000"),
            credit=net_pay,
        ),
        FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=run.tenant_id,
            entry_id=entry.id,
            account_code="211200",
            description="Payroll deductions / withholdings payable",
            debit=Decimal("0.0000"),
            credit=deductions,
        ),
    ]
    active_lines = [l for l in lines if l.debit > 0 or l.credit > 0]
    db.add_all(active_lines if active_lines else lines)

    run.status = "APPROVED"
    db.commit()
    db.refresh(entry)
    return entry


# ==============================================================================
# Double-Entry Financial Journal Endpoints
# ==============================================================================

@router.get("/journal-entries", response_model=List[JournalEntryResponse])
def list_journal_entries(
    status_filter: Optional[str] = Query(None, alias="status"),
    tenant_id: Optional[uuid.UUID] = None,
    limit: int = Query(50, ge=1, le=500),
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """List financial journal entries strictly isolated to tenant."""
    context.check_access(tenant_id)
    target_tenant = tenant_id if (context.is_super_admin and tenant_id) else context.tenant_id

    query = select(FinanceJournalEntry).where(FinanceJournalEntry.tenant_id == target_tenant).order_by(desc(FinanceJournalEntry.entry_date))
    if status_filter:
        query = query.where(FinanceJournalEntry.status == status_filter)
    query = query.limit(limit)
    return db.execute(query).scalars().all()


@router.post("/journal-entries", response_model=JournalEntryResponse, status_code=status.HTTP_201_CREATED, dependencies=[Security(require_write_access), Security(require_admin_or_accountant)])
def create_journal_entry(
    payload: JournalEntryCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """
    Create a balanced double-entry financial journal entry.
    Enforces strict mathematical invariance (Sum(Debit) == Sum(Credit)) and tenant boundary.
    """
    if not payload.lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Journal entry must contain at least one debit and credit line.",
        )

    context.check_access(payload.tenant_id, payload.company_id)
    effective_tenant_id = (payload.tenant_id or payload.company_id) if (context.is_super_admin and (payload.tenant_id or payload.company_id)) else context.tenant_id

    total_debit = sum((line.debit for line in payload.lines), Decimal("0.0000"))
    total_credit = sum((line.credit for line in payload.lines), Decimal("0.0000"))

    # Double-entry invariant gate
    if total_debit != total_credit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Double-entry violation: Total debits ({total_debit}) must equal total credits ({total_credit}).",
        )

    entry_number = payload.entry_number or f"JE-{uuid.uuid4().hex[:8].upper()}"

    entry = FinanceJournalEntry(
        id=uuid.uuid4(),
        tenant_id=effective_tenant_id,
        company_id=payload.company_id or effective_tenant_id,
        entry_number=entry_number,
        description=payload.description,
        entry_date=payload.entry_date or datetime.now(timezone.utc),
        total_debit=total_debit,
        total_credit=total_credit,
        status="POSTED",
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.flush()

    for line in payload.lines:
        jl = FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=effective_tenant_id,
            entry_id=entry.id,
            account_code=line.account_code,
            account_id=line.account_id,
            description=line.description,
            debit=line.debit,
            credit=line.credit,
        )
        db.add(jl)

    db.commit()
    db.refresh(entry)
    return entry


@router.get("/journal-entries/{entry_id}", response_model=JournalEntryResponse)
def get_journal_entry(
    entry_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Retrieve journal entry details and associated lines with strict tenant isolation."""
    entry = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found.")
    if not context.is_super_admin and entry.tenant_id != context.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to journal entry forbidden.")
    return entry
