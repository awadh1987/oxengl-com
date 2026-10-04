"""
OxenGL SaaS Billing & Subscription Management Service.
Manages subscription plans, multi-grade tier seeds, tenant subscription tracking,
invoice generation, and architectural entitlement verification.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session

from backend.app.domains.saas.models import SubscriptionPlan, TenantSubscription
from backend.models import MasterTenant, SaaSInvoice, ResCompany, ResUser

logger = logging.getLogger("oxengl.billing")

DEFAULT_TIER_PLANS: list[dict[str, Any]] = [
    {
        "name": "FREE",
        "display_name": "Free Evaluation Tier",
        "description": "Exploratory sandbox for small operators, trial evaluations, and developer setups.",
        "monthly_price": Decimal("0.00"),
        "annual_price": Decimal("0.00"),
        "currency": "SAR",
        "stripe_price_id": "price_free_tier",
        "stripe_product_id": "prod_free_tier",
        "max_seats": 2,
        "max_vehicles": 5,
        "max_storage_gb": 5,
        "max_monthly_transactions": 100,
        "allow_external_database": False,
        "allow_custom_domain": False,
        "allow_dedicated_ssl": False,
        "features": ["core_erp", "basic_reporting", "shared_db"],
        "is_active": True,
    },
    {
        "name": "PROFESSIONAL",
        "display_name": "Professional Business Grade",
        "description": "Standard business operations for growing logistics, transport, and commercial firms.",
        "monthly_price": Decimal("185.00"),
        "annual_price": Decimal("1850.00"),
        "currency": "SAR",
        "stripe_price_id": "price_professional_monthly",
        "stripe_product_id": "prod_professional",
        "max_seats": 20,
        "max_vehicles": 50,
        "max_storage_gb": 50,
        "max_monthly_transactions": 10000,
        "allow_external_database": False,
        "allow_custom_domain": False,
        "allow_dedicated_ssl": False,
        "features": [
            "core_erp",
            "advanced_reporting",
            "shared_db",
            "automated_invoicing",
            "audit_trail",
            "zatca_standard",
        ],
        "is_active": True,
    },
    {
        "name": "ENTERPRISE",
        "display_name": "Enterprise Sovereign Grade",
        "description": "Dedicated private database hosting, zero-slug custom domain routing, automated Caddy SSL, and sovereign compliance.",
        "monthly_price": Decimal("3750.00"),
        "annual_price": Decimal("37500.00"),
        "currency": "SAR",
        "stripe_price_id": "price_enterprise_custom",
        "stripe_product_id": "prod_enterprise",
        "max_seats": 999999,
        "max_vehicles": 999999,
        "max_storage_gb": 1000,
        "max_monthly_transactions": 999999,
        "allow_external_database": True,
        "allow_custom_domain": True,
        "allow_dedicated_ssl": True,
        "features": [
            "core_erp",
            "advanced_reporting",
            "external_private_db",
            "live_db_migration",
            "zero_slug_custom_domain",
            "automated_ssl_caddy",
            "priority_sla",
            "custom_zatca",
            "purchase_order_invoicing",
            "unlimited_capacity",
        ],
        "is_active": True,
    },
]

# Catalog presentation defaults. Only used when a plan row is first created, or once to
# back-fill rows that pre-date these columns. After that the Super Admin owns the values.
DEFAULT_PLAN_PRESENTATION: dict[str, dict[str, Any]] = {
    "FREE": {
        "sort_order": 10,
        "is_featured": False,
        "display_features": [
            "2 user seats",
            "Up to 5 fleet vehicles",
            "5 GB document vault storage",
            "100 transactions & tickets / month",
            "Shared database with standard hostname",
        ],
    },
    "PROFESSIONAL": {
        "sort_order": 20,
        "is_featured": True,
        "display_features": [
            "20 user seats with RBAC roles",
            "50 fleet vehicles & haulers",
            "50 GB cloud storage vault",
            "10,000 invoices & waybills / month",
            "Strict PostgreSQL RLS tenant isolation",
            "ZATCA Phase 2 tax invoicing engine",
            "Automated weighbridge ticket logs",
        ],
    },
    "ENTERPRISE": {
        "sort_order": 30,
        "is_featured": False,
        "display_features": [
            "Unlimited user seats & fleet vehicles",
            "1 TB (1,000 GB) dedicated vault",
            "Unlimited transactions & ledger volume",
            "Private external database hosting & live migration",
            "Dedicated zero-slug custom domain routing",
            "Automated on-demand SSL provisioning",
            "Corporate purchase order & bank wire billing",
            "24/7 priority SLA & dedicated solutions architect",
        ],
    },
}

# Legacy tier mapping to canonical 3-tier codes
LEGACY_TIER_ALIASES: dict[str, str] = {
    "trial": "FREE",
    "starter": "FREE",
    "free": "FREE",
    "standard": "PROFESSIONAL",
    "growth": "PROFESSIONAL",
    "pro": "PROFESSIONAL",
    "professional": "PROFESSIONAL",
    "enterprise": "ENTERPRISE",
    "sovereign": "ENTERPRISE",
}


def normalize_tier_name(tier_name: str) -> str:
    """Normalizes legacy or mixed-case tier names to canonical plan names ('FREE', 'PROFESSIONAL', 'ENTERPRISE')."""
    raw = (tier_name or "").strip().lower()
    return LEGACY_TIER_ALIASES.get(raw, "FREE")


def seed_default_subscription_plans(db: Session) -> list[SubscriptionPlan]:
    """
    Idempotently ensures the default subscription plans exist in the control plane database.

    The subscription_plans table is the single source of truth for pricing and is edited by
    the Super Admin, so existing rows are NEVER overwritten here (the previous behaviour
    re-applied the hard-coded prices on every startup, silently reverting admin edits).
    Only missing plans are inserted; presentation fields added later (display_features,
    sort_order, is_featured) are back-filled once while still empty.
    """
    seeded_plans: list[SubscriptionPlan] = []
    for plan_spec in DEFAULT_TIER_PLANS:
        name = plan_spec["name"]
        presentation = DEFAULT_PLAN_PRESENTATION.get(name, {})
        plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.name == name))
        if not plan:
            plan = SubscriptionPlan(
                id=uuid.uuid4(),
                **plan_spec,
                display_features=list(presentation.get("display_features", [])),
                sort_order=presentation.get("sort_order", 0),
                is_featured=presentation.get("is_featured", False),
            )
            db.add(plan)
            logger.info("Created new subscription plan: %s (%s)", name, plan_spec["display_name"])
        elif not plan.display_features:
            plan.display_features = list(presentation.get("display_features", []))
            plan.sort_order = presentation.get("sort_order", plan.sort_order or 0)
            plan.is_featured = presentation.get("is_featured", False)
            logger.info("Back-filled catalog presentation for plan %s", name)
        seeded_plans.append(plan)

    db.commit()
    for p in seeded_plans:
        db.refresh(p)
    return seeded_plans


def list_catalog_plans(db: Session, include_inactive: bool = False) -> list[SubscriptionPlan]:
    """Subscription plans in catalog order (single source of truth for every pricing view)."""
    query = select(SubscriptionPlan)
    if not include_inactive:
        query = query.where(SubscriptionPlan.is_active.is_(True))
    plans = db.scalars(
        query.order_by(SubscriptionPlan.sort_order.asc(), SubscriptionPlan.monthly_price.asc())
    ).all()
    if not plans and not db.scalar(select(func.count(SubscriptionPlan.id))):
        seed_default_subscription_plans(db)
        plans = db.scalars(
            query.order_by(SubscriptionPlan.sort_order.asc(), SubscriptionPlan.monthly_price.asc())
        ).all()
    return list(plans)


def get_plan_by_name(db: Session, tier_name: str) -> Optional[SubscriptionPlan]:
    """Retrieves a subscription plan by canonical name or alias (case-insensitive)."""
    canonical_name = normalize_tier_name(tier_name)
    return db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.name == canonical_name))


def get_or_create_tenant_subscription(
    db: Session,
    tenant_id: uuid.UUID,
    plan_name: str = "FREE",
    billing_cycle: str = "monthly",
    payment_method: str = "card",
    trial_days: int = 30,
) -> TenantSubscription:
    """
    Retrieves or establishes a tenant subscription contract record in the control plane.
    """
    sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    canonical_name = normalize_tier_name(plan_name)
    plan = get_plan_by_name(db, canonical_name)
    if not plan:
        # Guarantee fallback to FREE
        plans = seed_default_subscription_plans(db)
        plan = next((p for p in plans if p.name == canonical_name), plans[0])

    now = datetime.now(timezone.utc)
    if not sub:
        period_end = now + timedelta(days=365 if billing_cycle == "annual" else 30)
        sub = TenantSubscription(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            plan_id=plan.id,
            status="active" if canonical_name != "FREE" else "trialing",
            billing_cycle=billing_cycle,
            payment_method_type=payment_method,
            stripe_customer_id=None,
            stripe_subscription_id=None,
            current_seats_used=1,
            current_vehicles_used=0,
            current_storage_mb_used=0,
            current_period_start=now,
            current_period_end=period_end,
            trial_ends_at=now + timedelta(days=trial_days) if canonical_name == "FREE" else None,
            cancel_at_period_end=False,
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)

    return sub


def calculate_invoice_breakdown(
    total_or_subtotal: Decimal,
    is_gross: bool = True,
    tax_rate: Decimal = Decimal("0.15"),
) -> dict[str, Decimal]:
    """Calculates subtotal, VAT (15% standard Saudi ZATCA), and gross total."""
    if is_gross:
        gross = total_or_subtotal
        subtotal = (gross / (Decimal("1.0") + tax_rate)).quantize(Decimal("0.0001"))
        tax = (gross - subtotal).quantize(Decimal("0.0001"))
    else:
        subtotal = total_or_subtotal.quantize(Decimal("0.0001"))
        tax = (subtotal * tax_rate).quantize(Decimal("0.0001"))
        gross = subtotal + tax

    return {
        "subtotal": subtotal,
        "tax": tax,
        "total": gross,
    }


def create_subscription_invoice(
    db: Session,
    tenant_id: uuid.UUID,
    plan_id: uuid.UUID,
    subscription_id: Optional[uuid.UUID] = None,
    amount_sar: Optional[Decimal] = None,
    billing_cycle: str = "monthly",
    payment_method: str = "stripe_card",
    payment_reference: Optional[str] = None,
    po_number: Optional[str] = None,
    status: str = "paid",
    notes: Optional[str] = None,
) -> SaaSInvoice:
    """Creates a formal SaaS invoice record associated with the tenant and plan."""
    plan = db.get(SubscriptionPlan, plan_id)
    tier_name = plan.name if plan else "standard"
    if amount_sar is None:
        if plan:
            amount_sar = plan.annual_price if billing_cycle in ("annual", "yearly") else plan.monthly_price
        else:
            amount_sar = Decimal("0.00")

    breakdown = calculate_invoice_breakdown(amount_sar, is_gross=True)
    now = datetime.now(timezone.utc)
    seq = db.scalar(select(func.count(SaaSInvoice.id))) or 0
    invoice_number = f"SAAS-INV-{now:%Y%m}-{seq + 1:04d}-{uuid.uuid4().hex[:4].upper()}"

    invoice = SaaSInvoice(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        subscription_id=subscription_id,
        plan_id=plan_id,
        invoice_number=invoice_number,
        billing_cycle=billing_cycle,
        tier=tier_name,
        amount_sar=breakdown["total"],
        subtotal_sar=breakdown["subtotal"],
        tax_sar=breakdown["tax"],
        currency="SAR",
        status=status,
        payment_method=payment_method,
        payment_reference=payment_reference,
        po_number=po_number,
        issued_date=now,
        due_date=now + timedelta(days=30 if payment_method in ("purchase_order", "bank_transfer") else 0),
        paid_at=now if status == "paid" else None,
        pdf_url=f"/api/v1/tenant/billing/invoices/{invoice_number}.pdf",
        notes=notes,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def verify_tenant_entitlement(
    db: Session,
    tenant_id: uuid.UUID,
    entitlement_key: str,
) -> tuple[bool, str]:
    """
    Verifies whether a tenant possesses a specific architectural entitlement.
    Validates against active subscription plan flags:
    - 'allow_external_database'
    - 'allow_custom_domain'
    - 'allow_dedicated_ssl'
    """
    tenant = db.get(MasterTenant, tenant_id)
    comp = None
    if not tenant:
        # Fallback for tenant_id matching ResCompany directly
        comp = db.get(ResCompany, tenant_id)
        if comp:
            tenant = db.query(MasterTenant).filter(
                (MasterTenant.id == comp.id) |
                (MasterTenant.slug == comp.domain_slug) |
                (MasterTenant.slug == comp.slug)
            ).first()

    if tenant and not comp:
        comp = db.query(ResCompany).filter(
            (ResCompany.id == tenant.id) |
            (ResCompany.slug == tenant.slug) |
            (ResCompany.domain_slug == tenant.slug)
        ).first()

    if not tenant and not comp:
        return False, "Tenant not found in master catalog."

    # 1. Check explicit feature overrides (e.g., {"allow_custom_domain": True})
    for entity in (tenant, comp):
        if not entity:
            continue
        overrides = getattr(entity, "features_override", None)
        if isinstance(overrides, str):
            try:
                import json
                overrides = json.loads(overrides)
            except Exception:
                overrides = {}
        if isinstance(overrides, dict):
            val = overrides.get(entitlement_key)
            if val is True or str(val).lower() in ("true", "1"):
                return True, f"Entitled via tenant feature override: {entitlement_key}."

    # Inspect linked subscription first
    target_id = tenant.id if tenant else comp.id
    sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == target_id))
    if not sub and comp and comp.id != target_id:
        sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == comp.id))

    # 1b. Check custom override in sub.custom_limits if present
    if sub and sub.custom_limits and isinstance(sub.custom_limits, dict):
        val = sub.custom_limits.get(entitlement_key)
        if val is True or str(val).lower() in ("true", "1"):
            return True, f"Entitled via custom enterprise contract amendment: {entitlement_key}."

    # 2. Check enterprise tier on tenant, company, or subscription
    for candidate in [
        getattr(tenant, "subscription_tier", None),
        getattr(tenant, "subscription_plan", None),
        getattr(tenant, "grade", None),
        getattr(comp, "subscription_tier", None),
        sub.plan.name if sub and sub.plan else None,
    ]:
        if candidate and str(candidate).strip().lower() in ("enterprise", "sovereign"):
            return True, f"Tenant is entitled to {entitlement_key} under ENTERPRISE grade."

    plan: Optional[SubscriptionPlan] = None
    if sub and sub.plan:
        plan = sub.plan
    elif sub:
        plan = db.get(SubscriptionPlan, sub.plan_id)

    # Fallback to MasterTenant subscription_tier or ResCompany subscription_tier
    if not plan:
        tier_code = tenant.subscription_tier if tenant else getattr(comp, "subscription_tier", "FREE")
        plan = get_plan_by_name(db, tier_code or "FREE")

    if not plan:
        return False, f"Unknown subscription plan for tenant {tenant_id}."

    is_allowed = getattr(plan, entitlement_key, False)
    if not is_allowed:
        tier_code = plan.name
        return (
            False,
            f"Feature '{entitlement_key}' is locked for Grade '{tier_code}'. Upgrade required to unlock.",
        )

    return True, f"Tenant is entitled to {entitlement_key} under {plan.name}."


def enforce_tenant_entitlement(
    db: Session,
    tenant_id: uuid.UUID,
    entitlement_key: str,
) -> None:
    """
    Enforces that tenant_id possesses the requested architectural entitlement.
    Raises HTTPException(403) with structured headers and descriptive upgrade directive if blocked.
    """
    allowed, message = verify_tenant_entitlement(db, tenant_id, entitlement_key)
    if not allowed:
        tenant = db.get(MasterTenant, tenant_id)
        current_tier = tenant.subscription_tier if tenant else "FREE"
        upgrade_target = "ENTERPRISE"
        checkout_url = f"/api/v1/tenant/billing/checkout?plan={upgrade_target}"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{message} Upgrade to {upgrade_target} required: {checkout_url}",
            headers={
                "X-Required-Tier": upgrade_target,
                "X-Current-Tier": current_tier.upper(),
                "X-Feature-Gated": entitlement_key,
                "X-Upgrade-URL": checkout_url,
            },
        )


def verify_tenant_seat_limit(
    db: Session,
    tenant_id: uuid.UUID,
) -> tuple[bool, str]:
    """
    Verifies if the tenant has available seat capacity under their current subscription plan.
    """
    tenant = db.get(MasterTenant, tenant_id)
    comp = None
    if not tenant:
        comp = db.get(ResCompany, tenant_id)
        if comp:
            tenant = db.query(MasterTenant).filter(
                (MasterTenant.id == comp.id) |
                (MasterTenant.slug == comp.domain_slug) |
                (MasterTenant.slug == comp.slug)
            ).first()

    target_id = tenant.id if tenant else (comp.id if comp else tenant_id)
    sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == target_id))

    plan: Optional[SubscriptionPlan] = None
    if sub and sub.plan:
        plan = sub.plan
    elif sub:
        plan = db.get(SubscriptionPlan, sub.plan_id)

    if not plan:
        tier_code = tenant.subscription_tier if tenant else (getattr(comp, "subscription_tier", "FREE") if comp else "FREE")
        plan = get_plan_by_name(db, tier_code or "FREE")

    if not plan:
        return True, "No subscription plan found; seat check bypassed."

    # Unlimited seats flag (-1 or >= 999999)
    if plan.max_seats <= -1 or plan.max_seats >= 999999:
        return True, "Unlimited seats permitted on this plan."

    # Check custom limits override
    max_allowed = plan.max_seats
    if sub and sub.custom_limits and isinstance(sub.custom_limits, dict):
        if "max_seats" in sub.custom_limits:
            try:
                max_allowed = int(sub.custom_limits["max_seats"])
                if max_allowed <= -1 or max_allowed >= 999999:
                    return True, "Unlimited seats permitted via custom enterprise override."
            except (ValueError, TypeError):
                pass

    # Count live active users in ResUser for this tenant / company
    active_users_count = db.query(ResUser).filter(
        (ResUser.company_id == target_id) |
        (ResUser.company_id == tenant_id)
    ).count()

    if active_users_count >= max_allowed:
        return (
            False,
            f"Seat quota exceeded: Tenant currently has {active_users_count} user(s), "
            f"reaching the maximum limit of {max_allowed} seat(s) on Grade '{plan.name}'. "
            f"Please upgrade to Professional or Enterprise to invite additional team members.",
        )

    return True, f"Tenant has seat capacity ({active_users_count}/{max_allowed} used)."


def increment_tenant_seat_usage(db: Session, tenant_id: uuid.UUID) -> None:
    """Updates the cached current_seats_used count in TenantSubscription."""
    sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    if not sub:
        tenant = db.get(MasterTenant, tenant_id)
        if tenant:
            sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant.id))
    if sub:
        sub.current_seats_used = (sub.current_seats_used or 0) + 1
        db.commit()


# ==============================================================================
# Phase 2: Multi-Channel Invoicing, Stripe Checkout & SuperAdmin Settlement
# ==============================================================================

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

SAUDI_CORPORATE_BANK_DETAILS = {
    "beneficiary_name": "Oxen Logistics Cloud Technologies Co.",
    "bank_name": "Alinma Bank (مصرف الإنماء)",
    "iban": "SA0380000000608010167519",
    "swift_code": "INMASARI",
    "currency": "SAR",
    "payment_terms": "Net-30 Days from invoice issuance",
    "vat_registration_number": "310492847100003",
}


def activate_tenant_subscription(
    db: Session,
    tenant_id: uuid.UUID,
    plan_name: str,
    billing_cycle: str = "monthly",
    payment_method: str = "card",
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
    extend_period: bool = True,
) -> TenantSubscription:
    """
    Activates or upgrades a tenant's subscription contract to an active paid plan.
    Synchronizes the MasterTenant tier and activates enterprise capabilities immediately.
    """
    canonical_name = normalize_tier_name(plan_name)
    plan = get_plan_by_name(db, canonical_name)
    if not plan:
        plans = seed_default_subscription_plans(db)
        plan = next((p for p in plans if p.name == canonical_name), plans[0])

    sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    now = datetime.now(timezone.utc)
    period_days = 365 if billing_cycle in ("annual", "yearly") else 30

    if not sub:
        sub = TenantSubscription(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            plan_id=plan.id,
            status="active",
            billing_cycle=billing_cycle,
            payment_method_type=payment_method,
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            current_seats_used=1,
            current_vehicles_used=0,
            current_storage_mb_used=0,
            current_period_start=now,
            current_period_end=now + timedelta(days=period_days),
            trial_ends_at=None,
            cancel_at_period_end=False,
        )
        db.add(sub)
    else:
        sub.plan_id = plan.id
        sub.status = "active"
        sub.billing_cycle = billing_cycle
        sub.payment_method_type = payment_method
        if stripe_customer_id:
            sub.stripe_customer_id = stripe_customer_id
        if stripe_subscription_id:
            sub.stripe_subscription_id = stripe_subscription_id
        if extend_period:
            sub.current_period_start = now
            sub.current_period_end = now + timedelta(days=period_days)
        sub.trial_ends_at = None
        sub.canceled_at = None
        sub.cancel_at_period_end = False

    # Synchronize MasterTenant subscription_tier
    tenant = db.get(MasterTenant, tenant_id)
    if tenant:
        tenant.subscription_tier = canonical_name.lower()

    db.commit()
    db.refresh(sub)
    logger.info("Activated subscription for tenant %s under plan %s (%s)", tenant_id, canonical_name, billing_cycle)
    return sub


def create_stripe_checkout_session(
    db: Session,
    tenant_id: uuid.UUID,
    plan_name: str,
    billing_cycle: str = "monthly",
    success_url: str = "",
    cancel_url: str = "",
) -> dict[str, Any]:
    """
    Generates a Stripe Checkout Session for self-service card billing.
    Returns session ID, checkout URL, and plan metadata.
    """
    plan = get_plan_by_name(db, plan_name)
    if not plan:
        raise ValueError(f"Subscription plan '{plan_name}' does not exist.")

    amount_sar = plan.annual_price if billing_cycle in ("annual", "yearly") else plan.monthly_price
    tenant = db.get(MasterTenant, tenant_id)
    tenant_slug = tenant.slug if tenant else str(tenant_id)[:8]
    customer_email = tenant.owner_email if tenant else "admin@oxengl.me"

    session_id = f"cs_test_{uuid.uuid4().hex}"
    checkout_url = f"https://checkout.stripe.com/c/pay/{session_id}"

    # In production with live Stripe credentials, attempt external API handshake
    if STRIPE_SECRET_KEY and not STRIPE_SECRET_KEY.startswith("mock_") and not STRIPE_SECRET_KEY.startswith("test_"):
        try:
            import httpx
            price_id = plan.stripe_price_id or "price_professional_monthly"
            resp = httpx.post(
                "https://api.stripe.com/v1/checkout/sessions",
                auth=(STRIPE_SECRET_KEY, ""),
                data={
                    "payment_method_types[0]": "card",
                    "mode": "subscription",
                    "line_items[0][price]": price_id,
                    "line_items[0][quantity]": "1",
                    "client_reference_id": str(tenant_id),
                    "customer_email": customer_email,
                    "success_url": success_url or f"https://oxengl.me/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
                    "cancel_url": cancel_url or "https://oxengl.me/billing/cancel",
                    "metadata[tenant_id]": str(tenant_id),
                    "metadata[tenant_slug]": tenant_slug,
                    "metadata[plan_name]": plan.name,
                    "metadata[billing_cycle]": billing_cycle,
                },
                timeout=10.0,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                session_id = data.get("id", session_id)
                checkout_url = data.get("url", checkout_url)
        except Exception as exc:
            logger.warning("Stripe API checkout call encountered fallback to simulated session: %s", exc)

    return {
        "session_id": session_id,
        "checkout_url": checkout_url,
        "plan_name": plan.name,
        "display_name": plan.display_name,
        "amount_sar": float(amount_sar),
        "currency": "SAR",
        "billing_cycle": billing_cycle,
        "tenant_id": str(tenant_id),
    }


def verify_stripe_webhook_signature(
    raw_payload: bytes,
    sig_header: Optional[str],
    secret: Optional[str] = None,
) -> bool:
    """
    Validates Stripe HMAC SHA-256 signature header (t=timestamp,v1=signature).
    Permits simulated signatures in test environments when secret is unset or mocked.
    """
    secret = secret or STRIPE_WEBHOOK_SECRET or os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        # In test environments without configured webhook secret, gracefully accept
        return True

    if not sig_header:
        return False

    try:
        parts = dict(item.split("=", 1) for item in sig_header.split(","))
        timestamp = parts.get("t")
        sig = parts.get("v1")
        if not timestamp or not sig:
            return False

        signed_payload = f"{timestamp}.{raw_payload.decode('utf-8')}".encode("utf-8")
        expected_sig = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected_sig, sig)
    except Exception as exc:
        logger.error("Error validating Stripe webhook signature: %s", exc)
        return False


def handle_stripe_checkout_completed(
    db: Session,
    session_data: dict[str, Any],
) -> SaaSInvoice:
    """
    Processes Stripe 'checkout.session.completed' webhook event:
    Activates the subscription and creates a paid invoice record.
    """
    metadata = session_data.get("metadata", {})
    client_ref = session_data.get("client_reference_id") or metadata.get("tenant_id")
    if not client_ref:
        raise ValueError("Missing tenant_id / client_reference_id in Stripe checkout session.")

    tenant_id = uuid.UUID(str(client_ref))
    plan_name = metadata.get("plan_name", "PROFESSIONAL")
    billing_cycle = metadata.get("billing_cycle", "monthly")
    stripe_customer_id = session_data.get("customer")
    stripe_subscription_id = session_data.get("subscription")
    session_id = session_data.get("id", f"cs_{uuid.uuid4().hex[:8]}")

    plan = get_plan_by_name(db, plan_name) or get_plan_by_name(db, "PROFESSIONAL")
    amount_sar = plan.annual_price if billing_cycle in ("annual", "yearly") else plan.monthly_price

    # 1. Activate subscription
    sub = activate_tenant_subscription(
        db=db,
        tenant_id=tenant_id,
        plan_name=plan.name,
        billing_cycle=billing_cycle,
        payment_method="stripe_card",
        stripe_customer_id=stripe_customer_id,
        stripe_subscription_id=stripe_subscription_id,
        extend_period=True,
    )

    # 2. Record paid SaaS invoice
    invoice = create_subscription_invoice(
        db=db,
        tenant_id=tenant_id,
        plan_id=plan.id,
        subscription_id=sub.id,
        amount_sar=amount_sar,
        billing_cycle=billing_cycle,
        payment_method="stripe_card",
        payment_reference=session_id,
        status="paid",
        notes=f"Automated Stripe card payment (Session: {session_id})",
    )
    logger.info("Stripe checkout completed for tenant %s. Plan: %s, Invoice: %s", tenant_id, plan.name, invoice.invoice_number)
    return invoice


def handle_stripe_invoice_paid(
    db: Session,
    invoice_data: dict[str, Any],
) -> SaaSInvoice:
    """
    Processes recurring Stripe 'invoice.payment_succeeded' event:
    Advances tenant subscription renewal dates and issues a paid invoice.
    """
    sub_id = invoice_data.get("subscription")
    sub = None
    if sub_id:
        sub = db.scalar(select(TenantSubscription).where(TenantSubscription.stripe_subscription_id == sub_id))

    if not sub:
        cust_id = invoice_data.get("customer")
        if cust_id:
            sub = db.scalar(select(TenantSubscription).where(TenantSubscription.stripe_customer_id == cust_id))

    if not sub:
        raise ValueError(f"No tenant subscription located for Stripe sub: {sub_id}")

    plan = sub.plan
    amount_sar = plan.annual_price if sub.billing_cycle in ("annual", "yearly") else plan.monthly_price

    # Advance subscription period
    now = datetime.now(timezone.utc)
    period_days = 365 if sub.billing_cycle in ("annual", "yearly") else 30
    sub.status = "active"
    sub.current_period_start = now
    sub.current_period_end = now + timedelta(days=period_days)
    db.commit()

    inv_id = invoice_data.get("id", f"in_{uuid.uuid4().hex[:8]}")
    invoice = create_subscription_invoice(
        db=db,
        tenant_id=sub.tenant_id,
        plan_id=plan.id,
        subscription_id=sub.id,
        amount_sar=amount_sar,
        billing_cycle=sub.billing_cycle,
        payment_method="stripe_card",
        payment_reference=inv_id,
        status="paid",
        notes=f"Stripe recurring invoice payment succeeded: {inv_id}",
    )
    logger.info("Stripe invoice paid for tenant %s. Sub: %s, Invoice: %s", sub.tenant_id, sub_id, invoice.invoice_number)
    return invoice


def handle_stripe_invoice_failed(
    db: Session,
    invoice_data: dict[str, Any],
) -> Optional[TenantSubscription]:
    """
    Processes Stripe 'invoice.payment_failed' event:
    Marks subscription past_due and triggers a grace period.
    """
    sub_id = invoice_data.get("subscription")
    sub = None
    if sub_id:
        sub = db.scalar(select(TenantSubscription).where(TenantSubscription.stripe_subscription_id == sub_id))

    if not sub:
        cust_id = invoice_data.get("customer")
        if cust_id:
            sub = db.scalar(select(TenantSubscription).where(TenantSubscription.stripe_customer_id == cust_id))

    if not sub:
        metadata = invoice_data.get("metadata", {})
        tenant_id_str = metadata.get("tenant_id")
        if tenant_id_str:
            try:
                sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == uuid.UUID(str(tenant_id_str))))
            except Exception:
                pass

    if sub:
        sub.status = "past_due"
        db.commit()
        db.refresh(sub)
        logger.warning("Tenant %s subscription transitioned to 'past_due' following payment failure (Invoice: %s).", sub.tenant_id, invoice_data.get('id'))
    return sub


def handle_stripe_subscription_deleted(
    db: Session,
    sub_data: dict[str, Any],
) -> Optional[TenantSubscription]:
    """
    Processes Stripe 'customer.subscription.deleted' event:
    Cancels subscription and reverts tenant to Free evaluation grade.
    """
    sub_id = sub_data.get("id")
    sub = None
    if sub_id:
        sub = db.scalar(select(TenantSubscription).where(TenantSubscription.stripe_subscription_id == sub_id))

    if not sub:
        cust_id = sub_data.get("customer")
        if cust_id:
            sub = db.scalar(select(TenantSubscription).where(TenantSubscription.stripe_customer_id == cust_id))

    if not sub:
        metadata = sub_data.get("metadata", {})
        tenant_id_str = metadata.get("tenant_id")
        if tenant_id_str:
            try:
                sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == uuid.UUID(str(tenant_id_str))))
            except Exception:
                pass

    if sub:
        free_plan = get_plan_by_name(db, "FREE")
        sub.status = "canceled"
        sub.canceled_at = datetime.now(timezone.utc)
        if free_plan:
            sub.plan_id = free_plan.id
        tenant = db.get(MasterTenant, sub.tenant_id)
        if tenant:
            tenant.subscription_tier = "free"
        db.commit()
        db.refresh(sub)
        logger.info("Tenant %s subscription canceled and reverted to FREE grade (Sub: %s).", sub.tenant_id, sub_id)
    return sub


def handle_stripe_subscription_updated(
    db: Session,
    sub_data: dict[str, Any],
) -> Optional[TenantSubscription]:
    """
    Processes Stripe 'customer.subscription.updated' and 'customer.subscription.created' events:
    Updates subscription status, current period, renewal flags, and plan tier.
    """
    sub_id = sub_data.get("id")
    sub = None
    if sub_id:
        sub = db.scalar(select(TenantSubscription).where(TenantSubscription.stripe_subscription_id == sub_id))

    if not sub:
        cust_id = sub_data.get("customer")
        if cust_id:
            sub = db.scalar(select(TenantSubscription).where(TenantSubscription.stripe_customer_id == cust_id))

    if not sub:
        metadata = sub_data.get("metadata", {})
        tenant_id_str = metadata.get("tenant_id")
        if tenant_id_str:
            try:
                sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == uuid.UUID(str(tenant_id_str))))
            except Exception:
                pass

    if sub:
        stripe_status = sub_data.get("status")
        if stripe_status:
            sub.status = stripe_status

        cancel_at_period_end = sub_data.get("cancel_at_period_end")
        if cancel_at_period_end is not None:
            sub.cancel_at_period_end = bool(cancel_at_period_end)

        period_end = sub_data.get("current_period_end")
        if period_end:
            sub.current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)

        period_start = sub_data.get("current_period_start")
        if period_start:
            sub.current_period_start = datetime.fromtimestamp(period_start, tz=timezone.utc)

        metadata = sub_data.get("metadata", {})
        plan_name = metadata.get("plan_name")
        if plan_name:
            plan = get_plan_by_name(db, plan_name)
            if plan:
                sub.plan_id = plan.id
                tenant = db.get(MasterTenant, sub.tenant_id)
                if tenant:
                    tenant.subscription_tier = plan.name.lower()

        db.commit()
        db.refresh(sub)
        logger.info("Stripe subscription %s updated for tenant %s. Status: %s", sub_id, sub.tenant_id, sub.status)
    return sub


def create_enterprise_po_quote(
    db: Session,
    tenant_id: uuid.UUID,
    plan_name: str = "ENTERPRISE",
    billing_cycle: str = "monthly",
    po_number: Optional[str] = None,
    notes: Optional[str] = None,
    company_details: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Creates an Enterprise Purchase Order / Bank Wire invoice pending manual settlement.
    Returns invoice data and corporate banking wire instructions.
    """
    plan = get_plan_by_name(db, plan_name) or get_plan_by_name(db, "ENTERPRISE")
    amount_sar = plan.annual_price if billing_cycle in ("annual", "yearly") else plan.monthly_price

    sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    if not sub:
        sub = get_or_create_tenant_subscription(
            db=db,
            tenant_id=tenant_id,
            plan_name="FREE",
            billing_cycle="monthly",
            payment_method="purchase_order",
        )

    po_clean = (po_number or f"PO-{datetime.now(timezone.utc):%Y%m}-{uuid.uuid4().hex[:6].upper()}").strip()
    invoice = create_subscription_invoice(
        db=db,
        tenant_id=tenant_id,
        plan_id=plan.id,
        subscription_id=sub.id,
        amount_sar=amount_sar,
        billing_cycle=billing_cycle,
        payment_method="purchase_order",
        po_number=po_clean,
        status="pending",
        notes=notes or "Enterprise Purchase Order awaiting corporate bank wire settlement.",
    )

    return {
        "invoice": invoice.to_dict(),
        "corporate_bank_instructions": {
            **SAUDI_CORPORATE_BANK_DETAILS,
            "payment_reference": invoice.invoice_number,
            "po_number": po_clean,
            "amount_due_sar": float(invoice.amount_sar),
            "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        },
        "next_steps": "Initiate corporate bank wire transfer with the payment reference. SuperAdmin will verify the bank receipt and unlock enterprise access.",
    }


def verify_and_settle_invoice(
    db: Session,
    invoice_id: uuid.UUID,
    payment_reference: str,
    notes: Optional[str] = None,
) -> dict[str, Any]:
    """
    SuperAdmin one-click verification of bank wire receipts:
    Marks invoice paid, activates the tenant's subscription to the invoice's plan,
    extends the billing period, and unlocks architectural capabilities.
    """
    invoice = db.get(SaaSInvoice, invoice_id)
    if not invoice:
        raise ValueError(f"SaaS Invoice '{invoice_id}' not found.")

    if invoice.status == "paid":
        return {
            "invoice": invoice.to_dict(),
            "message": "Invoice was already settled.",
            "status": "already_paid",
        }

    now = datetime.now(timezone.utc)
    invoice.status = "paid"
    invoice.paid_at = now
    invoice.payment_reference = payment_reference
    if notes:
        invoice.notes = f"{invoice.notes or ''}\n[SuperAdmin Verification]: {notes}".strip()

    # Upgrades / activates tenant's subscription to the invoice's plan
    plan = invoice.plan or (db.get(SubscriptionPlan, invoice.plan_id) if invoice.plan_id else None)
    plan_name = plan.name if plan else "ENTERPRISE"

    sub = activate_tenant_subscription(
        db=db,
        tenant_id=invoice.tenant_id,
        plan_name=plan_name,
        billing_cycle=invoice.billing_cycle,
        payment_method=invoice.payment_method or "bank_transfer",
        extend_period=True,
    )

    db.commit()
    db.refresh(invoice)
    logger.info("SuperAdmin verified invoice %s (%s). Tenant %s activated under %s.", invoice.invoice_number, payment_reference, invoice.tenant_id, plan_name)

    return {
        "invoice": invoice.to_dict(),
        "subscription": sub.to_dict(),
        "message": f"Invoice {invoice.invoice_number} successfully settled. Tenant is activated under Grade '{plan_name}'.",
        "status": "settled",
    }


def update_tenant_custom_limits(
    db: Session,
    tenant_id: uuid.UUID,
    custom_limits: dict[str, Any],
) -> TenantSubscription:
    """
    Allows SuperAdmin to set custom contractual limits or feature overrides.
    """
    sub = get_or_create_tenant_subscription(db, tenant_id=tenant_id)
    current = sub.custom_limits or {}
    if isinstance(current, dict):
        current.update(custom_limits)
    else:
        current = custom_limits

    sub.custom_limits = current
    db.commit()
    db.refresh(sub)
    logger.info("SuperAdmin updated custom limits for tenant %s: %s", tenant_id, current)
    return sub
