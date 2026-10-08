"""extend weighbridge tickets with legacy superset fields

Revision ID: 202609220001
Revises: 202609210002
Create Date: 2026-09-22 02:40:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "202609220001"
down_revision = "202609210002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("weighbridge_tickets", sa.Column("material_supplier_name", sa.String(length=255), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("service_supplier_name", sa.String(length=255), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("destination_customer_name", sa.String(length=255), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("loading_invoice_no", sa.String(length=128), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("receipt_invoice_no", sa.String(length=128), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("material_type", sa.String(length=255), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("qty_loaded", sa.Numeric(precision=18, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("qty_delivered", sa.Numeric(precision=18, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("qty_wastage", sa.Numeric(precision=18, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("wastage_percentage", sa.Numeric(precision=7, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("sales_amount", sa.Numeric(precision=18, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("vat_amount", sa.Numeric(precision=18, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("total_sales", sa.Numeric(precision=18, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("purchases_cost", sa.Numeric(precision=18, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("crusher_payment", sa.Numeric(precision=18, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("net_profit", sa.Numeric(precision=18, scale=4), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("operation_month", sa.Integer(), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("operation_year", sa.Integer(), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("weighbridge_tickets", sa.Column("raw_legacy_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'{}'::jsonb")))


def downgrade() -> None:
    op.drop_column("weighbridge_tickets", "raw_legacy_data")
    op.drop_column("weighbridge_tickets", "notes")
    op.drop_column("weighbridge_tickets", "operation_year")
    op.drop_column("weighbridge_tickets", "operation_month")
    op.drop_column("weighbridge_tickets", "net_profit")
    op.drop_column("weighbridge_tickets", "crusher_payment")
    op.drop_column("weighbridge_tickets", "purchases_cost")
    op.drop_column("weighbridge_tickets", "total_sales")
    op.drop_column("weighbridge_tickets", "vat_amount")
    op.drop_column("weighbridge_tickets", "sales_amount")
    op.drop_column("weighbridge_tickets", "wastage_percentage")
    op.drop_column("weighbridge_tickets", "qty_wastage")
    op.drop_column("weighbridge_tickets", "qty_delivered")
    op.drop_column("weighbridge_tickets", "qty_loaded")
    op.drop_column("weighbridge_tickets", "material_type")
    op.drop_column("weighbridge_tickets", "receipt_invoice_no")
    op.drop_column("weighbridge_tickets", "loading_invoice_no")
    op.drop_column("weighbridge_tickets", "destination_customer_name")
    op.drop_column("weighbridge_tickets", "service_supplier_name")
    op.drop_column("weighbridge_tickets", "material_supplier_name")
