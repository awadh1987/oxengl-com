"""phase4_fleet_logistics

Revision ID: 46eaf23a1431
Revises: 202609060003
Create Date: 2026-09-06 05:28:54.436544+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '46eaf23a1431'
down_revision: Union[str, None] = '202609060003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. purchase_orders
    op.create_table(
        'purchase_orders',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('po_number', sa.String(length=64), nullable=False),
        sa.Column('partner_id', sa.UUID(), nullable=False),
        sa.Column('cost_center_id', sa.UUID(), nullable=True),
        sa.Column('order_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expected_delivery_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('subtotal', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('tax_amount', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'confirmed', 'received', 'billed', 'cancelled')", name='ck_purchase_order_status'),
        sa.CheckConstraint('subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0', name='ck_purchase_order_amounts'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['cost_center_id'], ['cost_centers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['partner_id'], ['res_partners.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_purchase_orders_company_id'), 'purchase_orders', ['company_id'], unique=False)
    op.create_index(op.f('ix_purchase_orders_cost_center_id'), 'purchase_orders', ['cost_center_id'], unique=False)
    op.create_index(op.f('ix_purchase_orders_partner_id'), 'purchase_orders', ['partner_id'], unique=False)
    op.create_index('uq_purchase_orders_company_number', 'purchase_orders', ['company_id', 'po_number'], unique=True)

    # 2. seasonal_crop_cycles
    op.create_table(
        'seasonal_crop_cycles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('product_id', sa.UUID(), nullable=True),
        sa.Column('cycle_season', sa.String(length=32), nullable=False),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('target_yield_tons', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('actual_yield_tons', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('cost_center_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("cycle_season IN ('winter', 'spring', 'summer', 'autumn', 'full_year')", name='ck_seasonal_crop_cycle_season'),
        sa.CheckConstraint("status IN ('planned', 'active', 'harvesting', 'completed', 'archived')", name='ck_seasonal_crop_cycle_status'),
        sa.CheckConstraint('end_date >= start_date', name='ck_seasonal_crop_cycle_dates'),
        sa.CheckConstraint('target_yield_tons >= 0 AND actual_yield_tons >= 0', name='ck_seasonal_crop_cycle_yields'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['cost_center_id'], ['cost_centers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['product_id'], ['product_products.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_seasonal_crop_cycles_company_id'), 'seasonal_crop_cycles', ['company_id'], unique=False)
    op.create_index(op.f('ix_seasonal_crop_cycles_cost_center_id'), 'seasonal_crop_cycles', ['cost_center_id'], unique=False)
    op.create_index(op.f('ix_seasonal_crop_cycles_product_id'), 'seasonal_crop_cycles', ['product_id'], unique=False)
    op.create_index('uq_seasonal_crop_cycles_company_code', 'seasonal_crop_cycles', ['company_id', 'code'], unique=True)

    # 3. vehicles
    op.create_table(
        'vehicles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('license_plate', sa.String(length=32), nullable=False),
        sa.Column('vin_chassis', sa.String(length=64), nullable=True),
        sa.Column('make', sa.String(length=64), nullable=True),
        sa.Column('model', sa.String(length=64), nullable=True),
        sa.Column('model_year', sa.Integer(), nullable=True),
        sa.Column('vehicle_type', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('current_odometer', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('fuel_capacity', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('transporter_id', sa.UUID(), nullable=True),
        sa.Column('cost_center_id', sa.UUID(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("status IN ('active', 'maintenance', 'breakdown', 'retired')", name='ck_vehicle_status'),
        sa.CheckConstraint("vehicle_type IN ('truck', 'trailer', 'pickup', 'tanker', 'forklift', 'heavy_machinery', 'other')", name='ck_vehicle_type'),
        sa.CheckConstraint('current_odometer >= 0', name='ck_vehicle_current_odometer'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['cost_center_id'], ['cost_centers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['transporter_id'], ['res_partners.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vehicles_company_id'), 'vehicles', ['company_id'], unique=False)
    op.create_index(op.f('ix_vehicles_cost_center_id'), 'vehicles', ['cost_center_id'], unique=False)
    op.create_index(op.f('ix_vehicles_license_plate'), 'vehicles', ['license_plate'], unique=False)
    op.create_index(op.f('ix_vehicles_transporter_id'), 'vehicles', ['transporter_id'], unique=False)
    op.create_index('uq_vehicles_company_license_plate', 'vehicles', ['company_id', 'license_plate'], unique=True)

    # 4. fuel_transactions
    op.create_table(
        'fuel_transactions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('transaction_number', sa.String(length=64), nullable=False),
        sa.Column('vehicle_id', sa.UUID(), nullable=False),
        sa.Column('driver_id', sa.UUID(), nullable=True),
        sa.Column('vendor_id', sa.UUID(), nullable=True),
        sa.Column('cost_center_id', sa.UUID(), nullable=True),
        sa.Column('transaction_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('liters', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('fuel_type', sa.String(length=32), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('odometer_reading', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("fuel_type IN ('diesel', 'gasoline_91', 'gasoline_95', 'cng', 'other')", name='ck_fuel_transaction_type'),
        sa.CheckConstraint('liters > 0', name='ck_fuel_transaction_liters'),
        sa.CheckConstraint('unit_price >= 0 AND total_amount >= 0', name='ck_fuel_transaction_amounts'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['cost_center_id'], ['cost_centers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['driver_id'], ['res_partners.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vendor_id'], ['res_partners.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fuel_transactions_company_id'), 'fuel_transactions', ['company_id'], unique=False)
    op.create_index(op.f('ix_fuel_transactions_cost_center_id'), 'fuel_transactions', ['cost_center_id'], unique=False)
    op.create_index(op.f('ix_fuel_transactions_driver_id'), 'fuel_transactions', ['driver_id'], unique=False)
    op.create_index('ix_fuel_transactions_vehicle_date', 'fuel_transactions', ['vehicle_id', 'transaction_date'], unique=False)
    op.create_index(op.f('ix_fuel_transactions_vehicle_id'), 'fuel_transactions', ['vehicle_id'], unique=False)
    op.create_index(op.f('ix_fuel_transactions_vendor_id'), 'fuel_transactions', ['vendor_id'], unique=False)
    op.create_index('uq_fuel_transactions_company_number', 'fuel_transactions', ['company_id', 'transaction_number'], unique=True)

    # 5. goods_receipts
    op.create_table(
        'goods_receipts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('gr_number', sa.String(length=64), nullable=False),
        sa.Column('purchase_order_id', sa.UUID(), nullable=False),
        sa.Column('picking_id', sa.UUID(), nullable=True),
        sa.Column('received_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('received_by_id', sa.UUID(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'inspected', 'accepted', 'rejected')", name='ck_goods_receipt_status'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['picking_id'], ['stock_pickings.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['purchase_order_id'], ['purchase_orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['received_by_id'], ['res_users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_goods_receipts_company_id'), 'goods_receipts', ['company_id'], unique=False)
    op.create_index(op.f('ix_goods_receipts_picking_id'), 'goods_receipts', ['picking_id'], unique=False)
    op.create_index(op.f('ix_goods_receipts_purchase_order_id'), 'goods_receipts', ['purchase_order_id'], unique=False)
    op.create_index(op.f('ix_goods_receipts_received_by_id'), 'goods_receipts', ['received_by_id'], unique=False)
    op.create_index('uq_goods_receipts_company_number', 'goods_receipts', ['company_id', 'gr_number'], unique=True)

    # 6. harvest_batches
    op.create_table(
        'harvest_batches',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('batch_number', sa.String(length=64), nullable=False),
        sa.Column('crop_cycle_id', sa.UUID(), nullable=False),
        sa.Column('location_id', sa.UUID(), nullable=True),
        sa.Column('harvest_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('gross_weight', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('tare_weight', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('net_weight', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('quality_grade', sa.String(length=16), nullable=False),
        sa.Column('moisture_percentage', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("quality_grade IN ('A', 'B', 'C', 'reject')", name='ck_harvest_batch_quality_grade'),
        sa.CheckConstraint("status IN ('harvested', 'inspected', 'stored', 'processed')", name='ck_harvest_batch_status'),
        sa.CheckConstraint('gross_weight >= 0 AND tare_weight >= 0 AND net_weight >= 0', name='ck_harvest_batch_weights'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['crop_cycle_id'], ['seasonal_crop_cycles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['location_id'], ['stock_locations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_harvest_batches_company_id'), 'harvest_batches', ['company_id'], unique=False)
    op.create_index(op.f('ix_harvest_batches_crop_cycle_id'), 'harvest_batches', ['crop_cycle_id'], unique=False)
    op.create_index(op.f('ix_harvest_batches_location_id'), 'harvest_batches', ['location_id'], unique=False)
    op.create_index('uq_harvest_batches_company_number', 'harvest_batches', ['company_id', 'batch_number'], unique=True)

    # 7. maintenance_work_orders
    op.create_table(
        'maintenance_work_orders',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('order_number', sa.String(length=64), nullable=False),
        sa.Column('vehicle_id', sa.UUID(), nullable=False),
        sa.Column('order_type', sa.String(length=32), nullable=False),
        sa.Column('priority', sa.String(length=16), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('odometer_reading', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('cost_center_id', sa.UUID(), nullable=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('total_parts_cost', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('total_labor_cost', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('total_cost', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('scheduled_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("order_type IN ('preventive', 'corrective', 'routine', 'emergency', 'inspection')", name='ck_maintenance_work_order_type'),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high', 'urgent')", name='ck_maintenance_work_order_priority'),
        sa.CheckConstraint("status IN ('draft', 'in_progress', 'awaiting_parts', 'completed', 'cancelled')", name='ck_maintenance_work_order_status'),
        sa.CheckConstraint('total_parts_cost >= 0 AND total_labor_cost >= 0 AND total_cost >= 0', name='ck_maintenance_work_order_costs'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['cost_center_id'], ['cost_centers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_maintenance_work_orders_company_id'), 'maintenance_work_orders', ['company_id'], unique=False)
    op.create_index(op.f('ix_maintenance_work_orders_cost_center_id'), 'maintenance_work_orders', ['cost_center_id'], unique=False)
    op.create_index(op.f('ix_maintenance_work_orders_order_number'), 'maintenance_work_orders', ['order_number'], unique=False)
    op.create_index(op.f('ix_maintenance_work_orders_vehicle_id'), 'maintenance_work_orders', ['vehicle_id'], unique=False)
    op.create_index('uq_maintenance_work_orders_company_number', 'maintenance_work_orders', ['company_id', 'order_number'], unique=True)

    # 8. farm_gate_weighments
    op.create_table(
        'farm_gate_weighments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('ticket_number', sa.String(length=64), nullable=False),
        sa.Column('harvest_batch_id', sa.UUID(), nullable=False),
        sa.Column('vehicle_id', sa.UUID(), nullable=True),
        sa.Column('transporter_id', sa.UUID(), nullable=True),
        sa.Column('farmer_id', sa.UUID(), nullable=True),
        sa.Column('weighment_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('gross_weight', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('tare_weight', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('net_weight', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('field_location_name', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('gross_weight >= 0 AND tare_weight >= 0 AND net_weight >= 0', name='ck_farm_gate_weighment_weights'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['farmer_id'], ['res_partners.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['harvest_batch_id'], ['harvest_batches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['transporter_id'], ['res_partners.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_farm_gate_weighments_company_id'), 'farm_gate_weighments', ['company_id'], unique=False)
    op.create_index(op.f('ix_farm_gate_weighments_farmer_id'), 'farm_gate_weighments', ['farmer_id'], unique=False)
    op.create_index(op.f('ix_farm_gate_weighments_harvest_batch_id'), 'farm_gate_weighments', ['harvest_batch_id'], unique=False)
    op.create_index(op.f('ix_farm_gate_weighments_transporter_id'), 'farm_gate_weighments', ['transporter_id'], unique=False)
    op.create_index(op.f('ix_farm_gate_weighments_vehicle_id'), 'farm_gate_weighments', ['vehicle_id'], unique=False)
    op.create_index('uq_farm_gate_weighments_company_ticket', 'farm_gate_weighments', ['company_id', 'ticket_number'], unique=True)

    # 9. part_requirements
    op.create_table(
        'part_requirements',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('work_order_id', sa.UUID(), nullable=False),
        sa.Column('product_id', sa.UUID(), nullable=False),
        sa.Column('quantity_required', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('quantity_used', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('unit_cost', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('total_cost', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('is_issued', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('quantity_required >= 0 AND quantity_used >= 0', name='ck_part_requirement_quantities'),
        sa.CheckConstraint('unit_cost >= 0 AND total_cost >= 0', name='ck_part_requirement_costs'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['product_id'], ['product_products.id']),
        sa.ForeignKeyConstraint(['work_order_id'], ['maintenance_work_orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_part_requirements_company_id'), 'part_requirements', ['company_id'], unique=False)
    op.create_index(op.f('ix_part_requirements_product_id'), 'part_requirements', ['product_id'], unique=False)
    op.create_index(op.f('ix_part_requirements_work_order_id'), 'part_requirements', ['work_order_id'], unique=False)

    # 10. supplier_invoices
    op.create_table(
        'supplier_invoices',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('invoice_number', sa.String(length=64), nullable=False),
        sa.Column('supplier_invoice_ref', sa.String(length=64), nullable=True),
        sa.Column('partner_id', sa.UUID(), nullable=False),
        sa.Column('purchase_order_id', sa.UUID(), nullable=True),
        sa.Column('goods_receipt_id', sa.UUID(), nullable=True),
        sa.Column('move_id', sa.UUID(), nullable=True),
        sa.Column('invoice_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('subtotal', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('tax_amount', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'approved', 'posted', 'paid', 'cancelled')", name='ck_supplier_invoice_status'),
        sa.CheckConstraint('subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0', name='ck_supplier_invoice_amounts'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['goods_receipt_id'], ['goods_receipts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['move_id'], ['account_moves.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['partner_id'], ['res_partners.id']),
        sa.ForeignKeyConstraint(['purchase_order_id'], ['purchase_orders.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('move_id')
    )
    op.create_index(op.f('ix_supplier_invoices_company_id'), 'supplier_invoices', ['company_id'], unique=False)
    op.create_index(op.f('ix_supplier_invoices_goods_receipt_id'), 'supplier_invoices', ['goods_receipt_id'], unique=False)
    op.create_index(op.f('ix_supplier_invoices_partner_id'), 'supplier_invoices', ['partner_id'], unique=False)
    op.create_index(op.f('ix_supplier_invoices_purchase_order_id'), 'supplier_invoices', ['purchase_order_id'], unique=False)
    op.create_index('uq_supplier_invoices_company_number', 'supplier_invoices', ['company_id', 'invoice_number'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_supplier_invoices_company_number', table_name='supplier_invoices')
    op.drop_index(op.f('ix_supplier_invoices_purchase_order_id'), table_name='supplier_invoices')
    op.drop_index(op.f('ix_supplier_invoices_partner_id'), table_name='supplier_invoices')
    op.drop_index(op.f('ix_supplier_invoices_goods_receipt_id'), table_name='supplier_invoices')
    op.drop_index(op.f('ix_supplier_invoices_company_id'), table_name='supplier_invoices')
    op.drop_table('supplier_invoices')

    op.drop_index(op.f('ix_part_requirements_work_order_id'), table_name='part_requirements')
    op.drop_index(op.f('ix_part_requirements_product_id'), table_name='part_requirements')
    op.drop_index(op.f('ix_part_requirements_company_id'), table_name='part_requirements')
    op.drop_table('part_requirements')

    op.drop_index('uq_farm_gate_weighments_company_ticket', table_name='farm_gate_weighments')
    op.drop_index(op.f('ix_farm_gate_weighments_vehicle_id'), table_name='farm_gate_weighments')
    op.drop_index(op.f('ix_farm_gate_weighments_transporter_id'), table_name='farm_gate_weighments')
    op.drop_index(op.f('ix_farm_gate_weighments_harvest_batch_id'), table_name='farm_gate_weighments')
    op.drop_index(op.f('ix_farm_gate_weighments_farmer_id'), table_name='farm_gate_weighments')
    op.drop_index(op.f('ix_farm_gate_weighments_company_id'), table_name='farm_gate_weighments')
    op.drop_table('farm_gate_weighments')

    op.drop_index('uq_maintenance_work_orders_company_number', table_name='maintenance_work_orders')
    op.drop_index(op.f('ix_maintenance_work_orders_vehicle_id'), table_name='maintenance_work_orders')
    op.drop_index(op.f('ix_maintenance_work_orders_order_number'), table_name='maintenance_work_orders')
    op.drop_index(op.f('ix_maintenance_work_orders_cost_center_id'), table_name='maintenance_work_orders')
    op.drop_index(op.f('ix_maintenance_work_orders_company_id'), table_name='maintenance_work_orders')
    op.drop_table('maintenance_work_orders')

    op.drop_index('uq_harvest_batches_company_number', table_name='harvest_batches')
    op.drop_index(op.f('ix_harvest_batches_location_id'), table_name='harvest_batches')
    op.drop_index(op.f('ix_harvest_batches_crop_cycle_id'), table_name='harvest_batches')
    op.drop_index(op.f('ix_harvest_batches_company_id'), table_name='harvest_batches')
    op.drop_table('harvest_batches')

    op.drop_index('uq_goods_receipts_company_number', table_name='goods_receipts')
    op.drop_index(op.f('ix_goods_receipts_received_by_id'), table_name='goods_receipts')
    op.drop_index(op.f('ix_goods_receipts_purchase_order_id'), table_name='goods_receipts')
    op.drop_index(op.f('ix_goods_receipts_picking_id'), table_name='goods_receipts')
    op.drop_index(op.f('ix_goods_receipts_company_id'), table_name='goods_receipts')
    op.drop_table('goods_receipts')

    op.drop_index('uq_fuel_transactions_company_number', table_name='fuel_transactions')
    op.drop_index(op.f('ix_fuel_transactions_vendor_id'), table_name='fuel_transactions')
    op.drop_index(op.f('ix_fuel_transactions_vehicle_id'), table_name='fuel_transactions')
    op.drop_index('ix_fuel_transactions_vehicle_date', table_name='fuel_transactions')
    op.drop_index(op.f('ix_fuel_transactions_driver_id'), table_name='fuel_transactions')
    op.drop_index(op.f('ix_fuel_transactions_cost_center_id'), table_name='fuel_transactions')
    op.drop_index(op.f('ix_fuel_transactions_company_id'), table_name='fuel_transactions')
    op.drop_table('fuel_transactions')

    op.drop_index('uq_vehicles_company_license_plate', table_name='vehicles')
    op.drop_index(op.f('ix_vehicles_transporter_id'), table_name='vehicles')
    op.drop_index(op.f('ix_vehicles_license_plate'), table_name='vehicles')
    op.drop_index(op.f('ix_vehicles_cost_center_id'), table_name='vehicles')
    op.drop_index(op.f('ix_vehicles_company_id'), table_name='vehicles')
    op.drop_table('vehicles')

    op.drop_index('uq_seasonal_crop_cycles_company_code', table_name='seasonal_crop_cycles')
    op.drop_index(op.f('ix_seasonal_crop_cycles_product_id'), table_name='seasonal_crop_cycles')
    op.drop_index(op.f('ix_seasonal_crop_cycles_cost_center_id'), table_name='seasonal_crop_cycles')
    op.drop_index(op.f('ix_seasonal_crop_cycles_company_id'), table_name='seasonal_crop_cycles')
    op.drop_table('seasonal_crop_cycles')

    op.drop_index('uq_purchase_orders_company_number', table_name='purchase_orders')
    op.drop_index(op.f('ix_purchase_orders_partner_id'), table_name='purchase_orders')
    op.drop_index(op.f('ix_purchase_orders_cost_center_id'), table_name='purchase_orders')
    op.drop_index(op.f('ix_purchase_orders_company_id'), table_name='purchase_orders')
    op.drop_table('purchase_orders')
