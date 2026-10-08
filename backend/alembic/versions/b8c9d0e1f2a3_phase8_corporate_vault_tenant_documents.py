"""phase8_corporate_vault_tenant_documents

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-09-25 22:06:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    try:
        inspector = sa.inspect(conn)
        existing_tables = inspector.get_table_names()
        is_mock = False
    except Exception:
        inspector = None
        existing_tables = []
        is_mock = True

    if not is_mock and 'tenant_documents' not in existing_tables:
        op.create_table(
            'tenant_documents',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('res_companies.id', ondelete='CASCADE'), nullable=False),
            sa.Column('document_type', sa.String(length=64), nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('document_number', sa.String(length=128), nullable=True),
            sa.Column('file_path', sa.String(length=1024), nullable=False),
            sa.Column('file_name', sa.String(length=255), nullable=False),
            sa.Column('file_size', sa.Integer(), nullable=True),
            sa.Column('mime_type', sa.String(length=128), nullable=True, server_default='application/pdf'),
            sa.Column('issue_date', sa.DateTime(timezone=True), nullable=True),
            sa.Column('expiry_date', sa.DateTime(timezone=True), nullable=True),
            sa.Column('issuing_authority', sa.String(length=255), nullable=True),
            sa.Column('verification_status', sa.String(length=32), nullable=False, server_default='UNVERIFIED'),
            sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('verified_by', sa.String(length=255), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('metadata_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default='{}'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.CheckConstraint(
                "verification_status IN ('UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REJECTED')",
                name='ck_tenant_document_verification_status',
            ),
        )
        op.create_index(op.f('ix_tenant_documents_company_id'), 'tenant_documents', ['company_id'], unique=False)
        op.create_index(op.f('ix_tenant_documents_document_type'), 'tenant_documents', ['document_type'], unique=False)
        op.create_index(op.f('ix_tenant_documents_expiry_date'), 'tenant_documents', ['expiry_date'], unique=False)
        op.create_index(op.f('ix_tenant_documents_verification_status'), 'tenant_documents', ['verification_status'], unique=False)
        op.create_index('ix_tenant_docs_company_type', 'tenant_documents', ['company_id', 'document_type'], unique=False)
        op.create_index('ix_tenant_docs_company_expiry', 'tenant_documents', ['company_id', 'expiry_date'], unique=False)
    elif is_mock:
        op.execute("""
            CREATE TABLE IF NOT EXISTS tenant_documents (
                id UUID PRIMARY KEY,
                company_id UUID NOT NULL REFERENCES res_companies(id) ON DELETE CASCADE,
                document_type VARCHAR(64) NOT NULL,
                title VARCHAR(255) NOT NULL,
                document_number VARCHAR(128),
                file_path VARCHAR(1024) NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_size INTEGER,
                mime_type VARCHAR(128) DEFAULT 'application/pdf',
                issue_date TIMESTAMPTZ,
                expiry_date TIMESTAMPTZ,
                issuing_authority VARCHAR(255),
                verification_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
                verified_at TIMESTAMPTZ,
                verified_by VARCHAR(255),
                notes TEXT,
                metadata_json JSONB DEFAULT '{}',
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT ck_tenant_document_verification_status CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REJECTED'))
            );
            CREATE INDEX IF NOT EXISTS ix_tenant_documents_company_id ON tenant_documents(company_id);
            CREATE INDEX IF NOT EXISTS ix_tenant_documents_document_type ON tenant_documents(document_type);
            CREATE INDEX IF NOT EXISTS ix_tenant_documents_expiry_date ON tenant_documents(expiry_date);
            CREATE INDEX IF NOT EXISTS ix_tenant_documents_verification_status ON tenant_documents(verification_status);
            CREATE INDEX IF NOT EXISTS ix_tenant_docs_company_type ON tenant_documents(company_id, document_type);
            CREATE INDEX IF NOT EXISTS ix_tenant_docs_company_expiry ON tenant_documents(company_id, expiry_date);
        """)


def downgrade() -> None:
    conn = op.get_bind()
    try:
        inspector = sa.inspect(conn)
        existing_tables = inspector.get_table_names()
        is_mock = False
    except Exception:
        inspector = None
        existing_tables = []
        is_mock = True

    if not is_mock and 'tenant_documents' in existing_tables:
        op.drop_table('tenant_documents')
    elif is_mock:
        op.execute("DROP TABLE IF EXISTS tenant_documents CASCADE;")
