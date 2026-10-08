# File: backend/alembic/versions/202609141123_add_domain_slug_index.py
"""add domain slug index

Revision ID: 202609141123
Revises: 202609140002
Create Date: 2026-09-14 23:23:00.000000

"""
from alembic import op
import sqlalchemy as sa

# Revision identifiers, used by Alembic
revision = '202609141123'
down_revision = '202609140002'
branch_labels = None
depends_on = None

def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = [c['name'] for c in inspector.get_columns('res_companies')]
    if 'domain_slug' not in cols:
        op.add_column('res_companies', sa.Column('domain_slug', sa.String(length=100), nullable=True))
        op.execute("UPDATE res_companies SET domain_slug = slug WHERE domain_slug IS NULL")
        
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('res_companies')]
    if 'ix_res_companies_domain_slug' not in existing_indexes:
        op.create_index(
            'ix_res_companies_domain_slug',
            'res_companies',
            ['domain_slug'],
            unique=True
        )
    print("🚀 B-Tree Unique Index deployed successfully over 'res_companies.domain_slug'")

def downgrade() -> None:
    op.drop_index('ix_res_companies_domain_slug', table_name='res_companies')
    op.drop_column('res_companies', 'domain_slug')
    print("↩️ Rollback completed: B-Tree index dropped cleanly.")
