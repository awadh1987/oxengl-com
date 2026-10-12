"""make res_users company_id nullable for global admins

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-09-27 05:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('res_users', 'company_id',
               existing_type=postgresql.UUID(),
               nullable=True)


def downgrade() -> None:
    op.alter_column('res_users', 'company_id',
               existing_type=postgresql.UUID(),
               nullable=False)
