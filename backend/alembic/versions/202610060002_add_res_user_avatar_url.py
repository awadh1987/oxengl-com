"""Add nullable avatar URL to res_users."""

from alembic import op
import sqlalchemy as sa


revision = "202610060002"
down_revision = "202610060001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("res_users", sa.Column("avatar_url", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("res_users", "avatar_url")
