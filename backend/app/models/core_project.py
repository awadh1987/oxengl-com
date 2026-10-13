from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from backend.database import Base


class ProjectStatusEnum(str, Enum):
    DRAFT = "draft"
    PLANNING = "planning"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class CoreProject(Base):
    __tablename__ = "core_projects"
    __table_args__ = (
        Index("ix_core_projects_tenant_type", "tenant_id", "project_type"),
        CheckConstraint(
            "project_type IN ('logistics', 'epc', 'humanitarian', 'fuel', 'construction')",
            name="chk_valid_project_type"
        ),
        {"extend_existing": True},
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    tenant_id = Column(UUID(as_uuid=True), index=True, nullable=False)  # Multi-tenant isolation anchor
    project_code = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Project Taxonomy: Logistics, EPC, Humanitarian, Fuel, Construction
    project_type = Column(String(50), nullable=False, index=True)
    
    # Lifecycle status: planning, active, suspended, completed, archived
    status = Column(String(32), default="planning", nullable=False, index=True)
    
    # Schema-flexible metadata for dynamic project specifications
    metadata_json = Column(JSONB, default=dict, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(UUID(as_uuid=True), nullable=True)


TARGET_OPERATIONAL_TABLES = {
    'project_charters',
    'account_moves',
    'account_move_lines',
    'customer_invoices',
    'supplier_invoices',
    'vendor_bills',
    'invoices',
    'finance_journal_entries',
    'finance_journal_lines',
    'journal_entries',
    'journal_lines',
    'reporting_ledger_summaries',
    'tax_profiles',
    'tax_rules',
    'purchase_orders',
    'purchase_order_lines',
    'purchase_requisitions',
    'purchase_requisition_lines',
    'procurement_bids',
    'procurement_bid_lines',
    'procurement_tenders',
    'tender_rfq_lines',
    'supplier_contracts',
    'supplier_settlements',
    'materials',
    'product_products',
    'stock_pickings',
    'stock_moves',
    'stock_movements',
    'inventory_movements',
    'stock_balances',
    'stock_quants',
    'stock_lots',
    'goods_receipts',
    'goods_receipt_batch_logs',
    'landed_cost_allocations',
    'landed_cost_items',
    'logistics_trips',
    'fleet_trips',
    'fleet_utilization_facts',
    'fuel_transactions',
    'waybills',
    'delivery_manifests',
    'delivery_proofs',
    'customs_manifests',
    'manifest_stops',
    'drivers',
    'vehicles',
    'transporter_ledger',
    'gps_events',
    'trip_inspection_logs',
    'yard_gate_appointments',
    'weighbridge_tickets',
    'employees',
    'hr_employees',
    'attendance_logs',
    'hrms_attendance_logs',
    'payroll_runs',
    'payroll_allowances',
    'maintenance_work_orders',
    'execution_tasks',
    'farm_gate_weighments',
    'harvest_batches',
    'seasonal_crop_cycles',
    'zatca_logs'
}


def attach_project_spine_columns():
    """Ensures SQLAlchemy Base.metadata includes project_id foreign keys matching proj_spine_core migration."""
    for table_name in TARGET_OPERATIONAL_TABLES:
        if table_name in Base.metadata.tables:
            table = Base.metadata.tables[table_name]
            if 'project_id' not in table.columns:
                fk_name = f'fk_{table_name}_core_projects'
                col = Column(
                    'project_id',
                    UUID(as_uuid=True),
                    ForeignKey('core_projects.id', ondelete='SET NULL', name=fk_name),
                    nullable=True,
                )
                table.append_column(col)
                Index(f'ix_{table_name}_project_id', col)
