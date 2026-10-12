"""cleanup_legacy_schema (REM-P1-003)

Revision ID: 202609060004
Revises: 442840b43675
Create Date: 2026-09-06 18:43:00+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202609060004'
down_revision: Union[str, None] = '442840b43675'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop completely empty orphaned legacy prototype tables (0 rows)
    for table_name in [
        'customers',
        'crushers',
        'transporters',
        'operations',
        'invoices',
        'vouchers',
    ]:
        op.execute(sa.text(f"DROP TABLE IF EXISTS {table_name} CASCADE"))

    # 2. Archive legacy users and roles tables to prevent confusion with active res_users and res_groups
    op.execute(sa.text("ALTER TABLE IF EXISTS users RENAME TO _legacy_archive_users"))
    op.execute(sa.text("ALTER TABLE IF EXISTS roles RENAME TO _legacy_archive_roles"))


def downgrade() -> None:
    # Restore legacy table names
    op.execute(sa.text("ALTER TABLE IF EXISTS _legacy_archive_users RENAME TO users"))
    op.execute(sa.text("ALTER TABLE IF EXISTS _legacy_archive_roles RENAME TO roles"))
