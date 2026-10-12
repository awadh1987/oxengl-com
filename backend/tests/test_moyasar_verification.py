"""Tests for Moyasar server-to-server invoice payment verification."""

from decimal import Decimal
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.database import SessionLocal
from backend.models import Invoice


@pytest.fixture
def test_invoice():
    db = SessionLocal()
    invoice = Invoice(
        invoice_number="INV-MOYASAR-TEST-001",
        total_amount=Decimal("250.00"),
        currency="SAR",
        payment_status="pending",
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    inv_id = invoice.id
    db.close()

    yield inv_id

    # Cleanup
    db = SessionLocal()
    inv = db.query(Invoice).filter(Invoice.id == inv_id).first()
    if inv:
        db.delete(inv)
        db.commit()
    db.close()


def test_moyasar_verify_missing_id(test_invoice):
    client = TestClient(app)
    resp = client.post(f"/api/finance/payments/moyasar/verify/{test_invoice}", json={})
    assert resp.status_code == 400
    assert "Transaction ID required" in resp.json()["detail"]


def test_moyasar_verify_invoice_not_found():
    client = TestClient(app)
    resp = client.post("/api/finance/payments/moyasar/verify/99999999", json={"id": "pay_test_123"})
    assert resp.status_code == 404
    assert "Invoice not found" in resp.json()["detail"]


def test_moyasar_verify_gateway_failure(test_invoice):
    client = TestClient(app)
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.text = "Not Found"
        mock_get.return_value = mock_resp

        resp = client.post(f"/api/finance/payments/moyasar/verify/{test_invoice}", json={"id": "pay_invalid"})
        assert resp.status_code == 400
        assert "Gateway verification failed" in resp.json()["detail"]


def test_moyasar_verify_unpaid_status(test_invoice):
    client = TestClient(app)
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "pay_failed_123",
            "status": "failed",
            "amount": 25000,
            "currency": "SAR",
        }
        mock_get.return_value = mock_resp

        resp = client.post(f"/api/finance/payments/moyasar/verify/{test_invoice}", json={"id": "pay_failed_123"})
        assert resp.status_code == 402
        assert "Payment not completed" in resp.json()["detail"]


def test_moyasar_verify_amount_mismatch(test_invoice):
    client = TestClient(app)
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "pay_mismatch_123",
            "status": "paid",
            "amount": 10000,  # 100 SAR instead of 250 SAR
            "currency": "SAR",
            "source": {"type": "mada"},
        }
        mock_get.return_value = mock_resp

        resp = client.post(f"/api/finance/payments/moyasar/verify/{test_invoice}", json={"id": "pay_mismatch_123"})
        assert resp.status_code == 400
        assert "Payment amount mismatch" in resp.json()["detail"]


def test_moyasar_verify_success(test_invoice):
    client = TestClient(app)
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "pay_success_123",
            "status": "paid",
            "amount": 25000,  # 250 SAR in halalas
            "currency": "SAR",
            "source": {"type": "creditcard"},
        }
        mock_get.return_value = mock_resp

        resp = client.post(f"/api/finance/payments/moyasar/verify/{test_invoice}", json={"id": "pay_success_123"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "paid"
        assert data["transaction_id"] == "pay_success_123"
        assert data["payment_method"] == "creditcard"

    # Verify database persistence
    db = SessionLocal()
    inv = db.query(Invoice).filter(Invoice.id == test_invoice).first()
    assert inv is not None
    assert inv.payment_status == "paid"
    assert inv.moyasar_transaction_id == "pay_success_123"
    assert inv.payment_method == "creditcard"
    assert inv.paid_at is not None
    db.close()


def test_get_public_invoice_success(test_invoice):
    client = TestClient(app)
    db = SessionLocal()
    inv = db.query(Invoice).filter(Invoice.id == test_invoice).first()
    token = inv.public_token
    db.close()

    assert token is not None
    resp = client.get(f"/api/finance/invoices/public/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == test_invoice
    assert data["invoice_number"] == "INV-MOYASAR-TEST-001"
    assert data["total_amount"] == 250.0
    assert data["currency"] == "SAR"
    assert data["payment_status"] == "pending"
    # Ensure sensitive fields are NOT exposed
    assert "tenant_id" not in data
    assert "vendor_id" not in data
    assert "company_id" not in data


def test_get_public_invoice_not_found():
    client = TestClient(app)
    resp = client.get("/api/finance/invoices/public/non-existent-token-12345")
    assert resp.status_code == 404
    assert "Invoice not found" in resp.json()["detail"]

