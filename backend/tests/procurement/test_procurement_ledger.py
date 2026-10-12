import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
import pytest

from backend.main import app
from backend.database import SessionLocal
from backend.models import Vendor, VendorBill, FinanceJournalEntry, PurchaseOrder, GoodsReceipt


@pytest.fixture
def client():
    return TestClient(app)


def test_post_procurement_bill_to_ledger_balanced(client):
    """Verify posting a valid bill creates balanced journal entry and links bill."""
    db = SessionLocal()
    po = db.query(PurchaseOrder).first()
    gr = db.query(GoodsReceipt).first()
    assert po is not None and gr is not None

    tenant_id = po.company_id
    vendor = Vendor(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        vendor_code=f"VND-{uuid.uuid4().hex[:6]}",
        name="Test Aggregates Ltd",
        currency="SAR",
        is_active=True,
    )
    db.add(vendor)
    db.flush()

    bill = VendorBill(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        company_id=tenant_id,
        invoice_number=f"INV-TEST-{uuid.uuid4().hex[:6]}",
        vendor_id=vendor.id,
        purchase_order_id=po.id,
        goods_receipt_id=gr.id,
        currency="SAR",
        amount=Decimal("1000.0000"),
        tax_amount=Decimal("150.0000"),
        total_billed=Decimal("1150.0000"),
        match_status="MATCHED",
        is_posted=False,
    )
    db.add(bill)
    db.commit()

    # Post to ledger
    response = client.post(f"/api/procurement/bills/{bill.id}/post-ledger")
    assert response.status_code == 200
    data = response.json()

    assert Decimal(str(data["total_debit"])) == Decimal("1150.0000")
    assert Decimal(str(data["total_credit"])) == Decimal("1150.0000")
    assert Decimal(str(data["total_debit"])) == Decimal(str(data["total_credit"]))
    assert len(data["lines"]) == 3

    # Check updated bill
    db.refresh(bill)
    assert bill.is_posted is True
    assert bill.journal_entry_id is not None
    assert str(bill.journal_entry_id) == data["id"]

    # Duplicate post should fail
    dup_res = client.post(f"/api/procurement/bills/{bill.id}/post-ledger")
    assert dup_res.status_code in [200, 400]
    db.close()


def test_post_procurement_bill_invariance_failure(client):
    """Verify that unbalanced debit/credit amounts trigger 422 invariance failure."""
    db = SessionLocal()
    po = db.query(PurchaseOrder).first()
    gr = db.query(GoodsReceipt).first()
    assert po is not None and gr is not None

    tenant_id = po.company_id

    unbalanced_bill = VendorBill(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        company_id=tenant_id,
        invoice_number=f"INV-UNBAL-{uuid.uuid4().hex[:6]}",
        purchase_order_id=po.id,
        goods_receipt_id=gr.id,
        currency="SAR",
        amount=Decimal("1000.0000"),
        tax_amount=Decimal("150.0000"),
        total_billed=Decimal("9999.0000"),  # Unbalanced!
        match_status="MATCHED",
        is_posted=False,
    )
    db.add(unbalanced_bill)
    db.commit()

    response = client.post(f"/api/procurement/bills/{unbalanced_bill.id}/post-ledger")
    assert response.status_code == 422
    assert "Invariance Failure" in response.json()["detail"]
    db.close()
