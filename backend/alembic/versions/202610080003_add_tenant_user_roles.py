"""add tenant_user_roles table for multi-tenant relational memberships

Revision ID: 202610080003
Revises: 202610080002
"""
from alembic import op
from sqlalchemy import text

revision = "202610080003"
down_revision = "202610080002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute(
            """
            CREATE TABLE IF NOT EXISTS tenant_user_roles (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES res_users(id) ON DELETE CASCADE,
                company_id UUID NOT NULL REFERENCES res_companies(id) ON DELETE CASCADE,
                role VARCHAR(32) NOT NULL DEFAULT 'Data_Entry',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_user_roles_user_company ON tenant_user_roles (user_id, company_id);
            CREATE INDEX IF NOT EXISTS ix_tenant_user_roles_user_id ON tenant_user_roles (user_id);
            CREATE INDEX IF NOT EXISTS ix_tenant_user_roles_company_id ON tenant_user_roles (company_id);

            ALTER TABLE tenant_user_roles ENABLE ROW LEVEL SECURITY;
            ALTER TABLE tenant_user_roles FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS oxengl_rls_all ON tenant_user_roles;
            CREATE POLICY oxengl_rls_all ON tenant_user_roles FOR ALL
                USING ((current_user = 'oxengl_platform') OR (company_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')))
                WITH CHECK ((current_user = 'oxengl_platform') OR (company_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')));

            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_app') THEN
                    GRANT ALL ON tenant_user_roles TO oxengl_app;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_platform') THEN
                    GRANT ALL ON tenant_user_roles TO oxengl_platform;
                END IF;
            END $$;
            """
        )
    else:
        op.execute(
            """
            CREATE TABLE IF NOT EXISTS tenant_user_roles (
                id CHAR(36) PRIMARY KEY,
                user_id CHAR(36) NOT NULL REFERENCES res_users(id) ON DELETE CASCADE,
                company_id CHAR(36) NOT NULL REFERENCES res_companies(id) ON DELETE CASCADE,
                role VARCHAR(32) NOT NULL DEFAULT 'Data_Entry',
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_user_roles_user_company ON tenant_user_roles (user_id, company_id);
            CREATE INDEX IF NOT EXISTS ix_tenant_user_roles_user_id ON tenant_user_roles (user_id);
            CREATE INDEX IF NOT EXISTS ix_tenant_user_roles_company_id ON tenant_user_roles (company_id);
            """
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenant_user_roles CASCADE")
