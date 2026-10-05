"""
OxenGL Inventory Domain Models.
Defines Material (Dual-UOM), StockBalance, and Landed Cost Allocation entities.
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
    Boolean,
    Text,
    CheckConstraint,
    Index,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

from backend.database import Base


class Material(Base):
    """Cataloged material and inventory items supporting Dual-UOM and valuation metrics."""
    __tablename__ = "materials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), default="RAW_MATERIAL", nullable=False)

    # Dual-UOM (e.g. Primary: TON/KG, Secondary: BAGS/PALLETS)
    primary_uom: Mapped[str] = mapped_column(String(20), nullable=False, default="KG")
    secondary_uom: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    uom_conversion_ratio: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("1.0000"), nullable=False)

    valuation_method: Mapped[str] = mapped_column(String(30), default="MOVING_AVERAGE", nullable=False)
    standard_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    current_moving_avg_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)

    density_factor: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)


class StockBalance(Base):
    """Warehouse-isolated perpetual inventory balance tracking quantities and valuation."""
    __tablename__ = "stock_balances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    material_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("materials.id", ondelete="CASCADE"), nullable=False, index=True)

    quantity_on_hand: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    quantity_reserved: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    quantity_available: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)

    unit_cost_moving_avg: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    total_valuation: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    last_revaluation_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)

    total_value = synonym("total_valuation")
    created_at = synonym("last_revaluation_date")

    material: Mapped["Material"] = relationship("Material")

    __table_args__ = (
        Index("ix_stock_balances_wh_material", "warehouse_id", "material_id", unique=False),
    )


class LandedCostAllocation(Base):
    """Header record for Landed Cost adjustments apportioned onto Goods Receipts."""
    __tablename__ = "landed_cost_allocations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    goods_receipt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False, index=True)

    freight_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    customs_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    port_handling_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    insurance_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    total_landed_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)

    allocation_method: Mapped[str] = mapped_column(String(30), default="VALUE", nullable=False)  # 'VALUE', 'WEIGHT', 'QUANTITY'
    is_posted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)

    items: Mapped[List["LandedCostItem"]] = relationship("LandedCostItem", back_populates="allocation", cascade="all, delete-orphan")


class LandedCostItem(Base):
    """Line-by-line landed cost apportionments and updated moving average unit costs."""
    __tablename__ = "landed_cost_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    allocation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("landed_cost_allocations.id", ondelete="CASCADE"), nullable=False, index=True)
    material_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("materials.id"), nullable=False)

    base_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    allocated_expense: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    final_effective_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)

    allocation: Mapped["LandedCostAllocation"] = relationship("LandedCostAllocation", back_populates="items")


class InventoryMovement(Base):
    """Inventory movement and valuation adjustments linked to General Ledger."""
    __tablename__ = "inventory_movements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="SET NULL"), nullable=True, index=True)
    movement_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    movement_type: Mapped[str] = mapped_column(String(32), nullable=False, default="ADJUSTMENT")  # 'ADJUSTMENT', 'INBOUND', 'OUTBOUND', 'TRANSFER', 'SCRAP'
    warehouse_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("product_products.id", ondelete="SET NULL"), nullable=True, index=True)

    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)

    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="COMPLETED", nullable=False)  # 'DRAFT', 'COMPLETED', 'POSTED'
    custom_attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    is_posted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    journal_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("finance_journal_entries.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    warehouse: Mapped[Optional["Warehouse"]] = relationship("Warehouse", foreign_keys=[warehouse_id])
    product: Mapped[Optional["ProductProduct"]] = relationship("ProductProduct", foreign_keys=[product_id])
    journal_entry: Mapped[Optional["FinanceJournalEntry"]] = relationship("FinanceJournalEntry", foreign_keys=[journal_entry_id])

