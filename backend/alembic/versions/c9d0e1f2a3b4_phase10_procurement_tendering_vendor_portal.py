"""phase10_procurement_tendering_vendor_portal

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-09-26 12:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
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

    # 1. procurement_tenders table
    if not is_mock and 'procurement_tenders' not in existing_tables:
        op.create_table(
            'procurement_tenders',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('res_companies.id', ondelete='CASCADE'), nullable=False),
            sa.Column('purchasing_organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('purchasing_organizations.id', ondelete='CASCADE'), nullable=False),
            sa.Column('tender_number', sa.String(length=64), nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('category', sa.String(length=100), nullable=False, server_default='Raw Materials'),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='DRAFT'),
            sa.Column('submission_deadline', sa.DateTime(timezone=True), nullable=False),
            sa.Column('bid_opening_date', sa.DateTime(timezone=True), nullable=False),
            sa.Column('currency', sa.String(length=3), nullable=False, server_default='SAR'),
            sa.Column('estimated_budget', sa.Numeric(precision=18, scale=4), nullable=True),
            sa.Column('is_sealed_bid', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('bids_unsealed', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('unsealed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('unsealed_by_user_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('winning_bid_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('awarded_purchase_order_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('purchase_orders.id', ondelete='SET NULL'), nullable=True),
            sa.Column('terms_and_conditions', sa.Text(), nullable=True),
            sa.Column('source_pr_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('purchase_requisitions.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_procurement_tenders_company_id', 'procurement_tenders', ['company_id'], unique=False)
        op.create_index('ix_procurement_tenders_purchasing_org_id', 'procurement_tenders', ['purchasing_organization_id'], unique=False)
        op.create_index('ix_procurement_tenders_tender_number', 'procurement_tenders', ['tender_number'], unique=True)
        op.create_index('ix_procurement_tenders_status', 'procurement_tenders', ['status'], unique=False)
        op.create_index('ix_procurement_tenders_deadline', 'procurement_tenders', ['submission_deadline'], unique=False)

    # 2. tender_rfq_lines table
    if not is_mock and 'tender_rfq_lines' not in existing_tables:
        op.create_table(
            'tender_rfq_lines',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('tender_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('procurement_tenders.id', ondelete='CASCADE'), nullable=False),
            sa.Column('line_number', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('item_code', sa.String(length=64), nullable=False),
            sa.Column('description', sa.String(length=255), nullable=False),
            sa.Column('quantity', sa.Numeric(precision=18, scale=4), nullable=False),
            sa.Column('uom', sa.String(length=20), nullable=False, server_default='UNIT'),
            sa.Column('target_unit_price', sa.Numeric(precision=18, scale=4), nullable=True),
            sa.Column('technical_specifications', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_tender_rfq_lines_tender_id', 'tender_rfq_lines', ['tender_id'], unique=False)

    # 3. vendor_portal_users table
    if not is_mock and 'vendor_portal_users' not in existing_tables:
        op.create_table(
            'vendor_portal_users',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('res_companies.id', ondelete='CASCADE'), nullable=False),
            sa.Column('partner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('res_partners.id', ondelete='CASCADE'), nullable=False),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('mobile_number', sa.String(length=64), nullable=True),
            sa.Column('contact_name', sa.String(length=255), nullable=False),
            sa.Column('company_name', sa.String(length=255), nullable=False),
            sa.Column('commercial_registration', sa.String(length=64), nullable=True),
            sa.Column('tax_id', sa.String(length=64), nullable=True),
            sa.Column('password_hash', sa.String(length=255), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_vendor_portal_users_email', 'vendor_portal_users', ['email'], unique=True)
        op.create_index('ix_vendor_portal_users_company_id', 'vendor_portal_users', ['company_id'], unique=False)
        op.create_index('ix_vendor_portal_users_partner_id', 'vendor_portal_users', ['partner_id'], unique=False)

    # 4. procurement_bids table
    if not is_mock and 'procurement_bids' not in existing_tables:
        op.create_table(
            'procurement_bids',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('tender_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('procurement_tenders.id', ondelete='CASCADE'), nullable=False),
            sa.Column('vendor_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('vendor_portal_users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('partner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('res_partners.id', ondelete='CASCADE'), nullable=False),
            sa.Column('bid_number', sa.String(length=64), nullable=False),
            sa.Column('total_amount', sa.Numeric(precision=18, scale=4), nullable=False),
            sa.Column('currency', sa.String(length=3), nullable=False, server_default='SAR'),
            sa.Column('sealed_quote_hash', sa.String(length=128), nullable=False),
            sa.Column('is_sealed', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('unsealed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='SUBMITTED'),
            sa.Column('technical_proposal', sa.Text(), nullable=True),
            sa.Column('commercial_terms', sa.Text(), nullable=True),
            sa.Column('delivery_lead_time_days', sa.Integer(), nullable=False, server_default='7'),
            sa.Column('validity_period_days', sa.Integer(), nullable=False, server_default='60'),
            sa.Column('sealed_envelope_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('evaluation_score', sa.Numeric(precision=5, scale=2), nullable=True),
            sa.Column('evaluation_notes', sa.Text(), nullable=True),
            sa.Column('submission_timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_procurement_bids_tender_id', 'procurement_bids', ['tender_id'], unique=False)
        op.create_index('ix_procurement_bids_partner_id', 'procurement_bids', ['partner_id'], unique=False)
        op.create_index('ix_procurement_bids_bid_number', 'procurement_bids', ['bid_number'], unique=True)
        op.create_index('ix_procurement_bids_status', 'procurement_bids', ['status'], unique=False)

    # 5. procurement_bid_lines table
    if not is_mock and 'procurement_bid_lines' not in existing_tables:
        op.create_table(
            'procurement_bid_lines',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('bid_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('procurement_bids.id', ondelete='CASCADE'), nullable=False),
            sa.Column('tender_line_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tender_rfq_lines.id', ondelete='CASCADE'), nullable=False),
            sa.Column('quoted_quantity', sa.Numeric(precision=18, scale=4), nullable=False),
            sa.Column('unit_price', sa.Numeric(precision=18, scale=4), nullable=False),
            sa.Column('total_price', sa.Numeric(precision=18, scale=4), nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('is_alternative', sa.Boolean(), nullable=False, server_default='false'),
        )
        op.create_index('ix_procurement_bid_lines_bid_id', 'procurement_bid_lines', ['bid_id'], unique=False)
        op.create_index('ix_procurement_bid_lines_tender_line_id', 'procurement_bid_lines', ['tender_line_id'], unique=False)


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

    if not is_mock and 'procurement_bid_lines' in existing_tables:
        op.drop_table('procurement_bid_lines')
    if not is_mock and 'procurement_bids' in existing_tables:
        op.drop_table('procurement_bids')
    if not is_mock and 'vendor_portal_users' in existing_tables:
        op.drop_table('vendor_portal_users')
    if not is_mock and 'tender_rfq_lines' in existing_tables:
        op.drop_table('tender_rfq_lines')
    if not is_mock and 'procurement_tenders' in existing_tables:
        op.drop_table('procurement_tenders')
