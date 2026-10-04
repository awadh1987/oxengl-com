"""Shared HR registration schemas and the standardized job-title directory."""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator


JOB_TITLE_DIRECTORY: dict[str, tuple[str, ...]] = {
    "EXECUTIVE": (
        "Chief Executive Officer (CEO)",
        "Chief Operating Officer (COO)",
        "Chief Financial Officer (CFO)",
        "Chief Technology Officer (CTO)",
        "General Manager",
    ),
    "MANAGEMENT": (
        "Operations Manager",
        "Finance Manager",
        "HR & Admin Manager",
        "Fleet & Logistics Manager",
        "Procurement Manager",
        "Warehouse Supervisor",
        "Dispatch Supervisor",
    ),
    "PROFESSIONAL": (
        "Senior Financial Accountant",
        "Logistics Operations Specialist",
        "HR Generalist / Government Relations Officer (Mandoob)",
        "Procurement Officer",
        "IT Support Specialist",
        "Administrative Assistant",
        "Data Entry Clerk",
    ),
    "OPERATIONAL": (
        "Fleet Dispatcher",
        "Heavy Vehicle Driver",
        "Light Vehicle Driver",
        "Warehouse Operator",
        "Forklift Operator",
        "Maintenance Technician / Mechanic",
    ),
    "FACILITY": (
        "Security Guard",
        "Office Boy / Tea Boy",
        "Cleaner / Janitor",
    ),
}

JOB_TITLE_CATEGORIES = Literal[
    "EXECUTIVE", "MANAGEMENT", "PROFESSIONAL", "OPERATIONAL", "FACILITY"
]
DEPARTMENT_TYPES = Literal[
    "OPERATIONS", "FINANCE", "HR_ADMIN", "FLEET_LOGISTICS",
    "PROCUREMENT", "WAREHOUSE", "IT", "GENERAL",
]
ID_TYPES = Literal["SAUDI_NATIONAL_ID", "IQAMA", "GCC_ID", "BORDER_NUMBER"]
CONTRACT_TYPES = Literal["FIXED_TERM", "INDEFINITE", "PART_TIME", "FREELANCE"]
DRIVER_LICENSE_TYPES = Literal["PRIVATE", "PUBLIC", "HEAVY"]
DOCUMENT_TYPES = Literal[
    "NATIONAL_ID_IQAMA", "PASSPORT", "EMPLOYMENT_CONTRACT",
    "EDUCATION_CERTIFICATE", "DRIVERS_LICENSE", "MEDICAL_INSURANCE",
]


def normalize_and_validate_iban(value: Optional[str]) -> Optional[str]:
    if value is None or not value.strip():
        return None
    normalized = re.sub(r"\s+", "", value).upper()
    if not re.fullmatch(r"SA[0-9]{22}", normalized):
        raise ValueError("IBAN must be SA followed by exactly 22 digits (24 characters).")
    rearranged = normalized[4:] + normalized[:4]
    expanded = "".join(str(ord(char) - ord("A") + 10) if char.isalpha() else char for char in rearranged)
    remainder = 0
    for digit in expanded:
        remainder = (remainder * 10 + int(digit)) % 97
    if remainder != 1:
        raise ValueError("IBAN checksum is invalid.")
    return normalized


class EmployeeCreate(BaseModel):
    """Accepts the legacy essentials as well as the complete advanced registration."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    tenant_id: Optional[UUID] = None
    company_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    is_active: bool = True
    registration_mode: Optional[Literal["QUICK", "ADVANCED"]] = None

    employee_code: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("employee_code", "employeeNumber")
    )
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    name: Optional[str] = Field(default=None, validation_alias=AliasChoices("name", "full_name"))
    name_ar: Optional[str] = Field(default=None, validation_alias=AliasChoices("name_ar", "nameAr"))
    name_en: Optional[str] = Field(default=None, validation_alias=AliasChoices("name_en", "nameEn"))

    date_of_birth: Optional[date] = None
    gender: Optional[Literal["MALE", "FEMALE"]] = None
    nationality: Optional[str] = None
    marital_status: Optional[Literal["SINGLE", "MARRIED"]] = None
    blood_type: Optional[Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]] = None
    personal_mobile: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    personal_email: Optional[str] = None

    id_type: Optional[ID_TYPES] = None
    identity_number: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("identity_number", "iqama_id")
    )
    iqamaOrNationalId: Optional[str] = None
    iqama_expiry_hijri: Optional[str] = None
    iqama_expiry_gregorian: Optional[date] = None
    passport_number: Optional[str] = None
    passport_expiry_date: Optional[date] = None
    profession_on_iqama: Optional[str] = None
    sponsorship_status: Optional[str] = None

    department: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("department", "departmentAr", "departmentEn")
    )
    department_type: Optional[DEPARTMENT_TYPES] = None
    job_title: Optional[str] = None
    job_title_category: Optional[JOB_TITLE_CATEGORIES] = None
    direct_manager_id: Optional[UUID] = None
    direct_manager_name: Optional[str] = None
    hire_date: Optional[date] = Field(
        default=None, validation_alias=AliasChoices("hire_date", "hireDate")
    )
    contract_type: Optional[CONTRACT_TYPES] = None
    contract_duration_months: Optional[Literal[12, 24]] = None
    probation_period_days: Optional[int] = Field(default=None, ge=0, le=365)

    base_salary: Optional[Decimal] = Field(
        default=None, ge=0, validation_alias=AliasChoices("base_salary", "baseSalary")
    )
    iban_number: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("iban_number", "iban", "ibanNumber")
    )
    bank_name: Optional[str] = None
    bank_code: Optional[str] = None
    housing_allowance: Decimal = Field(default=Decimal("0.00"), ge=0)
    transportation_allowance: Decimal = Field(default=Decimal("0.00"), ge=0)
    operational_telecom_allowance: Decimal = Field(default=Decimal("0.00"), ge=0)
    food_other_allowance: Decimal = Field(default=Decimal("0.00"), ge=0)
    total_target_salary: Optional[Decimal] = Field(default=None, ge=0)
    overtime_eligible: Optional[bool] = None
    standard_working_hours: Optional[Decimal] = Field(default=None, ge=0, le=168)
    gosi_registration_number: Optional[str] = None

    highest_education_level: Optional[str] = None
    field_of_study: Optional[str] = None
    certifications: Optional[list[str]] = None
    drivers_license_type: Optional[DRIVER_LICENSE_TYPES] = None
    drivers_license_expiry_date: Optional[date] = None

    @field_validator("identity_number", "iqamaOrNationalId", mode="before")
    @classmethod
    def validate_identity_number(cls, value: object) -> Optional[str]:
        if value is None or not str(value).strip():
            return None
        normalized = str(value).strip()
        if not re.fullmatch(r"[0-9]{10}", normalized):
            raise ValueError("ID / Iqama number must contain exactly 10 digits.")
        return normalized

    @field_validator("iban_number")
    @classmethod
    def validate_iban(cls, value: Optional[str]) -> Optional[str]:
        return normalize_and_validate_iban(value)

    @field_validator("personal_email")
    @classmethod
    def validate_personal_email(cls, value: Optional[str]) -> Optional[str]:
        if value and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value.strip()):
            raise ValueError("Enter a valid personal email address.")
        return value.strip() if value else value

    @field_validator("personal_mobile", "emergency_contact_number")
    @classmethod
    def validate_mobile(cls, value: Optional[str]) -> Optional[str]:
        if value and not re.fullmatch(r"\+?[0-9 ()-]{7,24}", value.strip()):
            raise ValueError("Enter a valid mobile phone number.")
        return value.strip() if value else value

    @model_validator(mode="after")
    def validate_registration(self) -> "EmployeeCreate":
        identity = self.identity_number or self.iqamaOrNationalId
        if self.registration_mode:
            if not (self.name_ar or "").strip():
                raise ValueError("Full Name (Arabic) is required.")
            if not self.id_type:
                raise ValueError("ID type is required.")
            if not identity:
                raise ValueError("A 10-digit ID / Iqama number is required.")
            if not self.iban_number:
                raise ValueError("A valid Saudi IBAN is required for WPS.")
        if self.job_title:
            category = next(
                (key for key, titles in JOB_TITLE_DIRECTORY.items() if self.job_title in titles),
                None,
            )
            if category is None:
                raise ValueError("Select a job title from the standardized directory.")
            if self.job_title_category and self.job_title_category != category:
                raise ValueError("Job title category does not match the selected title.")
            self.job_title_category = category
        if self.total_target_salary is not None:
            # The server derives total pay from components; never trust a submitted total.
            self.total_target_salary = None
        return self

    def get_identity_number(self) -> Optional[str]:
        return self.identity_number or self.iqamaOrNationalId


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    employee_code: str
    first_name: str
    last_name: str
    department: str
    base_salary: Decimal
    hire_date: date
    is_active: bool
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    marital_status: Optional[str] = None
    blood_type: Optional[str] = None
    personal_mobile: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    personal_email: Optional[str] = None
    id_type: Optional[str] = None
    identity_number: Optional[str] = None
    iqama_expiry_hijri: Optional[str] = None
    iqama_expiry_gregorian: Optional[date] = None
    passport_number: Optional[str] = None
    passport_expiry_date: Optional[date] = None
    profession_on_iqama: Optional[str] = None
    sponsorship_status: Optional[str] = None
    department_type: Optional[str] = None
    job_title: Optional[str] = None
    job_title_category: Optional[str] = None
    direct_manager_id: Optional[UUID] = None
    direct_manager_name: Optional[str] = None
    contract_type: Optional[str] = None
    contract_duration_months: Optional[int] = None
    probation_period_days: Optional[int] = None
    iban_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_code: Optional[str] = None
    housing_allowance: Decimal = Decimal("0.00")
    transportation_allowance: Decimal = Decimal("0.00")
    operational_telecom_allowance: Decimal = Decimal("0.00")
    food_other_allowance: Decimal = Decimal("0.00")
    overtime_eligible: Optional[bool] = None
    standard_working_hours: Optional[Decimal] = None
    gosi_registration_number: Optional[str] = None
    highest_education_level: Optional[str] = None
    field_of_study: Optional[str] = None
    certifications: Optional[list[str]] = None
    drivers_license_type: Optional[str] = None
    drivers_license_expiry_date: Optional[date] = None

    @computed_field
    @property
    def total_target_salary(self) -> Decimal:
        return sum(
            (
                Decimal(str(self.base_salary or 0)),
                Decimal(str(self.housing_allowance or 0)),
                Decimal(str(self.transportation_allowance or 0)),
                Decimal(str(self.operational_telecom_allowance or 0)),
                Decimal(str(self.food_other_allowance or 0)),
            ),
            Decimal("0.00"),
        )

    @computed_field
    @property
    def employeeNumber(self) -> str:
        return self.employee_code

    @computed_field
    @property
    def name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @computed_field
    @property
    def nameAr(self) -> str:
        return self.name_ar or self.name

    @computed_field
    @property
    def nameEn(self) -> str:
        return self.name_en or self.name

    @computed_field
    @property
    def departmentAr(self) -> str:
        return self.department

    @computed_field
    @property
    def departmentEn(self) -> str:
        return self.department

    @computed_field
    @property
    def baseSalary(self) -> float:
        return float(self.base_salary)

    @computed_field
    @property
    def roleAr(self) -> str:
        return self.job_title or "موظف"

    @computed_field
    @property
    def roleEn(self) -> str:
        return self.job_title or "Employee"

    @computed_field
    @property
    def iqamaOrNationalId(self) -> Optional[str]:
        return self.identity_number
