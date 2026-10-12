"""
Sprint 7 Tests: The Legacy Data Bridge (System Resource Excel Import).

Verifies:
1. POST /api/v1/system/import-legacy with openpyxl-generated Excel workbook.
2. Absorption into WeighbridgeTicket, Material, and ResPartner models.
3. Safe transactions, rollback handling, and idempotency (duplicate prevention/update).
4. Decimal ROUND_HALF_UP financial calculations (15% VAT, net profit, gross/tare weight invariants).
"""

import io
import uuid
from decimal import Decimal, ROUND_HALF_UP
import openpyxl
import pytest
from starlette.testclient import TestClient
from sqlalchemy import select

from backend.app.main import app
from backend.database import SessionLocal
from backend import models
from backend.app.domains.inventory.models import Material
from backend.app.services.legacy_import_service import (
    LegacyImportService,
    round_currency,
    round_quantity,
)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_company(db):
    company = db.scalar(select(models.ResCompany).limit(1))
    if not company:
        company = models.ResCompany(id=uuid.uuid4(), name=f"Legacy Test Co {uuid.uuid4().hex[:6]}")
        db.add(company)
        db.commit()
        db.refresh(company)
    return company


def test_round_half_up_utilities():
    """Verify ROUND_HALF_UP rounding rules for currency and quantities."""
    # 2.555 -> 2.56, 2.554 -> 2.55
    assert round_currency("100.555") == Decimal("100.56")
    assert round_currency("100.554") == Decimal("100.55")
    assert round_currency("100.5550") == Decimal("100.56")
    assert round_quantity("32.12345", 4) == Decimal("32.1235")
    assert round_quantity("32.12344", 4) == Decimal("32.1234")


def test_legacy_excel_service_absorption_and_idempotency(db, test_company):
    """
    Test direct service absorption of an in-memory System Resource workbook:
    - Creates WeighbridgeTicket, Material, ResPartners.
    - Subsequent run updates without crashing.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "قاعدة البيانات الشاملة"

    # Header Row matching historical Excel
    ws.append([
        "رقم تذكرة الميزان",
        "رقم الشاحنة",
        "اسم الناقل",
        "مصدر التحميل الكسارة",
        "العميل المستلم",
        "نوع المادة",
        "الوزن المحمل",
        "الوزن الفارغ",
        "الوزن الصافي",
        "قيمة المبيعات بدون ضريبة",
        "تكلفة المشتريات",
        "تاريخ التحميل",
        "الملاحظات",
    ])

    ticket_no = f"TK-LEGACY-{uuid.uuid4().hex[:6].upper()}"
    crusher_name = f"كسارة الرياض الكبرى {uuid.uuid4().hex[:4]}"
    transporter_name = f"نقليات الوفاق {uuid.uuid4().hex[:4]}"
    customer_name = f"شركة الخرسانة المتطورة {uuid.uuid4().hex[:4]}"
    material_name = f"بحص مغسول {uuid.uuid4().hex[:4]}"

    ws.append([
        ticket_no,
        "TRK-9812",
        transporter_name,
        crusher_name,
        customer_name,
        material_name,
        45.5000,
        15.5000,
        30.0000,
        2500.00,
        1700.00,
        "2026-09-23T10:00:00",
        "Historical haulage record test",
    ])

    bio = io.BytesIO()
    wb.save(bio)
    file_bytes = bio.getvalue()

    service = LegacyImportService(db=db, company_id=test_company.id)
    res = service.import_excel_bytes(file_bytes, "System Resource.xlsx")

    assert res["success"] is True
    assert res["imported_count"] == 1
    assert res["updated_count"] == 0

    # 1. Verify WeighbridgeTicket created with correct Decimal math
    ticket = db.scalar(
        select(models.WeighbridgeTicket).where(
            models.WeighbridgeTicket.company_id == test_company.id,
            models.WeighbridgeTicket.ticket_number == ticket_no,
        )
    )
    assert ticket is not None
    assert ticket.gross_weight == Decimal("45.5000")
    assert ticket.tare_weight == Decimal("15.5000")
    assert ticket.net_weight == Decimal("30.0000")
    assert ticket.sales_amount == Decimal("2500.00")
    # Recalculated 15% VAT via ROUND_HALF_UP: 2500 * 0.15 = 375.00
    assert ticket.vat_amount == Decimal("375.00")
    assert ticket.total_sales == Decimal("2875.00")
    assert ticket.purchases_cost == Decimal("1700.00")
    # Recalculated Net Profit: 2500 - 1700 = 800.00
    assert ticket.net_profit == Decimal("800.00")

    # 2. Verify Material created
    mat = db.scalar(
        select(Material).where(
            Material.company_id == test_company.id,
            Material.name == material_name,
        )
    )
    assert mat is not None
    assert mat.primary_uom == "MT"

    # 3. Verify ResPartners created
    crusher_partner = db.scalar(
        select(models.ResPartner).where(
            models.ResPartner.company_id == test_company.id,
            models.ResPartner.name == crusher_name,
        )
    )
    assert crusher_partner is not None
    assert crusher_partner.partner_type == "raw_materials_supplier"

    transporter_partner = db.scalar(
        select(models.ResPartner).where(
            models.ResPartner.company_id == test_company.id,
            models.ResPartner.name == transporter_name,
        )
    )
    assert transporter_partner is not None
    assert transporter_partner.partner_type == "service_supplier"

    customer_partner = db.scalar(
        select(models.ResPartner).where(
            models.ResPartner.company_id == test_company.id,
            models.ResPartner.name == customer_name,
        )
    )
    assert customer_partner is not None
    assert customer_partner.partner_type == "customer"

    # 4. Test Idempotency: Re-importing same file must update rather than crash
    res_repeat = service.import_excel_bytes(file_bytes, "System Resource.xlsx")
    assert res_repeat["success"] is True
    assert res_repeat["imported_count"] == 0
    assert res_repeat["updated_count"] == 1
    assert res_repeat["skipped_count"] == 0


def test_api_import_legacy_endpoint(test_company):
    """Test calling the FastAPI POST /api/v1/system/import-legacy endpoint."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Operations"

    ws.append([
        "Ticket Number", "Truck No", "Carrier", "Loading Source",
        "Client", "Material", "Gross Wt", "Tare Wt", "Net Wt", "Sales Amount"
    ])

    ticket_api_no = f"TK-API-{uuid.uuid4().hex[:6].upper()}"
    ws.append([
        ticket_api_no,
        "TRK-7711",
        "Al-Saqr Logistics",
        "Tuwaiq Quarry",
        "Gulf ReadyMix",
        "Aggregate 3/4",
        42.0,
        14.0,
        28.0,
        1850.50,
    ])

    bio = io.BytesIO()
    wb.save(bio)
    file_bytes = bio.getvalue()

    client = TestClient(app)
    response = client.post(
        "/api/v1/system/import-legacy",
        headers={"x-company-id": str(test_company.id)},
        files={"file": ("System Resource.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["success"] is True
    assert data["imported_count"] == 1
    assert data["filename"] == "System Resource.xlsx"
