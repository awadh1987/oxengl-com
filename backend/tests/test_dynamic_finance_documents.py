"""Invoice/voucher imports capture unknown columns into custom_attributes."""

import uuid

from sqlalchemy import select

from backend import models
from backend.app.domains.finance.models import FinanceJournalEntry
from backend.app.services.custom_fields import canonical_entity
from backend.app.services.finance_document_import import import_customer_invoices, import_journal_vouchers
from backend.database import SessionLocal


def _company(db):
    c = models.ResCompany(id=uuid.uuid4(), name=f"Fin Co {uuid.uuid4().hex[:6]}")
    db.add(c)
    db.commit()
    return c


def test_aliases():
    for a in ("invoice", "customer_invoice"):
        assert canonical_entity(a) == "invoice"
    for a in ("voucher", "payment_voucher", "receipt_voucher"):
        assert canonical_entity(a) == "voucher"


def test_invoice_import_captures_extras():
    db = SessionLocal()
    try:
        c = _company(db)
        num = f"INV-{uuid.uuid4().hex[:6]}"
        res = import_customer_invoices(db, c.id, [
            {"Invoice No": num, "Customer": "Acme", "Subtotal": 100, "VAT": 15, "PO Reference": "PO-9"}
        ])
        assert res["imported_count"] == 1 and res["custom_field_keys"] == ["po_reference"]
        inv = db.scalar(select(models.CustomerInvoice).where(models.CustomerInvoice.company_id == c.id))
        assert inv.custom_attributes == {"po_reference": "PO-9"} and float(inv.grand_total) == 115
    finally:
        db.close()


def test_voucher_import_groups_lines_and_captures_extras():
    db = SessionLocal()
    try:
        c = _company(db)
        num = f"V-{uuid.uuid4().hex[:6]}"
        res = import_journal_vouchers(db, c.id, [
            {"Voucher No": num, "Account": "101000", "Debit": 50, "Credit": 0, "Cheque No": "CH-1"},
            {"Voucher No": num, "Account": "120000", "Debit": 0, "Credit": 50},
            {"Voucher No": "BAD-" + num, "Account": "101000", "Debit": 5, "Credit": 0},
        ])
        assert res["imported_count"] == 1 and len(res["errors"]) == 1
        e = db.scalar(select(FinanceJournalEntry).where(FinanceJournalEntry.entry_number == num))
        assert e.custom_attributes == {"cheque_no": "CH-1"}
    finally:
        db.close()
