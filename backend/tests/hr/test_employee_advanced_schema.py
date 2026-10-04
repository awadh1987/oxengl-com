from datetime import date
from decimal import Decimal
import importlib.util
from pathlib import Path
import sqlite3

import pytest
from pydantic import ValidationError
import uuid
from fastapi import HTTPException
from starlette.requests import Request

from backend.app.domains.hr.audit import resolve_hr_client_ip
from backend.app.domains.hr.models import Employee, EmployeeDocument
from backend.app.security.abac import get_abac_user_context
from backend.app.domains.hr.schemas import EmployeeCreate, EmployeeResponse, JOB_TITLE_DIRECTORY


VALID_IBAN = "SA0380000000608010167519"


def load_hr_registration_migration():
    migration_path = (
        Path(__file__).resolve().parents[2]
        / "alembic"
        / "versions"
        / "202610040001_hr_advanced_registration.py"
    )
    spec = importlib.util.spec_from_file_location("hr_advanced_registration_migration", migration_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_advanced_registration_accepts_all_compliance_fields_and_derives_title_tier():
    payload = EmployeeCreate.model_validate(
        {
            "registration_mode": "ADVANCED",
            "name_ar": "أحمد بن خالد",
            "name_en": "Ahmed Al-Tamimi",
            "id_type": "IQAMA",
            "identity_number": "2092837461",
            "iban_number": VALID_IBAN,
            "job_title": "Heavy Vehicle Driver",
            "department_type": "FLEET_LOGISTICS",
            "hire_date": "2026-10-04",
            "base_salary": "12000.00",
            "housing_allowance": "1500",
            "transportation_allowance": "500",
            "total_target_salary": "1.00",
        }
    )

    assert payload.job_title_category == "OPERATIONAL"
    assert payload.hire_date == date(2026, 10, 4)
    assert payload.iban_number == VALID_IBAN
    # Submitted aggregate totals are ignored; the employee service derives them.
    assert payload.total_target_salary is None
    assert payload.housing_allowance == Decimal("1500")


@pytest.mark.parametrize("identity", ["123456789", "12345678901", "١٢٣٤٥٦٧٨٩٠"])
def test_identity_number_must_be_ten_ascii_digits(identity):
    with pytest.raises(ValidationError, match="10 digits"):
        EmployeeCreate.model_validate({"identity_number": identity})


@pytest.mark.parametrize(
    "iban",
    [
        "SA038000000060801016751",  # 23 characters
        "GB0380000000608010167519",  # non-Saudi
        "SA0380000000608010167518",  # bad checksum
    ],
)
def test_iban_requires_sa_format_length_and_checksum(iban):
    with pytest.raises(ValidationError):
        EmployeeCreate.model_validate({"iban_number": iban})


def test_legacy_quick_payloads_remain_valid_and_directory_is_tiered():
    legacy = EmployeeCreate.model_validate(
        {
            "employeeNumber": "EMP-LEGACY-1",
            "nameAr": "خالد الزامل",
            "department": "Operations",
            "baseSalary": 13500,
            "iqamaOrNationalId": "1087654321",
        }
    )
    assert legacy.employee_code == "EMP-LEGACY-1"
    assert legacy.get_identity_number() == "1087654321"
    assert len(JOB_TITLE_DIRECTORY) == 5
    assert sum(len(titles) for titles in JOB_TITLE_DIRECTORY.values()) == 28


def test_advanced_registration_rejects_missing_compliance_fields():
    with pytest.raises(ValidationError, match="Arabic"):
        EmployeeCreate.model_validate({"registration_mode": "ADVANCED", "id_type": "IQAMA"})

    with pytest.raises(ValidationError, match="IBAN"):
        EmployeeCreate.model_validate(
            {
                "registration_mode": "QUICK",
                "name_ar": "أحمد",
                "id_type": "IQAMA",
                "identity_number": "2092837461",
            }
        )


def test_employee_schema_has_advanced_fields_and_tenant_scoped_document_storage():
    employee_columns = set(Employee.__table__.columns.keys())
    assert {
        "name_ar", "date_of_birth", "id_type", "iqama_expiry_hijri",
        "department_type", "job_title_category", "contract_duration_months",
        "iban_number", "housing_allowance", "gosi_registration_number",
        "highest_education_level", "drivers_license_expiry_date",
    } <= employee_columns
    document_columns = set(EmployeeDocument.__table__.columns.keys())
    assert {"tenant_id", "employee_id", "document_type", "file_content"} <= document_columns


def test_job_title_database_constraint_matches_blueprint_directory_and_migration():
    model_constraint = next(
        constraint
        for constraint in Employee.__table__.constraints
        if constraint.name == "ck_employee_job_title"
    )
    migration = load_hr_registration_migration()
    model_titles = tuple(
        title for titles in JOB_TITLE_DIRECTORY.values() for title in titles
    )
    migration_titles = tuple(
        title for titles in migration.JOB_TITLE_DIRECTORY.values() for title in titles
    )

    assert migration_titles == model_titles
    expected_constraint = (
        "job_title IS NULL OR job_title IN ("
        + ", ".join("'" + title.replace("'", "''") + "'" for title in model_titles)
        + ")"
    )
    assert str(model_constraint.sqltext) == expected_constraint
    assert (
        "job_title IS NULL OR job_title IN ("
        + migration._JOB_TITLE_SQL_VALUES
        + ")"
    ) == expected_constraint

    # Execute the exact SQLAlchemy model check expression using SQLite's CHECK
    # implementation to prove NULL and directory entries pass and arbitrary values fail.
    connection = sqlite3.connect(":memory:")
    connection.execute(
        f"CREATE TABLE employee_title_check (job_title TEXT "
        f"CHECK ({model_constraint.sqltext}))"
    )
    connection.execute("INSERT INTO employee_title_check (job_title) VALUES (NULL)")
    for title in model_titles:
        connection.execute("INSERT INTO employee_title_check (job_title) VALUES (?)", (title,))
    with pytest.raises(sqlite3.IntegrityError):
        connection.execute(
            "INSERT INTO employee_title_check (job_title) VALUES (?)",
            ("Unlisted Job Title",),
        )
    connection.close()


def test_job_title_migration_downgrade_drops_constraint_before_column():
    migration = load_hr_registration_migration()
    calls = []

    class OperationRecorder:
        def __getattr__(self, name):
            def record(*args, **kwargs):
                calls.append((name, args, kwargs))
            return record

    migration.op = OperationRecorder()
    migration.downgrade()
    dropped_constraint_index = next(
        index
        for index, (name, args, _) in enumerate(calls)
        if name == "drop_constraint" and args[0] == "ck_employee_job_title"
    )
    dropped_column_index = next(
        index
        for index, (name, args, _) in enumerate(calls)
        if name == "drop_column" and args[1] == "job_title"
    )
    assert dropped_constraint_index < dropped_column_index


def test_employee_response_preserves_legacy_aliases_and_computes_wps_total():
    employee = Employee(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        employee_code="EMP-HR-TEST",
        first_name="Ahmed",
        last_name="Tamimi",
        name_ar="أحمد التميمي",
        name_en="Ahmed Tamimi",
        department="Fleet & Logistics",
        job_title="Heavy Vehicle Driver",
        job_title_category="OPERATIONAL",
        base_salary=Decimal("10000"),
        housing_allowance=Decimal("1000"),
        transportation_allowance=Decimal("500"),
        operational_telecom_allowance=Decimal("100"),
        food_other_allowance=Decimal("200"),
        hire_date=date(2026, 10, 4),
        is_active=True,
    )
    response = EmployeeResponse.model_validate(employee)

    assert response.employeeNumber == "EMP-HR-TEST"
    assert response.nameAr == "أحمد التميمي"
    assert response.roleEn == "Heavy Vehicle Driver"
    assert response.total_target_salary == Decimal("11800")


def test_forwarded_ip_is_used_only_for_configured_trusted_proxies(monkeypatch):
    request = Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/hrms/employees",
            "raw_path": b"/api/hrms/employees",
            "query_string": b"",
            "headers": [(b"x-forwarded-for", b"198.51.100.25")],
            "client": ("192.0.2.10", 8080),
            "server": ("test", 80),
        }
    )
    monkeypatch.delenv("OXENGL_TRUSTED_PROXY_CIDRS", raising=False)
    assert resolve_hr_client_ip(request) == "192.0.2.10"

    trusted_request = Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/hrms/employees",
            "raw_path": b"/api/hrms/employees",
            "query_string": b"",
            "headers": [(b"x-forwarded-for", b"198.51.100.25, 10.0.0.4")],
            "client": ("10.0.0.9", 8080),
            "server": ("test", 80),
        }
    )
    monkeypatch.setenv("OXENGL_TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
    assert resolve_hr_client_ip(trusted_request) == "198.51.100.25"


def test_abac_context_does_not_grant_anonymous_native_access(monkeypatch):
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    request = Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/v1/hr/employees",
            "raw_path": b"/api/v1/hr/employees",
            "query_string": b"",
            "headers": [],
            "client": ("192.0.2.10", 8080),
            "server": ("test", 80),
        }
    )
    with pytest.raises(HTTPException) as error:
        get_abac_user_context(
            request,
            authorization=None,
            x_tenant_id=None,
            x_user_id=None,
            x_role=None,
            x_warehouse_id=None,
            x_company_id=None,
            x_fleet_region=None,
            db=None,
        )
    assert error.value.status_code == 401
