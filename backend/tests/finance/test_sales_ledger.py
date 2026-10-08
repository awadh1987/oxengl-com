import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
import pytest

from backend.main import app
from backend.database import SessionLocal
from backend.models import (
    Invoice,
    CustomerInvoice,
    FinanceJournalEntry,
    ResCompany,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_post_invoice_to_ledger_balanced(client):
    """Verify posting a valid customer invoice creates a balanced double-entry journal entry."""
    db = SessionLocal()
    company = db.query(ResCompany).first()
    assert company is not None

    inv_num = f"INV-TEST-{uuid.uuid4().hex[:6].upper()}"
    invoice = Invoice(
        invoice_number=inv_num,
        total_amount=Decimal("1150.00"),
        currency="SAR",
        payment_status="paid",
        is_posted=False,
    )
    db.add(invoice)
    db.commit()

    # Post to ledger via integer id
    response = client.post(f"/api/finance/invoices/{invoice.id}/post-ledger")
    assert response.status_code == 200, response.text
    data = response.json()

    assert Decimal(str(data["total_debit"])) == Decimal("1150.0000")
    assert Decimal(str(data["total_credit"])) == Decimal("1150.0000")
    assert Decimal(str(data["total_debit"])) == Decimal(str(data["total_credit"]))
    assert len(data["lines"]) >= 2

    # Check updated invoice state
    db.refresh(invoice)
    assert invoice.is_posted is True
    assert invoice.journal_entry_id is not None
    assert str(invoice.journal_entry_id) == data["id"]

    # Duplicate post should return existing entry or 400
    dup_res = client.post(f"/api/finance/invoices/{invoice.id}/post-ledger")
    assert dup_res.status_code in [200, 400]
    db.close()


def test_post_invoice_by_invoice_number(client):
    """Verify posting works when passing the string invoice_number."""
    db = SessionLocal()
    company = db.query(ResCompany).first()
    assert company is not None

    inv_num = f"INV-STR-{uuid.uuid4().hex[:6].upper()}"
    from datetime import datetime, timezone
    cust_invoice = CustomerInvoice(
        id=uuid.uuid4(),
        company_id=company.id,
        invoice_number=inv_num,
        customer_name="Al Rajhi Logistics Ltd",
        issue_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc),
        subtotal=Decimal("2000.0000"),
        vat_amount=Decimal("300.0000"),
        grand_total=Decimal("2300.0000"),
        status="Approved",
    )
    db.add(cust_invoice)
    db.commit()

    response = client.post(f"/api/finance/invoices/{inv_num}/post-ledger")
    assert response.status_code == 200, response.text
    data = response.json()

    assert Decimal(str(data["total_debit"])) == Decimal("2300.0000")
    assert Decimal(str(data["total_credit"])) == Decimal("2300.0000")

    db.refresh(cust_invoice)
    assert cust_invoice.journal_entry_id is not None
    db.close()


def test_post_invoice_zero_total_failure(client):
    """Verify zero-amount invoice triggers 422 invariance rejection."""
    db = SessionLocal()
    inv_num = f"INV-ZERO-{uuid.uuid4().hex[:6].upper()}"
    invoice = Invoice(
        invoice_number=inv_num,
        total_amount=Decimal("0.00"),
        currency="SAR",
        payment_status="pending",
        is_posted=False,
    )
    db.add(invoice)
    db.commit()

    response = client.post(f"/api/finance/invoices/{invoice.id}/post-ledger")
    assert response.status_code == 422
    assert "Invariance Failure" in response.json()["detail"]
    db.close()
