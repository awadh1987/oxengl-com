"""Add nullable sync reference identifier to res_users."""

from alembic import op
import sqlalchemy as sa


revision = "202610050003"
down_revision = "202610050002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("res_users", sa.Column("sync_reference_id", sa.String(length=255), nullable=True))
    op.create_index(
        "ix_res_users_sync_reference_id",
        "res_users",
        ["sync_reference_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_res_users_sync_reference_id", table_name="res_users")
    op.drop_column("res_users", "sync_reference_id")
