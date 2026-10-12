"""
Unit & Integration Tests for Super Admin Billing Approvals Queue & Tenant Receipt Upload.
File: backend/tests/test_admin_billing_approvals.py
"""

from __future__ import annotations

import io
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.api.v1.admin_billing import router as admin_billing_router
from backend.app.api.v1.billing import tenant_billing_router
from backend.app.core import auth as core_auth
from backend.app.domains.saas.models import SubscriptionPlan, TenantSubscription
from backend.database import get_db, get_platform_db
from backend.models import MasterTenant, SaaSInvoice


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    # Temporary strip PostgreSQL specific ::jsonb server_default so SQLite can create the table
    orig_sd = MasterTenant.__table__.c.features_override.server_default
    MasterTenant.__table__.c.features_override.server_default = None

    try:
        for model in (SubscriptionPlan, MasterTenant, TenantSubscription, SaaSInvoice):
            model.__table__.create(engine)  # type: ignore[attr-defined]
    finally:
        MasterTenant.__table__.c.features_override.server_default = orig_sd

    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    db = factory()
    # Seed Plan
    plan = SubscriptionPlan(
        id=uuid.uuid4(),
        name="PROFESSIONAL",
        display_name="Professional Business Plan",
        monthly_price=Decimal("499.00"),
        annual_price=Decimal("4990.00"),
        currency="SAR",
    )
    db.add(plan)

    # Seed Tenant
    tenant = MasterTenant(
        id=uuid.uuid4(),
        name="Al-Saad Logistics Group",
        slug="al-saad-logistics",
        owner_full_name="Faisal Al-Saad",
        owner_email="faisal@alsaad.sa",
        owner_mobile="+966512345678",
        status="suspended",
        subscription_tier="free",
        max_users=5,
        max_storage_gb=10,
    )
    db.add(tenant)

    # Seed pending offline invoice
    invoice = SaaSInvoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        plan_id=plan.id,
        invoice_number="SAAS-INV-202610-0010-TEST",
        billing_cycle="monthly",
        tier="PROFESSIONAL",
        amount_sar=Decimal("499.00"),
        subtotal_sar=Decimal("433.91"),
        tax_sar=Decimal("65.09"),
        currency="SAR",
        status="pending_verification",
        payment_method="offline",
        payment_proof_url="/static/uploads/receipts/proof_123.png",
    )
    db.add(invoice)

    db.commit()
    db.close()
    return factory


def _mock_super_admin(email="superadmin@oxengl.com"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        email=email,
        role="Super_Admin",
        company_id=None,
        is_superuser=True,
        access_control_list="*",
        role_ids="super_admin",
    )


def _mock_tenant_user(company_id, email="faisal@alsaad.sa"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        email=email,
        role="Admin",
        company_id=company_id,
        is_superuser=False,
        access_control_list="",
        role_ids="tenant_admin",
    )


def _admin_client(session_factory, user=None) -> TestClient:
    app = FastAPI()
    app.include_router(admin_billing_router)
    app.include_router(tenant_billing_router, prefix="/api/v1/tenant/billing")

    current_user = user or _mock_super_admin()

    def _db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_platform_db] = _db
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[core_auth.require_super_admin] = lambda: current_user
    app.dependency_overrides[core_auth.get_authenticated_user] = lambda: current_user
    return TestClient(app)


# ------------------------------------------------------------------ Tests

def test_get_pending_invoices_returns_queue(session_factory):
    client = _admin_client(session_factory)
    res = client.get("/api/v1/admin/billing/pending-invoices")
    assert res.status_code == 200, res.text
    data = res.json()
    assert len(data) >= 1
    item = data[0]
    assert item["invoice_number"] == "SAAS-INV-202610-0010-TEST"
    assert item["tenant_name"] == "Al-Saad Logistics Group"
    assert item["payment_method"] == "offline"
    assert item["status"] == "pending_verification"
    assert item["payment_proof_url"] == "/static/uploads/receipts/proof_123.png"
    assert item["amount"] == 499.0


def test_approve_pending_invoice_activates_tenant_and_extends_period(session_factory):
    client = _admin_client(session_factory)
    db = session_factory()
    inv = db.query(SaaSInvoice).first()
    invoice_id = str(inv.id)
    tenant_id = inv.tenant_id
    db.close()

    payload = {
        "payment_reference": "WIRE-SAR-99887766",
        "notes": "Verified receipt with Al Rajhi corporate account transfer.",
    }
    res = client.post(f"/api/v1/admin/billing/invoices/{invoice_id}/approve", json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "paid"
    assert body["tenant_status"] == "ACTIVE"

    # Verify DB state
    db = session_factory()
    updated_inv = db.get(SaaSInvoice, uuid.UUID(invoice_id))
    assert updated_inv.status == "paid"
    assert updated_inv.paid_at is not None
    assert updated_inv.payment_reference == "WIRE-SAR-99887766"
    assert "Al Rajhi" in updated_inv.notes

    # Verify tenant activation
    tenant = db.get(MasterTenant, tenant_id)
    assert tenant.status == "active"
    assert tenant.is_active is True
    assert tenant.subscription_tier == "professional"

    # Verify subscription period extended
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    assert sub is not None
    assert sub.status == "active"
    assert sub.current_period_end is not None
    assert sub.current_period_end > sub.current_period_start
    db.close()


def test_approve_already_paid_invoice_fails_with_400(session_factory):
    client = _admin_client(session_factory)
    db = session_factory()
    inv = db.query(SaaSInvoice).first()
    inv.status = "paid"
    db.commit()
    invoice_id = str(inv.id)
    db.close()

    res = client.post(f"/api/v1/admin/billing/invoices/{invoice_id}/approve")
    assert res.status_code == 400
    assert "already 'paid'" in res.json()["detail"]


def test_reject_pending_invoice_marks_rejected_with_audit_reason(session_factory):
    client = _admin_client(session_factory)
    db = session_factory()
    inv = db.query(SaaSInvoice).first()
    invoice_id = str(inv.id)
    db.close()

    payload = {"reason": "IBAN mismatch and receipt timestamp expired."}
    res = client.post(f"/api/v1/admin/billing/invoices/{invoice_id}/reject", json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "rejected"

    # Verify DB state
    db = session_factory()
    updated_inv = db.get(SaaSInvoice, uuid.UUID(invoice_id))
    assert updated_inv.status == "rejected"
    assert "IBAN mismatch" in updated_inv.notes
    db.close()


def test_reject_already_paid_invoice_fails_with_400(session_factory):
    client = _admin_client(session_factory)
    db = session_factory()
    inv = db.query(SaaSInvoice).first()
    inv.status = "paid"
    db.commit()
    invoice_id = str(inv.id)
    db.close()

    res = client.post(f"/api/v1/admin/billing/invoices/{invoice_id}/reject")
    assert res.status_code == 400


def test_approve_or_reject_nonexistent_invoice_returns_404(session_factory):
    client = _admin_client(session_factory)
    fake_id = str(uuid.uuid4())
    res_app = client.post(f"/api/v1/admin/billing/invoices/{fake_id}/approve")
    assert res_app.status_code == 404

    res_rej = client.post(f"/api/v1/admin/billing/invoices/{fake_id}/reject")
    assert res_rej.status_code == 404


def test_tenant_upload_receipt_updates_invoice_to_pending_verification(session_factory):
    db = session_factory()
    tenant = db.query(MasterTenant).first()
    inv = db.query(SaaSInvoice).first()
    inv.status = "pending"
    inv.payment_proof_url = None
    db.commit()
    inv_id = str(inv.id)
    tenant_id = tenant.id
    db.close()

    # Client authenticated as tenant admin
    tenant_user = _mock_tenant_user(company_id=tenant_id)
    client = _admin_client(session_factory, user=tenant_user)

    # Valid PNG image bytes
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    files = {"file": ("receipt.png", io.BytesIO(png_bytes), "image/png")}

    res = client.post(f"/api/v1/tenant/billing/invoices/{inv_id}/receipt", files=files)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "pending_verification"
    assert "/static/uploads/receipts/" in body["payment_proof_url"]

    # Verify DB state
    db = session_factory()
    updated_inv = db.get(SaaSInvoice, uuid.UUID(inv_id))
    assert updated_inv.status == "pending_verification"
    assert updated_inv.payment_proof_url is not None
    db.close()


def test_approve_pending_invoice_enqueues_background_receipt_email(session_factory):
    """Verifies that approving a pending invoice enqueues _dispatch_receipt_email with correct ORM models."""
    client = _admin_client(session_factory)
    db = session_factory()
    inv = db.query(SaaSInvoice).first()
    invoice_id = str(inv.id)
    tenant_id = inv.tenant_id
    db.close()

    payload = {
        "payment_reference": "WIRE-SAR-11223344",
        "notes": "Verified receipt with Bank Albilad wire transfer.",
    }

    with patch("backend.app.api.v1.admin_billing._dispatch_receipt_email", new_callable=AsyncMock) as mock_dispatch:
        res = client.post(f"/api/v1/admin/billing/invoices/{invoice_id}/approve", json=payload)
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "paid"

        # Starlette/FastAPI TestClient automatically runs enqueued background tasks synchronously
        mock_dispatch.assert_called_once()
        called_args = mock_dispatch.call_args[0]
        called_tenant = called_args[0]
        called_invoice = called_args[1]
        called_period_end = called_args[2]

        assert called_tenant.id == tenant_id
        assert called_tenant.name == "Al-Saad Logistics Group"
        assert called_invoice.id == uuid.UUID(invoice_id)
        assert called_invoice.invoice_number == "SAAS-INV-202610-0010-TEST"
        assert called_invoice.status == "paid"
        assert called_period_end is not None


@pytest.mark.asyncio
async def test_dispatch_receipt_email_helper_execution(session_factory):
    """Verifies that _dispatch_receipt_email compiles PDF receipt and dispatches welcome email."""
    from backend.app.api.v1.admin_billing import _dispatch_receipt_email

    db = session_factory()
    tenant = db.query(MasterTenant).first()
    inv = db.query(SaaSInvoice).first()
    inv.status = "paid"
    db.close()

    mock_pdf_bytes = b"%PDF-1.4 Mock Receipt Byte Stream"

    with patch("backend.app.api.v1.admin_billing.generate_invoice_pdf", return_value=mock_pdf_bytes) as mock_pdf_gen, \
         patch("backend.app.api.v1.admin_billing.send_subscription_approved_email", new_callable=AsyncMock) as mock_email_send:

        await _dispatch_receipt_email(
            tenant=tenant,
            invoice=inv,
            current_period_end="2027-10-11",
        )

        mock_pdf_gen.assert_called_once_with(invoice=inv, tenant=tenant)
        mock_email_send.assert_called_once_with(
            tenant_email="faisal@alsaad.sa",
            tenant_name="Al-Saad Logistics Group",
            invoice=inv,
            pdf_attachment_bytes=mock_pdf_bytes,
            current_period_end="2027-10-11",
        )

