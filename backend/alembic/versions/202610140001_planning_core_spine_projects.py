"""Planning Core Spine: core_projects master table, RLS policies, and downstream project_id FKs.

Revision ID: 202610140001
Revises: 202610110002
Create Date: 2026-10-14 20:15:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "202610140001"
down_revision = "202610110002"
branch_labels = None
depends_on = None


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_exists(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def _fk_exists(inspector: sa.Inspector, table_name: str, constraint_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return any(fk.get("name") == constraint_name for fk in inspector.get_foreign_keys(table_name))


def _index_exists(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return any(idx.get("name") == index_name for idx in inspector.get_indexes(table_name))


def _apply_rls_and_grants(table_name: str, has_tenant_id: bool = True, has_company_id: bool = True) -> None:
    """Enforce strict PostgreSQL Row-Level Security (RLS) and role grants on a table."""
    op.execute(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;")
    op.execute(f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;")
    op.execute(f"DROP POLICY IF EXISTS oxengl_rls_all ON {table_name};")
    op.execute(f"DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};")

    if has_tenant_id and has_company_id:
        predicate = (
            "(current_user = 'oxengl_platform') OR ("
            "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid "
            "AND (company_id IS NULL OR company_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)"
            ")"
        )
    elif has_tenant_id:
        predicate = (
            "(current_user = 'oxengl_platform') OR ("
            "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
            ")"
        )
    else:
        predicate = (
            "(current_user = 'oxengl_platform') OR ("
            "company_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
            ")"
        )

    op.execute(
        f"""
        CREATE POLICY oxengl_rls_all ON {table_name}
            FOR ALL
            USING ({predicate})
            WITH CHECK ({predicate});
        """
    )

    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_app') THEN
                EXECUTE 'GRANT ALL ON TABLE {table_name} TO oxengl_app';
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_platform') THEN
                EXECUTE 'GRANT ALL ON TABLE {table_name} TO oxengl_platform';
            END IF;
        END $$;
        """
    )


def _add_project_id_fk(inspector: sa.Inspector, table_name: str) -> None:
    """Safely add nullable project_id UUID FK referencing core_projects(id) ON DELETE RESTRICT."""
    if not _table_exists(inspector, table_name):
        return

    fk_name = f"fk_{table_name}_project_id_core_projects"
    idx_name = f"ix_{table_name}_project_id"

    if not _column_exists(inspector, table_name, "project_id"):
        op.add_column(
            table_name,
            sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        )

    if not _fk_exists(inspector, table_name, fk_name):
        op.create_foreign_key(
            fk_name,
            source_table=table_name,
            referent_table="core_projects",
            local_cols=["project_id"],
            remote_cols=["id"],
            ondelete="RESTRICT",
        )

    if not _index_exists(inspector, table_name, idx_name):
        op.create_index(idx_name, table_name, ["project_id"], unique=False)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # -------------------------------------------------------------------------
    # 1. Create Master Project Table: core_projects
    # -------------------------------------------------------------------------
    if not _table_exists(inspector, "core_projects"):
        op.create_table(
            "core_projects",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column(
                "tenant_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_companies.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "company_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_companies.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column(
                "parent_project_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("core_projects.id", ondelete="RESTRICT"),
                nullable=True,
            ),
            sa.Column("project_code", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=True, server_default=sa.text("''")),
            sa.Column("project_type", sa.String(length=64), nullable=False, server_default=sa.text("'logistics'")),
            sa.Column(
                "client_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_partners.id", ondelete="RESTRICT"),
                nullable=True,
            ),
            sa.Column(
                "beneficiary_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_partners.id", ondelete="RESTRICT"),
                nullable=True,
            ),
            sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'Draft'")),
            sa.Column(
                "financial_envelope",
                sa.Numeric(precision=18, scale=4),
                nullable=False,
                server_default=sa.text("0.0000"),
            ),
            sa.Column(
                "metadata_json",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "telemetry_data",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "esg_metrics",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("tenant_id", "project_code", name="uq_core_projects_tenant_code"),
        )
        op.create_index("ix_core_projects_tenant_id", "core_projects", ["tenant_id"], unique=False)
        op.create_index("ix_core_projects_company_id", "core_projects", ["company_id"], unique=False)
        op.create_index("ix_core_projects_parent_project_id", "core_projects", ["parent_project_id"], unique=False)
        op.create_index("ix_core_projects_project_code", "core_projects", ["project_code"], unique=False)
        op.create_index("ix_core_projects_client_id", "core_projects", ["client_id"], unique=False)
        op.create_index("ix_core_projects_beneficiary_id", "core_projects", ["beneficiary_id"], unique=False)
        op.create_index("ix_core_projects_status", "core_projects", ["status"], unique=False)

    # Keep tenant_id and company_id automatically synchronized on core_projects
    op.execute(
        """
        CREATE OR REPLACE FUNCTION sync_core_projects_tenant_company()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.tenant_id IS NULL AND NEW.company_id IS NOT NULL THEN
                NEW.tenant_id := NEW.company_id;
            ELSIF NEW.company_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
                NEW.company_id := NEW.tenant_id;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_sync_core_projects_tenant_company ON core_projects;
        CREATE TRIGGER trg_sync_core_projects_tenant_company
            BEFORE INSERT OR UPDATE ON core_projects
            FOR EACH ROW
            EXECUTE FUNCTION sync_core_projects_tenant_company();
        """
    )

    # -------------------------------------------------------------------------
    # 2. Enforce Strict PostgreSQL RLS on core_projects
    # -------------------------------------------------------------------------
    _apply_rls_and_grants("core_projects", has_tenant_id=True, has_company_id=True)

    # -------------------------------------------------------------------------
    # 3. Ensure sale_orders and logistics_trips exist if not yet created
    # -------------------------------------------------------------------------
    inspector = sa.inspect(bind)
    if not _table_exists(inspector, "sale_orders"):
        op.create_table(
            "sale_orders",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column(
                "tenant_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_companies.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "company_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_companies.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column(
                "project_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("core_projects.id", ondelete="RESTRICT"),
                nullable=True,
            ),
            sa.Column("so_number", sa.String(length=64), nullable=False),
            sa.Column(
                "partner_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_partners.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "cost_center_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("cost_centers.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("order_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("expected_delivery_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default=sa.text("'SAR'")),
            sa.Column("subtotal", sa.Numeric(18, 4), nullable=False, server_default=sa.text("0.0000")),
            sa.Column("tax_amount", sa.Numeric(18, 4), nullable=False, server_default=sa.text("0.0000")),
            sa.Column("total_amount", sa.Numeric(18, 4), nullable=False, server_default=sa.text("0.0000")),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "custom_attributes",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("tenant_id", "so_number", name="uq_sale_orders_tenant_number"),
        )
        op.create_index("ix_sale_orders_tenant_id", "sale_orders", ["tenant_id"], unique=False)
        op.create_index("ix_sale_orders_company_id", "sale_orders", ["company_id"], unique=False)
        op.create_index("ix_sale_orders_project_id", "sale_orders", ["project_id"], unique=False)
        op.create_index("ix_sale_orders_partner_id", "sale_orders", ["partner_id"], unique=False)
        op.execute(
            """
            DROP TRIGGER IF EXISTS trg_sync_sale_orders_tenant_company ON sale_orders;
            CREATE TRIGGER trg_sync_sale_orders_tenant_company
                BEFORE INSERT OR UPDATE ON sale_orders
                FOR EACH ROW
                EXECUTE FUNCTION sync_core_projects_tenant_company();
            """
        )
        _apply_rls_and_grants("sale_orders", has_tenant_id=True, has_company_id=True)

    if not _table_exists(inspector, "logistics_trips"):
        op.create_table(
            "logistics_trips",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column(
                "tenant_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_companies.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "company_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_companies.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column(
                "project_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("core_projects.id", ondelete="RESTRICT"),
                nullable=True,
            ),
            sa.Column("trip_number", sa.String(length=64), nullable=False),
            sa.Column(
                "vehicle_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("vehicles.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "driver_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("res_partners.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("origin_location", sa.String(length=255), nullable=False, server_default=sa.text("''")),
            sa.Column("destination_location", sa.String(length=255), nullable=False, server_default=sa.text("''")),
            sa.Column("cargo_description", sa.String(length=255), nullable=True),
            sa.Column("planned_weight_tons", sa.Numeric(12, 4), nullable=False, server_default=sa.text("0.0000")),
            sa.Column("distance_km", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0.00")),
            sa.Column("fuel_consumed_liters", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0.00")),
            sa.Column("trip_cost", sa.Numeric(18, 4), nullable=False, server_default=sa.text("0.0000")),
            sa.Column("driver_hours", sa.Numeric(10, 2), nullable=False, server_default=sa.text("0.00")),
            sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'assigned'")),
            sa.Column("scheduled_departure", sa.DateTime(timezone=True), nullable=True),
            sa.Column("actual_departure", sa.DateTime(timezone=True), nullable=True),
            sa.Column("actual_delivery", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "telemetry_data",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("tenant_id", "trip_number", name="uq_logistics_trips_tenant_number"),
        )
        op.create_index("ix_logistics_trips_tenant_id", "logistics_trips", ["tenant_id"], unique=False)
        op.create_index("ix_logistics_trips_company_id", "logistics_trips", ["company_id"], unique=False)
        op.create_index("ix_logistics_trips_project_id", "logistics_trips", ["project_id"], unique=False)
        op.create_index("ix_logistics_trips_trip_number", "logistics_trips", ["trip_number"], unique=False)
        op.execute(
            """
            DROP TRIGGER IF EXISTS trg_sync_logistics_trips_tenant_company ON logistics_trips;
            CREATE TRIGGER trg_sync_logistics_trips_tenant_company
                BEFORE INSERT OR UPDATE ON logistics_trips
                FOR EACH ROW
                EXECUTE FUNCTION sync_core_projects_tenant_company();
            """
        )
        _apply_rls_and_grants("logistics_trips", has_tenant_id=True, has_company_id=True)

    # -------------------------------------------------------------------------
    # 4. Add project_id (nullable UUID FK -> core_projects.id ON DELETE RESTRICT)
    #    to transactional tables via safe ALTER TABLE operations
    # -------------------------------------------------------------------------
    inspector = sa.inspect(bind)
    transactional_tables = [
        # GL / Accounting
        "account_move_lines",
        "account_move_line",
        # Inventory
        "stock_pickings",
        "stock_picking",
        "stock_movements",
        # Supply Chain
        "purchase_orders",
        "sale_orders",
        # Fleet / Logistics
        "logistics_trips",
        "fleet_trips",
    ]
    for tbl in transactional_tables:
        _add_project_id_fk(inspector, tbl)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    transactional_tables = [
        "fleet_trips",
        "logistics_trips",
        "sale_orders",
        "purchase_orders",
        "stock_movements",
        "stock_picking",
        "stock_pickings",
        "account_move_line",
        "account_move_lines",
    ]
    for tbl in transactional_tables:
        if _table_exists(inspector, tbl):
            fk_name = f"fk_{tbl}_project_id_core_projects"
            idx_name = f"ix_{tbl}_project_id"
            if _fk_exists(inspector, tbl, fk_name):
                op.drop_constraint(fk_name, tbl, type_="foreignkey")
            if _index_exists(inspector, tbl, idx_name):
                op.drop_index(idx_name, table_name=tbl)
            if _column_exists(inspector, tbl, "project_id"):
                op.drop_column(tbl, "project_id")

    if _table_exists(inspector, "core_projects"):
        op.execute("DROP TRIGGER IF EXISTS trg_sync_core_projects_tenant_company ON core_projects;")
        op.execute("DROP POLICY IF EXISTS oxengl_rls_all ON core_projects;")
        op.drop_table("core_projects")
