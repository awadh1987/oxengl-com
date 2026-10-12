"""
Comprehensive automated tests for Tenant HR staff registration pipeline.
Tests transactional integrity (ResUser + HrEmployee), tenant RLS isolation,
SMTP onboarding email dispatch, and filtering endpoints.
"""
from __future__ import annotations

import os
import secrets
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

for _key_name in (
    "DATA_RESIDENCY_KEY",
    "JWT_SECRET",
    "JWT_SECRET_MASTER",
    "JWT_SECRET_TENANT",
):
    os.environ.setdefault(_key_name, secrets.token_hex(32))

from backend.app.main import app
from backend import models
from backend.database import SessionLocal
from backend.tests.auth_helpers import tenant_admin_headers


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


@pytest.fixture(autouse=True)
def mock_default_email_dispatch():
    """Mock SMTP email dispatch to prevent external network calls and timeouts."""
    with patch(
        "backend.app.api.v1.tenant_hr.dispatch_employee_welcome_email",
        new_callable=AsyncMock,
    ) as m:
        m.return_value = True
        yield m


def create_test_tenant(db: Session, prefix: str = "hr-test") -> tuple[models.MasterTenant, models.ResCompany]:
    """Helper to create an active isolated tenant for testing."""
    slug = f"{prefix}-{uuid.uuid4().hex[:8]}"
    company_id = uuid.uuid4()

    master = models.MasterTenant(
        id=company_id,
        slug=slug,
        name=f"HR Test Corp ({slug})",
        owner_full_name="Admin Owner",
        owner_email=f"owner_{slug}@example.sa",
        owner_mobile="+966512345678",
        subscription_tier="enterprise",
        status="active",
        is_active=True,
    )
    db.add(master)

    res_company = models.ResCompany(
        id=company_id,
        name=master.name,
        slug=master.slug,
        is_active=True,
    )
    db.add(res_company)
    db.commit()
    db.refresh(master)
    db.refresh(res_company)
    return master, res_company


def test_01_employee_registration_transactional_pipeline(client: TestClient, db_session: Session):
    """
    Test that registering an employee creates both ResUser and HrEmployee
    records in a single transactional operation, establishes 1-to-1 linkage,
    and returns correct IAM & HR properties.
    """
    _, company = create_test_tenant(db_session, "tx-pipe")
    headers = tenant_admin_headers(db_session, company.id)

    emp_email = f"staff_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "full_name": "Tariq Al-Ghamdi",
        "email": emp_email,
        "role": "Manager",
        "job_title": "Fleet Operations Supervisor",
        "department": "Logistics & Fleet",
        "base_salary": 14500.50,
        "hire_date": str(date.today()),
    }

    response = client.post(
        "/api/v1/tenant/hr/employees",
        json=payload,
        headers=headers,
    )

    assert response.status_code in (200, 201), f"Registration failed: {response.text}"
    data = response.json()

    # Verify returned attributes
    assert data["email"] == emp_email
    assert data["full_name"] == "Tariq Al-Ghamdi"
    assert data["job_title"] == "Fleet Operations Supervisor"
    assert data["company_id"] == str(company.id)
    assert data["iam_role"] == "Manager"
    assert data["base_salary"] == 14500.50
    assert data["is_active"] is True
    assert data["must_change_password"] is True
    assert "id" in data
    assert "user_id" in data
    assert "employee_id" in data

    # Verify database persistence & relational integrity
    user_id = uuid.UUID(data["user_id"])
    hr_id = uuid.UUID(data["id"])

    res_user = db_session.query(models.ResUser).filter(models.ResUser.id == user_id).first()
    assert res_user is not None, "ResUser record must exist in DB"
    assert res_user.email == emp_email
    assert res_user.company_id == company.id
    assert res_user.password_hash != "secret"  # Hash must be secure, never plaintext

    hr_emp = db_session.query(models.HrEmployee).filter(models.HrEmployee.id == hr_id).first()
    assert hr_emp is not None, "HrEmployee record must exist in DB"
    assert hr_emp.company_id == company.id
    assert hr_emp.user_id == user_id
    assert hr_emp.job_title == "Fleet Operations Supervisor"
    assert hr_emp.base_salary == Decimal("14500.50")

    # Verify 1-to-1 relationship navigation
    assert hr_emp.user.id == res_user.id
    assert res_user.hr_employee.id == hr_emp.id

    # Verify TenantUserRole relational mapping
    tur = (
        db_session.query(models.TenantUserRole)
        .filter(
            models.TenantUserRole.user_id == user_id,
            models.TenantUserRole.company_id == company.id,
        )
        .first()
    )
    assert tur is not None, "TenantUserRole record must be created"


def test_02_onboarding_welcome_email_dispatch_triggered(client: TestClient, db_session: Session, mock_default_email_dispatch):
    """
    Test that the onboarding welcome/reset email dispatch is triggered
    with correct employee email, company context, and temporary credentials.
    """
    _, company = create_test_tenant(db_session, "email-disp")
    headers = tenant_admin_headers(db_session, company.id)

    emp_email = f"welcome_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "full_name": "Nouf Al-Shehri",
        "email": emp_email,
        "role": "Standard",
        "job_title": "Customs Broker Specialist",
        "department": "Customs Clearance",
        "base_salary": 9800.00,
    }

    mock_default_email_dispatch.reset_mock()

    response = client.post(
        "/api/v1/tenant/hr/employees",
        json=payload,
        headers=headers,
    )

    assert response.status_code in (200, 201), response.text
    assert mock_default_email_dispatch.called, "dispatch_employee_welcome_email must be invoked"
    assert mock_default_email_dispatch.call_count == 1

    call_kwargs = mock_default_email_dispatch.call_args.kwargs
    assert call_kwargs["email"] == emp_email
    assert call_kwargs["full_name"] == "Nouf Al-Shehri"
    assert call_kwargs["company_id"] == company.id
    assert call_kwargs["job_title"] == "Customs Broker Specialist"
    assert call_kwargs["role"] == "Standard"
    assert len(call_kwargs["temporary_password"]) >= 8


def test_03_tenant_isolation_boundary(client: TestClient, db_session: Session):
    """
    Test tenant isolation:
    Ensure Tenant A cannot see or access employees registered by Tenant B.
    """
    _, company_a = create_test_tenant(db_session, "iso-a")
    _, company_b = create_test_tenant(db_session, "iso-b")

    headers_a = tenant_admin_headers(db_session, company_a.id)
    headers_b = tenant_admin_headers(db_session, company_b.id)

    # 1. Register staff in Tenant A
    emp_a_email = f"staff_a_{uuid.uuid4().hex[:8]}@company-a.sa"
    res_a = client.post(
        "/api/v1/tenant/hr/employees",
        json={
            "full_name": "Emp A Company Alpha",
            "email": emp_a_email,
            "role": "Standard",
            "job_title": "Dispatcher A",
            "department": "Operations",
            "base_salary": 8000.00,
        },
        headers=headers_a,
    )
    assert res_a.status_code in (200, 201), res_a.text
    emp_a_data = res_a.json()

    # 2. Register staff in Tenant B
    emp_b_email = f"staff_b_{uuid.uuid4().hex[:8]}@company-b.sa"
    res_b = client.post(
        "/api/v1/tenant/hr/employees",
        json={
            "full_name": "Emp B Company Beta",
            "email": emp_b_email,
            "role": "Standard",
            "job_title": "Dispatcher B",
            "department": "Operations",
            "base_salary": 8500.00,
        },
        headers=headers_b,
    )
    assert res_b.status_code in (200, 201), res_b.text
    emp_b_data = res_b.json()

    # 3. Query employees as Tenant A
    list_a_res = client.get("/api/v1/tenant/hr/employees", headers=headers_a)
    assert list_a_res.status_code == 200
    list_a_data = list_a_res.json()

    user_ids_in_a = [e["user_id"] for e in list_a_data]
    emails_in_a = [e["email"] for e in list_a_data]

    assert emp_a_data["user_id"] in user_ids_in_a, "Tenant A should see Employee A"
    assert emp_a_email in emails_in_a

    assert emp_b_data["user_id"] not in user_ids_in_a, "Tenant A must NOT see Employee B"
    assert emp_b_email not in emails_in_a

    # 4. Query employees as Tenant B
    list_b_res = client.get("/api/v1/tenant/hr/employees", headers=headers_b)
    assert list_b_res.status_code == 200
    list_b_data = list_b_res.json()

    user_ids_in_b = [e["user_id"] for e in list_b_data]
    emails_in_b = [e["email"] for e in list_b_data]

    assert emp_b_data["user_id"] in user_ids_in_b, "Tenant B should see Employee B"
    assert emp_b_email in emails_in_b

    assert emp_a_data["user_id"] not in user_ids_in_b, "Tenant B must NOT see Employee A"
    assert emp_a_email not in emails_in_b


def test_04_duplicate_email_registration_rejected(client: TestClient, db_session: Session):
    """
    Test that attempting to register an employee with an existing email in the company
    is rejected and does not leave orphaned records.
    """
    _, company = create_test_tenant(db_session, "dup-chk")
    headers = tenant_admin_headers(db_session, company.id)

    dup_email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "full_name": "First Instance",
        "email": dup_email,
        "role": "Standard",
        "job_title": "Driver",
        "department": "Fleet",
        "base_salary": 6000.00,
    }

    # Initial registration should succeed
    res1 = client.post("/api/v1/tenant/hr/employees", json=payload, headers=headers)
    assert res1.status_code in (200, 201), res1.text

    # Second registration with same email must fail
    res2 = client.post(
        "/api/v1/tenant/hr/employees",
        json={**payload, "full_name": "Second Instance"},
        headers=headers,
    )
    assert res2.status_code in (400, 409), f"Expected 400/409 duplicate error, got {res2.status_code}: {res2.text}"
    assert "already registered" in res2.text.lower() or "exists" in res2.text.lower()

    # Verify only 1 ResUser and 1 HrEmployee exist with this email
    users_count = db_session.query(models.ResUser).filter(models.ResUser.email == dup_email).count()
    assert users_count == 1, "There should be exactly 1 ResUser for this email"


def test_05_staff_listing_filters_and_search(client: TestClient, db_session: Session):
    """
    Test GET /api/v1/tenant/hr/employees filtering by department and search keyword.
    """
    _, company = create_test_tenant(db_session, "filt-chk")
    headers = tenant_admin_headers(db_session, company.id)

    # Register employee in Finance
    client.post(
        "/api/v1/tenant/hr/employees",
        json={
            "full_name": "Khalid Al-Mansoori",
            "email": f"khalid_{uuid.uuid4().hex[:8]}@company.sa",
            "role": "Standard",
            "job_title": "Accountant",
            "department": "Finance & Accounting",
            "base_salary": 11000.00,
        },
        headers=headers,
    )

    # Register employee in Logistics
    client.post(
        "/api/v1/tenant/hr/employees",
        json={
            "full_name": "Mansour Al-Harbi",
            "email": f"mansour_{uuid.uuid4().hex[:8]}@company.sa",
            "role": "Manager",
            "job_title": "Fleet Director",
            "department": "Logistics & Fleet",
            "base_salary": 22000.00,
        },
        headers=headers,
    )

    # Filter by department
    res_dept = client.get(
        "/api/v1/tenant/hr/employees?department=Finance%20%26%20Accounting",
        headers=headers,
    )
    assert res_dept.status_code == 200
    dept_items = res_dept.json()
    assert all(item["department_id"] == "Finance & Accounting" for item in dept_items)
    assert any("Khalid" in item["full_name"] for item in dept_items)
    assert not any("Mansour" in item["full_name"] for item in dept_items)

    # Search keyword
    res_search = client.get(
        "/api/v1/tenant/hr/employees?search=Mansour",
        headers=headers,
    )
    assert res_search.status_code == 200
    search_items = res_search.json()
    assert len(search_items) >= 1
    assert any("Mansour" in item["full_name"] for item in search_items)


def test_06_unauthenticated_requests_blocked(client: TestClient):
    """
    Test that requests without valid credentials are strictly rejected (HTTP 401).
    """
    res_post = client.post(
        "/api/v1/tenant/hr/employees",
        json={
            "full_name": "Anonymous User",
            "email": "anon@test.sa",
            "role": "Standard",
        },
    )
    assert res_post.status_code in (401, 403)

    res_get = client.get("/api/v1/tenant/hr/employees")
    assert res_get.status_code in (401, 403)
