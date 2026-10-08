"""Legacy import captures unknown Excel columns into custom_attributes and registers field definitions."""

import io
import uuid

import openpyxl
from sqlalchemy import select

from backend import models
from backend.app.services.custom_fields import canonical_entity, sanitize_attributes
from backend.app.services.legacy_import_service import LegacyImportService
from backend.database import SessionLocal


def test_unknown_columns_land_in_custom_attributes():
    db = SessionLocal()
    try:
        company = models.ResCompany(id=uuid.uuid4(), name=f"Dyn Co {uuid.uuid4().hex[:6]}")
        db.add(company)
        db.commit()
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["رقم تذكرة الميزان", "رقم الشاحنة", "اسم الناقل", "العميل المستلم", "نوع المادة", "الوزن المحمل", "الوزن الفارغ", "Gate Pass No", "Driver Rating"])
        ticket_no = f"TK-DYN-{uuid.uuid4().hex[:6]}"
        ws.append([ticket_no, "T-1", "Carrier", "Cust", "Sand", 40, 10, "GP-77", 4.5])
        bio = io.BytesIO()
        wb.save(bio)

        res = LegacyImportService(db, company.id).import_excel_bytes(bio.getvalue())
        assert res["success"] is True and res["imported_count"] == 1
        assert set(res["custom_field_keys"]) == {"gate_pass_no", "driver_rating"}

        ticket = db.scalar(select(models.WeighbridgeTicket).where(models.WeighbridgeTicket.company_id == company.id))
        assert ticket.custom_attributes == {"gate_pass_no": "GP-77", "driver_rating": 4.5}
        defs = db.scalars(select(models.CustomFieldDefinition).where(models.CustomFieldDefinition.company_id == company.id)).all()
        assert {d.field_key: d.data_type for d in defs} == {"gate_pass_no": "text", "driver_rating": "number"}
    finally:
        db.close()


def test_helpers():
    assert canonical_entity("customer") == "partner"
    assert canonical_entity("nope") is None
    assert sanitize_attributes({" My Key ": {"a": 1}, "": 1}) == {"my_key": "{'a': 1}"}
