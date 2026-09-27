"""
Unit and Integration Tests for Bulk Operations Architecture & Atomic Rollback Integrity.
Verifies docs/BULK_OPERATIONS_ARCHITECTURE.md requirements:
1. Multi-record status modification across tenants and procurement bills
2. Multi-record soft and hard deletions with audit logging
3. Atomic transaction management: complete rollback on failure with zero session poisoning
4. Dedicated endpoints for tenants and procurement
"""

import uuid
from decimal import Decimal
from unittest.mock import patch
import pytest
from starlette.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from backend.app.main import app
from backend.database import SessionLocal
from backend import models


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_bulk_tenant_status_update_and_audit(client: TestClient, db_session):
    """Test updating multiple tenants atomically and verifying audit log generation."""
    t1 = models.ResCompany(name=f"Bulk Test Co 1 {uuid.uuid4().hex[:6]}", is_active=True, status="ACTIVE")
    t2 = models.ResCompany(name=f"Bulk Test Co 2 {uuid.uuid4().hex[:6]}", is_active=True, status="ACTIVE")
    db_session.add_all([t1, t2])
    db_session.commit()
    db_session.refresh(t1)
    db_session.refresh(t2)

    try:
        response = client.post(
            "/api/v1/bulk/tenants/status",
            json={
                "ids": [str(t1.id), str(t2.id)],
                "entity": "tenants",
                "is_active": False,
                "status": "SUSPENDED",
                "reason": "Regulatory maintenance",
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["success"] is True
        assert data["affected_count"] == 2
        assert str(t1.id) in data["processed_ids"]
        assert str(t2.id) in data["processed_ids"]

        # Check DB state
        db_session.expire_all()
        refreshed_t1 = db_session.get(models.ResCompany, t1.id)
        refreshed_t2 = db_session.get(models.ResCompany, t2.id)
        assert refreshed_t1.is_active is False
        assert refreshed_t1.status == "SUSPENDED"
        assert refreshed_t2.is_active is False
        assert refreshed_t2.status == "SUSPENDED"

        # Check Audit Log
        audits = db_session.scalars(
            select(models.TenantAuditLog).where(
                models.TenantAuditLog.tenant_id.in_([str(t1.id), str(t2.id)])
            )
        ).all()
        assert len(audits) >= 2
        assert all(a.action_type == "BULK_STATUS_UPDATE" for a in audits)

    finally:
        db_session.delete(t1)
        db_session.delete(t2)
        db_session.commit()


def test_bulk_procurement_status_and_delete(client: TestClient, db_session):
    """Test bulk status update and bulk hard deletion on procurement bills."""
    company = db_session.scalar(select(models.ResCompany).limit(1))
    if not company:
        company = models.ResCompany(name=f"Procurement Test Co {uuid.uuid4().hex[:6]}")
        db_session.add(company)
        db_session.commit()

    po = db_session.scalar(select(models.PurchaseOrder).limit(1))
    gr = db_session.scalar(select(models.GoodsReceipt).limit(1))
    if not po or not gr:
        partner = db_session.scalar(select(models.ResPartner).limit(1))
        if not partner:
            partner = models.ResPartner(name=f"Partner {uuid.uuid4().hex[:6]}", is_company=True, is_vendor=True)
            db_session.add(partner)
            db_session.flush()
        if not po:
            po = models.PurchaseOrder(
                company_id=company.id,
                po_number=f"PO-TEST-{uuid.uuid4().hex[:6]}",
                partner_id=partner.id,
            )
            db_session.add(po)
            db_session.flush()
        if not gr:
            gr = models.GoodsReceipt(
                company_id=company.id,
                gr_number=f"GR-TEST-{uuid.uuid4().hex[:6]}",
                purchase_order_id=po.id,
            )
            db_session.add(gr)
            db_session.flush()

    bill1 = models.ProcurementBill(
        id=uuid.uuid4(),
        tenant_id=company.id,
        company_id=company.id,
        purchase_order_id=po.id,
        goods_receipt_id=gr.id,
        invoice_number=f"BILL-{uuid.uuid4().hex[:6]}",
        amount=Decimal("1500.00"),
        tax_amount=Decimal("225.00"),
        total_billed=Decimal("1725.00"),
        match_status="UNMATCHED",
    )
    bill2 = models.ProcurementBill(
        id=uuid.uuid4(),
        tenant_id=company.id,
        company_id=company.id,
        purchase_order_id=po.id,
        goods_receipt_id=gr.id,
        invoice_number=f"BILL-{uuid.uuid4().hex[:6]}",
        amount=Decimal("2500.00"),
        tax_amount=Decimal("375.00"),
        total_billed=Decimal("2875.00"),
        match_status="UNMATCHED",
    )
    db_session.add_all([bill1, bill2])
    db_session.commit()

    bill1_id = str(bill1.id)
    bill2_id = str(bill2.id)

    try:
        # Update match status via bulk endpoint
        resp = client.post(
            "/api/v1/bulk/procurement/status",
            json={
                "ids": [bill1_id, bill2_id],
                "entity": "procurement_bills",
                "status": "MATCHED",
            },
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["affected_count"] == 2

        db_session.expire_all()
        assert db_session.get(models.ProcurementBill, bill1.id).match_status == "MATCHED"
        assert db_session.get(models.ProcurementBill, bill2.id).match_status == "MATCHED"

        # Bulk Delete bills
        del_resp = client.post(
            "/api/v1/bulk/procurement/delete",
            json={
                "ids": [bill1_id, bill2_id],
                "entity": "procurement_bills",
                "hard_delete": True,
            },
        )
        assert del_resp.status_code == 200, del_resp.text
        assert del_resp.json()["affected_count"] == 2

        db_session.expunge_all()
        assert db_session.scalar(select(models.ProcurementBill).where(models.ProcurementBill.id == bill1.id)) is None
        assert db_session.scalar(select(models.ProcurementBill).where(models.ProcurementBill.id == bill2.id)) is None

    finally:
        db_session.rollback()


def test_bulk_operations_atomic_rollback_on_failure(client: TestClient, db_session):
    """
    CRITICAL TEST: Ensure strict transaction rollback (db.rollback()) on failure.
    If a database error occurs midway, no records are updated or deleted,
    preventing state corruption or session poisoning.
    """
    t1 = models.ResCompany(name=f"Rollback Test Co 1 {uuid.uuid4().hex[:6]}", is_active=True, status="ACTIVE")
    t2 = models.ResCompany(name=f"Rollback Test Co 2 {uuid.uuid4().hex[:6]}", is_active=True, status="ACTIVE")
    db_session.add_all([t1, t2])
    db_session.commit()
    db_session.refresh(t1)
    db_session.refresh(t2)

    try:
        # Mock db.commit to simulate database failure during transaction execution
        with patch("sqlalchemy.orm.Session.commit", side_effect=SQLAlchemyError("Simulated DB connection failure")):
            resp = client.post(
                "/api/v1/bulk/status",
                json={
                    "ids": [str(t1.id), str(t2.id)],
                    "entity": "tenants",
                    "status": "SUSPENDED",
                    "is_active": False,
                },
            )
            # Must return 500
            assert resp.status_code == 500
            assert "safely rolled back" in resp.text

        # Verify that because of db.rollback(), records remained untouched in DB
        db_session.expire_all()
        refreshed_t1 = db_session.get(models.ResCompany, t1.id)
        refreshed_t2 = db_session.get(models.ResCompany, t2.id)
        assert refreshed_t1.status == "ACTIVE"
        assert refreshed_t1.is_active is True
        assert refreshed_t2.status == "ACTIVE"
        assert refreshed_t2.is_active is True

    finally:
        db_session.delete(t1)
        db_session.delete(t2)
        db_session.commit()


def test_bulk_invalid_payload_handling(client: TestClient):
    """Test validation constraints for bulk operations."""
    # Empty IDs
    resp = client.post(
        "/api/v1/bulk/status",
        json={"ids": [], "entity": "tenants", "status": "ACTIVE"},
    )
    assert resp.status_code == 422  # Pydantic validation error min_length=1

    # Invalid UUIDs
    resp = client.post(
        "/api/v1/bulk/status",
        json={"ids": ["not-a-valid-uuid"], "entity": "tenants", "status": "ACTIVE"},
    )
    assert resp.status_code == 400
    assert "No valid UUIDs found" in resp.text
