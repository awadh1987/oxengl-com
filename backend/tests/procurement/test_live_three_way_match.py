import pytest, uuid
from decimal import Decimal
from fastapi import status
from backend.app.domains.procurement.models import PurchaseOrder, GoodsReceipt, VendorBill

@pytest.mark.asyncio
async def test_3way_01_matched_happy_path(async_client, db_session):
    """3WAY-01: Verifies that PO == GRN == Bill yields a MATCHED status transaction."""
    co_id, p_id = str(uuid.uuid4()), str(uuid.uuid4())
    payload = {
        "purchase_order_id": str(uuid.uuid4()),
        "goods_receipt_id": str(uuid.uuid4()),
        "invoice_no": "INV-LIVE-MATCH-001",
        "po_qty": 100.0, "grn_qty": 100.0, "inv_qty": 100.0,
        "amount": 12000.00, "company_id": co_id, "partner_id": p_id
    }
    # Dispatch live payload through reverse proxy API routing channels
    res = await async_client.post("/api/v1/procurement/vendor-invoices/match", json=payload)
    assert res.status_code == status.HTTP_200_OK
    assert res.json()["status"] == "MATCHED"

@pytest.mark.asyncio
async def test_3way_02_short_shipment_discrepancy(async_client):
    """3WAY-02: Verifies partial GRN counts trigger a HOLD_DISCREPANCY lock."""
    payload = {
        "purchase_order_id": str(uuid.uuid4()),
        "goods_receipt_id": str(uuid.uuid4()),
        "invoice_no": "INV-LIVE-ERR-002",
        "po_qty": 100.0, "grn_qty": 75.0, "inv_qty": 100.0, # 25 units short-shipped
        "amount": 12000.00
    }
    res = await async_client.post("/api/v1/procurement/vendor-invoices/match", json=payload)
    assert res.status_code == status.HTTP_200_OK
    assert res.json()["status"] == "HOLD_DISCREPANCY"
