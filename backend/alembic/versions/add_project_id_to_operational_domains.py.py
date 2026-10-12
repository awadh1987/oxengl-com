"""add project_id to operational and transactional domains safely

Revision ID: proj_spine_core
Revises: ae5265008c4f
Create Date: 2026-10-12 22:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine.reflection import Inspector

revision = 'proj_spine_core'
down_revision = 'ae5265008c4f'
branch_labels = None
depends_on = None

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

def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = set(inspector.get_table_names())

    # Pass 1: Add columns and indexes safely using savepoints
    for table in TARGET_OPERATIONAL_TABLES:
        if table not in existing_tables:
            continue
            
        columns = [c['name'] for c in inspector.get_columns(table)]
        if 'project_id' not in columns:
            print(f"Adding project_id column to: {table}")
            try:
                with op.get_context().begin_nested():
                    op.add_column(table, sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=True))
                    op.create_index(op.f(f'ix_{table}_project_id'), table, ['project_id'], unique=False)
            except Exception as e:
                print(f"Column/Index already exists or skipped for {table}: {e}")

    # Pass 2: Apply foreign key constraints safely using nested savepoints
    for table in TARGET_OPERATIONAL_TABLES:
        if table not in existing_tables:
            continue
            
        # Check if FK already exists to avoid redundant errors
        existing_fks = {fk['name'] for fk in inspector.get_foreign_keys(table)}
        fk_name = f'fk_{table}_core_projects'
        
        if fk_name not in existing_fks:
            try:
                print(f"Binding foreign key for: {table}")
                with op.get_context().begin_nested():
                    op.create_foreign_key(
                        fk_name,
                        table, 'core_projects',
                        ['project_id'], ['id'],
                        ondelete='SET NULL'
                    )
            except Exception as e:
                print(f"Skipping FK for {table}: {e}")

def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = set(inspector.get_table_names())

    for table in TARGET_OPERATIONAL_TABLES:
        if table not in existing_tables:
            continue
            
        columns = [c['name'] for c in inspector.get_columns(table)]
        if 'project_id' in columns:
            try:
                with op.get_context().begin_nested():
                    op.drop_constraint(f'fk_{table}_core_projects', table, type_='foreignkey')
            except Exception:
                pass
            try:
                with op.get_context().begin_nested():
                    op.drop_index(op.f(f'ix_{table}_project_id'), table_name=table)
                    op.drop_column(table, 'project_id')
            except Exception:
                pass