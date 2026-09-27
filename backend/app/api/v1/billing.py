"""
OxenGL SaaS Billing & Subscription Management API Endpoints.
Covers:
1. Tenant-Facing Billing: Plan catalog, active subscription status, Stripe Checkout sessions,
   Enterprise PO quotes, and invoice history.
2. SuperAdmin Invoicing: Global invoice directory, one-click bank receipt settlement,
   and custom contractual limit overrides.
3. Multi-Channel Webhooks: Automated Stripe webhook listener for recurring billing events.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import MasterTenant, SaaSInvoice
from backend.app.domains.saas.models import SubscriptionPlan, TenantSubscription
from backend.app.services.billing_service import (
    activate_tenant_subscription,
    create_enterprise_po_quote,
    create_stripe_checkout_session,
    get_or_create_tenant_subscription,
    get_plan_by_name,
    handle_stripe_checkout_completed,
    handle_stripe_invoice_failed,
    handle_stripe_invoice_paid,
    handle_stripe_subscription_deleted,
    handle_stripe_subscription_updated,
    seed_default_subscription_plans,
    update_tenant_custom_limits,
    verify_and_settle_invoice,
    verify_stripe_webhook_signature,
    verify_tenant_entitlement,
    SAUDI_CORPORATE_BANK_DETAILS,
)
from backend.app.api.v1.tenant_control import resolve_control_tenant_id

logger = logging.getLogger("oxengl.billing.api")

# Routers
tenant_billing_router = APIRouter(tags=["Tenant Billing"])
superadmin_billing_router = APIRouter(prefix="/api/v1/superadmin/billing", tags=["Super Admin Billing"])
stripe_webhook_router = APIRouter(tags=["Platform Billing Webhooks"])


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class StripeCheckoutRequest(BaseModel):
    plan_name: str = Field(..., description="Target plan code, e.g. 'PROFESSIONAL' or 'ENTERPRISE'")
    billing_cycle: str = Field("monthly", description="'monthly' or 'annual'")
    success_url: Optional[str] = Field(None, description="Redirect URL after card checkout completion")
    cancel_url: Optional[str] = Field(None, description="Redirect URL if checkout is canceled")


class EnterprisePORequest(BaseModel):
    plan_name: str = Field("ENTERPRISE", description="Target plan code ('ENTERPRISE')")
    billing_cycle: str = Field("monthly", description="'monthly' or 'annual'")
    po_number: Optional[str] = Field(None, description="Corporate Purchase Order reference identifier")
    company_tax_id: Optional[str] = Field(None, description="ZATCA 15-digit VAT identification number")
    billing_address: Optional[str] = Field(None, description="Corporate billing address")
    contact_email: Optional[str] = Field(None, description="Finance or procurement contact email")
    notes: Optional[str] = Field(None, description="Special contractual terms or procurement instructions")


class SuperadminInvoiceVerifyRequest(BaseModel):
    payment_reference: str = Field(..., description="Bank wire transfer confirmation or transaction reference")
    notes: Optional[str] = Field(None, description="Audit notes or verification details")


class SuperadminCustomLimitsRequest(BaseModel):
    custom_limits: Dict[str, Any] = Field(..., description="Custom quota overrides or entitlement amendments")


# ==============================================================================
# 1. Tenant-Facing Billing Endpoints
# ==============================================================================

@tenant_billing_router.get("/plans")
def list_available_subscription_plans(
    db: Session = Depends(get_db),
):
    """
    Retrieves the complete catalog of active multi-grade SaaS subscription plans,
    including pricing (SAR), resource limits, and architectural capability flags.
    """
    plans = db.scalars(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_active.is_(True))
        .order_by(SubscriptionPlan.monthly_price.asc())
    ).all()

    if not plans:
        plans = seed_default_subscription_plans(db)

    return [plan.to_dict() for plan in plans]


@tenant_billing_router.get("/subscription")
def get_tenant_active_subscription(
    request: Request,
    tenant_id_query: Optional[str] = Query(None, alias="tenant_id"),
    header_tenant: Optional[str] = Header(None, alias="X-Tenant-ID"),
    header_slug: Optional[str] = Header(None, alias="X-Tenant-Slug"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    """
    Retrieves the active commercial contract for the authenticated tenant,
    including live usage meters (seats, vehicles, storage) and capability entitlements.
    """
    tenant_uuid = resolve_control_tenant_id(
        query_tenant=tenant_id_query,
        header_tenant=header_tenant,
        header_slug=header_slug,
        authorization=authorization,
        request=request,
        db=db,
    )
    if not tenant_uuid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to resolve tenant identity from request headers, token, or context.",
        )

    tenant = db.get(MasterTenant, tenant_uuid)
    sub = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_uuid))
    if not sub:
        tier_default = tenant.subscription_tier if tenant else "FREE"
        sub = get_or_create_tenant_subscription(db, tenant_id=tenant_uuid, plan_name=tier_default)

    plan = sub.plan
    if not plan and sub.plan_id:
        plan = db.get(SubscriptionPlan, sub.plan_id)

    # Entitlement gates
    allow_ext_db = plan.allow_external_database if plan else False
    allow_custom_dom = plan.allow_custom_domain if plan else False
    allow_ded_ssl = plan.allow_dedicated_ssl if plan else False

    # Check custom overrides if present
    if sub.custom_limits and isinstance(sub.custom_limits, dict):
        if "allow_external_database" in sub.custom_limits:
            allow_ext_db = bool(sub.custom_limits["allow_external_database"])
        if "allow_custom_domain" in sub.custom_limits:
            allow_custom_dom = bool(sub.custom_limits["allow_custom_domain"])
        if "allow_dedicated_ssl" in sub.custom_limits:
            allow_ded_ssl = bool(sub.custom_limits["allow_dedicated_ssl"])

    return {
        "tenant_id": str(tenant_uuid),
        "tenant_name": tenant.name if tenant else None,
        "tenant_slug": tenant.slug if tenant else None,
        "subscription_id": str(sub.id),
        "status": sub.status,
        "billing_cycle": sub.billing_cycle,
        "payment_method_type": sub.payment_method_type,
        "plan": plan.to_dict() if plan else None,
        "meters": {
            "current_seats_used": sub.current_seats_used,
            "max_seats": sub.max_seats,
            "current_vehicles_used": sub.current_vehicles_used,
            "max_vehicles": plan.max_vehicles if plan else 5,
            "current_storage_mb_used": sub.current_storage_mb_used,
            "max_storage_gb": plan.max_storage_gb if plan else 5,
        },
        "entitlements": {
            "allow_external_database": allow_ext_db,
            "allow_custom_domain": allow_custom_dom,
            "allow_dedicated_ssl": allow_ded_ssl,
        },
        "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "cancel_at_period_end": sub.cancel_at_period_end,
    }


@tenant_billing_router.post("/checkout")
def create_card_checkout_session(
    payload: StripeCheckoutRequest,
    request: Request,
    tenant_id_query: Optional[str] = Query(None, alias="tenant_id"),
    header_tenant: Optional[str] = Header(None, alias="X-Tenant-ID"),
    header_slug: Optional[str] = Header(None, alias="X-Tenant-Slug"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    """
    Creates a Stripe Checkout Session for self-service card billing.
    Returns session URL for instant browser redirect.
    """
    tenant_uuid = resolve_control_tenant_id(
        query_tenant=tenant_id_query,
        header_tenant=header_tenant,
        header_slug=header_slug,
        authorization=authorization,
        request=request,
        db=db,
    )
    if not tenant_uuid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to resolve tenant identity.")

    try:
        session_info = create_stripe_checkout_session(
            db=db,
            tenant_id=tenant_uuid,
            plan_name=payload.plan_name,
            billing_cycle=payload.billing_cycle,
            success_url=payload.success_url or "",
            cancel_url=payload.cancel_url or "",
        )
        return session_info
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as exc:
        logger.error("Failed to generate Stripe checkout session: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Checkout session generation failed.")


@tenant_billing_router.post("/enterprise-quote")
def create_enterprise_purchase_order_quote(
    payload: EnterprisePORequest,
    request: Request,
    tenant_id_query: Optional[str] = Query(None, alias="tenant_id"),
    header_tenant: Optional[str] = Header(None, alias="X-Tenant-ID"),
    header_slug: Optional[str] = Header(None, alias="X-Tenant-Slug"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    """
    Issues a formal Enterprise Purchase Order / Bank Wire invoice in pending status.
    Generates official corporate wire instructions (IBAN, SWIFT, Beneficiary, Reference).
    """
    tenant_uuid = resolve_control_tenant_id(
        query_tenant=tenant_id_query,
        header_tenant=header_tenant,
        header_slug=header_slug,
        authorization=authorization,
        request=request,
        db=db,
    )
    if not tenant_uuid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to resolve tenant identity.")

    quote_data = create_enterprise_po_quote(
        db=db,
        tenant_id=tenant_uuid,
        plan_name=payload.plan_name,
        billing_cycle=payload.billing_cycle,
        po_number=payload.po_number,
        notes=payload.notes,
        company_details={
            "company_tax_id": payload.company_tax_id,
            "billing_address": payload.billing_address,
            "contact_email": payload.contact_email,
        },
    )
    return quote_data


@tenant_billing_router.get("/invoices")
def list_tenant_invoices(
    request: Request,
    tenant_id_query: Optional[str] = Query(None, alias="tenant_id"),
    header_tenant: Optional[str] = Header(None, alias="X-Tenant-ID"),
    header_slug: Optional[str] = Header(None, alias="X-Tenant-Slug"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    """
    Retrieves the chronological invoice history for the authenticated tenant,
    including VAT breakdowns, payment methods, and receipt download links.
    """
    tenant_uuid = resolve_control_tenant_id(
        query_tenant=tenant_id_query,
        header_tenant=header_tenant,
        header_slug=header_slug,
        authorization=authorization,
        request=request,
        db=db,
    )
    if not tenant_uuid:
        return []

    invoices = db.scalars(
        select(SaaSInvoice)
        .where(SaaSInvoice.tenant_id == tenant_uuid)
        .order_by(desc(SaaSInvoice.issued_date))
    ).all()

    return [inv.to_dict() for inv in invoices]


@tenant_billing_router.get("/invoices/{invoice_id}")
def get_single_invoice_detail(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """
    Retrieves a specific SaaS invoice with full line item and ZATCA tax metadata.
    """
    inv = db.get(SaaSInvoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return inv.to_dict()


# ==============================================================================
# 2. SuperAdmin Billing & Verification Endpoints
# ==============================================================================

@superadmin_billing_router.get("/invoices")
def list_superadmin_invoices(
    status_filter: Optional[str] = Query(None, alias="status"),
    payment_method: Optional[str] = Query(None, alias="payment_method"),
    tenant_id: Optional[uuid.UUID] = Query(None, alias="tenant_id"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    SuperAdmin directory of all platform SaaS invoices across all tenants,
    filterable by payment status and corporate payment rail.
    """
    query = select(SaaSInvoice).order_by(desc(SaaSInvoice.issued_date))
    if status_filter:
        query = query.where(SaaSInvoice.status == status_filter)
    if payment_method:
        query = query.where(SaaSInvoice.payment_method == payment_method)
    if tenant_id:
        query = query.where(SaaSInvoice.tenant_id == tenant_id)

    invoices = db.scalars(query.offset(offset).limit(limit)).all()
    results = []
    for inv in invoices:
        tenant = inv.tenant
        plan = inv.plan
        data = inv.to_dict()
        data["tenant_name"] = tenant.name if tenant else None
        data["tenant_slug"] = tenant.slug if tenant else None
        data["plan_display_name"] = plan.display_name if plan else None
        results.append(data)

    return results


@superadmin_billing_router.put("/invoices/{invoice_id}/verify")
def verify_and_settle_invoice_endpoint(
    invoice_id: uuid.UUID,
    payload: SuperadminInvoiceVerifyRequest,
    db: Session = Depends(get_db),
):
    """
    SuperAdmin one-click verification of corporate bank receipts and PO wire transfers:
    Marks invoice paid, activates the tenant's subscription to the invoice's plan,
    extends the billing cycle, and unlocks architectural capabilities (External DB & Custom Domain).
    """
    try:
        settlement_result = verify_and_settle_invoice(
            db=db,
            invoice_id=invoice_id,
            payment_reference=payload.payment_reference,
            notes=payload.notes,
        )
        return settlement_result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as exc:
        logger.error("Error settling invoice %s: %s", invoice_id, exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invoice settlement failed.")


@superadmin_billing_router.put("/tenants/{tenant_id}/custom-limits")
def update_tenant_limits_endpoint(
    tenant_id: uuid.UUID,
    payload: SuperadminCustomLimitsRequest,
    db: Session = Depends(get_db),
):
    """
    Allows SuperAdmin to set custom contractual limits or feature overrides for a tenant.
    """
    tenant = db.get(MasterTenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")

    sub = update_tenant_custom_limits(db=db, tenant_id=tenant_id, custom_limits=payload.custom_limits)
    return {
        "tenant_id": str(tenant_id),
        "custom_limits": sub.custom_limits,
        "message": "Custom limits updated successfully.",
    }


@superadmin_billing_router.get("/summary")
def get_superadmin_billing_summary(
    db: Session = Depends(get_db),
):
    """
    SuperAdmin SaaS financial telemetry: MRR, ARR, active subscriber distribution,
    and pending offline invoices awaiting wire verification.
    """
    # 1. Total counts by tier
    active_subs = db.scalars(
        select(TenantSubscription).where(TenantSubscription.status == "active")
    ).all()

    tier_counts: dict[str, int] = {"FREE": 0, "PROFESSIONAL": 0, "ENTERPRISE": 0}
    mrr_sar = Decimal("0.00")

    for s in active_subs:
        plan_name = s.plan.name if s.plan else "FREE"
        tier_counts[plan_name] = tier_counts.get(plan_name, 0) + 1
        if s.plan:
            if s.billing_cycle in ("annual", "yearly"):
                mrr_sar += (s.plan.annual_price / Decimal("12")).quantize(Decimal("0.01"))
            else:
                mrr_sar += s.plan.monthly_price

    # 2. Pending invoices count and sum
    pending_invoices = db.scalars(
        select(SaaSInvoice).where(SaaSInvoice.status == "pending")
    ).all()
    pending_total_sar = sum((inv.amount_sar for inv in pending_invoices), Decimal("0.00"))

    # 3. Settled total revenue
    settled_invoices = db.scalars(
        select(SaaSInvoice).where(SaaSInvoice.status == "paid")
    ).all()
    settled_total_sar = sum((inv.amount_sar for inv in settled_invoices), Decimal("0.00"))

    return {
        "active_subscribers_count": len(active_subs),
        "tier_distribution": tier_counts,
        "estimated_mrr_sar": float(mrr_sar),
        "estimated_arr_sar": float(mrr_sar * Decimal("12")),
        "pending_invoices_count": len(pending_invoices),
        "pending_amount_sar": float(pending_total_sar),
        "total_collected_sar": float(settled_total_sar),
    }


# ==============================================================================
# 3. Stripe Webhook Listener
# ==============================================================================

@stripe_webhook_router.post("/stripe", status_code=status.HTTP_200_OK)
async def handle_stripe_webhook_event(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="Stripe-Signature"),
    db: Session = Depends(get_db),
):
    """
    Ingest and process recurring billing and subscription lifecycle events from Stripe.
    Handles 'checkout.session.completed', 'invoice.payment_succeeded',
    'invoice.payment_failed', and 'customer.subscription.deleted'.
    """
    raw_body = await request.body()
    if not verify_stripe_webhook_signature(raw_body, stripe_signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe webhook signature.")

    try:
        event = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload.")

    event_type = event.get("type")
    event_data = event.get("data", {}).get("object", {})
    logger.info("Received Stripe webhook event: %s", event_type)

    if event_type == "checkout.session.completed":
        try:
            invoice = handle_stripe_checkout_completed(db, event_data)
            return {"status": "success", "event": event_type, "invoice_id": str(invoice.id)}
        except Exception as exc:
            logger.error("Error handling checkout.session.completed: %s", exc)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    elif event_type == "invoice.payment_succeeded":
        try:
            invoice = handle_stripe_invoice_paid(db, event_data)
            return {"status": "success", "event": event_type, "invoice_id": str(invoice.id)}
        except Exception as exc:
            logger.error("Error handling invoice.payment_succeeded: %s", exc)
            # Return 200 so Stripe doesn't incessantly retry non-fatal errors
            return {"status": "warning", "event": event_type, "detail": str(exc)}

    elif event_type == "invoice.payment_failed":
        sub = handle_stripe_invoice_failed(db, event_data)
        return {"status": "success", "event": event_type, "subscription_status": sub.status if sub else "unknown"}

    elif event_type == "customer.subscription.deleted":
        sub = handle_stripe_subscription_deleted(db, event_data)
        return {"status": "success", "event": event_type, "subscription_status": sub.status if sub else "unknown"}

    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        sub = handle_stripe_subscription_updated(db, event_data)
        return {"status": "success", "event": event_type, "subscription_status": sub.status if sub else "unknown"}

    return {"status": "ignored", "event": event_type}
