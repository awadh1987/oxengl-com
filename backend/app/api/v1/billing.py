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
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, func, select, update
from sqlalchemy.orm import Session

from backend.database import get_db, get_platform_db
from backend.models import MasterTenant, SaaSInvoice
from backend.app.domains.saas.models import SubscriptionPlan, TenantSubscription
from backend.app.services.billing_service import (
    resolve_billing_tenant,
    get_tenant_invoice,
    list_tenant_invoices_scoped,
    activate_tenant_subscription,
    create_enterprise_po_quote,
    create_stripe_checkout_session,
    get_or_create_tenant_subscription,
    get_plan_by_name,
    list_catalog_plans,
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
from backend.app.core.auth import get_authenticated_user, is_super_admin_authorized, require_super_admin
from backend.app.domains.hr.audit import append_audit_from_context, build_audit_context
from backend.app.services.billing.payment_strategy import (
    GatewayConfigurationError,
    GatewayDisabledError,
    GatewayError,
    PaymentMethod,
    get_payment_gateway,
)

logger = logging.getLogger("oxengl.billing.api")

# Routers
# SECURITY: every tenant billing route requires an authenticated session (cookie or Bearer).
# The tenant is always derived from that user (resolve_billing_tenant / _invoice_scope_tenant_id),
# never from client-supplied tenant headers or query parameters. The public pricing catalog lives
# on pricing_router (/api/v1/pricing/plans) and stays anonymous.
tenant_billing_router = APIRouter(tags=["Tenant Billing"], dependencies=[Depends(get_authenticated_user)])
# Every Super Admin billing endpoint (invoices, settlement, limits, pricing) requires Super_Admin.
superadmin_billing_router = APIRouter(
    prefix="/api/v1/superadmin/billing",
    tags=["Super Admin Billing"],
    dependencies=[Depends(require_super_admin)],
)
# The summary has a separate authorization boundary; all other routes above remain Super Admin-only.
billing_summary_router = APIRouter(
    prefix="/api/v1/superadmin/billing",
    tags=["Billing Analytics"],
)
# Public, unauthenticated pricing catalog (landing page, tenant billing, Super Admin console).
pricing_router = APIRouter(tags=["Pricing Catalog"])
stripe_webhook_router = APIRouter(tags=["Platform Billing Webhooks"])


def get_billing_summary_db(
    request: Request,
    current_user: Any = Depends(get_authenticated_user),
    tenant_db: Session = Depends(get_db),
):
    if is_super_admin_authorized(current_user, request):
        request.state.platform_db_authorized = True
        yield from get_platform_db(request)
    else:
        yield tenant_db


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class StripeCheckoutRequest(BaseModel):
    plan_name: str = Field(..., description="Target plan code, e.g. 'PROFESSIONAL' or 'ENTERPRISE'")
    billing_cycle: str = Field("monthly", description="'monthly' or 'annual'")
    success_url: Optional[str] = Field(None, description="Redirect URL after card checkout completion")
    cancel_url: Optional[str] = Field(None, description="Redirect URL if checkout is canceled")


class TenantSubscribeRequest(BaseModel):
    plan_id: Optional[str] = Field(None, description="Target plan code name (e.g. 'PROFESSIONAL') or UUID")
    plan_name: Optional[str] = Field(None, description="Target plan code name (e.g. 'PROFESSIONAL' or 'ENTERPRISE')")
    company_id: Optional[str] = Field(None, description="Optional tenant purchasing company UUID")
    payment_method: PaymentMethod = Field(PaymentMethod.OFFLINE, description="'stripe', 'moyasar', or 'offline'")
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


PRICE_FIELD = dict(ge=Decimal("0"), le=Decimal("99999999.99"), max_digits=10, decimal_places=2)


class SubscriptionPlanUpdateRequest(BaseModel):
    """Super Admin edit of a catalog plan. Only provided fields are changed."""
    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=600)
    monthly_price: Optional[Decimal] = Field(None, description="Monthly list price in SAR (excl. VAT)", **PRICE_FIELD)
    annual_price: Optional[Decimal] = Field(None, description="Annual list price in SAR (excl. VAT)", **PRICE_FIELD)
    display_features: Optional[List[str]] = Field(None, max_length=20)
    is_featured: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0, le=1000)
    max_seats: Optional[int] = Field(None, ge=1, le=999999)
    max_vehicles: Optional[int] = Field(None, ge=0, le=999999)
    max_storage_gb: Optional[int] = Field(None, ge=0, le=999999)
    max_monthly_transactions: Optional[int] = Field(None, ge=0, le=999999)

    @field_validator("display_name", "description")
    @classmethod
    def _strip_text(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if isinstance(value, str) else value

    @field_validator("display_features")
    @classmethod
    def _clean_features(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return value
        cleaned = [item.strip() for item in value if isinstance(item, str) and item.strip()]
        if any(len(item) > 160 for item in cleaned):
            raise ValueError("Each feature must be at most 160 characters.")
        return cleaned


def _public_plan_dict(plan: SubscriptionPlan) -> dict[str, Any]:
    """Catalog representation safe for unauthenticated callers (no payment-provider IDs)."""
    data = plan.to_dict()
    data.pop("stripe_price_id", None)
    data.pop("stripe_product_id", None)
    return data


def _plan_subscriber_counts(db: Session) -> dict[Any, int]:
    rows = db.execute(
        select(TenantSubscription.plan_id, func.count(TenantSubscription.id)).group_by(TenantSubscription.plan_id)
    ).all()
    return {plan_id: int(count) for plan_id, count in rows}


# ==============================================================================
# 1. Tenant-Facing Billing Endpoints
# ==============================================================================

@pricing_router.get("/plans")
@tenant_billing_router.get("/plans")
def list_available_subscription_plans(
    db: Session = Depends(get_db),
):
    """
    Unified pricing catalog: every active subscription plan from the subscription_plans table
    (the single source of truth), in catalog order, with SAR prices, limits, capability flags
    and marketing features. Served publicly at /api/v1/pricing/plans and, for backwards
    compatibility, at /api/v1/tenant/billing/plans.
    """
    return [_public_plan_dict(plan) for plan in list_catalog_plans(db)]


@tenant_billing_router.get("/subscription")
def get_tenant_active_subscription(
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves the active commercial contract for the authenticated tenant,
    including live usage meters (seats, vehicles, storage) and capability entitlements.
    """
    tenant_uuid = resolve_billing_tenant(db, current_user).id

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
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    """
    Creates a Stripe Checkout Session for self-service card billing.
    Returns session URL for instant browser redirect.
    """
    tenant_uuid = resolve_billing_tenant(db, current_user).id

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


@tenant_billing_router.post("/subscribe", status_code=status.HTTP_200_OK)
def subscribe_to_subscription_plan(
    payload: TenantSubscribeRequest,
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    """
    Subscribes the authenticated tenant to a SaaS subscription plan using the configured Gateway Strategy:
    - 'stripe': Dynamically generates Stripe Checkout session with decrypted platform API keys.
    - 'moyasar': Dynamically generates Moyasar payment session for Mada, Apple Pay, and STC Pay.
    - 'offline': Issues a pending invoice and returns receiving bank accounts & digital wallet instructions.
    """
    tenant = resolve_billing_tenant(db, current_user)

    target_identifier = payload.plan_name or payload.plan_id
    if not target_identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either plan_id or plan_name to subscribe.",
        )

    plan: Optional[SubscriptionPlan] = None
    try:
        plan_uuid = uuid.UUID(str(target_identifier))
        plan = db.get(SubscriptionPlan, plan_uuid)
    except (ValueError, AttributeError):
        pass

    if not plan:
        plan = get_plan_by_name(db, str(target_identifier))

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subscription plan '{target_identifier}' not found in catalog.",
        )

    try:
        gateway = get_payment_gateway(payload.payment_method, db)
        session_info = gateway.create_subscription(
            tenant=tenant,
            plan=plan,
            billing_cycle=payload.billing_cycle,
            success_url=payload.success_url or "",
            cancel_url=payload.cancel_url or "",
        )
        return session_info
    except GatewayDisabledError as gde:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(gde))
    except GatewayConfigurationError as gce:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(gce))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as exc:
        logger.error("Subscription gateway error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Subscription gateway processing failed: {exc}",
        )



@tenant_billing_router.post("/enterprise-quote")
def create_enterprise_purchase_order_quote(
    payload: EnterprisePORequest,
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    """
    Issues a formal Enterprise Purchase Order / Bank Wire invoice in pending status.
    Generates official corporate wire instructions (IBAN, SWIFT, Beneficiary, Reference).
    """
    tenant_uuid = resolve_billing_tenant(db, current_user).id

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


def _invoice_scope_tenant_id(request: Request, current_user: Any, requested_tenant: Optional[str]) -> uuid.UUID:
    """Tenant whose invoices the caller may read.

    SECURITY: derived from the authenticated user's own ``company_id`` and never from
    client-controlled headers/query params. Only a platform Super Admin may target another
    tenant explicitly via ``?tenant_id=<uuid>``.
    """
    if requested_tenant and is_super_admin_authorized(current_user, request):
        try:
            return uuid.UUID(str(requested_tenant))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tenant_id must be a valid UUID.")
    company_id = getattr(current_user, "company_id", None)
    if not company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tenant workspace is associated with this account.")
    return uuid.UUID(str(company_id))


@tenant_billing_router.get("/invoices")
def list_tenant_invoices(
    request: Request,
    tenant_id_query: Optional[str] = Query(None, alias="tenant_id"),
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves the chronological invoice history for the authenticated tenant,
    including VAT breakdowns, payment methods, and receipt download links.
    """
    tenant_uuid = _invoice_scope_tenant_id(request, current_user, tenant_id_query)
    return [inv.to_dict() for inv in list_tenant_invoices_scoped(db, tenant_id=tenant_uuid)]


@tenant_billing_router.get("/invoices/{invoice_id}")
def get_single_invoice_detail(
    invoice_id: uuid.UUID,
    request: Request,
    tenant_id_query: Optional[str] = Query(None, alias="tenant_id"),
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves a specific SaaS invoice with full line item and ZATCA tax metadata.
    Strictly scoped to the requesting user's tenant: another tenant's invoice returns 404.
    """
    tenant_uuid = _invoice_scope_tenant_id(request, current_user, tenant_id_query)
    inv = get_tenant_invoice(db, tenant_id=tenant_uuid, invoice_id=invoice_id)
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
    db: Session = Depends(get_platform_db),
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
    db: Session = Depends(get_platform_db),
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
    db: Session = Depends(get_platform_db),
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


@superadmin_billing_router.get("/plans")
def list_superadmin_subscription_plans(db: Session = Depends(get_platform_db)):
    """Super Admin pricing console: all plans (including inactive) with live subscriber counts."""
    counts = _plan_subscriber_counts(db)
    return [
        {**plan.to_dict(), "subscriber_count": counts.get(plan.id, 0)}
        for plan in list_catalog_plans(db, include_inactive=True)
    ]


@superadmin_billing_router.put("/plans/{plan_id}")
def update_superadmin_subscription_plan(
    plan_id: uuid.UUID,
    payload: SubscriptionPlanUpdateRequest,
    request: Request,
    db: Session = Depends(get_platform_db),
    current_user: Any = Depends(require_super_admin),
):
    """
    Super Admin: edit a plan's name, description, SAR prices, features, limits or visibility.
    Changes apply immediately to the public landing page, tenant billing and new invoices.
    """
    plan = db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription plan not found.")

    changes = payload.model_dump(exclude_unset=True)
    changes = {key: value for key, value in changes.items() if value is not None}
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes supplied.")
    if "display_features" in changes and not changes["display_features"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A plan needs at least one feature.")

    for field, value in changes.items():
        setattr(plan, field, value)
    if changes.get("is_featured"):
        # A single "Most Popular" plan keeps the catalog unambiguous.
        db.execute(update(SubscriptionPlan).where(SubscriptionPlan.id != plan.id).values(is_featured=False))
    db.commit()
    db.refresh(plan)

    # Synchronize platform landing sections (pricing_matrix / pricing) and invalidate cache
    try:
        from backend.app.api.v1.platform_governance import sync_pricing_sections_with_catalog
        sync_pricing_sections_with_catalog(db)
    except Exception as exc:
        logger.warning("Could not sync landing pricing section with catalog: %s", exc)

    actor = getattr(current_user, "email", "unknown")
    logger.info("Pricing plan %s updated by %s: %s", plan.name, actor, sorted(changes))
    try:
        from backend.app.main import get_request_id, record_platform_audit, resolve_client_ip
        record_platform_audit(
            db,
            actor_email=actor,
            action="PRICING_PLAN_UPDATED",
            endpoint=request.url.path,
            ip_address=resolve_client_ip(request),
            company_id=getattr(current_user, "company_id", None),
            request_id=get_request_id(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception as exc:  # noqa: BLE001 - auditing must never block the edit
        logger.warning("Could not write pricing audit record: %s", exc)

    return {**plan.to_dict(), "subscriber_count": _plan_subscriber_counts(db).get(plan.id, 0)}


def _is_platform_super_admin_for_summary(user: Any, request: Request) -> bool:
    role = str(getattr(user, "role", "") or "").strip().upper().replace(" ", "_").replace("-", "_")
    iam_role = str(getattr(user, "iam_role", "") or "").strip().upper().replace(" ", "_").replace("-", "_")
    acl = str(getattr(user, "access_control_list", "") or "").upper()
    role_ids = str(getattr(user, "role_ids", "") or "").upper()
    explicit_platform_grant = (
        bool(getattr(user, "is_superuser", False))
        or role in {"SUPER_ADMIN", "SUPERADMIN", "ROOT", "MASTER"}
        or "SUPER_ADMIN" in acl
        or "SUPER_ADMIN" in role_ids
        or (iam_role in {"SUPER_ADMIN", "SUPERADMIN"} and not getattr(user, "company_id", None))
    )
    # Avoid the development-mode fallback in is_super_admin_authorized from elevating a tenant-less CEO/Admin.
    if not explicit_platform_grant:
        return False
    if iam_role in {"SUPER_ADMIN", "SUPERADMIN"} and not getattr(user, "company_id", None):
        return True
    return is_super_admin_authorized(user, request)


def _audit_billing_summary_access(
    db: Session, request: Request, user: Any, tenant_id: Optional[uuid.UUID], outcome: str
) -> None:
    user_id = getattr(user, "id", None)
    context = build_audit_context(
        request,
        actor_id=user_id if isinstance(user_id, uuid.UUID) else None,
        actor_identifier=getattr(user, "email", None) or (f"user:{user_id}" if user_id else "unknown"),
    )
    append_audit_from_context(
        db,
        context,
        action="BILLING_SUMMARY_ACCESS",
        outcome=outcome,
        tenant_id=tenant_id,
    )
    db.commit()


@billing_summary_router.get("/summary")
def get_superadmin_billing_summary(
    request: Request,
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_billing_summary_db),
):
    """Return platform billing totals to Super Admins and own-workspace totals to tenant Owners/CEOs."""
    raw_company_id = getattr(current_user, "company_id", None)
    company_id = uuid.UUID(str(raw_company_id)) if raw_company_id else None
    role = str(getattr(current_user, "role", "") or "").strip().upper().replace(" ", "_").replace("-", "_")
    iam_role = str(getattr(current_user, "iam_role", "") or "").strip().upper().replace(" ", "_").replace("-", "_")
    is_platform_admin = _is_platform_super_admin_for_summary(current_user, request)
    is_tenant_owner = role in {"OWNER", "CEO"} or iam_role in {"OWNER", "CEO"}

    if is_platform_admin:
        tenant_scope = None
    elif is_tenant_owner and company_id is not None:
        tenant_scope = company_id
    else:
        _audit_billing_summary_access(db, request, current_user, company_id, "DENIED")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner, CEO, or platform Super Admin role required.",
        )

    _audit_billing_summary_access(db, request, current_user, tenant_scope, "SUCCESS")

    subscription_query = select(TenantSubscription).where(TenantSubscription.status == "active")
    pending_query = select(SaaSInvoice).where(SaaSInvoice.status == "pending")
    settled_query = select(SaaSInvoice).where(SaaSInvoice.status == "paid")
    if tenant_scope is not None:
        subscription_query = subscription_query.where(TenantSubscription.tenant_id == tenant_scope)
        pending_query = pending_query.where(SaaSInvoice.tenant_id == tenant_scope)
        settled_query = settled_query.where(SaaSInvoice.tenant_id == tenant_scope)

    active_subs = db.scalars(subscription_query).all()
    tier_counts: dict[str, int] = {"FREE": 0, "PROFESSIONAL": 0, "ENTERPRISE": 0}
    mrr_sar = Decimal("0.00")

    for subscription in active_subs:
        plan_name = subscription.plan.name if subscription.plan else "FREE"
        tier_counts[plan_name] = tier_counts.get(plan_name, 0) + 1
        if subscription.plan:
            if subscription.billing_cycle in ("annual", "yearly"):
                mrr_sar += (subscription.plan.annual_price / Decimal("12")).quantize(Decimal("0.01"))
            else:
                mrr_sar += subscription.plan.monthly_price

    pending_invoices = db.scalars(pending_query).all()
    pending_total_sar = sum((invoice.amount_sar for invoice in pending_invoices), Decimal("0.00"))
    settled_invoices = db.scalars(settled_query).all()
    settled_total_sar = sum((invoice.amount_sar for invoice in settled_invoices), Decimal("0.00"))

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
