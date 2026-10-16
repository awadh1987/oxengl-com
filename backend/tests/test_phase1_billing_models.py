"""
OxenGL Phase 1 Billing & Subscription Data Models Verification Suite.
Validates 3-tier plans (Free, Professional, Enterprise), tenant subscription lifecycle,
invoice generation with 15% ZATCA VAT calculations, and architectural entitlement gates.
"""

import uuid
from decimal import Decimal
import pytest
from sqlalchemy import select

from backend.database import PlatformSessionLocal as SessionLocal
from backend.models import MasterTenant, SaaSInvoice
from backend.app.domains.saas.models import SubscriptionPlan, TenantSubscription
from backend.app.services.billing_service import (
    DEFAULT_TIER_PLANS,
    seed_default_subscription_plans,
    get_plan_by_name,
    get_or_create_tenant_subscription,
    create_subscription_invoice,
    verify_tenant_entitlement,
    calculate_invoice_breakdown,
)


@pytest.fixture(scope="module")
def db():
    """Provides a dedicated database session for Phase 1 testing."""
    session = SessionLocal()
    for p_def in DEFAULT_TIER_PLANS:
        existing = get_plan_by_name(session, p_def["name"])
        if existing:
            existing.monthly_price = p_def["monthly_price"]
            existing.annual_price = p_def["annual_price"]
    session.commit()
    yield session
    session.close()


def test_01_default_plans_seeding_and_idempotency(db):
    """
    Test 1: Verifies that seed_default_subscription_plans seeds all 3 tiers
    with proper resource limits, pricing, and enterprise architectural unlock flags.
    """
    plans = seed_default_subscription_plans(db)
    assert len(plans) == 3

    # 1. Verify Free Tier
    free = get_plan_by_name(db, "FREE")
    assert free is not None
    assert free.name == "FREE"
    assert free.monthly_price == Decimal("0.00")
    assert free.max_seats == 2
    assert free.max_vehicles == 5
    assert free.max_storage_gb == 5
    assert free.max_monthly_transactions == 100
    assert free.allow_external_database is False
    assert free.allow_custom_domain is False
    assert free.allow_dedicated_ssl is False

    # 2. Verify Professional Tier
    pro = get_plan_by_name(db, "PROFESSIONAL")
    assert pro is not None
    assert pro.name == "PROFESSIONAL"
    assert pro.monthly_price > 0
    assert pro.annual_price > pro.monthly_price
    assert pro.max_seats == 20
    assert pro.max_vehicles == 50
    assert pro.max_storage_gb == 50
    assert pro.max_monthly_transactions == 10000
    assert pro.allow_external_database is False
    assert pro.allow_custom_domain is False
    assert pro.allow_dedicated_ssl is False

    # 3. Verify Enterprise Tier
    ent = get_plan_by_name(db, "ENTERPRISE")
    assert ent is not None
    assert ent.name == "ENTERPRISE"
    assert ent.monthly_price == Decimal("3750.00")
    assert ent.annual_price == Decimal("37500.00")
    assert ent.max_seats == 999999
    assert ent.max_vehicles == 999999
    assert ent.max_storage_gb == 1000
    assert ent.max_monthly_transactions == 999999
    assert ent.allow_external_database is True
    assert ent.allow_custom_domain is True
    assert ent.allow_dedicated_ssl is True

    # 4. Verify Idempotency - running seed again produces identical count
    plans_again = seed_default_subscription_plans(db)
    assert len(plans_again) == 3
    total_plans = db.scalars(select(SubscriptionPlan)).all()
    assert len(total_plans) == 3


def test_02_tenant_subscription_contract_lifecycle(db):
    """
    Test 2: Verifies establishing and querying tenant subscription contracts,
    seat allocations, and relationships to MasterTenant.
    """
    tenant_id = uuid.uuid4()
    tenant = MasterTenant(
        id=tenant_id,
        name="Al-Majd Logistics Corp",
        slug=f"almajd-{uuid.uuid4().hex[:6]}",
        owner_full_name="Saleh Al-Otaibi",
        owner_email=f"saleh@{uuid.uuid4().hex[:6]}.com",
        owner_mobile="+966551234567",
        subscription_tier="standard",
        status="active",
    )
    db.add(tenant)
    db.commit()

    try:
        # Establish subscription under Professional plan
        sub = get_or_create_tenant_subscription(
            db=db,
            tenant_id=tenant_id,
            plan_name="PROFESSIONAL",
            billing_cycle="monthly",
            payment_method="card",
        )
        assert sub is not None
        assert sub.tenant_id == tenant_id
        assert sub.plan.name == "PROFESSIONAL"
        assert sub.max_seats == 20
        assert sub.status == "active"
        assert sub.current_seats_used == 1
        assert sub.current_vehicles_used == 0

        # Verify relationship from MasterTenant side
        db.refresh(tenant)
        assert tenant.subscription is not None
        assert tenant.subscription.id == sub.id
        assert tenant.subscription.plan.name == "PROFESSIONAL"

        # Verify to_dict serialization
        sub_dict = sub.to_dict()
        assert sub_dict["plan_name"] == "PROFESSIONAL"
        assert sub_dict["max_seats"] == 20
        assert sub_dict["billing_cycle"] == "monthly"
    finally:
        if tenant.subscription:
            db.delete(tenant.subscription)
        db.delete(tenant)
        db.commit()


def test_03_multi_grade_entitlement_enforcement(db):
    """
    Test 3: Verifies that architectural features (external DB, custom domain)
    are strictly restricted by subscription grade and can be unlocked by Enterprise upgrade.
    """
    tenant_id = uuid.uuid4()
    tenant = MasterTenant(
        id=tenant_id,
        name="Sovereign Mining Co",
        slug=f"mining-{uuid.uuid4().hex[:6]}",
        owner_full_name="Khalid Mansour",
        owner_email=f"khalid@{uuid.uuid4().hex[:6]}.com",
        owner_mobile="+966559876543",
        subscription_tier="starter",
        status="active",
    )
    db.add(tenant)
    db.commit()

    try:
        # 1. Tenant on Free Tier
        sub = get_or_create_tenant_subscription(db, tenant_id=tenant_id, plan_name="FREE")
        allowed_db, msg_db = verify_tenant_entitlement(db, tenant_id, "allow_external_database")
        allowed_dom, msg_dom = verify_tenant_entitlement(db, tenant_id, "allow_custom_domain")
        assert allowed_db is False
        assert allowed_dom is False
        assert "locked for Grade 'FREE'" in msg_db

        # 2. Upgrade to Professional Tier
        pro_plan = get_plan_by_name(db, "PROFESSIONAL")
        sub.plan_id = pro_plan.id
        db.commit()
        allowed_db_pro, _ = verify_tenant_entitlement(db, tenant_id, "allow_external_database")
        assert allowed_db_pro is False

        # 3. Upgrade to Enterprise Sovereign Tier
        ent_plan = get_plan_by_name(db, "ENTERPRISE")
        sub.plan_id = ent_plan.id
        db.commit()
        allowed_db_ent, msg_db_ent = verify_tenant_entitlement(db, tenant_id, "allow_external_database")
        allowed_dom_ent, msg_dom_ent = verify_tenant_entitlement(db, tenant_id, "allow_custom_domain")
        allowed_ssl_ent, _ = verify_tenant_entitlement(db, tenant_id, "allow_dedicated_ssl")
        assert allowed_db_ent is True
        assert allowed_dom_ent is True
        assert allowed_ssl_ent is True
        assert "entitled to allow_external_database under ENTERPRISE" in msg_db_ent

        # 4. Custom Override Amendment test
        sub.plan_id = pro_plan.id
        sub.custom_limits = {"allow_external_database": True}
        db.commit()
        allowed_override, msg_override = verify_tenant_entitlement(db, tenant_id, "allow_external_database")
        assert allowed_override is True
        assert "custom enterprise contract amendment" in msg_override
    finally:
        if tenant.subscription:
            db.delete(tenant.subscription)
        db.delete(tenant)
        db.commit()


def test_04_saas_invoicing_and_multi_channel_payments(db):
    """
    Test 4: Verifies invoice creation across payment methods (Card, PO, Bank Wire)
    with automated 15% ZATCA VAT calculations and sequential numbering.
    """
    tenant_id = uuid.uuid4()
    tenant = MasterTenant(
        id=tenant_id,
        name="Global Transport Fleet",
        slug=f"global-{uuid.uuid4().hex[:6]}",
        owner_full_name="Fahad Al-Zahrani",
        owner_email=f"fahad@{uuid.uuid4().hex[:6]}.com",
        owner_mobile="+966553334444",
        subscription_tier="enterprise",
        status="active",
    )
    db.add(tenant)
    db.commit()

    ent_plan = get_plan_by_name(db, "ENTERPRISE")
    sub = get_or_create_tenant_subscription(db, tenant_id=tenant_id, plan_name="ENTERPRISE")

    created_invoices: list[SaaSInvoice] = []
    try:
        # Channel 1: Enterprise Purchase Order Invoice (Net-30)
        inv_po = create_subscription_invoice(
            db=db,
            tenant_id=tenant_id,
            plan_id=ent_plan.id,
            subscription_id=sub.id,
            amount_sar=Decimal("3750.00"),
            billing_cycle="monthly",
            payment_method="purchase_order",
            po_number="PO-2026-ARAMCO-998",
            status="pending",
            notes="Corporate PO Net-30 payment terms.",
        )
        created_invoices.append(inv_po)

        assert inv_po.payment_method == "purchase_order"
        assert inv_po.po_number == "PO-2026-ARAMCO-998"
        assert inv_po.status == "pending"
        assert inv_po.amount_sar == Decimal("3750.0000")
        # Subtotal + VAT (15%) = Total
        assert (inv_po.subtotal_sar + inv_po.tax_sar) == Decimal("3750.0000")
        assert inv_po.tier == "ENTERPRISE"
        assert inv_po.subscription.id == sub.id
        assert inv_po.tenant.id == tenant.id

        # Channel 2: Bank Wire / Transfer Invoice
        inv_wire = create_subscription_invoice(
            db=db,
            tenant_id=tenant_id,
            plan_id=ent_plan.id,
            subscription_id=sub.id,
            amount_sar=Decimal("37500.00"),
            billing_cycle="annual",
            payment_method="bank_transfer",
            payment_reference="WIRE-SA-20260926-0042",
            status="paid",
            notes="Annual upfront payment via Alinma Bank corporate wire.",
        )
        created_invoices.append(inv_wire)

        assert inv_wire.payment_method == "bank_transfer"
        assert inv_wire.payment_reference == "WIRE-SA-20260926-0042"
        assert inv_wire.status == "paid"
        assert inv_wire.billing_cycle == "annual"
        assert inv_wire.paid_at is not None
        assert (inv_wire.subtotal_sar + inv_wire.tax_sar) == Decimal("37500.0000")

        # Verify sequential numbering format
        assert inv_po.invoice_number != inv_wire.invoice_number
        assert "SAAS-INV-" in inv_po.invoice_number
        assert "SAAS-INV-" in inv_wire.invoice_number

        # Channel 3: Vat calculation utility directly
        calc = calculate_invoice_breakdown(Decimal("1000.00"), is_gross=True, tax_rate=Decimal("0.15"))
        assert calc["subtotal"] + calc["tax"] == Decimal("1000.0000")
    finally:
        for inv in created_invoices:
            db.delete(inv)
        if tenant.subscription:
            db.delete(tenant.subscription)
        db.delete(tenant)
        db.commit()


def test_05_cascade_deletion_isolation(db):
    """
    Test 5: Verifies that deleting a MasterTenant cascades to its TenantSubscription
    and SaaSInvoice records without affecting global SubscriptionPlans.
    """
    tenant_id = uuid.uuid4()
    tenant = MasterTenant(
        id=tenant_id,
        name="Temporary Ephemeral LLC",
        slug=f"temp-{uuid.uuid4().hex[:6]}",
        owner_full_name="Temporary Owner",
        owner_email=f"temp@{uuid.uuid4().hex[:6]}.com",
        owner_mobile="+966550000000",
        subscription_tier="standard",
        status="active",
    )
    db.add(tenant)
    db.commit()

    pro_plan = get_plan_by_name(db, "PROFESSIONAL")
    sub = get_or_create_tenant_subscription(db, tenant_id=tenant_id, plan_name="PROFESSIONAL")
    inv = create_subscription_invoice(
        db=db,
        tenant_id=tenant_id,
        plan_id=pro_plan.id,
        subscription_id=sub.id,
        amount_sar=Decimal("185.00"),
    )

    sub_id = sub.id
    inv_id = inv.id

    # Delete MasterTenant
    db.delete(tenant)
    db.commit()

    # Verify tenant, subscription, and invoice are removed
    assert db.get(MasterTenant, tenant_id) is None
    assert db.get(TenantSubscription, sub_id) is None
    assert db.get(SaaSInvoice, inv_id) is None

    # Verify global plan remains untouched
    assert db.get(SubscriptionPlan, pro_plan.id) is not None
