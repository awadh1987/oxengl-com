"""Unit and Integration Tests for Phase 7: Universal Bulk Import Engine & Schema Extension."""
import io
import uuid
from decimal import Decimal
from datetime import datetime, timezone
import openpyxl
import pytest
from starlette.testclient import TestClient
from sqlalchemy import select

from backend.app.main import app
from backend.database import SessionLocal
from backend import models
from backend.app.services.bulk_import_service import (
    BulkImportService,
    match_column_key,
    normalize_header,
    parse_raw_rows_from_csv,
    parse_raw_rows_from_excel,
    stream_raw_rows_from_csv,
    stream_raw_rows_from_excel,
)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def test_company_id(db_session):
    company = db_session.scalar(select(models.ResCompany).limit(1))
    if not company:
        company = models.ResCompany(name=f"Phase 7 Test Co {uuid.uuid4().hex[:6]}")
        db_session.add(company)
        db_session.commit()
    return company.id


def test_header_normalization_and_matching():
    """Verify legacy Arabic and English header mapping."""
    assert match_column_key("الناقل") == "service_supplier"
    assert match_column_key("اسم الناقل") == "service_supplier"
    assert match_column_key("الكسارة") == "material_supplier"
    assert match_column_key("مصدر التحميل") == "material_supplier"
    assert match_column_key("العميل") == "customer"
    assert match_column_key("العميل المستلم") == "customer"
    assert match_column_key("الوزن المحمل") == "qty_loaded"
    assert match_column_key("الصافي") == "qty_delivered"
    assert match_column_key("الوزن المفرغ") == "qty_delivered"
    assert match_column_key("صافي الربح") == "net_profit"
    assert match_column_key("إجمالي المبيعات") == "total_sales"
    assert match_column_key("تكلفة المشتريات") == "purchases_cost"
    assert match_column_key("حساب الكسارة") == "crusher_payment"


def test_excel_streaming_and_parsing():
    """Test generating and streaming rows from in-memory openpyxl workbook."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "قاعدة البيانات الشاملة"
    ws.append(["الناقل", "الكسارة", "العميل", "الوزن المحمل", "الصافي", "المبيعات", "رقم التذكرة"])
    ws.append(["شركة اليمامة للنقل", "كسارة العاصمة 1", "شركة الخرسانة الجاهزة", 32.5, 31.8, 1500.0, "TK-9901"])
    ws.append(["مؤسسة السرعة للتوريدات", "كسارة الصفا", "شركة بناء الشرق", 40.0, 39.2, 2200.0, "TK-9902"])

    bio = io.BytesIO()
    wb.save(bio)
    excel_bytes = bio.getvalue()

    rows = list(stream_raw_rows_from_excel(excel_bytes))
    assert len(rows) == 2
    assert rows[0]["الناقل"] == "شركة اليمامة للنقل"
    assert rows[0]["الكسارة"] == "كسارة العاصمة 1"
    assert rows[0]["العميل"] == "شركة الخرسانة الجاهزة"
    assert float(rows[0]["الوزن المحمل"]) == 32.5
    assert rows[1]["رقم التذكرة"] == "TK-9902"


def test_csv_streaming_and_parsing():
    """Test streaming and parsing CSV format with Arabic UTF-8 content."""
    csv_text = "الناقل,الكسارة,العميل,الصافي,المبيعات\nناقل الجنوب,كسارة الأمل,عميل الغربية,28.5,1200"
    rows = list(stream_raw_rows_from_csv(csv_text.encode("utf-8")))
    assert len(rows) == 1
    assert rows[0]["الناقل"] == "ناقل الجنوب"
    assert rows[0]["الكسارة"] == "كسارة الأمل"
    assert rows[0]["العميل"] == "عميل الغربية"


def test_bulk_import_operations_legacy_superset(db_session, test_company_id):
    """
    Verify full operations import:
    - Creates Picking and Move
    - Creates WeighbridgeTicket with all 17 superset columns
    - Creates TransporterLedger entry
    - Resolves raw_materials_supplier and service_supplier
    """
    ticket_num = f"WB-TEST-{uuid.uuid4().hex[:8].upper()}"
    raw_rows = [
        {
            "الناقل": "شركة النورس للنقل السريع",
            "الكسارة": "كسارة طويق للمواد",
            "العميل": "شركة المقاولات المتحدة",
            "المادة": "بحص 3/4",
            "الوزن المحمل": 35.0,
            "الصافي": 34.2,
            "نسبة الفاقد": 2.28,
            "مبلغ المبيعات": 1800.0,
            "الضريبة": 270.0,
            "إجمالي المبيعات": 2070.0,
            "تكلفة المشتريات": 1200.0,
            "حساب الكسارة": 1150.0,
            "صافي الربح": 600.0,
            "الشهر": 9,
            "رقم تذكرة الميزان": ticket_num,
            "رقم الشاحنة": "TRK-5544",
            "ملاحظات": "حمولة تجريبية لاختبار استيراد قاعدة البيانات الشاملة",
        }
    ]

    service = BulkImportService(db_session, test_company_id)
    result = service.import_operations(raw_rows)

    assert result["success"] is True
    assert result["imported_count"] == 1
    assert len(result["imported_ticket_ids"]) == 1

    ticket_id = uuid.UUID(result["imported_ticket_ids"][0])
    ticket = db_session.get(models.WeighbridgeTicket, ticket_id)
    assert ticket is not None
    assert ticket.ticket_number == ticket_num
    assert ticket.truck_number == "TRK-5544"
    assert ticket.material_supplier_name == "كسارة طويق للمواد"
    assert ticket.service_supplier_name == "شركة النورس للنقل السريع"
    assert ticket.destination_customer_name == "شركة المقاولات المتحدة"
    assert ticket.material_type == "بحص 3/4"
    assert ticket.qty_loaded == Decimal("35.0")
    assert ticket.qty_delivered == Decimal("34.2")
    assert ticket.sales_amount == Decimal("1800.0")
    assert ticket.vat_amount == Decimal("270.0")
    assert ticket.total_sales == Decimal("2070.0")
    assert ticket.purchases_cost == Decimal("1200.0")
    assert ticket.crusher_payment == Decimal("1150.0")
    assert ticket.net_profit == Decimal("600.0")
    assert ticket.operation_month == 9

    # Check partner types
    mat_supp = db_session.scalar(
        select(models.ResPartner).where(
            models.ResPartner.company_id == test_company_id,
            models.ResPartner.name == "كسارة طويق للمواد",
        )
    )
    assert mat_supp is not None
    assert mat_supp.partner_type == "raw_materials_supplier"

    srv_supp = db_session.scalar(
        select(models.ResPartner).where(
            models.ResPartner.company_id == test_company_id,
            models.ResPartner.name == "شركة النورس للنقل السريع",
        )
    )
    assert srv_supp is not None
    assert srv_supp.partner_type == "service_supplier"

    # Check TransporterLedger
    ledger = db_session.scalar(
        select(models.TransporterLedger).where(
            models.TransporterLedger.company_id == test_company_id,
            models.TransporterLedger.operation_id == f"OP-{ticket_num}",
        )
    )
    assert ledger is not None
    assert ledger.transporter_id == srv_supp.id


def test_bulk_import_partners(db_session, test_company_id):
    """Test importing Master Data partners with automatic classification."""
    p_crusher = f"كسارة الذهب {uuid.uuid4().hex[:4]}"
    p_carrier = f"نقليات الفارس {uuid.uuid4().hex[:4]}"
    p_cust = f"شركة الخرسانة العالمية {uuid.uuid4().hex[:4]}"

    tax_no = f"300{uuid.uuid4().int % 100000000000:012d}"
    partner_rows = [
        {"name": p_crusher, "partner_type": "كسارة مواد خام", "tax_number": tax_no},
        {"name": p_carrier, "partner_type": "خدمات نقل بري", "phone": "+966501112233"},
        {"name": p_cust, "partner_type": "عميل زبون", "commercial_registration": "1010998877"},
    ]

    service = BulkImportService(db_session, test_company_id)
    result = service.import_partners(partner_rows)

    assert result["success"] is True
    assert result["imported_count"] == 3

    p1 = db_session.scalar(select(models.ResPartner).where(models.ResPartner.name == p_crusher))
    assert p1.partner_type == "raw_materials_supplier"
    assert p1.tax_number == tax_no

    p2 = db_session.scalar(select(models.ResPartner).where(models.ResPartner.name == p_carrier))
    assert p2.partner_type == "service_supplier"
    assert p2.phone == "+966501112233"

    p3 = db_session.scalar(select(models.ResPartner).where(models.ResPartner.name == p_cust))
    assert p3.partner_type == "customer"
    assert p3.commercial_registration == "1010998877"


def test_api_bulk_import_operations_endpoint(test_company_id):
    """Test calling the FastAPI bulk import endpoint with JSON payload."""
    from backend.app.main import get_active_company_id
    app.dependency_overrides[get_active_company_id] = lambda: test_company_id
    try:
        client = TestClient(app)
        ticket_num = f"WB-API-{uuid.uuid4().hex[:8].upper()}"

        payload = {
            "records": [
                {
                    "service_supplier": "شركة الشاحنات الحديثة",
                    "material_supplier": "كسارة الرياض الكبرى",
                    "customer": "مصنع البلك الآلي",
                    "scale_ticket_no": ticket_num,
                    "qty_loaded": 33.0,
                    "qty_delivered": 32.5,
                    "sales_amount": 1650.0,
                    "purchases_cost": 1000.0,
                }
            ]
        }

        res = client.post("/api/v1/operations/bulk-import", json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True
        assert data["imported_count"] == 1
    finally:
        app.dependency_overrides.pop(get_active_company_id, None)
