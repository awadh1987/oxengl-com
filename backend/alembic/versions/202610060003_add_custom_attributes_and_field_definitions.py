"""Add custom_attributes JSONB columns and custom_field_definitions table."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "202610060003"
down_revision = "202610060002"
branch_labels = None
depends_on = None

TABLES = ("res_partners", "weighbridge_tickets", "fleet_trips")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column("custom_attributes", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        )
    op.create_table(
        "custom_field_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity", sa.String(48), nullable=False),
        sa.Column("field_key", sa.String(96), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("label_ar", sa.String(255)),
        sa.Column("data_type", sa.String(16), nullable=False, server_default="text"),
        sa.Column("options", postgresql.JSONB()),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_custom_field_definitions_company_id", "custom_field_definitions", ["company_id"])
    op.create_index("uq_custom_field_company_entity_key", "custom_field_definitions", ["company_id", "entity", "field_key"], unique=True)


def downgrade() -> None:
    op.drop_table("custom_field_definitions")
    for table in TABLES:
        op.drop_column(table, "custom_attributes")
