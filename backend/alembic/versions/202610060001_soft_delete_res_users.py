"""Add soft-delete timestamp to res_users."""

from alembic import op
import sqlalchemy as sa


revision = "202610060001"
down_revision = "202610050003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("res_users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_res_users_deleted_at", "res_users", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_res_users_deleted_at", table_name="res_users")
    op.drop_column("res_users", "deleted_at")
