"""
Procurement & Double-Entry Financial Ledger API Router.
Implements Phase 7 Procurement Ledger Integration:
- Vendor Management
- Vendor / Procurement Bills with 3-Way Matching state
- Balanced Double-Entry General Ledger posting (total_debit == total_credit)
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from pydantic import BaseModel, ConfigDict, Field, computed_field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from backend.api.dependencies import (
    TenantContext,
    get_tenant_context,
    require_write_access,
    require_admin_or_accountant,
    require_admin,
    StandardRole,
)

try:
    from backend.database import get_db
    from backend.models import (
        Vendor,
        VendorBill,
        ProcurementBill,
        FinanceJournalEntry,
        FinanceJournalLine,
        PurchaseOrder,
        GoodsReceipt,
    )
except ImportError:
    from database import get_db
    from models import (
        Vendor,
        VendorBill,
        ProcurementBill,
        FinanceJournalEntry,
        FinanceJournalLine,
        PurchaseOrder,
        GoodsReceipt,
    )

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/procurement", tags=["Procurement & Financial Ledger"])


# ==============================================================================
# Pydantic Schemas
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


class VendorCreate(BaseModel):
    tenant_id: Optional[uuid.UUID] = None
    vendor_code: str
    name: str
    commercial_registration: Optional[str] = None
    vat_number: Optional[str] = None
    payment_terms_days: int = 30
    currency: str = "SAR"
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class VendorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    vendor_code: str
    name: str
    commercial_registration: Optional[str] = None
    vat_number: Optional[str] = None
    payment_terms_days: int
    currency: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    created_at: datetime


class ProcurementBillCreate(BaseModel):
    tenant_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    invoice_number: str
    vendor_id: Optional[uuid.UUID] = None
    purchase_order_id: Optional[uuid.UUID] = None
    goods_receipt_id: Optional[uuid.UUID] = None
    invoice_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: str = "SAR"
    amount: Decimal
    tax_amount: Decimal = Decimal("0.0000")
    total_billed: Optional[Decimal] = None
    match_status: str = "MATCHED"


class ProcurementBillResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    invoice_number: str
    vendor_id: Optional[uuid.UUID] = None
    vendor_name: Optional[str] = None
    purchase_order_id: Optional[uuid.UUID] = None
    purchase_order_number: Optional[str] = None
    goods_receipt_id: Optional[uuid.UUID] = None
    invoice_date: datetime
    due_date: Optional[datetime] = None
    currency: str
    amount: Decimal
    tax_amount: Decimal
    total_billed: Decimal
    match_status: str
    is_posted: bool
    journal_entry_id: Optional[uuid.UUID] = None
    created_at: datetime


# ==============================================================================
# Helper / Seed Utilities
# ==============================================================================

def _ensure_default_po_and_grn(db: Session, company_id: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    """Ensure a valid PurchaseOrder and GoodsReceipt exist for company_id to satisfy FK constraints."""
    try:
        from backend.models import ResPartner
    except ImportError:
        from models import ResPartner

    po = db.query(PurchaseOrder).filter(PurchaseOrder.company_id == company_id).first()
    if not po:
        partner = db.query(ResPartner).filter(ResPartner.company_id == company_id).first()
        if not partner:
            partner = ResPartner(
                id=uuid.uuid4(),
                company_id=company_id,
                name="Default Procurement Supplier",
                partner_type="supplier",
                is_active=True,
            )
            db.add(partner)
            db.flush()
        po = PurchaseOrder(
            id=uuid.uuid4(),
            company_id=company_id,
            po_number=f"PO-AUTO-{uuid.uuid4().hex[:6].upper()}",
            partner_id=partner.id,
            status="received",
            currency="SAR",
            subtotal=Decimal("0"),
            tax_amount=Decimal("0"),
            total_amount=Decimal("0"),
        )
        db.add(po)
        db.flush()

    gr = db.query(GoodsReceipt).filter(GoodsReceipt.company_id == company_id).first()
    if not gr:
        gr = GoodsReceipt(
            id=uuid.uuid4(),
            company_id=company_id,
            gr_number=f"GR-AUTO-{uuid.uuid4().hex[:6].upper()}",
            purchase_order_id=po.id,
            status="accepted",
        )
        db.add(gr)
        db.flush()

    return po.id, gr.id


def _seed_initial_procurement_data_if_needed(db: Session, tenant_id: uuid.UUID, company_id: uuid.UUID):
    """Seed initial sample vendor and bills if the table is empty for instant testing."""
    existing_bill = db.query(VendorBill).filter(VendorBill.tenant_id == tenant_id).first()
    if existing_bill:
        return

    # Check or create vendor
    vendor = db.query(Vendor).filter(Vendor.tenant_id == tenant_id).first()
    if not vendor:
        vendor = Vendor(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            vendor_code=f"VND-2026-{uuid.uuid4().hex[:4].upper()}",
            name="Arabian Aggregates Co.",
            commercial_registration="1010892345",
            vat_number="300987654300003",
            payment_terms_days=30,
            currency="SAR",
            email="accounts@arabianaggregates.sa",
            phone="+966 11 456 7890",
            address="Riyadh Industrial City 2, Riyadh, KSA",
            is_active=True,
        )
        db.add(vendor)
        db.flush()

    po_id, gr_id = _ensure_default_po_and_grn(db, company_id)

    sample_bills = [
        VendorBill(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            company_id=company_id,
            invoice_number="INV-VND-2026-001",
            vendor_id=vendor.id,
            purchase_order_id=po_id,
            goods_receipt_id=gr_id,
            invoice_date=datetime.now(timezone.utc),
            due_date=datetime.now(timezone.utc),
            currency="SAR",
            amount=Decimal("160869.5700"),
            tax_amount=Decimal("24130.4300"),
            total_billed=Decimal("185000.0000"),
            match_status="MATCHED",
            is_posted=False,
        ),
        VendorBill(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            company_id=company_id,
            invoice_number="INV-VND-2026-002",
            vendor_id=vendor.id,
            purchase_order_id=po_id,
            goods_receipt_id=gr_id,
            invoice_date=datetime.now(timezone.utc),
            due_date=datetime.now(timezone.utc),
            currency="SAR",
            amount=Decimal("37217.3900"),
            tax_amount=Decimal("5582.6100"),
            total_billed=Decimal("42800.0000"),
            match_status="MATCHED",
            is_posted=False,
        ),
    ]
    try:
        db.add_all(sample_bills)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Could not auto-seed sample procurement bills: %s", exc)


# ==============================================================================
# Vendor Endpoints
# ==============================================================================

# ==============================================================================
# Vendor Endpoints
# ==============================================================================

@router.get("/vendors", response_model=List[VendorResponse])
def list_vendors(
    tenant_id: Optional[uuid.UUID] = None,
    limit: int = Query(100, ge=1, le=500),
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Retrieve vendors list strictly isolated to tenant."""
    context.check_access(tenant_id)
    target_tenant = tenant_id if (context.is_super_admin and tenant_id) else context.tenant_id

    query = select(Vendor).where(Vendor.tenant_id == target_tenant).order_by(desc(Vendor.created_at))
    return db.scalars(query.limit(limit)).all()


@router.post("/vendors", response_model=VendorResponse, status_code=status.HTTP_201_CREATED, dependencies=[Security(require_write_access), Security(require_admin_or_accountant)])
def create_vendor(
    payload: VendorCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Register a new vendor/supplier within caller's isolated tenant."""
    context.check_access(payload.tenant_id)
    effective_tenant_id = payload.tenant_id if (context.is_super_admin and payload.tenant_id) else context.tenant_id

    vendor = Vendor(
        id=uuid.uuid4(),
        tenant_id=effective_tenant_id,
        vendor_code=payload.vendor_code,
        name=payload.name,
        commercial_registration=payload.commercial_registration,
        vat_number=payload.vat_number,
        payment_terms_days=payload.payment_terms_days,
        currency=payload.currency,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        is_active=True,
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


# ==============================================================================
# Procurement / Vendor Bill Endpoints
# ==============================================================================

@router.get("/bills", response_model=List[ProcurementBillResponse])
def list_procurement_bills(
    tenant_id: Optional[uuid.UUID] = None,
    match_status: Optional[str] = Query(None),
    is_posted: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """
    List vendor bills strictly filtered by caller tenant boundary.
    """
    context.check_access(tenant_id)
    target_tenant = tenant_id if (context.is_super_admin and tenant_id) else context.tenant_id

    _seed_initial_procurement_data_if_needed(db, target_tenant, target_tenant)

    query = select(VendorBill).where(VendorBill.tenant_id == target_tenant).order_by(desc(VendorBill.created_at))
    if match_status:
        query = query.where(VendorBill.match_status == match_status)
    if is_posted is not None:
        query = query.where(VendorBill.is_posted == is_posted)

    bills = db.scalars(query.limit(limit)).all()

    # Pre-fetch vendors and purchase orders for readable UI metadata
    vendor_ids = {b.vendor_id for b in bills if b.vendor_id}
    po_ids = {b.purchase_order_id for b in bills if b.purchase_order_id}

    vendors_map = {}
    if vendor_ids:
        v_list = db.query(Vendor).filter(Vendor.id.in_(vendor_ids)).all()
        vendors_map = {v.id: v.name for v in v_list}

    pos_map = {}
    if po_ids:
        po_list = db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(po_ids)).all()
        pos_map = {p.id: p.po_number for p in po_list}

    response_items = []
    for b in bills:
        item = ProcurementBillResponse(
            id=b.id,
            tenant_id=b.tenant_id,
            company_id=b.company_id,
            invoice_number=b.invoice_number,
            vendor_id=b.vendor_id,
            vendor_name=vendors_map.get(b.vendor_id, "Vendor"),
            purchase_order_id=b.purchase_order_id,
            purchase_order_number=pos_map.get(b.purchase_order_id, "PO-AUTO"),
            goods_receipt_id=b.goods_receipt_id,
            invoice_date=b.invoice_date,
            due_date=b.due_date,
            currency=b.currency,
            amount=b.amount,
            tax_amount=b.tax_amount,
            total_billed=b.total_billed,
            match_status=b.match_status,
            is_posted=b.is_posted,
            journal_entry_id=b.journal_entry_id,
            created_at=b.created_at,
        )
        response_items.append(item)

    return response_items


@router.get("/bills/{bill_id}", response_model=ProcurementBillResponse)
def get_procurement_bill(
    bill_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Retrieve details for a single procurement bill with strict tenant boundary."""
    bill = db.query(VendorBill).filter(VendorBill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procurement bill not found.")

    if not context.is_super_admin and bill.tenant_id != context.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to procurement bill forbidden.")

    vendor_name = None
    if bill.vendor_id:
        v = db.query(Vendor).filter(Vendor.id == bill.vendor_id).first()
        if v:
            vendor_name = v.name

    po_number = None
    if bill.purchase_order_id:
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == bill.purchase_order_id).first()
        if po:
            po_number = po.po_number

    return ProcurementBillResponse(
        id=bill.id,
        tenant_id=bill.tenant_id,
        company_id=bill.company_id,
        invoice_number=bill.invoice_number,
        vendor_id=bill.vendor_id,
        vendor_name=vendor_name or "Vendor",
        purchase_order_id=bill.purchase_order_id,
        purchase_order_number=po_number or "PO-AUTO",
        goods_receipt_id=bill.goods_receipt_id,
        invoice_date=bill.invoice_date,
        due_date=bill.due_date,
        currency=bill.currency,
        amount=bill.amount,
        tax_amount=bill.tax_amount,
        total_billed=bill.total_billed,
        match_status=bill.match_status,
        is_posted=bill.is_posted,
        journal_entry_id=bill.journal_entry_id,
        created_at=bill.created_at,
    )


@router.post("/bills", response_model=ProcurementBillResponse, status_code=status.HTTP_201_CREATED, dependencies=[Security(require_write_access), Security(require_admin_or_accountant)])
def create_procurement_bill(
    payload: ProcurementBillCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """Create a new vendor / procurement bill within caller's tenant."""
    context.check_access(payload.tenant_id, payload.company_id)
    effective_tenant_id = (payload.tenant_id or payload.company_id) if (context.is_super_admin and (payload.tenant_id or payload.company_id)) else context.tenant_id
    effective_company_id = payload.company_id if (context.is_super_admin and payload.company_id) else context.company_id

    total_billed = payload.total_billed
    if total_billed is None:
        total_billed = payload.amount + payload.tax_amount

    # Invariance check
    if payload.amount + payload.tax_amount != total_billed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invariance Failure: Subtotal ({payload.amount}) + Tax ({payload.tax_amount}) != Total Billed ({total_billed}).",
        )

    po_id = payload.purchase_order_id
    gr_id = payload.goods_receipt_id
    if not po_id or not gr_id:
        default_po_id, default_gr_id = _ensure_default_po_and_grn(db, effective_company_id)
        po_id = po_id or default_po_id
        gr_id = gr_id or default_gr_id

    bill = VendorBill(
        id=uuid.uuid4(),
        tenant_id=effective_tenant_id,
        company_id=effective_company_id,
        invoice_number=payload.invoice_number,
        vendor_id=payload.vendor_id,
        purchase_order_id=po_id,
        goods_receipt_id=gr_id,
        invoice_date=payload.invoice_date or datetime.now(timezone.utc),
        due_date=payload.due_date,
        currency=payload.currency,
        amount=payload.amount,
        tax_amount=payload.tax_amount,
        total_billed=total_billed,
        match_status=payload.match_status,
        is_posted=False,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)

    try:
        from backend.app.services.workflow_service import WorkflowEngineService
        wf_result = WorkflowEngineService.initialize_document_workflow(
            db=db,
            tenant_id=effective_tenant_id,
            doc_type="VENDOR_BILL",
            doc_id=bill.id,
            total_amount=float(total_billed),
        )
        if wf_result != "AUTO_APPROVED":
            bill.match_status = "PENDING_APPROVAL"
            db.commit()
            db.refresh(bill)
    except Exception:
        pass

    vendor_name = None
    if bill.vendor_id:
        v = db.query(Vendor).filter(Vendor.id == bill.vendor_id).first()
        if v:
            vendor_name = v.name

    return ProcurementBillResponse(
        id=bill.id,
        tenant_id=bill.tenant_id,
        company_id=bill.company_id,
        invoice_number=bill.invoice_number,
        vendor_id=bill.vendor_id,
        vendor_name=vendor_name or "Vendor",
        purchase_order_id=bill.purchase_order_id,
        purchase_order_number="PO-AUTO",
        goods_receipt_id=bill.goods_receipt_id,
        invoice_date=bill.invoice_date,
        due_date=bill.due_date,
        currency=bill.currency,
        amount=bill.amount,
        tax_amount=bill.tax_amount,
        total_billed=bill.total_billed,
        match_status=bill.match_status,
        is_posted=bill.is_posted,
        journal_entry_id=bill.journal_entry_id,
        created_at=bill.created_at,
    )


# ==============================================================================
# Phase 7 Core: Post to Double-Entry General Ledger
# ==============================================================================

@router.post("/bills/{bill_id}/post-ledger", response_model=JournalEntryResponse, dependencies=[Security(require_write_access), Security(require_admin_or_accountant)])
def post_procurement_bill_to_ledger(
    bill_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """
    Approves a 3-way matched procurement bill and posts a balanced double-entry
    journal entry to the General Ledger.
    
    Enforces debit/credit mathematical invariance and tenant boundary:
      total_debit (Expense + VAT Input) == total_credit (Accounts Payable)
    """
    bill = db.query(VendorBill).filter(VendorBill.id == bill_id).first()
    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Procurement bill '{bill_id}' not found.",
        )

    if not context.is_super_admin and bill.tenant_id != context.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Multi-tenant isolation violation: Access to procurement bill forbidden.",
        )

    from backend.app.services.workflow_service import WorkflowEngineService
    if bill.match_status in ("PENDING_APPROVAL", "REJECTED") or WorkflowEngineService.is_document_pending_approval(
        db, bill.tenant_id, "VENDOR_BILL", bill.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"GL Posting Blocked: Procurement bill '{bill.invoice_number}' is {bill.match_status} and must be approved before posting to the General Ledger.",
        )

    if bill.is_posted:
        if bill.journal_entry_id:
            existing_entry = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.id == bill.journal_entry_id).first()
            if existing_entry:
                return existing_entry
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bill '{bill.invoice_number}' has already been posted to the general ledger.",
        )

    amount = Decimal(str(bill.amount))
    tax_amount = Decimal(str(bill.tax_amount))
    total_billed = Decimal(str(bill.total_billed))

    # Mathematical invariance verification gate
    total_debit = amount + tax_amount
    total_credit = total_billed

    if total_debit != total_credit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invariance Failure: Debits ({total_debit}) do not balance with credits ({total_credit}).",
        )

    vendor_name = "Supplier"
    if bill.vendor_id:
        v = db.query(Vendor).filter(Vendor.id == bill.vendor_id).first()
        if v:
            vendor_name = v.name

    # Create master journal voucher entry
    entry = FinanceJournalEntry(
        id=uuid.uuid4(),
        tenant_id=bill.tenant_id,
        company_id=bill.company_id,
        entry_number=f"BILL-{bill.invoice_number}-{uuid.uuid4().hex[:6].upper()}",
        description=f"Procurement Bill posting {bill.invoice_number} for vendor {vendor_name}",
        entry_date=datetime.now(timezone.utc),
        total_debit=total_debit,
        total_credit=total_credit,
        status="POSTED",
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.flush()

    # Balanced Journal Lines:
    lines = [
        FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=bill.tenant_id,
            entry_id=entry.id,
            account_code="510000",
            description=f"Procurement expense - Bill {bill.invoice_number}",
            debit=amount,
            credit=Decimal("0.0000"),
        ),
        FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=bill.tenant_id,
            entry_id=entry.id,
            account_code="115000",
            description=f"VAT Input - Bill {bill.invoice_number}",
            debit=tax_amount,
            credit=Decimal("0.0000"),
        ),
        FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=bill.tenant_id,
            entry_id=entry.id,
            account_code="211000",
            description=f"Accounts Payable - Vendor {vendor_name}",
            debit=Decimal("0.0000"),
            credit=total_billed,
        ),
    ]

    active_lines = [l for l in lines if l.debit > 0 or l.credit > 0]
    db.add_all(active_lines if active_lines else lines)

    # Link bill to journal entry and update state
    bill.is_posted = True
    bill.journal_entry_id = entry.id
    bill.match_status = "MATCHED"

    db.commit()
    db.refresh(entry)
    db.refresh(bill)
    return entry
