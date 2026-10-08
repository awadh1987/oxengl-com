"""initial ERP schema

Revision ID: 202609060001
Revises:
Create Date: 2026-09-06 00:00:01 UTC
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202609060001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def timestamp_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade_existing_schema() -> None:
    op.execute("ALTER TABLE res_users ADD COLUMN IF NOT EXISTS phone VARCHAR(64)")
    op.execute("ALTER TABLE res_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)")
    op.execute("UPDATE res_users SET password_hash = '' WHERE password_hash IS NULL")
    op.execute("ALTER TABLE res_users ALTER COLUMN password_hash SET NOT NULL")
    op.execute("ALTER TABLE platform_audit_logs ADD COLUMN IF NOT EXISTS outcome VARCHAR(40) NOT NULL DEFAULT 'SUCCESS'")
    op.execute("ALTER TABLE platform_audit_logs ADD COLUMN IF NOT EXISTS request_id VARCHAR(64)")
    op.execute("ALTER TABLE platform_audit_logs ADD COLUMN IF NOT EXISTS user_agent VARCHAR(512)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_platform_audit_logs_outcome ON platform_audit_logs (outcome)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_platform_audit_logs_request_id ON platform_audit_logs (request_id)")


def upgrade() -> None:
    existing_tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "res_companies" in existing_tables:
        upgrade_existing_schema()
        return

    op.create_table(
        "res_companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("tax_id", sa.String(length=64), nullable=True),
        sa.Column("commercial_registration", sa.String(length=10), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("subscription_tier", sa.String(length=32), nullable=False),
        sa.Column("license_key", sa.String(length=64), nullable=True),
        sa.Column("license_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_cost_centers", sa.Integer(), nullable=False),
        sa.Column("theme_mode", sa.String(length=16), nullable=False),
        sa.Column("ui_primary_color", sa.String(length=9), nullable=False),
        sa.Column("ui_secondary_color", sa.String(length=9), nullable=False),
        sa.Column("ui_logo_url", sa.Text(), nullable=True),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("commercial_registration"),
        sa.UniqueConstraint("license_key"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("slug"),
        sa.UniqueConstraint("tax_id"),
    )
    op.create_index(op.f("ix_res_companies_slug"), "res_companies", ["slug"], unique=False)

    op.create_table(
        "res_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("firebase_uid", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("role IN ('Super_Admin', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest')", name="ck_res_user_role"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("firebase_uid"),
    )
    op.create_index(op.f("ix_res_users_company_id"), "res_users", ["company_id"], unique=False)
    op.create_index(op.f("ix_res_users_email"), "res_users", ["email"], unique=False)
    op.create_index(op.f("ix_res_users_firebase_uid"), "res_users", ["firebase_uid"], unique=False)

    op.create_table(
        "platform_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_email", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("outcome", sa.String(length=40), nullable=False),
        sa.Column("endpoint_accessed", sa.String(length=255), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_platform_audit_logs_action"), "platform_audit_logs", ["action"], unique=False)
    op.create_index(op.f("ix_platform_audit_logs_actor_email"), "platform_audit_logs", ["actor_email"], unique=False)
    op.create_index(op.f("ix_platform_audit_logs_company_id"), "platform_audit_logs", ["company_id"], unique=False)
    op.create_index(op.f("ix_platform_audit_logs_created_at"), "platform_audit_logs", ["created_at"], unique=False)
    op.create_index(op.f("ix_platform_audit_logs_outcome"), "platform_audit_logs", ["outcome"], unique=False)
    op.create_index(op.f("ix_platform_audit_logs_request_id"), "platform_audit_logs", ["request_id"], unique=False)

    op.create_table(
        "res_partners",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("partner_type", sa.String(length=32), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("tax_number", sa.String(length=64), nullable=True),
        sa.Column("commercial_registration", sa.String(length=64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("partner_type IN ('raw_materials_supplier', 'service_supplier', 'customer', 'internal', 'supplier', 'transporter', 'employee', 'other')", name="ck_partner_type"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("tax_number"),
    )
    op.create_index(op.f("ix_res_partners_company_id"), "res_partners", ["company_id"], unique=False)
    op.create_index(op.f("ix_res_partners_name"), "res_partners", ["name"], unique=False)

    op.create_table(
        "stock_locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("location_type", sa.String(length=32), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("location_type IN ('supplier', 'internal', 'customer', 'inventory', 'production', 'transit')", name="ck_stock_location_type"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.ForeignKeyConstraint(["parent_id"], ["stock_locations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stock_locations_company_id"), "stock_locations", ["company_id"], unique=False)
    op.create_index("ix_stock_locations_parent_name", "stock_locations", ["parent_id", "name"], unique=False)

    op.create_table(
        "product_products",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("product_type", sa.String(length=32), nullable=False),
        sa.Column("unit_of_measure", sa.String(length=32), nullable=False),
        sa.Column("standard_cost", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("sale_price", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("product_type IN ('storable', 'consumable', 'service')", name="ck_product_type"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku"),
    )
    op.create_index(op.f("ix_product_products_company_id"), "product_products", ["company_id"], unique=False)
    op.create_index(op.f("ix_product_products_name"), "product_products", ["name"], unique=False)

    op.create_table(
        "stock_pickings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reference", sa.String(length=64), nullable=False),
        sa.Column("picking_type", sa.String(length=32), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.CheckConstraint("picking_type IN ('incoming', 'outgoing', 'internal')", name="ck_picking_type"),
        sa.CheckConstraint("state IN ('draft', 'confirmed', 'assigned', 'done', 'cancelled')", name="ck_picking_state"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.ForeignKeyConstraint(["partner_id"], ["res_partners.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reference"),
    )
    op.create_index(op.f("ix_stock_pickings_company_id"), "stock_pickings", ["company_id"], unique=False)
    op.create_index("ix_stock_pickings_state_scheduled", "stock_pickings", ["state", "scheduled_at"], unique=False)

    op.create_table(
        "stock_moves",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("picking_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_dest_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity_planned", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("quantity_done", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("moved_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.CheckConstraint("quantity_done >= 0", name="ck_stock_move_quantity_done"),
        sa.CheckConstraint("quantity_planned >= 0", name="ck_stock_move_quantity_planned"),
        sa.CheckConstraint("location_id <> location_dest_id", name="ck_stock_move_distinct_locations"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.ForeignKeyConstraint(["location_dest_id"], ["stock_locations.id"]),
        sa.ForeignKeyConstraint(["location_id"], ["stock_locations.id"]),
        sa.ForeignKeyConstraint(["picking_id"], ["stock_pickings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["product_products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stock_moves_company_id"), "stock_moves", ["company_id"], unique=False)
    op.create_index(op.f("ix_stock_moves_picking_id"), "stock_moves", ["picking_id"], unique=False)
    op.create_index("ix_stock_moves_product_state", "stock_moves", ["product_id", "state"], unique=False)

    op.create_table(
        "stock_quants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("reserved_quantity", sa.Numeric(precision=18, scale=4), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("reserved_quantity >= 0", name="ck_stock_quant_reserved"),
        sa.CheckConstraint("reserved_quantity = 0 OR (quantity >= 0 AND reserved_quantity <= quantity)", name="ck_stock_quant_reserved_available"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.ForeignKeyConstraint(["location_id"], ["stock_locations.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["product_products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stock_quants_company_id"), "stock_quants", ["company_id"], unique=False)
    op.create_index("uq_stock_quant_product_location", "stock_quants", ["product_id", "location_id"], unique=True)

    op.create_table(
        "weighbridge_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ticket_number", sa.String(length=64), nullable=False),
        sa.Column("picking_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("truck_number", sa.String(length=64), nullable=False),
        sa.Column("gross_weight", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("tare_weight", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("net_weight", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("weighed_in_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("weighed_out_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.CheckConstraint("gross_weight >= tare_weight", name="ck_ticket_gross_weight"),
        sa.CheckConstraint("net_weight = gross_weight - tare_weight", name="ck_ticket_net_weight"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.ForeignKeyConstraint(["picking_id"], ["stock_pickings.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticket_number"),
    )
    op.create_index(op.f("ix_weighbridge_tickets_company_id"), "weighbridge_tickets", ["company_id"], unique=False)
    op.create_index(op.f("ix_weighbridge_tickets_picking_id"), "weighbridge_tickets", ["picking_id"], unique=False)
    op.create_index(op.f("ix_weighbridge_tickets_truck_number"), "weighbridge_tickets", ["truck_number"], unique=False)
    op.create_index("ix_weighbridge_tickets_truck_weighed_in", "weighbridge_tickets", ["truck_number", "weighed_in_at"], unique=False)

    op.create_table(
        "transporter_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transporter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_id", sa.String(length=64), nullable=False),
        sa.Column("expected_qty", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("delivered_qty", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("loss_percentage", sa.Numeric(precision=7, scale=4), nullable=False),
        sa.Column("ai_risk_assessment", sa.Text(), nullable=True),
        *timestamp_columns(),
        sa.CheckConstraint("delivered_qty >= 0", name="ck_transporter_ledger_delivered"),
        sa.CheckConstraint("expected_qty >= 0", name="ck_transporter_ledger_expected"),
        sa.CheckConstraint("loss_percentage >= 0 AND loss_percentage <= 100", name="ck_transporter_ledger_loss"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.ForeignKeyConstraint(["transporter_id"], ["res_partners.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("operation_id"),
    )
    op.create_index(op.f("ix_transporter_ledger_company_id"), "transporter_ledger", ["company_id"], unique=False)
    op.create_index("ix_transporter_ledger_transporter_created", "transporter_ledger", ["transporter_id", "created_at"], unique=False)

    op.create_table(
        "account_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("internal_type", sa.String(length=16), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("internal_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')", name="ck_account_internal_type"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_account_accounts_company_id"), "account_accounts", ["company_id"], unique=False)
    op.create_index("uq_account_accounts_company_code", "account_accounts", ["company_id", "code"], unique=True)

    op.create_table(
        "account_moves",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("move_type", sa.String(length=16), nullable=False),
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("date", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("ref", sa.String(length=128), nullable=True),
        *timestamp_columns(),
        sa.CheckConstraint("move_type IN ('entry', 'out_invoice', 'in_invoice', 'settlement')", name="ck_account_move_type"),
        sa.CheckConstraint("state IN ('draft', 'posted', 'canceled')", name="ck_account_move_state"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.ForeignKeyConstraint(["partner_id"], ["res_partners.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_account_moves_company_id"), "account_moves", ["company_id"], unique=False)
    op.create_index("ix_account_moves_company_date", "account_moves", ["company_id", "date"], unique=False)
    op.create_index("uq_account_moves_company_name", "account_moves", ["company_id", "name"], unique=True)

    op.create_table(
        "account_move_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("move_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("debit", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("credit", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.CheckConstraint("debit = 0 OR credit = 0", name="ck_account_move_line_single_side"),
        sa.CheckConstraint("debit >= 0 AND credit >= 0", name="ck_account_move_line_amounts"),
        sa.ForeignKeyConstraint(["account_id"], ["account_accounts.id"]),
        sa.ForeignKeyConstraint(["move_id"], ["account_moves.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["partner_id"], ["res_partners.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_account_move_lines_move_id"), "account_move_lines", ["move_id"], unique=False)

    op.create_table(
        "supplier_settlements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("move_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("total_gross_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("total_penalties_loss", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("net_payable", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("period_end >= period_start", name="ck_supplier_settlement_period"),
        sa.CheckConstraint("state IN ('draft', 'approved', 'paid')", name="ck_supplier_settlement_state"),
        sa.CheckConstraint("total_gross_amount >= 0 AND total_penalties_loss >= 0 AND net_payable >= 0", name="ck_supplier_settlement_amounts"),
        sa.ForeignKeyConstraint(["company_id"], ["res_companies.id"]),
        sa.ForeignKeyConstraint(["move_id"], ["account_moves.id"]),
        sa.ForeignKeyConstraint(["partner_id"], ["res_partners.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("move_id"),
    )
    op.create_index(op.f("ix_supplier_settlements_company_id"), "supplier_settlements", ["company_id"], unique=False)
    op.create_index("ix_supplier_settlements_company_partner_period", "supplier_settlements", ["company_id", "partner_id", "period_start", "period_end"], unique=False)


def downgrade() -> None:
    op.drop_table("supplier_settlements")
    op.drop_table("account_move_lines")
    op.drop_table("account_moves")
    op.drop_table("account_accounts")
    op.drop_table("transporter_ledger")
    op.drop_table("weighbridge_tickets")
    op.drop_table("stock_quants")
    op.drop_table("stock_moves")
    op.drop_table("stock_pickings")
    op.drop_table("product_products")
    op.drop_table("stock_locations")
    op.drop_table("res_partners")
    op.drop_table("platform_audit_logs")
    op.drop_table("res_users")
    op.drop_table("res_companies")
