"""
OxenGL Super Admin Billing Approvals API.
File: backend/app/api/v1/admin_billing.py

Provides Super Admin management of manual/offline tenant subscription payments:
1. GET  /api/v1/admin/billing/pending-invoices: Queue of offline invoices awaiting review.
2. POST /api/v1/admin/billing/invoices/{invoice_id}/approve: Verifies payment proof, activates tenant subscription, extends period, and logs audit.
3. POST /api/v1/admin/billing/invoices/{invoice_id}/reject: Marks invalid/fraudulent proofs as rejected with an audit note.

SECURITY: Every route enforces Super_Admin authorization and control-plane DB access.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from backend.app.core.auth import has_record_super_admin_authority, require_super_admin
from backend.app.domains.saas.models import SubscriptionPlan, TenantSubscription
from backend.app.services.billing_service import activate_tenant_subscription
from backend.app.services.email_service import send_subscription_approved_email
from backend.app.services.pdf_service import generate_invoice_pdf
from backend.database import get_platform_db
from backend.models import MasterTenant, SaaSInvoice

logger = logging.getLogger("oxengl.billing.admin_approvals")

router = APIRouter(
    prefix="/api/v1/admin/billing",
    tags=["Admin Billing Approvals"],
    dependencies=[Depends(require_super_admin)],
)


# ==============================================================================
# Async Background Dispatcher
# ==============================================================================

async def _dispatch_receipt_email(
    tenant: Any,
    invoice: Any,
    current_period_end: Optional[str] = None,
) -> None:
    """
    Background worker that compiles the PDF receipt using WeasyPrint and Jinja2,
    then dispatches the subscription approval notification email with the PDF attached.
    """
    try:
        tenant_email = getattr(tenant, "owner_email", None) or (tenant.get("owner_email") if isinstance(tenant, dict) else None)
        tenant_name = getattr(tenant, "name", None) or (tenant.get("name") if isinstance(tenant, dict) else "Valued Tenant")
        if not tenant_email:
            logger.warning("Cannot dispatch receipt email: missing tenant owner_email (tenant=%s)", tenant)
            return

        # 1. Compile PDF Receipt bytes via WeasyPrint
        pdf_bytes = generate_invoice_pdf(invoice=invoice, tenant=tenant)

        # 2. Dispatch welcome notification with attached PDF
        await send_subscription_approved_email(
            tenant_email=tenant_email,
            tenant_name=tenant_name,
            invoice=invoice,
            pdf_attachment_bytes=pdf_bytes,
            current_period_end=current_period_end,
        )
        logger.info(
            "Successfully generated PDF and dispatched subscription welcome email to %s (Invoice: %s)",
            tenant_email,
            getattr(invoice, "invoice_number", "UNKNOWN"),
        )
    except Exception as exc:
        logger.error(
            "Failed background execution of _dispatch_receipt_email for invoice %s: %s",
            getattr(invoice, "invoice_number", "UNKNOWN"),
            exc,
            exc_info=True,
        )


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class PendingInvoiceResponse(BaseModel):
    id: str
    invoice_number: str
    tenant_id: str
    tenant_name: str
    tenant_slug: str
    tenant_email: str
    plan_id: Optional[str] = None
    plan_name: str
    plan_display_name: str
    amount: float
    subtotal: float
    tax: float
    currency: str
    billing_cycle: str
    status: str
    payment_method: str
    payment_reference: Optional[str] = None
    payment_proof_url: Optional[str] = None
    issued_date: Optional[str] = None
    notes: Optional[str] = None


class InvoiceApproveRequest(BaseModel):
    payment_reference: Optional[str] = Field(None, description="Optional bank wire or wallet transaction reference")
    notes: Optional[str] = Field(None, description="Optional audit notes or settlement details")


class InvoiceRejectRequest(BaseModel):
    reason: Optional[str] = Field(None, description="Reason for rejecting the receipt or payment proof")


class InvoiceActionResponse(BaseModel):
    status: str
    message: str
    invoice: dict[str, Any]
    tenant_status: Optional[str] = None


# ==============================================================================
# Audit Helper
# ==============================================================================

def _audit(db: Session, request: Request, user: Any, action: str, company_id: Any = None, outcome: str = "SUCCESS") -> None:
    try:
        from backend.app.main import get_request_id, record_platform_audit, resolve_client_ip
        record_platform_audit(
            db,
            actor_email=getattr(user, "email", "superadmin"),
            action=action,
            endpoint=request.url.path,
            ip_address=resolve_client_ip(request),
            company_id=company_id or getattr(user, "company_id", None),
            actor_id=getattr(user, "id", None),
            outcome=outcome,
            request_id=get_request_id(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception as exc:  # noqa: BLE001 - auditing must never abort the core operation
        logger.warning("Could not write billing approval audit record: %s", exc)


# ==============================================================================
# Endpoints
# ==============================================================================

@router.get("/pending-invoices", response_model=List[PendingInvoiceResponse])
def get_pending_invoices(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_platform_db),
):
    """
    Super Admin queue of tenant subscription invoices pending manual review.
    Filters invoices where payment_method is offline/bank/wallet and status is pending or pending_verification.
    """
    # Accept both 'offline' variants and pending verification statuses
    query = (
        select(SaaSInvoice)
        .where(
            SaaSInvoice.status.in_(["pending_verification", "pending"]),
            SaaSInvoice.payment_method.in_(["offline", "offline_bank_transfer", "bank_transfer", "manual"]),
        )
        .order_by(desc(SaaSInvoice.issued_date))
        .offset(offset)
        .limit(limit)
    )

    invoices = db.scalars(query).all()
    results: List[PendingInvoiceResponse] = []

    for inv in invoices:
        tenant = inv.tenant or db.get(MasterTenant, inv.tenant_id)
        plan = inv.plan or (db.get(SubscriptionPlan, inv.plan_id) if inv.plan_id else None)

        proof_url = getattr(inv, "payment_proof_url", None) or inv.pdf_url

        results.append(
            PendingInvoiceResponse(
                id=str(inv.id),
                invoice_number=inv.invoice_number,
                tenant_id=str(inv.tenant_id),
                tenant_name=tenant.name if tenant else "Unknown Tenant",
                tenant_slug=tenant.slug if tenant else "",
                tenant_email=tenant.owner_email if tenant else "",
                plan_id=str(inv.plan_id) if inv.plan_id else None,
                plan_name=plan.name if plan else inv.tier,
                plan_display_name=plan.display_name if plan else (inv.tier.capitalize() if inv.tier else "Standard Plan"),
                amount=float(inv.amount_sar) if inv.amount_sar is not None else 0.0,
                subtotal=float(inv.subtotal_sar) if inv.subtotal_sar is not None else 0.0,
                tax=float(inv.tax_sar) if inv.tax_sar is not None else 0.0,
                currency=inv.currency or "SAR",
                billing_cycle=inv.billing_cycle,
                status=inv.status,
                payment_method=inv.payment_method,
                payment_reference=inv.payment_reference,
                payment_proof_url=proof_url,
                issued_date=inv.issued_date.isoformat() if inv.issued_date else None,
                notes=inv.notes,
            )
        )

    return results


@router.post("/invoices/{invoice_id}/approve", response_model=InvoiceActionResponse)
def approve_pending_invoice(
    invoice_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    payload: Optional[InvoiceApproveRequest] = None,
    current_user: Any = Depends(require_super_admin),
    db: Session = Depends(get_platform_db),
):
    """
    Super Admin one-click approval of an offline payment receipt:
    1. Verifies that the invoice is in pending status.
    2. Marks the invoice status as 'paid' with payment timestamp.
    3. Updates the associated MasterTenant record status to 'ACTIVE' and activates capabilities.
    4. Extends the subscription current_period_end based on monthly or annual billing cycle.
    5. Writes an immutable audit trail entry.
    6. Enqueues background task for WeasyPrint PDF receipt generation and welcome email dispatch.
    """
    invoice = db.get(SaaSInvoice, invoice_id)
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SaaS Invoice '{invoice_id}' not found.",
        )

    if invoice.status not in ("pending", "pending_verification"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invoice {invoice.invoice_number} cannot be approved because it is already '{invoice.status}'.",
        )

    now = datetime.now(timezone.utc)
    invoice.status = "paid"
    invoice.paid_at = now

    ref = payload.payment_reference if payload and payload.payment_reference else None
    if ref:
        invoice.payment_reference = ref

    notes = payload.notes if payload and payload.notes else None
    if notes:
        invoice.notes = f"{invoice.notes or ''}\n[SuperAdmin Approval]: {notes}".strip()

    # Determine subscription plan
    plan = invoice.plan or (db.get(SubscriptionPlan, invoice.plan_id) if invoice.plan_id else None)
    plan_name = plan.name if plan else (invoice.tier or "PROFESSIONAL").upper()

    # Activate tenant subscription contract (extends current_period_end & enables capabilities)
    sub = activate_tenant_subscription(
        db=db,
        tenant_id=invoice.tenant_id,
        plan_name=plan_name,
        billing_cycle=invoice.billing_cycle,
        payment_method=invoice.payment_method or "offline",
        extend_period=True,
    )

    # Ensure MasterTenant status is set to active
    tenant = db.get(MasterTenant, invoice.tenant_id)
    if tenant:
        tenant.status = "active"
        tenant.is_active = True
        tenant.subscription_tier = plan_name.lower()

    db.commit()
    db.refresh(invoice)
    if tenant:
        db.refresh(tenant)

    # Write platform audit log
    _audit(
        db=db,
        request=request,
        user=current_user,
        action="INVOICE_SUBSCRIPTION_APPROVED",
        company_id=invoice.tenant_id,
        outcome="SUCCESS",
    )

    # Format subscription end date for notification
    current_period_end = None
    if sub and getattr(sub, "current_period_end", None):
        c_end = sub.current_period_end
        current_period_end = c_end.strftime("%Y-%m-%d") if hasattr(c_end, "strftime") else str(c_end)[:10]

    # Ensure instances are refreshed and expunged so background workers can access attributes detached
    try:
        db.refresh(invoice)
        db.expunge(invoice)
        if tenant:
            db.refresh(tenant)
            db.expunge(tenant)
    except Exception:
        pass

    # Enqueue background task for PDF receipt rendering and email dispatch
    background_tasks.add_task(
        _dispatch_receipt_email,
        tenant,
        invoice,
        current_period_end,
    )

    logger.info(
        "SuperAdmin %s approved invoice %s for tenant %s under plan %s",
        getattr(current_user, "email", "superadmin"),
        invoice.invoice_number,
        invoice.tenant_id,
        plan_name,
    )

    return InvoiceActionResponse(
        status="paid",
        message=f"Invoice {invoice.invoice_number} successfully approved. Tenant subscription is now active.",
        invoice=invoice.to_dict(),
        tenant_status="ACTIVE",
    )


@router.post("/invoices/{invoice_id}/reject", response_model=InvoiceActionResponse)
def reject_pending_invoice(
    invoice_id: uuid.UUID,
    request: Request,
    payload: Optional[InvoiceRejectRequest] = None,
    current_user: Any = Depends(require_super_admin),
    db: Session = Depends(get_platform_db),
):
    """
    Super Admin rejection of an invalid or unverified offline receipt:
    1. Verifies that the invoice is in pending status.
    2. Marks the invoice status as 'rejected'.
    3. Records rejection reason in audit notes.
    4. Writes an immutable audit trail entry.
    """
    invoice = db.get(SaaSInvoice, invoice_id)
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SaaS Invoice '{invoice_id}' not found.",
        )

    if invoice.status not in ("pending", "pending_verification"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invoice {invoice.invoice_number} cannot be rejected because it is already '{invoice.status}'.",
        )

    reason = payload.reason if payload and payload.reason else "Payment receipt was unverified or invalid."
    invoice.status = "rejected"
    invoice.notes = f"{invoice.notes or ''}\n[SuperAdmin Rejection]: {reason}".strip()

    db.commit()
    db.refresh(invoice)

    # Write platform audit log
    _audit(
        db=db,
        request=request,
        user=current_user,
        action="INVOICE_SUBSCRIPTION_REJECTED",
        company_id=invoice.tenant_id,
        outcome="REJECTED",
    )

    logger.info(
        "SuperAdmin %s rejected invoice %s for tenant %s. Reason: %s",
        getattr(current_user, "email", "superadmin"),
        invoice.invoice_number,
        invoice.tenant_id,
        reason,
    )

    return InvoiceActionResponse(
        status="rejected",
        message=f"Invoice {invoice.invoice_number} has been rejected.",
        invoice=invoice.to_dict(),
        tenant_status="PENDING",
    )
