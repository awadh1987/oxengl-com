"""Procurement/inventory/HR imports capture unknown columns into custom_attributes."""

import uuid

from sqlalchemy import select

from backend import models
from backend.app.domains.hr.models import Employee
from backend.app.services.custom_fields import canonical_entity
from backend.app.services.erp_document_import import import_employees, import_purchase_orders, import_stock_items
from backend.database import SessionLocal


def _company(db):
    c = models.ResCompany(id=uuid.uuid4(), name=f"ERP Co {uuid.uuid4().hex[:6]}")
    db.add(c)
    db.commit()
    return c


def test_aliases():
    assert canonical_entity("procurement") == "purchase_order"
    assert canonical_entity("stock_item") == "inventory_item"
    assert canonical_entity("hr_profile") == "employee"
    assert canonical_entity("payroll") == "employee"


def test_purchase_order_import():
    db = SessionLocal()
    try:
        c = _company(db)
        res = import_purchase_orders(db, c.id, [
            {"PO No": f"PO-{uuid.uuid4().hex[:6]}", "Supplier": "Acme Supplies", "Subtotal": 100, "VAT": 15, "Cost Basis": "FOB"}
        ])
        assert res["imported_count"] == 1, res
        assert res["custom_field_keys"] == ["cost_basis"]
        po = db.scalar(select(models.PurchaseOrder).where(models.PurchaseOrder.company_id == c.id))
        assert po.custom_attributes == {"cost_basis": "FOB"}
    finally:
        db.close()


def test_stock_item_import():
    db = SessionLocal()
    try:
        c = _company(db)
        res = import_stock_items(db, c.id, [{"SKU": f"S-{uuid.uuid4().hex[:6]}", "Item Name": "Gravel", "Bin Location": "A-12"}])
        assert res["imported_count"] == 1, res
        item = db.scalar(select(models.StockItem).where(models.StockItem.company_id == c.id))
        assert item.custom_attributes == {"bin_location": "A-12"}
    finally:
        db.close()


def test_employee_import_and_seat_cap():
    db = SessionLocal()
    try:
        t = _company(db).id
        code = f"E-{uuid.uuid4().hex[:6]}"
        res = import_employees(db, t, [
            {"Employee Code": code, "Name": "Sara Ali", "Badge Color": "blue"},
            {"Employee Code": code + "b", "Name": "Over Cap"},
        ], seats_available=1)
        assert res["imported_count"] == 1 and len(res["errors"]) == 1, res
        emp = db.scalar(select(Employee).where(Employee.employee_code == code))
        assert emp.custom_attributes == {"badge_color": "blue"}
    finally:
        db.close()
