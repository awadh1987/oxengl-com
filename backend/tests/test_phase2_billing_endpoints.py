"""
OxenGL Phase 2 Test Suite: Subscription Management Endpoints & Multi-Channel Invoicing.
Tests:
1. Plan catalog discovery (GET /api/v1/tenant/billing/plans).
2. Tenant subscription status and usage meters (GET /api/v1/tenant/billing/subscription).
3. Stripe Checkout Session creation (POST /api/v1/tenant/billing/checkout).
4. Multi-channel Stripe webhook processing (checkout.session.completed, invoice.payment_succeeded,
   invoice.payment_failed, customer.subscription.deleted).
5. Enterprise Corporate PO quote & wire transfer instructions (POST /api/v1/tenant/billing/enterprise-quote).
6. SuperAdmin global invoice catalog & one-click bank receipt settlement (PUT /api/v1/superadmin/billing/invoices/{id}/verify).
7. Immediate entitlement unlock post-settlement (External DB & Custom Domain).
8. SuperAdmin custom contract limits & financial summary telemetry.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.main import app
from backend.tests.auth_helpers import platform_superadmin_headers, tenant_admin_headers
from backend.database import PlatformSessionLocal as SessionLocal
from backend.models import MasterTenant, ResCompany, SaaSInvoice
from backend.app.domains.saas.models import SubscriptionPlan, TenantSubscription
from backend.app.services.billing_service import (
    DEFAULT_TIER_PLANS,
    get_plan_by_name,
    seed_default_subscription_plans,
    verify_tenant_entitlement,
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    db = SessionLocal()
    seed_default_subscription_plans(db)
    for p_def in DEFAULT_TIER_PLANS:
        existing = get_plan_by_name(db, p_def["name"])
        if existing:
            existing.monthly_price = p_def["monthly_price"]
            existing.annual_price = p_def["annual_price"]
    db.commit()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def create_test_master_tenant(db, slug=None, name=None, tier="free") -> MasterTenant:
    slug_val = slug or f"p2-{uuid.uuid4().hex[:8]}"
    tenant = MasterTenant(
        id=uuid.uuid4(),
        slug=slug_val,
        name=name or f"Phase 2 Test Tenant ({slug_val})",
        owner_full_name="Saleh Al-Otaibi",
        owner_email=f"owner_{slug_val}@oxengl.me",
        owner_mobile="+966500000000",
        subscription_tier=tier,
        status="active",
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


def test_01_plan_catalog_endpoint(client: TestClient, db_session):
    """Verifies GET /api/v1/tenant/billing/plans returns all 3 tiers with quotas and unlock flags."""
    resp = client.get("/api/v1/tenant/billing/plans", headers=tenant_admin_headers(db_session, create_test_master_tenant(db_session).id))
    assert resp.status_code == 200, resp.text
    plans = resp.json()
    assert len(plans) >= 3

    plan_map = {p["name"]: p for p in plans}
    assert "FREE" in plan_map
    assert "PROFESSIONAL" in plan_map
    assert "ENTERPRISE" in plan_map

    # Free Grade Checks
    free = plan_map["FREE"]
    assert free["monthly_price"] == 0.0
    assert free["max_seats"] == 2
    assert free["max_vehicles"] == 5
    assert free["allow_external_database"] is False
    assert free["allow_custom_domain"] is False

    # Professional Grade Checks
    pro = plan_map["PROFESSIONAL"]
    assert pro["monthly_price"] == float(get_plan_by_name(db_session, "PROFESSIONAL").monthly_price)
    assert pro["annual_price"] == float(get_plan_by_name(db_session, "PROFESSIONAL").annual_price)
    assert pro["max_seats"] == 20
    assert pro["max_vehicles"] == 50
    assert pro["allow_external_database"] is False
    assert pro["allow_custom_domain"] is False

    # Enterprise Grade Checks
    ent = plan_map["ENTERPRISE"]
    assert ent["monthly_price"] == 3750.0
    assert ent["annual_price"] == 37500.0
    assert ent["allow_external_database"] is True
    assert ent["allow_custom_domain"] is True
    assert ent["allow_dedicated_ssl"] is True


def test_02_tenant_subscription_and_meters_endpoint(client: TestClient, db_session):
    """Verifies GET /api/v1/tenant/billing/subscription returns live meters and entitlement gates."""
    tenant = create_test_master_tenant(db_session, tier="free")

    resp = client.get(
        "/api/v1/tenant/billing/subscription",
        headers=tenant_admin_headers(db_session, tenant.id),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["tenant_id"] == str(tenant.id)
    assert data["status"] in ("active", "trialing")
    assert data["plan"]["name"] == "FREE"
    assert data["entitlements"]["allow_external_database"] is False
    assert data["entitlements"]["allow_custom_domain"] is False
    assert data["meters"]["max_seats"] == 2


def test_03_stripe_checkout_session_creation(client: TestClient, db_session):
    """Verifies POST /api/v1/tenant/billing/checkout generates checkout URL and metadata."""
    tenant = create_test_master_tenant(db_session, tier="free")

    # Monthly checkout
    payload = {
        "plan_name": "PROFESSIONAL",
        "billing_cycle": "monthly",
        "success_url": "https://oxengl.me/billing/success",
        "cancel_url": "https://oxengl.me/billing/cancel",
    }
    resp = client.post(
        "/api/v1/tenant/billing/checkout",
        headers=tenant_admin_headers(db_session, tenant.id),
        json=payload,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "session_id" in data
    assert "checkout_url" in data
    assert data["checkout_url"].startswith("https://checkout.stripe.com")
    assert data["amount_sar"] == float(get_plan_by_name(db_session, "PROFESSIONAL").monthly_price)
    assert data["plan_name"] == "PROFESSIONAL"
    assert data["billing_cycle"] == "monthly"

    # Annual checkout with discount
    payload_annual = {
        "plan_name": "PROFESSIONAL",
        "billing_cycle": "annual",
    }
    resp_annual = client.post(
        "/api/v1/tenant/billing/checkout",
        headers=tenant_admin_headers(db_session, tenant.id),
        json=payload_annual,
    )
    assert resp_annual.status_code == 200, resp_annual.text
    assert resp_annual.json()["amount_sar"] == float(get_plan_by_name(db_session, "PROFESSIONAL").annual_price)


def test_04_stripe_webhook_lifecycle_events(client: TestClient, db_session):
    """Verifies automated webhook handling: checkout completion, recurring success, failure, deletion."""
    tenant = create_test_master_tenant(db_session, tier="free")

    # 1. checkout.session.completed
    checkout_event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": f"cs_test_{uuid.uuid4().hex[:12]}",
                "client_reference_id": str(tenant.id),
                "customer": f"cus_{uuid.uuid4().hex[:8]}",
                "subscription": f"sub_{uuid.uuid4().hex[:8]}",
                "metadata": {
                    "tenant_id": str(tenant.id),
                    "plan_name": "PROFESSIONAL",
                    "billing_cycle": "monthly",
                },
            }
        },
    }
    resp = client.post("/api/v1/platform/webhooks/stripe", json=checkout_event)
    assert resp.status_code == 200, resp.text
    res_data = resp.json()
    assert res_data["status"] == "success"

    # Verify database state after checkout
    sub = db_session.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant.id))
    assert sub is not None
    assert sub.status == "active"
    assert sub.plan.name == "PROFESSIONAL"
    assert sub.payment_method_type == "stripe_card"

    # Verify SaaS invoice generated
    inv = db_session.scalar(select(SaaSInvoice).where(SaaSInvoice.tenant_id == tenant.id))
    assert inv is not None
    assert inv.status == "paid"
    assert inv.amount_sar == get_plan_by_name(db_session, "PROFESSIONAL").monthly_price
    assert inv.payment_method == "stripe_card"

    # 2. invoice.payment_succeeded (recurring renewal)
    invoice_paid_event = {
        "type": "invoice.payment_succeeded",
        "data": {
            "object": {
                "id": f"in_{uuid.uuid4().hex[:8]}",
                "subscription": sub.stripe_subscription_id,
                "customer": sub.stripe_customer_id,
            }
        },
    }
    resp_inv = client.post("/api/v1/platform/webhooks/stripe", json=invoice_paid_event)
    assert resp_inv.status_code == 200, resp_inv.text
    assert resp_inv.json()["status"] == "success"

    # 3. invoice.payment_failed (grace period)
    invoice_fail_event = {
        "type": "invoice.payment_failed",
        "data": {
            "object": {
                "id": f"in_fail_{uuid.uuid4().hex[:8]}",
                "subscription": sub.stripe_subscription_id,
            }
        },
    }
    resp_fail = client.post("/api/v1/platform/webhooks/stripe", json=invoice_fail_event)
    assert resp_fail.status_code == 200, resp_fail.text
    assert resp_fail.json()["subscription_status"] == "past_due"

    # 4. customer.subscription.deleted (downgrade to free)
    sub_del_event = {
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": sub.stripe_subscription_id,
            }
        },
    }
    resp_del = client.post("/api/v1/platform/webhooks/stripe", json=sub_del_event)
    assert resp_del.status_code == 200, resp_del.text
    assert resp_del.json()["subscription_status"] == "canceled"


def test_05_enterprise_po_quote_and_wire_instructions(client: TestClient, db_session):
    """Verifies POST /api/v1/tenant/billing/enterprise-quote generates formal corporate PO invoice and wire instructions."""
    tenant = create_test_master_tenant(db_session, tier="free")

    po_num = f"PO-KSA-2026-{uuid.uuid4().hex[:4].upper()}"
    payload = {
        "plan_name": "ENTERPRISE",
        "billing_cycle": "annual",
        "po_number": po_num,
        "company_tax_id": "310492847100003",
        "billing_address": "King Fahd Road, Al Olaya, Riyadh, Kingdom of Saudi Arabia",
        "contact_email": "procurement@enterprise.sa",
        "notes": "Net-30 Enterprise Sovereign contract terms.",
    }

    resp = client.post(
        "/api/v1/tenant/billing/enterprise-quote",
        headers=tenant_admin_headers(db_session, tenant.id),
        json=payload,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    invoice_data = data["invoice"]
    assert invoice_data["status"] == "pending"
    assert invoice_data["payment_method"] == "purchase_order"
    assert invoice_data["po_number"] == po_num
    assert invoice_data["tier"] == "ENTERPRISE"
    assert invoice_data["amount_sar"] == 37500.0
    # 15% VAT check
    assert round(invoice_data["subtotal_sar"], 2) == 32608.70
    assert round(invoice_data["tax_sar"], 2) == 4891.30

    bank_instructions = data["corporate_bank_instructions"]
    assert "SA0380000000608010167519" in bank_instructions["iban"]
    assert bank_instructions["swift_code"] == "INMASARI"
    assert bank_instructions["payment_reference"] == invoice_data["invoice_number"]

    # Verify that before settlement, Enterprise capabilities remain locked
    allowed, _ = verify_tenant_entitlement(db_session, tenant.id, "allow_external_database")
    assert allowed is False, "Enterprise external database must remain locked until PO invoice is settled!"


def test_06_superadmin_invoicing_and_one_click_verification(client: TestClient, db_session):
    """Verifies SuperAdmin directory listing and one-click bank receipt settlement with immediate capability unlock."""
    # 1. Fetch pending invoices
    resp_list = client.get("/api/v1/superadmin/billing/invoices?status=pending", headers=platform_superadmin_headers(db_session)[0])
    assert resp_list.status_code == 200, resp_list.text
    invoices = resp_list.json()
    assert len(invoices) >= 1

    target_invoice = invoices[0]
    invoice_id = target_invoice["id"]
    tenant_id = uuid.UUID(target_invoice["tenant_id"])

    # 2. SuperAdmin verifies and settles invoice via bank transfer reference
    verify_payload = {
        "payment_reference": f"SARIE-WIRE-{uuid.uuid4().hex[:8].upper()}",
        "notes": "Corporate bank wire confirmed via Alinma Business Portal.",
    }
    resp_settle = client.put(
        f"/api/v1/superadmin/billing/invoices/{invoice_id}/verify",
        json=verify_payload,
        headers=platform_superadmin_headers(db_session)[0],
    )
    assert resp_settle.status_code == 200, resp_settle.text
    settle_data = resp_settle.json()

    assert settle_data["status"] == "settled"
    assert settle_data["invoice"]["status"] == "paid"
    assert settle_data["invoice"]["payment_reference"] == verify_payload["payment_reference"]
    assert settle_data["subscription"]["status"] == "active"

    # 3. CRITICAL: Entitlement check post-settlement!
    allowed_db, msg_db = verify_tenant_entitlement(db_session, tenant_id, "allow_external_database")
    assert allowed_db is True, f"External database must be unlocked! {msg_db}"

    allowed_domain, msg_domain = verify_tenant_entitlement(db_session, tenant_id, "allow_custom_domain")
    assert allowed_domain is True, f"Custom domain must be unlocked! {msg_domain}"

    # 4. Verify idempotent duplicate settlement
    resp_dupe = client.put(
        f"/api/v1/superadmin/billing/invoices/{invoice_id}/verify",
        json=verify_payload,
        headers=platform_superadmin_headers(db_session)[0],
    )
    assert resp_dupe.status_code == 200
    assert resp_dupe.json()["status"] == "already_paid"


def test_07_superadmin_custom_limits_and_summary(client: TestClient, db_session):
    """Verifies SuperAdmin custom contract limits amendment and platform financial summary telemetry."""
    tenant = create_test_master_tenant(db_session, tier="free")

    # 1. Update custom limits
    custom_limits_payload = {
        "custom_limits": {
            "max_seats": 750,
            "max_vehicles": 1500,
            "allow_external_database": True,
        }
    }
    resp_limits = client.put(
        f"/api/v1/superadmin/billing/tenants/{tenant.id}/custom-limits",
        json=custom_limits_payload,
        headers=platform_superadmin_headers(db_session)[0],
    )
    assert resp_limits.status_code == 200, resp_limits.text
    assert resp_limits.json()["custom_limits"]["max_seats"] == 750

    # Verify custom limit entitlement override
    allowed, _ = verify_tenant_entitlement(db_session, tenant.id, "allow_external_database")
    assert allowed is True, "Custom limits must grant entitlement override!"

    # 2. SuperAdmin Summary Telemetry
    resp_summary = client.get("/api/v1/superadmin/billing/summary", headers=platform_superadmin_headers(db_session)[0])
    assert resp_summary.status_code == 200, resp_summary.text
    summary = resp_summary.json()

    assert summary["active_subscribers_count"] >= 1
    assert "tier_distribution" in summary
    assert "estimated_mrr_sar" in summary
    assert "estimated_arr_sar" in summary
    assert summary["total_collected_sar"] >= 0.0


def test_08_invoice_history_and_detail_endpoints(client: TestClient, db_session):
    """Verifies GET /api/v1/tenant/billing/invoices and GET /api/v1/tenant/billing/invoices/{id}."""
    tenant = create_test_master_tenant(db_session, tier="professional")

    # Create two test invoices
    plan = get_plan_by_name(db_session, "PROFESSIONAL")
    inv1 = SaaSInvoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        plan_id=plan.id,
        invoice_number=f"SAAS-INV-202609-TEST-{uuid.uuid4().hex[:4].upper()}",
        billing_cycle="monthly",
        tier="PROFESSIONAL",
        amount_sar=Decimal("185.00"),
        subtotal_sar=Decimal("160.87"),
        tax_sar=Decimal("24.13"),
        status="paid",
        payment_method="stripe_card",
        issued_date=datetime.now(timezone.utc),
        pdf_url="/api/v1/tenant/billing/invoices/test.pdf",
    )
    db_session.add(inv1)
    db_session.commit()

    # List invoices for tenant
    resp_list = client.get(
        "/api/v1/tenant/billing/invoices",
        headers=tenant_admin_headers(db_session, tenant.id),
    )
    assert resp_list.status_code == 200, resp_list.text
    invoices = resp_list.json()
    assert len(invoices) >= 1
    assert invoices[0]["invoice_number"] == inv1.invoice_number

    # Get single invoice detail
    resp_single = client.get(f"/api/v1/tenant/billing/invoices/{inv1.id}", headers=tenant_admin_headers(db_session, tenant.id))
    assert resp_single.status_code == 200, resp_single.text
    detail = resp_single.json()
    assert detail["id"] == str(inv1.id)
    assert detail["amount_sar"] == 185.0
    assert detail["status"] == "paid"


def test_09_lazy_master_tenant_provisioning_from_res_company(client: TestClient, db_session):
    """
    Verifies Point 2: Legacy/seeded ResCompany workspaces lacking a MasterTenant row
    are lazily auto-provisioned on GET /api/v1/tenant/billing/subscription and POST /api/v1/tenant/billing/checkout
    so they never fail with HTTP 403 'This account has no billable tenant workspace'.
    """
    legacy_company_id = uuid.uuid4()
    slug_val = f"legacy-myon-{uuid.uuid4().hex[:6]}"
    company = ResCompany(
        id=legacy_company_id,
        name=f"Myon Contract Cloud ({slug_val})",
        slug=slug_val,
        subscription_tier="professional",
        is_active=True,
    )
    db_session.add(company)
    db_session.commit()

    try:
        # Confirm no MasterTenant exists initially
        assert db_session.get(MasterTenant, legacy_company_id) is None

        headers = tenant_admin_headers(db_session, legacy_company_id)

        # 1. GET /api/v1/tenant/billing/subscription lazily provisions MasterTenant + TenantSubscription
        sub_resp = client.get("/api/v1/tenant/billing/subscription", headers=headers)
        assert sub_resp.status_code == 200, sub_resp.text
        sub_data = sub_resp.json()
        assert sub_data["tenant_id"] == str(legacy_company_id)
        assert sub_data["tenant_slug"] == slug_val
        assert sub_data["plan"]["name"] == "PROFESSIONAL"

        # 2. POST /api/v1/tenant/billing/checkout succeeds without 403
        checkout_resp = client.post(
            "/api/v1/tenant/billing/checkout",
            headers=headers,
            json={"plan_name": "ENTERPRISE", "billing_cycle": "monthly"},
        )
        assert checkout_resp.status_code == 200, checkout_resp.text
        assert "checkout_url" in checkout_resp.json()
    finally:
        db_session.rollback()
        db_session.query(TenantSubscription).filter(TenantSubscription.tenant_id == legacy_company_id).delete()
        db_session.query(MasterTenant).filter(MasterTenant.id == legacy_company_id).delete()
        db_session.query(ResCompany).filter(ResCompany.id == legacy_company_id).delete()
        db_session.commit()


def test_10_public_and_tenant_billing_gateways_endpoint(client: TestClient, db_session):
    """
    Verifies Point 6: GET /api/v1/pricing/gateways (public) and GET /api/v1/tenant/billing/gateways (authenticated)
    expose active payment gateway status, publishable keys, bank wire accounts, and digital wallets without secrets.
    """
    pub_resp = client.get("/api/v1/pricing/gateways")
    assert pub_resp.status_code == 200, pub_resp.text
    pub_data = pub_resp.json()

    assert "is_stripe_enabled" in pub_data
    assert "is_moyasar_enabled" in pub_data
    assert isinstance(pub_data["local_bank_instructions"], list)
    assert len(pub_data["local_bank_instructions"]) >= 1
    assert isinstance(pub_data["digital_wallet_instructions"], list)
    # Must never expose secret keys
    assert "stripe_secret_key" not in pub_data
    assert "moyasar_api_key" not in pub_data

    tenant = create_test_master_tenant(db_session, tier="free")
    auth_resp = client.get("/api/v1/tenant/billing/gateways", headers=tenant_admin_headers(db_session, tenant.id))
    assert auth_resp.status_code == 200, auth_resp.text
    assert auth_resp.json()["local_bank_instructions"] == pub_data["local_bank_instructions"]

