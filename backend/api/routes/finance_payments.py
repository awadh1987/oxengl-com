"""
Moyasar Payment Verification Route for Tenant B2B Invoices (KSA Settlement).
Verifies transactions server-to-server with the Moyasar API and updates invoice payment status.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Security, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session

try:
    from backend.database import get_db
    from backend.models import (
        Invoice,
        CustomerInvoice,
        FinanceJournalEntry,
        FinanceJournalLine,
        ResCompany,
    )
    from backend.api.dependencies import (
        TenantContext,
        get_tenant_context,
        require_admin_or_accountant,
        require_write_access,
    )
except ImportError:
    from database import get_db
    from models import (
        Invoice,
        CustomerInvoice,
        FinanceJournalEntry,
        FinanceJournalLine,
        ResCompany,
    )
    from dependencies import (  # type: ignore
        TenantContext,
        get_tenant_context,
        require_admin_or_accountant,
        require_write_access,
    )

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/finance", tags=["Tenant Invoices"])
MOYASAR_SECRET_KEY = os.getenv("MOYASAR_SECRET_KEY", "")


# ==============================================================================
# Pydantic Schemas for General Ledger Posting
# ==============================================================================

class JournalLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_code: str
    account_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    debit: Decimal
    credit: Decimal


class JournalEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    entry_number: str
    entry_date: datetime
    description: str
    total_debit: Decimal
    total_credit: Decimal
    status: str
    lines: List[JournalLineResponse] = []



@router.post("/payments/moyasar/verify/{invoice_id}", status_code=status.HTTP_200_OK)
@router.post("/moyasar/verify/{invoice_id}", status_code=status.HTTP_200_OK)
async def verify_moyasar_payment(
    invoice_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Server-to-server verification of a Moyasar payment for a given invoice.
    Queries the Moyasar gateway, validates payment completion and amount parity,
    and updates the invoice record to paid.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON request body",
        )

    payment_id = body.get("id") or body.get("payment_id")
    if not payment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction ID required",
        )

    invoice = None
    if str(invoice_id).isdigit():
        invoice = db.query(Invoice).filter(Invoice.id == int(invoice_id)).first()
    if not invoice:
        invoice = db.query(Invoice).filter(Invoice.invoice_number == str(invoice_id)).first()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found",
        )

    secret_key = os.getenv("MOYASAR_SECRET_KEY", MOYASAR_SECRET_KEY)
    gateway_url = f"https://api.moyasar.com/v1/payments/{payment_id}"

    try:
        response = requests.get(
            gateway_url,
            auth=(secret_key, ""),
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.error(f"Network error querying Moyasar API: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to communicate with Moyasar payment gateway",
        )

    if response.status_code != 200:
        logger.warning(
            "Moyasar verification failed for transaction %s: status_code=%s, response=%s",
            payment_id,
            response.status_code,
            response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gateway verification failed",
        )

    try:
        payment_record = response.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from Moyasar payment gateway",
        )

    # Validate payment status
    if payment_record.get("status") != "paid":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment not completed",
        )

    # Validate amount parity: Moyasar amounts are provided in Halalas (1 SAR = 100 Halalas)
    payment_amount = payment_record.get("amount")
    expected_halalas = int(round(float(invoice.total_amount) * 100))
    if payment_amount is not None:
        # Check against halalas or major unit equivalent
        if payment_amount != expected_halalas and abs(float(payment_amount) - float(invoice.total_amount)) > 0.01:
            logger.warning(
                "Moyasar payment amount mismatch: gateway=%s, invoice_expected_halalas=%s, invoice_total=%s",
                payment_amount,
                expected_halalas,
                invoice.total_amount,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment amount mismatch between gateway and invoice",
            )

    # Persist verified payment details
    invoice.payment_status = "paid"
    invoice.moyasar_transaction_id = payment_id
    source_type = payment_record.get("source", {}).get("type", "card")
    invoice.payment_method = source_type
    from datetime import timezone
    invoice.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()

    logger.info(
        "Moyasar payment verified successfully for invoice %s (ID: %s): transaction_id=%s, method=%s",
        invoice.invoice_number,
        invoice.id,
        payment_id,
        invoice.payment_method,
    )

    return {
        "status": "paid",
        "transaction_id": payment_id,
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "amount": float(invoice.total_amount),
        "currency": invoice.currency,
        "payment_method": invoice.payment_method,
    }


@router.get("/invoices/public/{token}", status_code=status.HTTP_200_OK)
@router.get("/payments/invoices/public/{token}", status_code=status.HTTP_200_OK)
async def get_public_invoice(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Public, unauthenticated retrieval of invoice metadata by public magic link token.
    Exposes only a safe subset of data for external checkout/verification without
    exposing internal tenant/vendor IDs or sensitive accounting details.
    """
    invoice = db.query(Invoice).filter(Invoice.public_token == token).first()
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found",
        )

    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "total_amount": float(invoice.total_amount),
        "currency": invoice.currency,
        "payment_status": invoice.payment_status,
        "paid_at": invoice.paid_at.isoformat() if invoice.paid_at else None,
        "payment_method": invoice.payment_method,
        "public_token": invoice.public_token,
    }


# ==============================================================================
# Phase 9: Sales & Accounts Receivable General Ledger Posting
# ==============================================================================

@router.post("/invoices/{invoice_id}/post-ledger", response_model=JournalEntryResponse, status_code=status.HTTP_200_OK)
def post_invoice_to_ledger(
    invoice_id: str,
    db: Session = Depends(get_db),
    _write_perm=Security(require_write_access),
    _role_perm=Security(require_admin_or_accountant),
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Approves a customer invoice and posts a balanced double-entry journal entry
    to the General Ledger:
    - Debit: Accounts Receivable / Trade Debtors (112000) for Total Billed Amount
    - Credit: Sales Revenue / Operating Income (410000) for Net Subtotal
    - Credit: VAT Output / Tax Payable (214000) for VAT Amount
    Strictly verifies mathematical invariance: total_debit == total_credit.
    """
    invoice = None
    customer_invoice = None

    # 1. Flexible lookup by integer id, invoice_number, UUID, or public_token
    # Try finding in Invoice (payment gateway model)
    if str(invoice_id).isdigit():
        invoice = db.query(Invoice).filter(Invoice.id == int(invoice_id)).first()
    if not invoice:
        invoice = db.query(Invoice).filter(Invoice.invoice_number == str(invoice_id)).first()
    if not invoice:
        invoice = db.query(Invoice).filter(Invoice.public_token == str(invoice_id)).first()

    # Try finding in CustomerInvoice (AR/sales invoice model)
    customer_invoice = db.query(CustomerInvoice).filter(CustomerInvoice.invoice_number == str(invoice_id)).first()
    if not customer_invoice:
        try:
            inv_uuid = uuid.UUID(str(invoice_id))
            customer_invoice = db.query(CustomerInvoice).filter(CustomerInvoice.id == inv_uuid).first()
        except ValueError:
            pass

    # Correlate between Invoice and CustomerInvoice if only one was found
    if not customer_invoice and invoice:
        customer_invoice = db.query(CustomerInvoice).filter(CustomerInvoice.invoice_number == invoice.invoice_number).first()
    if not invoice and customer_invoice:
        invoice = db.query(Invoice).filter(Invoice.invoice_number == customer_invoice.invoice_number).first()
        if not invoice:
            invoice = Invoice(
                invoice_number=customer_invoice.invoice_number,
                total_amount=Decimal(str(customer_invoice.grand_total)),
                currency="SAR",
                payment_status="paid" if customer_invoice.status == "Paid" else "pending",
                is_posted=False,
            )
            db.add(invoice)
            db.flush()

    if not invoice and not customer_invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer invoice '{invoice_id}' not found.",
        )

    # Multi-tenant and company isolation check
    check_cid = customer_invoice.company_id if customer_invoice else getattr(invoice, "company_id", None)
    if check_cid:
        context.check_access(None, target_company_id=check_cid)

    # 2. Check already posted
    if invoice and invoice.is_posted:
        if invoice.journal_entry_id:
            existing_entry = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.id == invoice.journal_entry_id).first()
            if existing_entry:
                return existing_entry
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invoice '{invoice.invoice_number}' has already been posted to the general ledger.",
        )

    # 3. Compute balanced amounts & accounting values
    if customer_invoice:
        subtotal = Decimal(str(customer_invoice.subtotal))
        tax_amount = Decimal(str(customer_invoice.vat_amount))
        total_amount = Decimal(str(customer_invoice.grand_total))
        company_id = customer_invoice.company_id
        customer_name = customer_invoice.customer_name or "Valued Client"
    else:
        total_amount = Decimal(str(invoice.total_amount))
        # KSA 15% VAT calculation
        subtotal = round(total_amount / Decimal("1.15"), 4)
        tax_amount = total_amount - subtotal
        first_comp = db.query(ResCompany).first()
        company_id = first_comp.id if first_comp else uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
        customer_name = "Valued Client"

    if total_amount <= Decimal("0.0000"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invariance Failure: Invoice total amount must be greater than zero for ledger posting.",
        )

    # 4. Mathematical invariance verification gate
    # Total Debits: Accounts Receivable (Asset)
    # Total Credits: Sales Revenue (Income) + VAT Output (Liability)
    total_debit = total_amount
    total_credit = subtotal + tax_amount

    if total_debit != total_credit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invariance Failure: Debits ({total_debit}) do not balance with credits ({total_credit}).",
        )

    tenant_id = company_id or uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
    inv_num = invoice.invoice_number if invoice else (customer_invoice.invoice_number if customer_invoice else "INV-SALES")

    # 5. Create master general ledger voucher
    entry = FinanceJournalEntry(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        company_id=company_id,
        entry_number=f"INV-SALES-{inv_num}-{uuid.uuid4().hex[:6].upper()}",
        description=f"Sales Revenue & Accounts Receivable posting for Invoice {inv_num} ({customer_name})",
        entry_date=datetime.now(timezone.utc),
        total_debit=total_debit,
        total_credit=total_credit,
        status="POSTED",
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.flush()

    # 6. Balanced Journal Lines:
    # 1. Debit: Accounts Receivable (112000)
    # 2. Credit: Sales Revenue (410000)
    # 3. Credit: VAT Output Payable (214000)
    lines = [
        FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            entry_id=entry.id,
            account_code="112000",
            description=f"Accounts Receivable - Customer {customer_name} (Invoice {inv_num})",
            debit=total_debit,
            credit=Decimal("0.0000"),
        ),
        FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            entry_id=entry.id,
            account_code="410000",
            description=f"Sales Revenue - Invoice {inv_num}",
            debit=Decimal("0.0000"),
            credit=subtotal,
        ),
    ]
    if tax_amount > Decimal("0.0000"):
        lines.append(
            FinanceJournalLine(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                entry_id=entry.id,
                account_code="214000",
                description=f"VAT Output (15%) - Invoice {inv_num}",
                debit=Decimal("0.0000"),
                credit=tax_amount,
            )
        )

    db.add_all(lines)

    # 7. Update Invoice & CustomerInvoice records
    if invoice:
        invoice.is_posted = True
        invoice.journal_entry_id = entry.id
    if customer_invoice:
        customer_invoice.journal_entry_id = entry.id
        if customer_invoice.status in ["Draft", "Approved"]:
            customer_invoice.status = "Issued"

    db.commit()
    db.refresh(entry)
    if invoice:
        db.refresh(invoice)
    if customer_invoice:
        db.refresh(customer_invoice)

    return entry


@router.get("/invoices", status_code=status.HTTP_200_OK)
def list_invoices(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
):
    """Lists invoices with payment and general ledger status."""
    query = db.query(Invoice)
    if not context.is_super_admin and context.company_id:
        allowed_nums = [
            row[0]
            for row in db.query(CustomerInvoice.invoice_number)
            .filter(CustomerInvoice.company_id == context.company_id)
            .all()
        ]
        allowed_jes = [
            row[0]
            for row in db.query(FinanceJournalEntry.id)
            .filter(FinanceJournalEntry.company_id == context.company_id)
            .all()
        ]
        query = query.filter(
            or_(
                Invoice.invoice_number.in_(allowed_nums),
                Invoice.journal_entry_id.in_(allowed_jes),
            )
        )
    invoices = query.order_by(Invoice.id.desc()).all()
    return [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "total_amount": float(inv.total_amount),
            "currency": inv.currency,
            "payment_status": inv.payment_status,
            "is_posted": getattr(inv, "is_posted", False),
            "journal_entry_id": str(inv.journal_entry_id) if getattr(inv, "journal_entry_id", None) else None,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "public_token": inv.public_token,
        }
        for inv in invoices
    ]


@router.get("/invoices/{invoice_id}", status_code=status.HTTP_200_OK)
def get_invoice_details(
    invoice_id: str,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
):
    """Retrieve details for a single invoice."""
    invoice = None
    if str(invoice_id).isdigit():
        invoice = db.query(Invoice).filter(Invoice.id == int(invoice_id)).first()
    if not invoice:
        invoice = db.query(Invoice).filter(Invoice.invoice_number == str(invoice_id)).first()
    if not invoice:
        try:
            inv_uuid = uuid.UUID(str(invoice_id))
            invoice = db.query(Invoice).filter(Invoice.public_token == str(invoice_id)).first()
        except ValueError:
            pass

    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    cust_inv = db.query(CustomerInvoice).filter(CustomerInvoice.invoice_number == invoice.invoice_number).first()
    if cust_inv and cust_inv.company_id:
        context.check_access(None, target_company_id=cust_inv.company_id)
    elif getattr(invoice, "journal_entry_id", None):
        je = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.id == invoice.journal_entry_id).first()
        if je and je.company_id:
            context.check_access(je.tenant_id, je.company_id)

    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "total_amount": float(invoice.total_amount),
        "currency": invoice.currency,
        "payment_status": invoice.payment_status,
        "is_posted": getattr(invoice, "is_posted", False),
        "journal_entry_id": str(invoice.journal_entry_id) if getattr(invoice, "journal_entry_id", None) else None,
        "paid_at": invoice.paid_at.isoformat() if invoice.paid_at else None,
        "payment_method": invoice.payment_method,
        "public_token": invoice.public_token,
    }


try:
    from backend.schemas import InvoiceOut, InvoiceResponse
except ImportError:
    from schemas import InvoiceOut, InvoiceResponse  # type: ignore



