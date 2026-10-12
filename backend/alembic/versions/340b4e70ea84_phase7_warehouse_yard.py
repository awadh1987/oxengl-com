"""phase7_warehouse_yard

Revision ID: 340b4e70ea84
Revises: b8dd4d4fec5f
Create Date: 2026-09-06 07:55:47.805040+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '340b4e70ea84'
down_revision: Union[str, None] = 'b8dd4d4fec5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. warehouses
    op.create_table(
        'warehouses',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('address', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_warehouses_code'), 'warehouses', ['code'], unique=False)
    op.create_index(op.f('ix_warehouses_company_id'), 'warehouses', ['company_id'], unique=False)
    op.create_index('uq_warehouses_company_code', 'warehouses', ['company_id', 'code'], unique=True)

    # 2. warehouse_zones
    op.create_table(
        'warehouse_zones',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('warehouse_id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('zone_type', sa.String(length=32), nullable=False, server_default='storage'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            "zone_type IN ('receiving', 'storage', 'picking', 'staging', 'cold_storage', 'hazardous', 'quarantine')",
            name='ck_warehouse_zone_type'
        ),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['warehouse_id'], ['warehouses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_warehouse_zones_company_id'), 'warehouse_zones', ['company_id'], unique=False)
    op.create_index(op.f('ix_warehouse_zones_warehouse_id'), 'warehouse_zones', ['warehouse_id'], unique=False)
    op.create_index('uq_warehouse_zones_warehouse_code', 'warehouse_zones', ['warehouse_id', 'code'], unique=True)

    # 3. stock_items
    op.create_table(
        'stock_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('product_id', sa.UUID(), nullable=False),
        sa.Column('sku', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('base_uom', sa.String(length=32), nullable=False, server_default='kg'),
        sa.Column('secondary_uom', sa.String(length=32), nullable=True),
        sa.Column('conversion_factor', sa.Numeric(precision=14, scale=4), nullable=False, server_default='1.0000'),
        sa.Column('reorder_point', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0.00'),
        sa.Column('maximum_stock', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0.00'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('conversion_factor > 0', name='ck_stock_item_conversion_factor'),
        sa.CheckConstraint('maximum_stock >= 0', name='ck_stock_item_maximum_stock'),
        sa.CheckConstraint('reorder_point >= 0', name='ck_stock_item_reorder_point'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['product_id'], ['product_products.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stock_items_company_id'), 'stock_items', ['company_id'], unique=False)
    op.create_index(op.f('ix_stock_items_product_id'), 'stock_items', ['product_id'], unique=False)
    op.create_index(op.f('ix_stock_items_sku'), 'stock_items', ['sku'], unique=False)
    op.create_index('uq_stock_items_company_product', 'stock_items', ['company_id', 'product_id'], unique=True)
    op.create_index('uq_stock_items_company_sku', 'stock_items', ['company_id', 'sku'], unique=True)

    # 4. stock_lots
    op.create_table(
        'stock_lots',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('stock_item_id', sa.UUID(), nullable=False),
        sa.Column('lot_number', sa.String(length=64), nullable=False),
        sa.Column('harvest_batch_id', sa.UUID(), nullable=True),
        sa.Column('initial_quantity', sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column('remaining_quantity', sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column('unit_cost', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('received_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expiration_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("status IN ('active', 'depleted', 'quarantined', 'expired')", name='ck_stock_lot_status'),
        sa.CheckConstraint('initial_quantity >= 0', name='ck_stock_lot_initial_quantity'),
        sa.CheckConstraint('remaining_quantity <= initial_quantity', name='ck_stock_lot_remaining_le_initial'),
        sa.CheckConstraint('remaining_quantity >= 0', name='ck_stock_lot_remaining_quantity'),
        sa.CheckConstraint('unit_cost >= 0', name='ck_stock_lot_unit_cost'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['harvest_batch_id'], ['harvest_batches.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['stock_item_id'], ['stock_items.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stock_lots_company_id'), 'stock_lots', ['company_id'], unique=False)
    op.create_index('ix_stock_lots_fifo_lookup', 'stock_lots', ['company_id', 'stock_item_id', 'status', 'received_date'], unique=False)
    op.create_index(op.f('ix_stock_lots_harvest_batch_id'), 'stock_lots', ['harvest_batch_id'], unique=False)
    op.create_index(op.f('ix_stock_lots_lot_number'), 'stock_lots', ['lot_number'], unique=False)
    op.create_index(op.f('ix_stock_lots_stock_item_id'), 'stock_lots', ['stock_item_id'], unique=False)
    op.create_index('uq_stock_lots_company_item_lot', 'stock_lots', ['company_id', 'stock_item_id', 'lot_number'], unique=True)

    # 5. stock_movements
    op.create_table(
        'stock_movements',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('movement_number', sa.String(length=64), nullable=False),
        sa.Column('stock_item_id', sa.UUID(), nullable=False),
        sa.Column('lot_id', sa.UUID(), nullable=True),
        sa.Column('warehouse_id', sa.UUID(), nullable=False),
        sa.Column('zone_id', sa.UUID(), nullable=True),
        sa.Column('movement_type', sa.String(length=32), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column('unit_cost', sa.Numeric(precision=18, scale=4), nullable=False, server_default='0.0000'),
        sa.Column('reference_type', sa.String(length=64), nullable=True),
        sa.Column('reference_id', sa.String(length=128), nullable=True),
        sa.Column('performed_by_id', sa.UUID(), nullable=True),
        sa.Column('balance_after', sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("movement_type IN ('inbound', 'outbound', 'transfer', 'adjustment', 'scrap')", name='ck_stock_movement_type'),
        sa.CheckConstraint('balance_after >= 0', name='ck_stock_movement_balance_after_non_negative'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['lot_id'], ['stock_lots.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['performed_by_id'], ['res_users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['stock_item_id'], ['stock_items.id']),
        sa.ForeignKeyConstraint(['warehouse_id'], ['warehouses.id']),
        sa.ForeignKeyConstraint(['zone_id'], ['warehouse_zones.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stock_movements_company_id'), 'stock_movements', ['company_id'], unique=False)
    op.create_index('ix_stock_movements_item_created', 'stock_movements', ['company_id', 'stock_item_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_stock_movements_lot_id'), 'stock_movements', ['lot_id'], unique=False)
    op.create_index(op.f('ix_stock_movements_movement_number'), 'stock_movements', ['movement_number'], unique=False)
    op.create_index(op.f('ix_stock_movements_performed_by_id'), 'stock_movements', ['performed_by_id'], unique=False)
    op.create_index(op.f('ix_stock_movements_stock_item_id'), 'stock_movements', ['stock_item_id'], unique=False)
    op.create_index(op.f('ix_stock_movements_warehouse_id'), 'stock_movements', ['warehouse_id'], unique=False)
    op.create_index(op.f('ix_stock_movements_zone_id'), 'stock_movements', ['zone_id'], unique=False)
    op.create_index('uq_stock_movements_company_number', 'stock_movements', ['company_id', 'movement_number'], unique=True)

    # 6. yard_gate_appointments
    op.create_table(
        'yard_gate_appointments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('appointment_number', sa.String(length=64), nullable=False),
        sa.Column('warehouse_id', sa.UUID(), nullable=False),
        sa.Column('vehicle_id', sa.UUID(), nullable=True),
        sa.Column('transporter_id', sa.UUID(), nullable=True),
        sa.Column('driver_name', sa.String(length=128), nullable=True),
        sa.Column('driver_phone', sa.String(length=32), nullable=True),
        sa.Column('scheduled_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('arrival_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('gate_in_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('gate_out_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('waiting_area', sa.String(length=64), nullable=True),
        sa.Column('loading_slot', sa.String(length=64), nullable=True),
        sa.Column('purpose', sa.String(length=32), nullable=False, server_default='inbound_unloading'),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='scheduled'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("purpose IN ('inbound_unloading', 'outbound_loading', 'cross_dock', 'inspection')", name='ck_yard_gate_purpose'),
        sa.CheckConstraint("status IN ('scheduled', 'arrived_waiting', 'docked', 'processing', 'completed', 'cancelled', 'no_show')", name='ck_yard_gate_status'),
        sa.ForeignKeyConstraint(['company_id'], ['res_companies.id']),
        sa.ForeignKeyConstraint(['transporter_id'], ['res_partners.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['warehouse_id'], ['warehouses.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_yard_gate_appointments_appointment_number'), 'yard_gate_appointments', ['appointment_number'], unique=False)
    op.create_index(op.f('ix_yard_gate_appointments_company_id'), 'yard_gate_appointments', ['company_id'], unique=False)
    op.create_index(op.f('ix_yard_gate_appointments_transporter_id'), 'yard_gate_appointments', ['transporter_id'], unique=False)
    op.create_index(op.f('ix_yard_gate_appointments_vehicle_id'), 'yard_gate_appointments', ['vehicle_id'], unique=False)
    op.create_index(op.f('ix_yard_gate_appointments_warehouse_id'), 'yard_gate_appointments', ['warehouse_id'], unique=False)
    op.create_index('ix_yard_gate_schedule', 'yard_gate_appointments', ['company_id', 'warehouse_id', 'scheduled_time'], unique=False)
    op.create_index('uq_yard_gate_company_number', 'yard_gate_appointments', ['company_id', 'appointment_number'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_yard_gate_company_number', table_name='yard_gate_appointments')
    op.drop_index('ix_yard_gate_schedule', table_name='yard_gate_appointments')
    op.drop_index(op.f('ix_yard_gate_appointments_warehouse_id'), table_name='yard_gate_appointments')
    op.drop_index(op.f('ix_yard_gate_appointments_vehicle_id'), table_name='yard_gate_appointments')
    op.drop_index(op.f('ix_yard_gate_appointments_transporter_id'), table_name='yard_gate_appointments')
    op.drop_index(op.f('ix_yard_gate_appointments_company_id'), table_name='yard_gate_appointments')
    op.drop_index(op.f('ix_yard_gate_appointments_appointment_number'), table_name='yard_gate_appointments')
    op.drop_table('yard_gate_appointments')

    op.drop_index('uq_stock_movements_company_number', table_name='stock_movements')
    op.drop_index(op.f('ix_stock_movements_zone_id'), table_name='stock_movements')
    op.drop_index(op.f('ix_stock_movements_warehouse_id'), table_name='stock_movements')
    op.drop_index(op.f('ix_stock_movements_stock_item_id'), table_name='stock_movements')
    op.drop_index(op.f('ix_stock_movements_performed_by_id'), table_name='stock_movements')
    op.drop_index(op.f('ix_stock_movements_movement_number'), table_name='stock_movements')
    op.drop_index(op.f('ix_stock_movements_lot_id'), table_name='stock_movements')
    op.drop_index('ix_stock_movements_item_created', table_name='stock_movements')
    op.drop_index(op.f('ix_stock_movements_company_id'), table_name='stock_movements')
    op.drop_table('stock_movements')

    op.drop_index('uq_stock_lots_company_item_lot', table_name='stock_lots')
    op.drop_index(op.f('ix_stock_lots_stock_item_id'), table_name='stock_lots')
    op.drop_index(op.f('ix_stock_lots_lot_number'), table_name='stock_lots')
    op.drop_index(op.f('ix_stock_lots_harvest_batch_id'), table_name='stock_lots')
    op.drop_index('ix_stock_lots_fifo_lookup', table_name='stock_lots')
    op.drop_index(op.f('ix_stock_lots_company_id'), table_name='stock_lots')
    op.drop_table('stock_lots')

    op.drop_index('uq_stock_items_company_sku', table_name='stock_items')
    op.drop_index('uq_stock_items_company_product', table_name='stock_items')
    op.drop_index(op.f('ix_stock_items_sku'), table_name='stock_items')
    op.drop_index(op.f('ix_stock_items_product_id'), table_name='stock_items')
    op.drop_index(op.f('ix_stock_items_company_id'), table_name='stock_items')
    op.drop_table('stock_items')

    op.drop_index('uq_warehouse_zones_warehouse_code', table_name='warehouse_zones')
    op.drop_index(op.f('ix_warehouse_zones_warehouse_id'), table_name='warehouse_zones')
    op.drop_index(op.f('ix_warehouse_zones_company_id'), table_name='warehouse_zones')
    op.drop_table('warehouse_zones')

    op.drop_index('uq_warehouses_company_code', table_name='warehouses')
    op.drop_index(op.f('ix_warehouses_company_id'), table_name='warehouses')
    op.drop_index(op.f('ix_warehouses_code'), table_name='warehouses')
    op.drop_table('warehouses')
