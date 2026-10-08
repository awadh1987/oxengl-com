"""Financial engine: subledger, fiscal years, cost centers, account moves extensions, and customer invoices

Revision ID: 202609060003
Revises: 202609060002
Create Date: 2026-09-06 00:00:03 UTC
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202609060003"
down_revision: Union[str, None] = "202609060002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def timestamp_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_tables = set(insp.get_table_names())

    # 1. account_journals
    if "account_journals" not in existing_tables:
        op.create_table(
            "account_journals",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("res_companies.id"), nullable=False, index=True),
            sa.Column("code", sa.String(length=16), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("journal_type", sa.String(length=32), nullable=False, server_default="general"),
            sa.Column("sequence_prefix", sa.String(length=24), nullable=False, server_default="MISC"),
            sa.Column("next_sequence", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            *timestamp_columns(),
            sa.CheckConstraint("journal_type IN ('general', 'sale', 'purchase', 'cash', 'bank')", name="ck_account_journal_type"),
        )
        op.create_index("uq_account_journals_company_code", "account_journals", ["company_id", "code"], unique=True)

    # 2. fiscal_years
    if "fiscal_years" not in existing_tables:
        op.create_table(
            "fiscal_years",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("res_companies.id"), nullable=False, index=True),
            sa.Column("name", sa.String(length=64), nullable=False),
            sa.Column("date_start", sa.DateTime(timezone=True), nullable=False),
            sa.Column("date_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("state", sa.String(length=16), nullable=False, server_default="open"),
            *timestamp_columns(),
            sa.CheckConstraint("date_end >= date_start", name="ck_fiscal_year_dates"),
            sa.CheckConstraint("state IN ('open', 'closed', 'locked')", name="ck_fiscal_year_state"),
        )
        op.create_index("uq_fiscal_years_company_name", "fiscal_years", ["company_id", "name"], unique=True)

    # 3. cost_centers
    if "cost_centers" in existing_tables:
        columns = [c["name"] for c in insp.get_columns("cost_centers")]
        if "company_id" not in columns:
            op.execute("DROP TABLE cost_centers CASCADE")
            existing_tables.remove("cost_centers")

    if "cost_centers" not in existing_tables:
        op.create_table(
            "cost_centers",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("res_companies.id"), nullable=False, index=True),
            sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("code", sa.String(length=32), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            *timestamp_columns(),
        )
        op.create_index("uq_cost_centers_company_code", "cost_centers", ["company_id", "code"], unique=True)

    # 4. account_moves columns
    move_columns = {c["name"] for c in insp.get_columns("account_moves")}
    if "journal_id" not in move_columns:
        op.add_column("account_moves", sa.Column("journal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("account_journals.id"), nullable=True))
        op.create_index(op.f("ix_account_moves_journal_id"), "account_moves", ["journal_id"], unique=False)
    if "fiscal_year_id" not in move_columns:
        op.add_column("account_moves", sa.Column("fiscal_year_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fiscal_years.id"), nullable=True))
        op.create_index(op.f("ix_account_moves_fiscal_year_id"), "account_moves", ["fiscal_year_id"], unique=False)
    if "sequence_number" not in move_columns:
        op.add_column("account_moves", sa.Column("sequence_number", sa.Integer(), nullable=True))
    if "cost_center_id" not in move_columns:
        op.add_column("account_moves", sa.Column("cost_center_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True))
    if "posted_at" not in move_columns:
        op.add_column("account_moves", sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True))

    # 5. account_move_lines columns
    line_columns = {c["name"] for c in insp.get_columns("account_move_lines")}
    if "company_id" not in line_columns:
        op.add_column("account_move_lines", sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("res_companies.id"), nullable=True))
        # Backfill company_id from parent move if moves exist
        op.execute("UPDATE account_move_lines SET company_id = account_moves.company_id FROM account_moves WHERE account_move_lines.move_id = account_moves.id")
        op.alter_column("account_move_lines", "company_id", nullable=False)
        op.create_index(op.f("ix_account_move_lines_company_id"), "account_move_lines", ["company_id"], unique=False)
    if "cost_center_id" not in line_columns:
        op.add_column("account_move_lines", sa.Column("cost_center_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True))

    # 6. customer_invoices
    if "customer_invoices" not in existing_tables:
        op.create_table(
            "customer_invoices",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("res_companies.id"), nullable=False, index=True),
            sa.Column("partner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("res_partners.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("move_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("account_moves.id", ondelete="SET NULL"), nullable=True, unique=True),
            sa.Column("invoice_number", sa.String(length=64), nullable=False),
            sa.Column("customer_name", sa.String(length=255), nullable=False),
            sa.Column("customer_tax_number", sa.String(length=64), nullable=True),
            sa.Column("issue_date", sa.DateTime(timezone=True), nullable=False),
            sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="Draft"),
            sa.Column("subtotal", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
            sa.Column("vat_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
            sa.Column("grand_total", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
            sa.Column("approved_by", sa.String(length=255), nullable=True),
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
            *timestamp_columns(),
            sa.CheckConstraint("status IN ('Draft', 'Approved', 'Issued', 'Cancelled')", name="ck_customer_invoice_status"),
            sa.CheckConstraint("subtotal >= 0 AND vat_amount >= 0 AND grand_total >= 0", name="ck_customer_invoice_amounts"),
        )
        op.create_index("uq_customer_invoices_company_number", "customer_invoices", ["company_id", "invoice_number"], unique=True)


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_tables = set(insp.get_table_names())

    if "customer_invoices" in existing_tables:
        op.drop_table("customer_invoices")

    line_columns = {c["name"] for c in insp.get_columns("account_move_lines")}
    if "cost_center_id" in line_columns:
        op.drop_column("account_move_lines", "cost_center_id")
    if "company_id" in line_columns:
        op.drop_index(op.f("ix_account_move_lines_company_id"), table_name="account_move_lines")
        op.drop_column("account_move_lines", "company_id")

    move_columns = {c["name"] for c in insp.get_columns("account_moves")}
    if "posted_at" in move_columns:
        op.drop_column("account_moves", "posted_at")
    if "cost_center_id" in move_columns:
        op.drop_column("account_moves", "cost_center_id")
    if "sequence_number" in move_columns:
        op.drop_column("account_moves", "sequence_number")
    if "fiscal_year_id" in move_columns:
        op.drop_index(op.f("ix_account_moves_fiscal_year_id"), table_name="account_moves")
        op.drop_column("account_moves", "fiscal_year_id")
    if "journal_id" in move_columns:
        op.drop_index(op.f("ix_account_moves_journal_id"), table_name="account_moves")
        op.drop_column("account_moves", "journal_id")

    if "cost_centers" in existing_tables:
        op.drop_table("cost_centers")
    if "fiscal_years" in existing_tables:
        op.drop_table("fiscal_years")
    if "account_journals" in existing_tables:
        op.drop_table("account_journals")
