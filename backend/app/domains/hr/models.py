import uuid
from datetime import datetime as dt_class, date
from decimal import Decimal
from typing import Optional
from sqlalchemy import (
    String, ForeignKey, DateTime, Boolean, Numeric, Date, Integer,
    LargeBinary, CheckConstraint, Index, Text, func, text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base
from .schemas import JOB_TITLE_DIRECTORY


_JOB_TITLE_VALUES = tuple(
    title for titles in JOB_TITLE_DIRECTORY.values() for title in titles
)
_JOB_TITLE_SQL_VALUES = ", ".join(
    "'" + title.replace("'", "''") + "'" for title in _JOB_TITLE_VALUES
)


class Employee(Base):
    """Core personnel identity record. Links profiles cleanly to users and tenant isolation."""
    __tablename__ = "employees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("res_users.id", ondelete="SET NULL"), nullable=True)
    
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    base_salary: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0.00)
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Personal and demographic profile
    name_ar: Mapped[Optional[str]] = mapped_column(String(255))
    name_en: Mapped[Optional[str]] = mapped_column(String(255))
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    gender: Mapped[Optional[str]] = mapped_column(String(16))
    nationality: Mapped[Optional[str]] = mapped_column(String(100))
    marital_status: Mapped[Optional[str]] = mapped_column(String(16))
    blood_type: Mapped[Optional[str]] = mapped_column(String(8))
    personal_mobile: Mapped[Optional[str]] = mapped_column(String(32))
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(255))
    emergency_contact_number: Mapped[Optional[str]] = mapped_column(String(32))
    personal_email: Mapped[Optional[str]] = mapped_column(String(255))

    # KSA regulatory identity
    id_type: Mapped[Optional[str]] = mapped_column(String(32))
    identity_number: Mapped[Optional[str]] = mapped_column(String(10))
    iqama_expiry_hijri: Mapped[Optional[str]] = mapped_column(String(32))
    iqama_expiry_gregorian: Mapped[Optional[date]] = mapped_column(Date)
    passport_number: Mapped[Optional[str]] = mapped_column(String(64))
    passport_expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    profession_on_iqama: Mapped[Optional[str]] = mapped_column(String(255))
    sponsorship_status: Mapped[Optional[str]] = mapped_column(String(64))

    # Employment organization and contract
    department_type: Mapped[Optional[str]] = mapped_column(String(32))
    job_title: Mapped[Optional[str]] = mapped_column(String(120))
    job_title_category: Mapped[Optional[str]] = mapped_column(String(48))
    direct_manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), index=True
    )
    direct_manager_name: Mapped[Optional[str]] = mapped_column(String(255))
    contract_type: Mapped[Optional[str]] = mapped_column(String(32))
    contract_duration_months: Mapped[Optional[int]] = mapped_column(Integer)
    probation_period_days: Mapped[Optional[int]] = mapped_column(Integer)

    # WPS payroll data. `base_salary` is retained as the legacy base-pay column.
    iban_number: Mapped[Optional[str]] = mapped_column(String(34))
    bank_name: Mapped[Optional[str]] = mapped_column(String(120))
    bank_code: Mapped[Optional[str]] = mapped_column(String(32))
    housing_allowance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    transportation_allowance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    operational_telecom_allowance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    food_other_allowance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total_target_salary: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    custom_attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    overtime_eligible: Mapped[Optional[bool]] = mapped_column(Boolean)
    standard_working_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    gosi_registration_number: Mapped[Optional[str]] = mapped_column(String(64))

    # Qualifications; documents are kept in the tenant-scoped employee_documents table.
    highest_education_level: Mapped[Optional[str]] = mapped_column(String(64))
    field_of_study: Mapped[Optional[str]] = mapped_column(String(255))
    certifications: Mapped[Optional[list]] = mapped_column(JSONB)
    drivers_license_type: Mapped[Optional[str]] = mapped_column(String(32))
    drivers_license_expiry_date: Mapped[Optional[date]] = mapped_column(Date)

    __table_args__ = (
        CheckConstraint(
            "department_type IS NULL OR department_type IN "
            "('OPERATIONS', 'FINANCE', 'HR_ADMIN', 'FLEET_LOGISTICS', "
            "'PROCUREMENT', 'WAREHOUSE', 'IT', 'GENERAL')",
            name="ck_employee_department_type",
        ),
        CheckConstraint(
            "job_title_category IS NULL OR job_title_category IN "
            "('EXECUTIVE', 'MANAGEMENT', 'PROFESSIONAL', 'OPERATIONAL', 'FACILITY')",
            name="ck_employee_job_title_category",
        ),
        CheckConstraint(
            f"job_title IS NULL OR job_title IN ({_JOB_TITLE_SQL_VALUES})",
            name="ck_employee_job_title",
        ),
        CheckConstraint(
            "contract_duration_months IS NULL OR contract_duration_months IN (12, 24)",
            name="ck_employee_contract_duration_months",
        ),
        CheckConstraint(
            "probation_period_days IS NULL OR probation_period_days >= 0",
            name="ck_employee_probation_period_days",
        ),
        Index("ix_employees_identity_number", "tenant_id", "identity_number"),
    )

    @property
    def company_id(self) -> uuid.UUID:
        return self.tenant_id

    @company_id.setter
    def company_id(self, val: uuid.UUID):
        self.tenant_id = val

    @property
    def calculated_target_salary(self) -> Decimal:
        return sum(
            (Decimal(str(value or 0)) for value in (
                self.base_salary,
                self.housing_allowance,
                self.transportation_allowance,
                self.operational_telecom_allowance,
                self.food_other_allowance,
            )),
            Decimal("0.00"),
        )


class EmployeeDocument(Base):
    """Private employee attachment, always addressed through its tenant and employee."""
    __tablename__ = "employee_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), index=True, nullable=False
    )
    document_type: Mapped[str] = mapped_column(String(48), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    file_content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    uploaded_at: Mapped[dt_class] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "document_type IN ('NATIONAL_ID_IQAMA', 'PASSPORT', 'EMPLOYMENT_CONTRACT', "
            "'EDUCATION_CERTIFICATE', 'DRIVERS_LICENSE', 'MEDICAL_INSURANCE')",
            name="ck_employee_document_type",
        ),
        CheckConstraint("file_size > 0 AND file_size <= 15728640", name="ck_employee_document_file_size"),
    )


class AttendanceLog(Base):
    """Tracks biometric check-ins and check-outs for automated working hours logs."""
    __tablename__ = "attendance_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    
    check_in: Mapped[dt_class] = mapped_column(DateTime(timezone=True), nullable=False)
    check_out: Mapped[Optional[dt_class]] = mapped_column(DateTime(timezone=True), nullable=True)
    device_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class PayrollAllowance(Base):
    """Per-employee recurring allowance line (housing, transport, custom)."""
    __tablename__ = "payroll_allowances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    allowance_type: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    is_taxable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    custom_attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt_class] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)


class PayrollRun(Base):
    """Calculates compensation ledgers, adding allowances and subtracting deductions dynamically."""
    __tablename__ = "payroll_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    
    pay_period: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # e.g. '2026-09'
    gross_earnings: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    allowances: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    deductions: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    net_pay: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)  # Formula: Gross + Allowances - Deductions
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", nullable=False)  # 'DRAFT', 'APPROVED', 'PAID'
    custom_attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))

    @property
    def company_id(self) -> uuid.UUID:
        return self.tenant_id

    @company_id.setter
    def company_id(self, val: uuid.UUID):
        self.tenant_id = val


class HrmsAttendanceLog(Base):
    """Tracks biometric check-ins and check-outs for automated working hours logs with biometric hashes."""
    __tablename__ = "hrms_attendance_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)

    device_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    check_in: Mapped[dt_class] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    check_out: Mapped[Optional[dt_class]] = mapped_column(DateTime(timezone=True), nullable=True)
    biometric_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    verification_mode: Mapped[str] = mapped_column(String(50), default="BIOMETRIC_FINGERPRINT", nullable=False)
    created_at: Mapped[dt_class] = mapped_column(DateTime(timezone=True), default=dt_class.utcnow, nullable=False)

    @property
    def company_id(self) -> uuid.UUID:
        return self.tenant_id

    @company_id.setter
    def company_id(self, val: uuid.UUID):
        self.tenant_id = val

    def __init__(self, *args, **kwargs):
        if "company_id" in kwargs and "tenant_id" not in kwargs:
            kwargs["tenant_id"] = kwargs.pop("company_id")
        if "biometric_timestamp" in kwargs and "check_in" not in kwargs:
            kwargs["check_in"] = kwargs.pop("biometric_timestamp")
        if "device_identifier" in kwargs and "device_id" not in kwargs:
            kwargs["device_id"] = kwargs.pop("device_identifier")
        if "crypto_hash" in kwargs and "biometric_hash" not in kwargs:
            kwargs["biometric_hash"] = kwargs.pop("crypto_hash")
        if "log_type" in kwargs and "verification_mode" not in kwargs:
            kwargs["verification_mode"] = kwargs.pop("log_type")
        if "id" in kwargs and isinstance(kwargs["id"], str):
            kwargs["id"] = uuid.UUID(kwargs["id"])
        if "tenant_id" in kwargs and isinstance(kwargs["tenant_id"], str):
            kwargs["tenant_id"] = uuid.UUID(kwargs["tenant_id"])
        if "employee_id" in kwargs and isinstance(kwargs["employee_id"], str):
            kwargs["employee_id"] = uuid.UUID(kwargs["employee_id"])
        super().__init__(*args, **kwargs)
