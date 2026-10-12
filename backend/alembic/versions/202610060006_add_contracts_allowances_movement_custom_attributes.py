"""supplier contracts, payroll allowances and movement custom_attributes

Revision ID: 202610060006
Revises: 202610060005
"""
from alembic import op

revision = "202610060006"
down_revision = "202610060005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS supplier_contracts (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL,
            contract_number VARCHAR(64) NOT NULL,
            supplier_name VARCHAR(255) NOT NULL,
            vendor_id UUID,
            title VARCHAR(255) NOT NULL,
            start_date TIMESTAMPTZ,
            end_date TIMESTAMPTZ,
            contract_value NUMERIC(18,4) NOT NULL DEFAULT 0,
            currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
            payment_terms VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
            custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_contracts_tenant_id ON supplier_contracts (tenant_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_contracts_tenant_number ON supplier_contracts (tenant_id, contract_number)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS payroll_allowances (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL,
            employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            allowance_type VARCHAR(64) NOT NULL,
            amount NUMERIC(12,2) NOT NULL DEFAULT 0,
            is_taxable BOOLEAN NOT NULL DEFAULT false,
            notes TEXT,
            custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_payroll_allowances_tenant_id ON payroll_allowances (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payroll_allowances_employee_id ON payroll_allowances (employee_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS payroll_allowances")
    op.execute("DROP TABLE IF EXISTS supplier_contracts")
    op.execute("ALTER TABLE stock_movements DROP COLUMN IF EXISTS custom_attributes")
    op.execute("ALTER TABLE inventory_movements DROP COLUMN IF EXISTS custom_attributes")
