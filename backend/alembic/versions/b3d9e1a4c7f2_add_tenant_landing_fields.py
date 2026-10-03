"""add tenant landing page fields to tenant_branding

Phase 4 (Tenant Custom Landing Engine): stores per-tenant public landing page
content rendered on tenant subdomains (*.oxengl.me) and mapped custom domains.

Revision ID: b3d9e1a4c7f2
Revises: 6519e4493fb6
Create Date: 2026-10-03 21:20:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op


revision: str = 'b3d9e1a4c7f2'
down_revision: Union[str, None] = '6519e4493fb6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# All columns are nullable with no default, so ADD COLUMN is a metadata-only
# change in PostgreSQL (no table rewrite). IF [NOT] EXISTS keeps it idempotent.
_COLUMNS = (
    ('landing_hero_title', 'VARCHAR(160)'),
    ('landing_hero_subtitle', 'TEXT'),
    ('landing_cta_label', 'VARCHAR(60)'),
    ('landing_cta_url', 'VARCHAR(2048)'),
    ('landing_theme_mode', 'VARCHAR(10)'),
)


def upgrade() -> None:
    for name, sql_type in _COLUMNS:
        op.execute(f'ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS {name} {sql_type} NULL')
    op.execute('ALTER TABLE tenant_branding DROP CONSTRAINT IF EXISTS ck_tenant_branding_landing_theme_mode')
    op.execute(
        "ALTER TABLE tenant_branding ADD CONSTRAINT ck_tenant_branding_landing_theme_mode "
        "CHECK (landing_theme_mode IS NULL OR landing_theme_mode IN ('light', 'dark'))"
    )


def downgrade() -> None:
    op.execute('ALTER TABLE tenant_branding DROP CONSTRAINT IF EXISTS ck_tenant_branding_landing_theme_mode')
    for name, _ in reversed(_COLUMNS):
        op.execute(f'ALTER TABLE tenant_branding DROP COLUMN IF EXISTS {name}')
