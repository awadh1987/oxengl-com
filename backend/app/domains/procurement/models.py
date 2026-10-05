"""
OxenGL Procurement Domain Models.
Defines entities for S2P (Source-to-Pay), Approval Matrix Workflows,
Purchase Requisitions, Purchase Orders, Goods Receipts with Batch Logs, and Vendor Bills.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import (
    String,
    Numeric,
    ForeignKey,
    DateTime,
    Integer,
    Boolean,
    Text,
    CheckConstraint,
    Index,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

try:
    from backend.models import PurchaseOrder, GoodsReceipt
except ImportError:
    from models import PurchaseOrder, GoodsReceipt

try:
    from backend.app.domains.finance.models import FinanceJournalEntry
except ImportError:
    try:
        from app.domains.finance.models import FinanceJournalEntry
    except ImportError:
        FinanceJournalEntry = "FinanceJournalEntry"


class ApprovalRule(Base):
    """Metadata-driven routing rules determining approvals based on value thresholds."""
    __tablename__ = "approval_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'VENDOR_BILL'
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)

    min_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    max_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")

    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    required_role_code: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g., 'DEPARTMENT_SUPERVISOR', 'FINANCE_MANAGER'
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)


class WorkflowInstance(Base):
    """Tracks live lifecycle routing pipelines for targeted document transactions."""
    __tablename__ = "workflow_instances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)

    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False)  # 'PENDING', 'APPROVED', 'REJECTED'
    current_step: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    steps: Mapped[List["WorkflowStep"]] = relationship("WorkflowStep", back_populates="instance", cascade="all, delete-orphan", order_by="WorkflowStep.sequence_order")


class WorkflowStep(Base):
    """Granular approval tier records tracking historical logs and individual signatures."""
    __tablename__ = "workflow_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instance_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workflow_instances.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_role_code: Mapped[str] = mapped_column(String(100), nullable=False)

    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False)  # 'PENDING', 'APPROVED', 'REJECTED'
    actioned_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    actioned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    instance: Mapped["WorkflowInstance"] = relationship("WorkflowInstance", back_populates="steps")


class Vendor(Base):
    """Supplier & Vendor master entity for procurement operations."""
    __tablename__ = "vendors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    vendor_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    commercial_registration: Mapped[Optional[str]] = mapped_column(String(64))
    vat_number: Mapped[Optional[str]] = mapped_column(String(64))
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(64))
    address: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)

    bills: Mapped[List["VendorBill"]] = relationship("VendorBill", back_populates="vendor")


class PurchaseRequisition(Base):
    """Internal departmental purchase requests triggering multi-level approvals."""
    __tablename__ = "purchase_requisitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    pr_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    requester_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    justification: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="DRAFT", nullable=False)  # DRAFT, SUBMITTED, APPROVED, REJECTED, CONVERTED_TO_PO
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)
    total_estimated_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    custom_attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)

    lines: Mapped[List["PurchaseRequisitionLine"]] = relationship("PurchaseRequisitionLine", back_populates="requisition", cascade="all, delete-orphan")


class PurchaseRequisitionLine(Base):
    """Line items for Purchase Requisitions."""
    __tablename__ = "purchase_requisition_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requisition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_requisitions.id", ondelete="CASCADE"), nullable=False, index=True)
    item_description: Mapped[str] = mapped_column(String(255), nullable=False)
    material_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    quantity_requested: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    uom: Mapped[str] = mapped_column(String(20), default="UNIT", nullable=False)
    estimated_unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)

    requisition: Mapped["PurchaseRequisition"] = relationship("PurchaseRequisition", back_populates="lines")


class PurchaseOrderLine(Base):
    """Line items for Purchase Orders (binding PO to materials and quantities)."""
    __tablename__ = "purchase_order_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    material_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity_ordered: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    quantity_received: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    quantity_billed: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.1500"), nullable=False)  # 15% VAT default
    line_subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)


class GoodsReceiptBatchLog(Base):
    """Batch tracking logs recorded at Goods Receipt Inspection (GRN)."""
    __tablename__ = "goods_receipt_batch_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goods_receipt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    material_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    batch_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    quantity_received: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    uom: Mapped[str] = mapped_column(String(20), default="KG", nullable=False)
    manufacture_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    inspection_result: Mapped[str] = mapped_column(String(32), default="PASSED", nullable=False)  # PASSED, REJECTED, CONDITIONAL
    storage_location: Mapped[Optional[str]] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)


class VendorBill(Base):
    """Supplier Vendor Invoices for 3-Way Matching against PO and Goods Receipt."""
    __tablename__ = "vendor_bills"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    vendor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    goods_receipt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    journal_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("finance_journal_entries.id", ondelete="SET NULL"), nullable=True, index=True)

    invoice_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    total_billed: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)

    match_status: Mapped[str] = mapped_column(String(32), default="PENDING", nullable=False)  # 'PENDING', 'MATCHED', 'HOLD_DISCREPANCY'
    discrepancy_details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_posted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)

    vendor: Mapped[Optional["Vendor"]] = relationship("Vendor", back_populates="bills")
    journal_entry: Mapped[Optional["FinanceJournalEntry"]] = relationship("FinanceJournalEntry", foreign_keys=[journal_entry_id])


# Semantic domain aliases for Procurement & General Ledger integration
ProcurementBill = VendorBill
ProcurementVendor = Vendor


# ==============================================================================
# Phase 10: Procurement Tendering, RFQ Engine & Sealed-Bid Models
# ==============================================================================

class ProcurementTender(Base):
    """Phase 10: eSourcing RFQ Tender bound to Enterprise Purchasing Organizations."""
    __tablename__ = "procurement_tenders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    purchasing_organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("purchasing_organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    tender_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(100), default="Raw Materials", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="DRAFT", nullable=False, index=True)  # DRAFT, PUBLISHED, OPEN, EVALUATING, AWARDED, CANCELLED, CLOSED
    submission_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    bid_opening_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)
    estimated_budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    is_sealed_bid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    bids_unsealed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    unsealed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    unsealed_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    winning_bid_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    awarded_purchase_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True)
    terms_and_conditions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_pr_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_requisitions.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    lines: Mapped[List["TenderRFQLine"]] = relationship("TenderRFQLine", back_populates="tender", cascade="all, delete-orphan")
    bids: Mapped[List["ProcurementBid"]] = relationship("ProcurementBid", back_populates="tender", cascade="all, delete-orphan")


class TenderRFQLine(Base):
    """Line items for eSourcing RFQ Tenders."""
    __tablename__ = "tender_rfq_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("procurement_tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    line_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    item_code: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    uom: Mapped[str] = mapped_column(String(20), default="UNIT", nullable=False)
    target_unit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    technical_specifications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)

    tender: Mapped["ProcurementTender"] = relationship("ProcurementTender", back_populates="lines")
    bid_lines: Mapped[List["ProcurementBidLine"]] = relationship("ProcurementBidLine", back_populates="tender_line", cascade="all, delete-orphan")


class VendorPortalUser(Base):
    """Phase 10: External Supplier / Vendor user identity for Vendor Portal."""
    __tablename__ = "vendor_portal_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_partners.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    mobile_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    contact_name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    commercial_registration: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tax_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    bids: Mapped[List["ProcurementBid"]] = relationship("ProcurementBid", back_populates="vendor_user")


class ProcurementBid(Base):
    """Phase 10: Sealed Commercial Bids submitted by external vendors against RFQs."""
    __tablename__ = "procurement_bids"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("procurement_tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("vendor_portal_users.id", ondelete="SET NULL"), nullable=True)
    partner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_partners.id", ondelete="CASCADE"), nullable=False, index=True)
    bid_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)
    sealed_quote_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    is_sealed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    unsealed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="SUBMITTED", nullable=False, index=True)  # SUBMITTED, UNDER_EVALUATION, AWARDED, DISQUALIFIED, REJECTED
    technical_proposal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    commercial_terms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_lead_time_days: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
    validity_period_days: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    sealed_envelope_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    evaluation_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    evaluation_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submission_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    tender: Mapped["ProcurementTender"] = relationship("ProcurementTender", back_populates="bids")
    vendor_user: Mapped[Optional["VendorPortalUser"]] = relationship("VendorPortalUser", back_populates="bids")
    lines: Mapped[List["ProcurementBidLine"]] = relationship("ProcurementBidLine", back_populates="bid", cascade="all, delete-orphan")


class ProcurementBidLine(Base):
    """Line items for sealed bids."""
    __tablename__ = "procurement_bid_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bid_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("procurement_bids.id", ondelete="CASCADE"), nullable=False, index=True)
    tender_line_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tender_rfq_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    quoted_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_alternative: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    bid: Mapped["ProcurementBid"] = relationship("ProcurementBid", back_populates="lines")
    tender_line: Mapped["TenderRFQLine"] = relationship("TenderRFQLine", back_populates="bid_lines")


# Semantic aliases
TenderRFQ = ProcurementTender
TenderBid = ProcurementBid
TenderBidLine = ProcurementBidLine
