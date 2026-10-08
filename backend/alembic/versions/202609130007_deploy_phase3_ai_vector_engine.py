"""deploy_phase3_ai_vector_engine

Revision ID: 202609130007
Revises: 202609130006
Create Date: 2026-09-13 22:05:00.000000+00:00
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import pgvector.sqlalchemy

revision: str = '202609130007'
down_revision: Union[str, None] = '202609130006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Activate the native pgvector processing extension inside the engine mesh
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 2. Provision / adjust isolated data-intelligent knowledge block tables
    # Check if column created_at exists, add if missing
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('ai_knowledge_chunks')]

    if 'created_at' not in columns:
        op.add_column(
            'ai_knowledge_chunks',
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True)
        )

    # Make document_id nullable if present to allow standalone knowledge chunks
    if 'document_id' in columns:
        op.alter_column('ai_knowledge_chunks', 'document_id', nullable=True)

    # Ensure default gen_random_uuid() on id
    op.execute("ALTER TABLE ai_knowledge_chunks ALTER COLUMN id SET DEFAULT gen_random_uuid();")

    # Add foreign key constraint to res_companies if not already present
    fks = [fk['name'] for fk in inspector.get_foreign_keys('ai_knowledge_chunks')]
    if 'fk_ai_knowledge_chunks_tenant' not in fks and 'ai_knowledge_chunks_tenant_id_fkey' not in fks:
        op.create_foreign_key(
            'fk_ai_knowledge_chunks_tenant',
            'ai_knowledge_chunks',
            'res_companies',
            ['tenant_id'],
            ['id'],
            ondelete='CASCADE'
        )

    # 3. Deploy high-performance HNSW vector search indexing to keep queries sub-millisecond
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_vector 
        ON ai_knowledge_chunks 
        USING hnsw (embedding vector_l2_ops) 
        WITH (m = 16, ef_construction = 64);
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_ai_knowledge_chunks_vector;")
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    fks = [fk['name'] for fk in inspector.get_foreign_keys('ai_knowledge_chunks')]
    if 'fk_ai_knowledge_chunks_tenant' in fks:
        op.drop_constraint('fk_ai_knowledge_chunks_tenant', 'ai_knowledge_chunks', type_='foreignkey')
    columns = [col['name'] for col in inspector.get_columns('ai_knowledge_chunks')]
    if 'created_at' in columns:
        op.drop_column('ai_knowledge_chunks', 'created_at')
