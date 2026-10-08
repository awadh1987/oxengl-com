"""create hr_employees table with 1-to-1 ResUser linkage and RLS tenant isolation

Revision ID: 202610080004
Revises: 202610080003
"""
from alembic import op
from sqlalchemy import text

revision = "202610080004"
down_revision = "202610080003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute(
            """
            CREATE TABLE IF NOT EXISTS hr_employees (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL UNIQUE REFERENCES res_users(id) ON DELETE CASCADE,
                company_id UUID NOT NULL REFERENCES res_companies(id) ON DELETE CASCADE,
                employee_id VARCHAR(64) NOT NULL,
                department_id VARCHAR(128),
                job_title VARCHAR(128) NOT NULL DEFAULT 'Standard',
                hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
                employment_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
                base_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                manager_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employees_company_employee_id ON hr_employees (company_id, employee_id);
            CREATE INDEX IF NOT EXISTS ix_hr_employees_user_id ON hr_employees (user_id);
            CREATE INDEX IF NOT EXISTS ix_hr_employees_company_id ON hr_employees (company_id);
            CREATE INDEX IF NOT EXISTS ix_hr_employees_department_id ON hr_employees (department_id);
            CREATE INDEX IF NOT EXISTS ix_hr_employees_manager_id ON hr_employees (manager_id);

            ALTER TABLE hr_employees ENABLE ROW LEVEL SECURITY;
            ALTER TABLE hr_employees FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS oxengl_rls_all ON hr_employees;
            CREATE POLICY oxengl_rls_all ON hr_employees FOR ALL
                USING ((current_user = 'oxengl_platform') OR (company_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')))
                WITH CHECK ((current_user = 'oxengl_platform') OR (company_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')));

            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_app') THEN
                    GRANT ALL ON hr_employees TO oxengl_app;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_platform') THEN
                    GRANT ALL ON hr_employees TO oxengl_platform;
                END IF;
            END $$;
            """
        )
    else:
        op.execute(
            """
            CREATE TABLE IF NOT EXISTS hr_employees (
                id CHAR(36) PRIMARY KEY,
                user_id CHAR(36) NOT NULL UNIQUE REFERENCES res_users(id) ON DELETE CASCADE,
                company_id CHAR(36) NOT NULL REFERENCES res_companies(id) ON DELETE CASCADE,
                employee_id VARCHAR(64) NOT NULL,
                department_id VARCHAR(128),
                job_title VARCHAR(128) NOT NULL DEFAULT 'Standard',
                hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
                employment_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
                base_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                manager_id CHAR(36) REFERENCES hr_employees(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employees_company_employee_id ON hr_employees (company_id, employee_id);
            CREATE INDEX IF NOT EXISTS ix_hr_employees_user_id ON hr_employees (user_id);
            CREATE INDEX IF NOT EXISTS ix_hr_employees_company_id ON hr_employees (company_id);
            """
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS hr_employees CASCADE")
