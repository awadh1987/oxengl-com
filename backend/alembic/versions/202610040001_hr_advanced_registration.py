"""Expand employee records for KSA-compliant advanced HR registration.

Revision ID: 202610040001
Revises: 202609130007, b3d9e1a4c7f2 (merge existing branches)
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "202610040001"
down_revision: Union[str, Sequence[str], None] = ("202609130007", "b3d9e1a4c7f2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


JOB_TITLE_DIRECTORY = {
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
_JOB_TITLE_SQL_VALUES = ", ".join(
    "'" + title.replace("'", "''") + "'"
    for titles in JOB_TITLE_DIRECTORY.values()
    for title in titles
)


def upgrade() -> None:
    employee_columns = (
        ("name_ar", sa.String(length=255)),
        ("name_en", sa.String(length=255)),
        ("date_of_birth", sa.Date()),
        ("gender", sa.String(length=16)),
        ("nationality", sa.String(length=100)),
        ("marital_status", sa.String(length=16)),
        ("blood_type", sa.String(length=8)),
        ("personal_mobile", sa.String(length=32)),
        ("emergency_contact_name", sa.String(length=255)),
        ("emergency_contact_number", sa.String(length=32)),
        ("personal_email", sa.String(length=255)),
        ("id_type", sa.String(length=32)),
        ("identity_number", sa.String(length=10)),
        ("iqama_expiry_hijri", sa.String(length=32)),
        ("iqama_expiry_gregorian", sa.Date()),
        ("passport_number", sa.String(length=64)),
        ("passport_expiry_date", sa.Date()),
        ("profession_on_iqama", sa.String(length=255)),
        ("sponsorship_status", sa.String(length=64)),
        ("department_type", sa.String(length=32)),
        ("job_title", sa.String(length=120)),
        ("job_title_category", sa.String(length=48)),
        ("direct_manager_id", postgresql.UUID(as_uuid=True)),
        ("direct_manager_name", sa.String(length=255)),
        ("contract_type", sa.String(length=32)),
        ("contract_duration_months", sa.Integer()),
        ("probation_period_days", sa.Integer()),
        ("iban_number", sa.String(length=34)),
        ("bank_name", sa.String(length=120)),
        ("bank_code", sa.String(length=32)),
        ("housing_allowance", sa.Numeric(12, 2), sa.text("0")),
        ("transportation_allowance", sa.Numeric(12, 2), sa.text("0")),
        ("operational_telecom_allowance", sa.Numeric(12, 2), sa.text("0")),
        ("food_other_allowance", sa.Numeric(12, 2), sa.text("0")),
        ("total_target_salary", sa.Numeric(12, 2)),
        ("overtime_eligible", sa.Boolean()),
        ("standard_working_hours", sa.Numeric(5, 2)),
        ("gosi_registration_number", sa.String(length=64)),
        ("highest_education_level", sa.String(length=64)),
        ("field_of_study", sa.String(length=255)),
        ("certifications", postgresql.JSONB(astext_type=sa.Text())),
        ("drivers_license_type", sa.String(length=32)),
        ("drivers_license_expiry_date", sa.Date()),
    )
    for column in employee_columns:
        name, column_type, *default = column
        op.add_column(
            "employees",
            sa.Column(name, column_type, nullable=False if default else True, server_default=default[0] if default else None),
        )

    op.create_foreign_key(
        "fk_employees_direct_manager_id_employees",
        "employees",
        "employees",
        ["direct_manager_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_employees_identity_number", "employees", ["tenant_id", "identity_number"])
    op.create_check_constraint(
        "ck_employee_department_type",
        "employees",
        "department_type IS NULL OR department_type IN "
        "('OPERATIONS', 'FINANCE', 'HR_ADMIN', 'FLEET_LOGISTICS', 'PROCUREMENT', 'WAREHOUSE', 'IT', 'GENERAL')",
    )
    op.create_check_constraint(
        "ck_employee_job_title_category",
        "employees",
        "job_title_category IS NULL OR job_title_category IN "
        "('EXECUTIVE', 'MANAGEMENT', 'PROFESSIONAL', 'OPERATIONAL', 'FACILITY')",
    )
    op.create_check_constraint(
        "ck_employee_job_title",
        "employees",
        f"job_title IS NULL OR job_title IN ({_JOB_TITLE_SQL_VALUES})",
    )
    op.create_check_constraint(
        "ck_employee_contract_duration_months",
        "employees",
        "contract_duration_months IS NULL OR contract_duration_months IN (12, 24)",
    )
    op.create_check_constraint(
        "ck_employee_probation_period_days",
        "employees",
        "probation_period_days IS NULL OR probation_period_days >= 0",
    )

    op.create_table(
        "employee_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_type", sa.String(length=48), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("file_content", sa.LargeBinary(), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "document_type IN ('NATIONAL_ID_IQAMA', 'PASSPORT', 'EMPLOYMENT_CONTRACT', "
            "'EDUCATION_CERTIFICATE', 'DRIVERS_LICENSE', 'MEDICAL_INSURANCE')",
            name="ck_employee_document_type",
        ),
        sa.CheckConstraint(
            "file_size > 0 AND file_size <= 15728640",
            name="ck_employee_document_file_size",
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_employee_documents_tenant_id", "employee_documents", ["tenant_id"])
    op.create_index("ix_employee_documents_employee_id", "employee_documents", ["employee_id"])

    # Existing audit rows remain valid. Tenant and actor IDs make HR events attributable
    # even when a legacy tenant identifier has no corresponding res_companies row.
    op.add_column("platform_audit_logs", sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("platform_audit_logs", sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_platform_audit_logs_actor_id", "platform_audit_logs", ["actor_id"])
    op.create_index("ix_platform_audit_logs_tenant_id", "platform_audit_logs", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_platform_audit_logs_tenant_id", table_name="platform_audit_logs")
    op.drop_index("ix_platform_audit_logs_actor_id", table_name="platform_audit_logs")
    op.drop_column("platform_audit_logs", "tenant_id")
    op.drop_column("platform_audit_logs", "actor_id")

    op.drop_index("ix_employee_documents_employee_id", table_name="employee_documents")
    op.drop_index("ix_employee_documents_tenant_id", table_name="employee_documents")
    op.drop_constraint("ck_employee_document_file_size", "employee_documents", type_="check")
    op.drop_table("employee_documents")

    op.drop_constraint("ck_employee_probation_period_days", "employees", type_="check")
    op.drop_constraint("ck_employee_contract_duration_months", "employees", type_="check")
    op.drop_constraint("ck_employee_job_title", "employees", type_="check")
    op.drop_constraint("ck_employee_job_title_category", "employees", type_="check")
    op.drop_constraint("ck_employee_department_type", "employees", type_="check")
    op.drop_index("ix_employees_identity_number", table_name="employees")
    op.drop_constraint("fk_employees_direct_manager_id_employees", "employees", type_="foreignkey")

    for name in (
        "drivers_license_expiry_date", "drivers_license_type", "certifications", "field_of_study",
        "highest_education_level", "gosi_registration_number", "standard_working_hours",
        "overtime_eligible", "total_target_salary", "food_other_allowance",
        "operational_telecom_allowance", "transportation_allowance", "housing_allowance",
        "bank_code", "bank_name", "iban_number", "probation_period_days",
        "contract_duration_months", "contract_type", "direct_manager_name",
        "direct_manager_id", "job_title_category", "job_title", "department_type",
        "sponsorship_status", "profession_on_iqama", "passport_expiry_date", "passport_number",
        "iqama_expiry_gregorian", "iqama_expiry_hijri", "identity_number", "id_type",
        "personal_email", "emergency_contact_number", "emergency_contact_name",
        "personal_mobile", "blood_type", "marital_status", "nationality", "gender",
        "date_of_birth", "name_en", "name_ar",
    ):
        op.drop_column("employees", name)
