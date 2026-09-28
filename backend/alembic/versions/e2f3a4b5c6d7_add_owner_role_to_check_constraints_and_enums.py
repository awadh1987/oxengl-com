"""add OWNER role to user check constraints and enums

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-09-28 14:56:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update ck_res_user_role on res_users
    op.execute("ALTER TABLE res_users DROP CONSTRAINT IF EXISTS ck_res_user_role;")
    op.execute("""
        ALTER TABLE res_users ADD CONSTRAINT ck_res_user_role 
        CHECK (role IN ('Super_Admin', 'super_admin', 'SUPER_ADMIN', 'Owner', 'owner', 'OWNER', 'Admin', 'admin', 'ADMIN', 'User', 'user', 'USER', 'COO', 'CEO', 'Accountant', 'Data_Entry', 'Guest'));
    """)

    # 2. Update ck_tenant_user_role on tenant_users
    op.execute("ALTER TABLE tenant_users DROP CONSTRAINT IF EXISTS ck_tenant_user_role;")
    op.execute("""
        ALTER TABLE tenant_users ADD CONSTRAINT ck_tenant_user_role 
        CHECK (role IN ('admin', 'ADMIN', 'Admin', 'owner', 'OWNER', 'Owner', 'ceo', 'user', 'USER', 'guest_user'));
    """)

    # 3. Update ck_tenant_invite_role on tenant_user_invitations
    op.execute("ALTER TABLE tenant_user_invitations DROP CONSTRAINT IF EXISTS ck_tenant_invite_role;")
    op.execute("""
        ALTER TABLE tenant_user_invitations ADD CONSTRAINT ck_tenant_invite_role 
        CHECK (role IN ('admin', 'ADMIN', 'Admin', 'owner', 'OWNER', 'Owner', 'user', 'USER', 'guest_user'));
    """)

    # 4. Update ck_tenant_sso_default_role on tenant_sso_configs if exists
    op.execute("""
        DO $$ 
        BEGIN 
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tenant_sso_default_role') THEN
                ALTER TABLE tenant_sso_configs DROP CONSTRAINT IF EXISTS ck_tenant_sso_default_role;
                ALTER TABLE tenant_sso_configs ADD CONSTRAINT ck_tenant_sso_default_role 
                CHECK (default_role IN ('Super_Admin', 'super_admin', 'SUPER_ADMIN', 'Owner', 'owner', 'OWNER', 'Admin', 'admin', 'ADMIN', 'User', 'user', 'USER', 'COO', 'Accountant', 'Data_Entry', 'Guest'));
            END IF;
        END $$;
    """)

    # 5. Ensure postgres enum type user_role contains OWNER
    op.execute("""
        DO $$ 
        BEGIN 
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
                BEGIN
                    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'OWNER';
                EXCEPTION
                    WHEN duplicate_object THEN null;
                END;
            ELSE
                CREATE TYPE user_role AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN', 'OWNER');
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE res_users DROP CONSTRAINT IF EXISTS ck_res_user_role;")
    op.execute("""
        ALTER TABLE res_users ADD CONSTRAINT ck_res_user_role 
        CHECK (role IN ('Super_Admin', 'Admin', 'COO', 'CEO', 'Accountant', 'Data_Entry', 'Guest'));
    """)
    op.execute("ALTER TABLE tenant_users DROP CONSTRAINT IF EXISTS ck_tenant_user_role;")
    op.execute("""
        ALTER TABLE tenant_users ADD CONSTRAINT ck_tenant_user_role 
        CHECK (role IN ('admin', 'ceo', 'user', 'guest_user'));
    """)
    op.execute("ALTER TABLE tenant_user_invitations DROP CONSTRAINT IF EXISTS ck_tenant_invite_role;")
    op.execute("""
        ALTER TABLE tenant_user_invitations ADD CONSTRAINT ck_tenant_invite_role 
        CHECK (role IN ('admin', 'user', 'guest_user'));
    """)
