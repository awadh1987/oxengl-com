"""cascade master_tenants foreign keys on update

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-09-28 18:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update tenant_databases foreign key to ON UPDATE CASCADE
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_databases_tenant_id_fkey') THEN
                ALTER TABLE tenant_databases DROP CONSTRAINT tenant_databases_tenant_id_fkey;
            END IF;
            ALTER TABLE tenant_databases 
                ADD CONSTRAINT tenant_databases_tenant_id_fkey 
                FOREIGN KEY (tenant_id) REFERENCES master_tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;
        END $$;
    """)

    # 2. Update master_audit_logs foreign key to ON UPDATE CASCADE
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_audit_logs_target_tenant_id_fkey') THEN
                ALTER TABLE master_audit_logs DROP CONSTRAINT master_audit_logs_target_tenant_id_fkey;
            END IF;
            ALTER TABLE master_audit_logs 
                ADD CONSTRAINT master_audit_logs_target_tenant_id_fkey 
                FOREIGN KEY (target_tenant_id) REFERENCES master_tenants(id) ON UPDATE CASCADE ON DELETE SET NULL;
        END $$;
    """)

    # 3. Update saas_invoices foreign key to ON UPDATE CASCADE
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saas_invoices_tenant_id_fkey') THEN
                ALTER TABLE saas_invoices DROP CONSTRAINT saas_invoices_tenant_id_fkey;
            END IF;
            ALTER TABLE saas_invoices 
                ADD CONSTRAINT saas_invoices_tenant_id_fkey 
                FOREIGN KEY (tenant_id) REFERENCES master_tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_databases_tenant_id_fkey') THEN
                ALTER TABLE tenant_databases DROP CONSTRAINT tenant_databases_tenant_id_fkey;
                ALTER TABLE tenant_databases 
                    ADD CONSTRAINT tenant_databases_tenant_id_fkey 
                    FOREIGN KEY (tenant_id) REFERENCES master_tenants(id) ON DELETE CASCADE;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_audit_logs_target_tenant_id_fkey') THEN
                ALTER TABLE master_audit_logs DROP CONSTRAINT master_audit_logs_target_tenant_id_fkey;
                ALTER TABLE master_audit_logs 
                    ADD CONSTRAINT master_audit_logs_target_tenant_id_fkey 
                    FOREIGN KEY (target_tenant_id) REFERENCES master_tenants(id) ON DELETE SET NULL;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saas_invoices_tenant_id_fkey') THEN
                ALTER TABLE saas_invoices DROP CONSTRAINT saas_invoices_tenant_id_fkey;
                ALTER TABLE saas_invoices 
                    ADD CONSTRAINT saas_invoices_tenant_id_fkey 
                    FOREIGN KEY (tenant_id) REFERENCES master_tenants(id) ON DELETE CASCADE;
            END IF;
        END $$;
    """)
