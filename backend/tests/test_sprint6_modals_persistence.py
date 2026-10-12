import uuid
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.database import get_db
from backend.models import PurchaseOrder, ResCompany, ResPartner
from backend.app.domains.hr.models import Employee

client = TestClient(app)


def test_sprint6_employee_creation_and_persistence():
    """Verify that POST /api/v1/hr/employees strictly persists records with db.commit()."""
    unique_emp_code = f"EMP-TST-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "employee_code": unique_emp_code,
        "nameAr": "خالد بن عبد العزيز الزامل",
        "nameEn": "Khalid Al-Zamil",
        "department": "العمليات اللوجستية",
        "role": "مشرف حركة الشاحنات",
        "base_salary": 13500.0,
        "iqamaOrNationalId": "1087654321",
    }

    response = client.post("/api/v1/hr/employees", json=payload)
    assert response.status_code == 201, f"Expected 201 Created, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] in ["CREATED", "ACTIVE"]
    assert data["employee_code"] == unique_emp_code
    assert data["base_salary"] == 13500.0

    # Verify query
    list_resp = client.get("/api/v1/hr/employees")
    assert list_resp.status_code == 200
    employees = list_resp.json()
    assert any(e["employee_code"] == unique_emp_code for e in employees)


def test_sprint6_purchase_order_creation_and_persistence():
    """Verify that POST /api/v1/inventory/purchase-orders strictly persists records with db.commit()."""
    unique_po = f"PO-TST-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "po_number": unique_po,
        "vendor_name": "مورد الركام والأسمنت الوطني",
        "category": "مواد أولية وكسارات",
        "total_amount": 75000.0,
        "delivery_date": "2026-10-15",
        "notes": "توريد ركام خرساني عالي الجودة",
    }

    response = client.post("/api/v1/inventory/purchase-orders", json=payload)
    assert response.status_code == 201, f"Expected 201 Created, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["po_number"] == unique_po
    assert data["total_amount"] == 75000.0
    assert data["vendor_name"] == "مورد الركام والأسمنت الوطني"

    # Verify query
    list_resp = client.get("/api/v1/inventory/purchase-orders")
    assert list_resp.status_code == 200
    pos = list_resp.json()
    assert any(p["po_number"] == unique_po for p in pos)
