"""create core_projects table as immutable platform core

Revision ID: ae5265008c4f
Revises: 202610110002
Create Date: 2026-10-12 17:57:44.642603+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ae5265008c4f'
down_revision: Union[str, None] = '202610110002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
