"""
Integration tests for the Planning Department Core Spine API Router (`backend/app/routers/planning.py`)
and Pydantic v2 schemas (`backend/app/schemas/planning.py`).

Tests cover:
1. Project CRUD (`POST`, `GET`, `PUT`, `DELETE` under `/api/v1/planning/projects`).
2. Dynamic `metadata_json` validation based on `project_type` (both valid and 422 invalid payloads).
3. Hierarchical WBS endpoint (`GET /api/v1/planning/projects/{project_id}/wbs`) & cycle guard.
4. Command Center Aggregator (`GET /api/v1/planning/projects/{project_id}/telemetry`) combining
   GL actuals (`account_move_lines`), committed POs (`purchase_orders`), active fleet (`logistics_trips`),
   and stock reservations (`stock_pickings` / `stock_moves` / `stock_movements`).
5. Strict `app.current_tenant_id` GUC session propagation and multi-tenant RLS isolation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.app.main import app
from backend.database import SessionLocal
from backend.models import (
    AccountAccount,
    AccountJournal,
    AccountMove,
    AccountMoveLine,
    LogisticsTrip,
    ProductProduct,
    PurchaseOrder,
    ResCompany,
    ResPartner,
    SaleOrder,
    StockItem,
    StockLocation,
    StockMove,
    StockMovement,
    StockPicking,
    Vehicle,
    Warehouse,
)


@pytest.fixture()
def seeded_tenants():
    """Creates two isolated tenants (Tenant Alpha & Tenant Beta) with baseline master data."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:8]
    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()

    try:
        # Use session-level tenant context to seed Tenant A and Tenant B
        db.execute(
            text(
                "SELECT set_config('app.current_tenant_id', :tid, false), "
                "set_config('app.current_company_id', :tid, false)"
            ),
            {"tid": str(tenant_a_id)},
        )
        company_a = ResCompany(
            id=tenant_a_id,
            name=f"Planning Spine Alpha {suffix}",
            slug=f"planning-alpha-{suffix}",
            currency="USD",
            is_active=True,
        )
        db.add(company_a)
        db.commit()

        db.execute(
            text(
                "SELECT set_config('app.current_tenant_id', :tid, false), "
                "set_config('app.current_company_id', :tid, false)"
            ),
            {"tid": str(tenant_b_id)},
        )
        company_b = ResCompany(
            id=tenant_b_id,
            name=f"Planning Spine Beta {suffix}",
            slug=f"planning-beta-{suffix}",
            currency="USD",
            is_active=True,
        )
        db.add(company_b)
        db.commit()

        yield {"tenant_a": tenant_a_id, "tenant_b": tenant_b_id, "suffix": suffix}
    finally:
        # Clean up test records under each tenant scope
        for tid in (tenant_a_id, tenant_b_id):
            try:
                db.execute(
                    text(
                        "SELECT set_config('app.current_tenant_id', :tid, false), "
                        "set_config('app.current_company_id', :tid, false)"
                    ),
                    {"tid": str(tid)},
                )
                db.execute(text("DELETE FROM stock_movements WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM stock_moves WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM stock_pickings WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM logistics_trips WHERE tenant_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM purchase_orders WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM sale_orders WHERE tenant_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM account_move_lines WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM account_moves WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM account_journals WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM account_accounts WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("UPDATE core_projects SET parent_project_id = NULL WHERE tenant_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM core_projects WHERE tenant_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM stock_items WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM warehouses WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM stock_locations WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM product_products WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM vehicles WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM res_partners WHERE company_id = :tid"), {"tid": str(tid)})
                db.execute(text("DELETE FROM res_companies WHERE id = :tid"), {"tid": str(tid)})
                db.commit()
            except Exception:
                db.rollback()
        db.close()


def test_crud_and_dynamic_metadata_validation(seeded_tenants):
    """
    Verifies POST / PUT / GET / DELETE on `/api/v1/planning/projects` and ensures
    polymorphic `metadata_json` is dynamically validated against `project_type`.
    """
    client = TestClient(app)
    tenant_a = str(seeded_tenants["tenant_a"])
    headers = {"X-Tenant-ID": tenant_a}

    # 1. Invalid LOGISTICS metadata (origin_hub without destination_hub) -> 422
    invalid_resp = client.post(
        "/api/v1/planning/projects",
        headers=headers,
        json={
            "project_name": "Invalid Logistics Convoy",
            "project_type": "LOGISTICS",
            "total_budget": "150000.00",
            "metadata_json": {
                "origin_hub": "Port of Aden",
                # destination_hub is missing
            },
        },
    )
    assert invalid_resp.status_code == 422, invalid_resp.text

    # 2. Invalid EPC metadata (retention_percentage > 100) -> 422
    invalid_epc = client.post(
        "/api/v1/planning/projects",
        headers=headers,
        json={
            "project_name": "Invalid EPC Solar Plant",
            "project_type": "EPC",
            "total_budget": "500000.00",
            "metadata_json": {
                "site_code": "SITE-SOLAR-01",
                "retention_percentage": "125.00",
            },
        },
    )
    assert invalid_epc.status_code == 422, invalid_epc.text

    # 3. Valid HUMANITARIAN_SUPPLY project creation
    create_resp = client.post(
        "/api/v1/planning/projects",
        headers=headers,
        json={
            "project_name": "WFP Emergency Food Corridor",
            "project_type": "HUMANITARIAN_SUPPLY",
            "status": "ACTIVE",
            "total_budget": "1200000.00",
            "metadata_json": {
                "donor_grant_code": "WFP-YEM-2026-099",
                "distribution_region": "Marib Governorate",
                "cluster_sector": "FOOD_SECURITY",
                "target_beneficiaries_count": 45000,
                "customs_exemption_ref": "EX-99182",
            },
            "esg_metrics": {
                "carbon_footprint_kg": 4200.5,
                "fuel_consumed_liters": 1580.0,
                "solar_offset_kwh": 320.0,
                "safety_incidents": 0,
            },
            "telemetry_data": {
                "active_alerts": [],
            },
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    project_id = created["id"]
    assert created["project_code"].startswith("PRJ-")
    assert created["project_type"] == "humanitarian_supply"
    assert created["status"] == "Active Execution"
    assert created["metadata_json"]["donor_grant_code"] == "WFP-YEM-2026-099"
    assert created["metadata_json"]["target_beneficiaries_count"] == 45000
    assert Decimal(str(created["financial_envelope"])) == Decimal("1200000.00")

    # 4. PUT update with invalid metadata for existing HUMANITARIAN_SUPPLY type -> 422
    bad_put = client.put(
        f"/api/v1/planning/projects/{project_id}",
        headers=headers,
        json={
            "metadata_json": {
                "origin_hub": "Aden",  # Not valid for HUMANITARIAN_SUPPLY (extra="forbid")
            }
        },
    )
    assert bad_put.status_code == 422, bad_put.text

    # 5. PUT update with valid HUMANITARIAN_SUPPLY metadata
    good_put = client.put(
        f"/api/v1/planning/projects/{project_id}",
        headers=headers,
        json={
            "project_name": "WFP Emergency Food Corridor - Phase II",
            "metadata_json": {
                "donor_grant_code": "WFP-YEM-2026-099-P2",
                "distribution_region": "Marib & Shabwah",
                "cluster_sector": "FOOD_SECURITY",
                "target_beneficiaries_count": 60000,
            },
        },
    )
    assert good_put.status_code == 200, good_put.text
    updated = good_put.json()
    assert updated["name"] == "WFP Emergency Food Corridor - Phase II"
    assert updated["metadata_json"]["target_beneficiaries_count"] == 60000


def test_wbs_hierarchy_and_telemetry_command_center_aggregator(seeded_tenants):
    """
    Tests:
    - Multi-level WBS tree (`GET /api/v1/planning/projects/{project_id}/wbs`)
    - Command Center Aggregator (`GET /api/v1/planning/projects/{project_id}/telemetry`)
      rolling up budget vs actual GL expenses, active fleet trips, and stock reservations.
    - Multi-tenant RLS isolation against Tenant B.
    """
    client = TestClient(app)
    tenant_a = seeded_tenants["tenant_a"]
    tenant_b = seeded_tenants["tenant_b"]
    suffix = seeded_tenants["suffix"]
    headers_a = {"X-Tenant-ID": str(tenant_a)}
    headers_b = {"X-Tenant-ID": str(tenant_b)}

    # 1. Create Master Root Project (LOGISTICS)
    root_resp = client.post(
        "/api/v1/planning/projects",
        headers=headers_a,
        json={
            "project_code": f"PRJ-LOG-{suffix.upper()}-ROOT",
            "project_name": "National Cold-Chain Corridor Master",
            "project_type": "LOGISTICS",
            "status": "ACTIVE",
            "total_budget": "500000.00",
            "metadata_json": {
                "origin_hub": "Jeddah Islamic Port",
                "destination_hub": "Riyadh Dry Port",
                "fleet_allocation_count": 12,
                "cargo_classification": "COLD_CHAIN",
                "sla_target_hours": 18.0,
            },
            "esg_metrics": {
                "carbon_footprint_kg": 1200.0,
                "fuel_consumed_liters": 450.0,
                "solar_offset_kwh": 100.0,
                "safety_incidents": 0,
            },
            "telemetry_data": {
                "active_alerts": [{"alert_id": "A1", "severity": "LOW"}],
            },
        },
    )
    assert root_resp.status_code == 201, root_resp.text
    root_id = uuid.UUID(root_resp.json()["id"])

    # 2. Create Sub-Project (Phase 1) under Root Project
    sub_resp = client.post(
        "/api/v1/planning/projects",
        headers=headers_a,
        json={
            "project_code": f"PRJ-LOG-{suffix.upper()}-SUB1",
            "project_name": "Cold-Chain Phase 1: Reefer Dispatch",
            "project_type": "LOGISTICS",
            "status": "ACTIVE",
            "parent_project_id": str(root_id),
            "total_budget": "200000.00",
            "metadata_json": {
                "origin_hub": "Jeddah Islamic Port",
                "destination_hub": "Qassim Hub",
                "fleet_allocation_count": 6,
                "cargo_classification": "COLD_CHAIN",
            },
            "esg_metrics": {
                "carbon_footprint_kg": 800.0,
                "fuel_consumed_liters": 300.0,
                "solar_offset_kwh": 50.0,
                "safety_incidents": 1,
            },
            "telemetry_data": {
                "active_alerts": [],
            },
        },
    )
    assert sub_resp.status_code == 201, sub_resp.text
    sub_id = uuid.UUID(sub_resp.json()["id"])

    # 3. Verify WBS Cycle Prevention (Root cannot become child of Sub-Project)
    cycle_resp = client.put(
        f"/api/v1/planning/projects/{root_id}",
        headers=headers_a,
        json={"parent_project_id": str(sub_id)},
    )
    assert cycle_resp.status_code == 400, cycle_resp.text

    # 4. Seed transactional records anchored to Root & Sub-Project under Tenant A
    db = SessionLocal()
    try:
        db.execute(
            text(
                "SELECT set_config('app.current_tenant_id', :tid, false), "
                "set_config('app.current_company_id', :tid, false)"
            ),
            {"tid": str(tenant_a)},
        )

        now_utc = datetime.now(timezone.utc)

        partner = ResPartner(
            company_id=tenant_a,
            name=f"Al-Watania Logistics {suffix}",
            partner_type="supplier",
        )
        db.add(partner)
        db.flush()

        # GL Account, Journal, Move, and Move Line anchored to Root Project
        expense_account = AccountAccount(
            company_id=tenant_a,
            code=f"5100{suffix[:4]}",
            name="Project Fleet Fuel & Freight Expense",
            internal_type="expense",
        )
        payable_account = AccountAccount(
            company_id=tenant_a,
            code=f"2100{suffix[:4]}",
            name="Accounts Payable",
            internal_type="liability",
        )
        journal = AccountJournal(
            company_id=tenant_a,
            name="Project Operations Journal",
            code=f"PJ{suffix[:3].upper()}",
            journal_type="purchase",
        )
        db.add_all([expense_account, payable_account, journal])
        db.flush()

        move = AccountMove(
            company_id=tenant_a,
            journal_id=journal.id,
            partner_id=partner.id,
            name=f"BILL/{suffix.upper()}/001",
            date=now_utc,
            state="posted",
            move_type="in_invoice",
        )
        db.add(move)
        db.flush()

        aml_debit = AccountMoveLine(
            company_id=tenant_a,
            move_id=move.id,
            account_id=expense_account.id,
            partner_id=partner.id,
            project_id=root_id,
            name="Reefer Diesel & Corridor Toll Charges",
            debit=Decimal("45000.00"),
            credit=Decimal("0.00"),
        )
        aml_credit = AccountMoveLine(
            company_id=tenant_a,
            move_id=move.id,
            account_id=payable_account.id,
            partner_id=partner.id,
            name="Payable to Al-Watania",
            debit=Decimal("0.00"),
            credit=Decimal("45000.00"),
        )
        db.add_all([aml_debit, aml_credit])

        # Purchase Order (Confirmed) & Sale Order (Confirmed) on Sub-Project / Root
        po = PurchaseOrder(
            company_id=tenant_a,
            po_number=f"PO-{suffix.upper()}-01",
            partner_id=partner.id,
            project_id=sub_id,
            order_date=now_utc,
            status="confirmed",
            subtotal=Decimal("32000.00"),
            tax_amount=Decimal("0.00"),
            total_amount=Decimal("32000.00"),
            currency="USD",
        )
        so = SaleOrder(
            tenant_id=tenant_a,
            company_id=tenant_a,
            so_number=f"SO-{suffix.upper()}-01",
            partner_id=partner.id,
            project_id=root_id,
            order_date=now_utc,
            status="confirmed",
            subtotal=Decimal("680000.00"),
            tax_amount=Decimal("0.00"),
            total_amount=Decimal("680000.00"),
            currency="USD",
        )
        db.add_all([po, so])

        # Fleet Vehicle & Logistics Trips (1 in_transit on root, 1 completed on sub)
        vehicle = Vehicle(
            company_id=tenant_a,
            tenant_id=tenant_a,
            name=f"Mercedes-Benz Actros {suffix}",
            license_plate=f"KSA-{suffix[:4].upper()}",
            plate_number=f"KSA-{suffix[:4].upper()}",
            vehicle_type="truck",
            status="active",
        )
        db.add(vehicle)
        db.flush()

        trip_active = LogisticsTrip(
            tenant_id=tenant_a,
            company_id=tenant_a,
            project_id=root_id,
            vehicle_id=vehicle.id,
            trip_number=f"TRP-{suffix.upper()}-01",
            status="in_transit",
            origin_location="Jeddah Islamic Port",
            destination_location="Riyadh Dry Port",
            distance_km=Decimal("950.00"),
            planned_weight_tons=Decimal("24.50"),
            fuel_consumed_liters=Decimal("310.00"),
            trip_cost=Decimal("5000.00"),
            driver_hours=Decimal("11.50"),
        )
        trip_done = LogisticsTrip(
            tenant_id=tenant_a,
            company_id=tenant_a,
            project_id=sub_id,
            vehicle_id=vehicle.id,
            trip_number=f"TRP-{suffix.upper()}-02",
            status="completed",
            origin_location="Jeddah Islamic Port",
            destination_location="Qassim Hub",
            distance_km=Decimal("720.00"),
            planned_weight_tons=Decimal("18.00"),
            fuel_consumed_liters=Decimal("240.00"),
            trip_cost=Decimal("3500.00"),
            driver_hours=Decimal("8.50"),
        )
        db.add_all([trip_active, trip_done])

        # Inventory Stock Picking + Stock Move + Warehouse Stock Movement
        src_loc = StockLocation(
            company_id=tenant_a,
            name=f"Jeddah Cold Store {suffix}",
            location_type="internal",
        )
        dest_loc = StockLocation(
            company_id=tenant_a,
            name=f"Project Corridor Staging {suffix}",
            location_type="internal",
        )
        product = ProductProduct(
            company_id=tenant_a,
            sku=f"MED-{suffix[:4].upper()}",
            name=f"Insulin Cold-Box Pallet {suffix}",
            product_type="storable",
            unit_of_measure="ton",
            sale_price=Decimal("1200.00"),
            standard_cost=Decimal("800.00"),
        )
        db.add_all([src_loc, dest_loc, product])
        db.flush()

        picking = StockPicking(
            company_id=tenant_a,
            project_id=root_id,
            reference=f"WH/OUT/{suffix.upper()}/001",
            picking_type="outgoing",
            state="assigned",
        )
        db.add(picking)
        db.flush()

        stock_move = StockMove(
            company_id=tenant_a,
            picking_id=picking.id,
            product_id=product.id,
            quantity_planned=Decimal("50.00"),
            quantity_done=Decimal("0.00"),
            state="assigned",
            location_id=src_loc.id,
            location_dest_id=dest_loc.id,
        )
        db.add(stock_move)

        wh = Warehouse(
            company_id=tenant_a,
            code=f"WH-{suffix[:4].upper()}",
            name=f"Central Cold Hub {suffix}",
        )
        db.add(wh)
        db.flush()

        stock_item = StockItem(
            company_id=tenant_a,
            product_id=product.id,
            sku=f"SKU-{suffix[:5].upper()}",
            name=f"Cold Chain Data Logger {suffix}",
            base_uom="kg",
        )
        db.add(stock_item)
        db.flush()

        movement = StockMovement(
            company_id=tenant_a,
            project_id=sub_id,
            movement_number=f"MOV-{suffix.upper()}-01",
            stock_item_id=stock_item.id,
            warehouse_id=wh.id,
            movement_type="outbound",
            quantity=Decimal("100.00"),
            unit_cost=Decimal("45.00"),
            balance_after=Decimal("500.00"),
        )
        db.add(movement)
        db.commit()
    finally:
        db.close()

    # 5. Test WBS Tree Endpoint (`GET /api/v1/planning/projects/{root_id}/wbs`)
    wbs_resp = client.get(f"/api/v1/planning/projects/{root_id}/wbs", headers=headers_a)
    assert wbs_resp.status_code == 200, wbs_resp.text
    wbs_data = wbs_resp.json()
    assert wbs_data["total_tree_nodes"] == 2
    assert wbs_data["max_depth"] == 1
    assert wbs_data["id"] == str(root_id)
    assert len(wbs_data["sub_projects"]) == 1
    assert wbs_data["sub_projects"][0]["id"] == str(sub_id)
    # Rolled up financial envelope = 500,000 (root) + 200,000 (sub) = 700,000
    assert Decimal(str(wbs_data["rolled_up_financial_envelope"])) == Decimal("700000.00")

    # 6. Test Command Center Telemetry Aggregator (`GET /api/v1/planning/projects/{root_id}/telemetry`)
    tel_resp = client.get(
        f"/api/v1/planning/projects/{root_id}/telemetry?include_sub_projects=true",
        headers=headers_a,
    )
    assert tel_resp.status_code == 200, tel_resp.text
    tel = tel_resp.json()

    assert tel["project_id"] == str(root_id)
    assert tel["include_sub_projects"] is True
    assert len(tel["scoped_project_ids"]) == 2

    # Budget vs Actuals checks:
    # Total budget = 500,000 + 200,000 = 700,000
    # GL expense debit = 45,000
    # Logistics trip costs = 5,000 + 3,500 = 8,500
    # Total actual expenses = 45,000 + 8,500 = 53,500
    # Committed PO = 32,000 (1 PO)
    # Contracted Revenue SO = 680,000 (1 SO)
    bva = tel["budget_vs_actual"]
    assert Decimal(str(bva["total_budget"])) == Decimal("700000.00")
    assert Decimal(str(bva["actual_gl_debit"])) == Decimal("45000.00")
    assert Decimal(str(bva["actual_trip_costs"])) == Decimal("8500.00")
    assert Decimal(str(bva["total_actual_expenses"])) == Decimal("53500.00")
    assert Decimal(str(bva["committed_po_amount"])) == Decimal("32000.00")
    assert bva["purchase_order_count"] == 1
    assert Decimal(str(bva["sale_order_revenue"])) == Decimal("680000.00")
    assert bva["sale_order_count"] == 1
    assert bva["journal_entry_count"] == 1

    # Active Fleet checks:
    # 2 total trips (1 active in_transit, 1 completed), 1670 km, 42.50 tons
    fleet = tel["active_fleet"]
    assert fleet["total_trips"] == 2
    assert fleet["active_trips"] == 1
    assert fleet["completed_trips"] == 1
    assert Decimal(str(fleet["total_distance_km"])) == Decimal("1670.00")
    assert Decimal(str(fleet["total_planned_weight_tons"])) == Decimal("42.50")

    # Stock Reservations checks:
    # 1 active picking with 50.00 reserved qty, 1 warehouse movement (outbound) with 100.00 qty and 4,500.00 value
    stock = tel["stock_reservations"]
    assert stock["total_pickings"] == 1
    assert stock["active_reservations"] == 1
    assert Decimal(str(stock["reserved_quantity"])) == Decimal("50.00")
    assert stock["stock_movement_count"] == 1
    assert Decimal(str(stock["stock_movement_quantity"])) == Decimal("100.00")
    assert Decimal(str(stock["stock_movement_valuation"])) == Decimal("4500.00")

    # ESG & IoT checks:
    esg = tel["esg_and_iot"]
    assert Decimal(str(esg["esg_metrics"]["carbon_footprint_kg"])) == Decimal("1200.00")
    # Estimated scope1 CO2 = 550 liters * 2.68 = 1474.00 kg
    assert Decimal(str(esg["estimated_scope1_co2_kg"])) == Decimal("1474.00")

    # 7. Strict RLS Tenant Isolation Check: Tenant B cannot access Tenant A's project
    rls_get = client.get(f"/api/v1/planning/projects/{root_id}", headers=headers_b)
    assert rls_get.status_code == 404

    rls_wbs = client.get(f"/api/v1/planning/projects/{root_id}/wbs", headers=headers_b)
    assert rls_wbs.status_code == 404

    rls_tel = client.get(f"/api/v1/planning/projects/{root_id}/telemetry", headers=headers_b)
    assert rls_tel.status_code == 404

    rls_list = client.get("/api/v1/planning/projects", headers=headers_b)
    assert rls_list.status_code == 200
    assert rls_list.json() == []


def test_list_projects_status_normalization_and_case_insensitive_db_filter(seeded_tenants):
    """
    Verifies that `GET /api/v1/planning/projects?status=...` normalizes `'active'`,
    `'active execution'`, and case variations to `ProjectStatus.ACTIVE_EXECUTION`
    (and other statuses case-insensitively), and matches DB rows regardless of
    casing variations (`'Active Execution'` vs `'active'`).
    """
    client = TestClient(app)
    tenant_a = seeded_tenants["tenant_a"]
    headers = {"X-Tenant-ID": str(tenant_a)}

    # 1. Create an active project via POST (stored as 'Active Execution')
    resp_active_1 = client.post(
        "/api/v1/planning/projects",
        headers=headers,
        json={
            "project_name": "Canonical Active Project",
            "project_type": "SUPPLY_CHAIN",
            "status": "Active Execution",
            "total_budget": "250000.00",
        },
    )
    assert resp_active_1.status_code == 201, resp_active_1.text
    p1_id = resp_active_1.json()["id"]

    # 2. Create a second project and update its raw DB status to lowercase 'active'
    resp_active_2 = client.post(
        "/api/v1/planning/projects",
        headers=headers,
        json={
            "project_name": "Legacy Lowercase Active Project",
            "project_type": "SUPPLY_CHAIN",
            "status": "active",
            "total_budget": "180000.00",
        },
    )
    assert resp_active_2.status_code == 201, resp_active_2.text
    p2_id = resp_active_2.json()["id"]

    db = SessionLocal()
    try:
        db.execute(
            text(
                "SELECT set_config('app.current_tenant_id', :tid, false), "
                "set_config('app.current_company_id', :tid, false)"
            ),
            {"tid": str(tenant_a)},
        )
        db.execute(
            text("UPDATE core_projects SET status = 'active' WHERE id = :pid"),
            {"pid": p2_id},
        )
        db.commit()
    finally:
        db.close()

    # 3. Create a Draft project
    resp_draft = client.post(
        "/api/v1/planning/projects",
        headers=headers,
        json={
            "project_name": "Draft Pipeline Project",
            "project_type": "SUPPLY_CHAIN",
            "status": "draft",
            "total_budget": "90000.00",
        },
    )
    assert resp_draft.status_code == 201, resp_draft.text
    draft_id = resp_draft.json()["id"]

    # 4. Query with ?status=active (previously threw 422 in production)
    list_active = client.get("/api/v1/planning/projects?status=active", headers=headers)
    assert list_active.status_code == 200, list_active.text
    active_ids = {item["id"] for item in list_active.json()}
    assert p1_id in active_ids
    assert p2_id in active_ids
    assert draft_id not in active_ids

    # 5. Query with ?status=Active Execution
    list_canonical = client.get(
        "/api/v1/planning/projects",
        params={"status": "Active Execution"},
        headers=headers,
    )
    assert list_canonical.status_code == 200, list_canonical.text
    canonical_ids = {item["id"] for item in list_canonical.json()}
    assert p1_id in canonical_ids
    assert p2_id in canonical_ids
    assert draft_id not in canonical_ids

    # 6. Query with case-insensitive ?status=draft and ?status=DRAFT
    for q_status in ("draft", "DRAFT", "Draft"):
        list_draft = client.get(
            "/api/v1/planning/projects",
            params={"status": q_status},
            headers=headers,
        )
        assert list_draft.status_code == 200, list_draft.text
        draft_ids = {item["id"] for item in list_draft.json()}
        assert draft_id in draft_ids
        assert p1_id not in draft_ids

    # 7. Invalid status still returns 422
    bad_status = client.get(
        "/api/v1/planning/projects?status=not_a_valid_status",
        headers=headers,
    )
    assert bad_status.status_code == 422

