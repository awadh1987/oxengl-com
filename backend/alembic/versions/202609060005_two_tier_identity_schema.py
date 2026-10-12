"""two_tier_identity_schema

Revision ID: 202609060005
Revises: 202609060004
Create Date: 2026-09-06 23:25:00+00:00
"""

from typing import Sequence, Union
import uuid
import secrets
import string
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from passlib.context import CryptContext

# revision identifiers, used by Alembic.
revision: str = '202609060005'
down_revision: Union[str, None] = '202609060004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

pwd_context = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated="auto",
    argon2__memory_cost=65536,
    argon2__time_cost=3,
    argon2__parallelism=4,
)


def upgrade() -> None:
    # --------------------------------------------------------------------------
    # 1. Level 1: Control Plane Tables
    # --------------------------------------------------------------------------
    op.create_table(
        'master_tenants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(64), nullable=False, unique=True),
        sa.Column('custom_domain', sa.String(255), unique=True, nullable=True),
        sa.Column('owner_full_name', sa.String(255), nullable=False),
        sa.Column('owner_email', sa.String(255), nullable=False),
        sa.Column('owner_mobile', sa.String(64), nullable=False),
        sa.Column('status', sa.String(32), server_default='active', nullable=False),
        sa.Column('subscription_tier', sa.String(32), server_default='standard', nullable=False),
        sa.Column('max_users', sa.Integer(), server_default='10', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('provisioning', 'active', 'suspended', 'deprovisioned')", name='ck_master_tenant_status'),
        sa.CheckConstraint("subscription_tier IN ('starter', 'standard', 'growth', 'enterprise')", name='ck_master_tenant_tier'),
    )
    op.create_index('ix_master_tenants_slug', 'master_tenants', ['slug'])
    op.create_index('ix_master_tenants_domain', 'master_tenants', ['custom_domain'])

    op.create_table(
        'tenant_databases',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('master_tenants.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('database_name', sa.String(128), nullable=False),
        sa.Column('encrypted_dsn', sa.Text(), nullable=False),
        sa.Column('host', sa.String(255), server_default='localhost', nullable=False),
        sa.Column('port', sa.Integer(), server_default='5432', nullable=False),
        sa.Column('residency_region', sa.String(64), server_default='sa-central-1', nullable=False),
        sa.Column('pool_size', sa.Integer(), server_default='10', nullable=False),
        sa.Column('max_overflow', sa.Integer(), server_default='20', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_tenant_databases_active', 'tenant_databases', ['tenant_id', 'is_active'])

    op.create_table(
        'master_users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('mobile_number', sa.String(64), nullable=False, unique=True),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.String(32), server_default='user', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('failed_login_attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('super_admin', 'admin', 'user')", name='ck_master_user_role'),
    )
    op.create_index('ix_master_users_email', 'master_users', ['email'])
    op.create_index('ix_master_users_mobile', 'master_users', ['mobile_number'])

    op.create_table(
        'master_password_resets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('master_users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('identifier', sa.String(255), nullable=False),
        sa.Column('otp_hash', sa.String(255), nullable=False),
        sa.Column('reset_token', sa.String(128), unique=True, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_used', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_master_password_resets_token', 'master_password_resets', ['reset_token'])

    op.create_table(
        'master_audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('actor_identifier', sa.String(255), nullable=False),
        sa.Column('action', sa.String(120), nullable=False),
        sa.Column('target_tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('master_tenants.id', ondelete='SET NULL'), nullable=True),
        sa.Column('endpoint', sa.String(255), nullable=False),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(512), nullable=True),
        sa.Column('outcome', sa.String(32), server_default='SUCCESS', nullable=False),
        sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_master_audit_action_time', 'master_audit_logs', ['action', 'created_at'])

    # --------------------------------------------------------------------------
    # 2. Level 2: Tenant Plane Tables
    # --------------------------------------------------------------------------
    op.create_table(
        'tenant_users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('mobile_number', sa.String(64), nullable=False, unique=True),
        sa.Column('first_name', sa.String(128), nullable=False),
        sa.Column('last_name', sa.String(128), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.String(32), server_default='user', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('department', sa.String(128), nullable=True),
        sa.Column('failed_login_attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('invited_by_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenant_users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'user', 'guest_user')", name='ck_tenant_user_role'),
    )
    op.create_index('ix_tenant_users_email', 'tenant_users', ['email'])
    op.create_index('ix_tenant_users_mobile', 'tenant_users', ['mobile_number'])

    op.create_table(
        'tenant_password_resets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenant_users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('identifier', sa.String(255), nullable=False),
        sa.Column('otp_hash', sa.String(255), nullable=False),
        sa.Column('reset_token', sa.String(128), unique=True, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_used', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_tenant_password_resets_token', 'tenant_password_resets', ['reset_token'])

    op.create_table(
        'tenant_user_invitations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('mobile_number', sa.String(64), nullable=True),
        sa.Column('role', sa.String(32), server_default='user', nullable=False),
        sa.Column('invited_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenant_users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invite_token', sa.String(128), unique=True, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_accepted', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'user', 'guest_user')", name='ck_tenant_invite_role'),
    )
    op.create_index('ix_tenant_user_invitations_token', 'tenant_user_invitations', ['invite_token'])

    # --------------------------------------------------------------------------
    # 3. Seed Default Master Super Admin securely
    # --------------------------------------------------------------------------
    temp_password = "OxenGL#" + secrets.token_urlsafe(12) + "!2026"
    argon2_hash = pwd_context.hash(temp_password)

    # Insert default Control Plane super_admin
    op.execute(
        sa.text(
            """
            INSERT INTO master_users (id, email, mobile_number, full_name, password_hash, role, is_active)
            VALUES (
                'a0000000-0000-0000-0000-000000000001',
                'superadmin@oxengl.com',
                '+966500000001',
                'OxenGL SaaS Super Administrator',
                :hash,
                'super_admin',
                true
            )
            ON CONFLICT (email) DO NOTHING;
            """
        ).bindparams(hash=argon2_hash)
    )

    # Record generated temporary credentials into .env.local
    try:
        with open('.env.local', 'a', encoding='utf-8') as f:
            f.write(f"\n# Generated on migration 202609060005\nMASTER_SUPERADMIN_EMAIL=superadmin@oxengl.com\nMASTER_SUPERADMIN_MOBILE=+966500000001\nMASTER_SUPERADMIN_TEMP_PASSWORD={temp_password}\n")
    except Exception as e:
        print(f"Warning: Could not write .env.local: {e}")

    print(f"\n[BOOTSTRAP-SECURITY] Control Plane SuperAdmin seeded: superadmin@oxengl.com / +966500000001")


def downgrade() -> None:
    op.drop_table('tenant_user_invitations')
    op.drop_table('tenant_password_resets')
    op.drop_table('tenant_users')
    op.drop_table('master_audit_logs')
    op.drop_table('master_password_resets')
    op.drop_table('master_users')
    op.drop_table('tenant_databases')
    op.drop_table('master_tenants')
