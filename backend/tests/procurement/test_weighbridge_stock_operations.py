"""
Tests for OxenGL Weighbridge Tickets & Stock Picking Operations Integration (REM-P2-02).
Verifies weighbridge operation posting creates linked StockPicking, StockMove (Decimal 18,4),
and WeighbridgeTicket records in PostgreSQL.
"""
import uuid
import pytest
from decimal import Decimal
from starlette.testclient import TestClient

from backend.app.main import app, create_session_token
from backend.database import SessionLocal
from backend.models import ResCompany, ResUser, StockPicking, StockMove, WeighbridgeTicket

client = TestClient(app)


@pytest.fixture
def weighbridge_test_company():
    """Provides a temporary company, admin user, and auth headers for weighbridge operation tests."""
    db = SessionLocal()
    cid = uuid.uuid4()
    company = ResCompany(
        id=cid,
        name=f"Weighbridge Test Corp {cid.hex[:6]}",
        slug=f"wb-{cid.hex[:6]}",
        domain_slug=f"wb-{cid.hex[:6]}",
        currency="SAR",
        tax_id=f"300{cid.hex[:8]}",
        commercial_registration=f"101{cid.hex[:7]}",
        is_active=True,
    )
    db.add(company)

    user = ResUser(
        id=uuid.uuid4(),
        firebase_uid=f"wb-user-{cid.hex[:6]}",
        email=f"wb-{cid.hex[:6]}@example.com",
        full_name="Weighbridge Test Admin",
        company_id=cid,
        role="Admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    token = create_session_token(
        subject=user.email,
        company_id=company.id,
        role="Admin",
        tenant_slug=company.slug,
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": str(company.id),
    }

    yield {"company": company, "headers": headers, "cid": str(cid)}

    # Cleanup operations
    pickings = db.query(StockPicking).filter(StockPicking.company_id == cid).all()
    picking_ids = [p.id for p in pickings]
    if picking_ids:
        db.query(WeighbridgeTicket).filter(WeighbridgeTicket.picking_id.in_(picking_ids)).delete(synchronize_session=False)
        db.query(StockMove).filter(StockMove.picking_id.in_(picking_ids)).delete(synchronize_session=False)
        db.query(StockPicking).filter(StockPicking.id.in_(picking_ids)).delete(synchronize_session=False)
    from backend.models import ResPartner, StockLocation, StockQuant, ProductProduct
    db.query(StockQuant).filter(StockQuant.company_id == cid).delete(synchronize_session=False)
    db.query(StockLocation).filter(StockLocation.company_id == cid).delete(synchronize_session=False)
    db.query(ProductProduct).filter(ProductProduct.company_id == cid).delete(synchronize_session=False)
    db.query(ResPartner).filter(ResPartner.company_id == cid).delete(synchronize_session=False)
    db.delete(user)
    db.delete(company)
    db.commit()
    db.close()


def test_weighbridge_operation_creation_and_stock_moves(weighbridge_test_company):
    """POST /api/operations/weighbridge maps gross/tare/net weights cleanly to StockPicking and StockMove."""
    cid = weighbridge_test_company["cid"]
    headers = weighbridge_test_company["headers"]
    t_no = f"WB-{uuid.uuid4().hex[:6].upper()}"

    payload = {
        "partner_name": "Al-Yamamah Steel Corp",
        "product_name": "Reinforcing Steel Deformed Bars (16mm)",
        "gross_weight": 42500.0,
        "tare_weight": 14200.0,
        "net_weight": 28300.0,
        "source_location_name": "WH/Stock/Bulk",
        "dest_location_name": "WH/Output/Staging",
        "ticket_number": t_no,
        "plate_number": "KSA-9988-XYZ",
        "driver_name": "Tariq Mansoor",
        "unit_of_measure": "MT",
        "company_id": cid,
    }

    resp = client.post("/api/operations/weighbridge", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    ticket_data = resp.json()

    assert ticket_data["ticket_id"] is not None
    assert ticket_data["ticket_number"] == t_no
    assert Decimal(str(ticket_data["net_weight"])) == Decimal("28300.0000")
    assert ticket_data["picking_id"] is not None
    picking_id = uuid.UUID(ticket_data["picking_id"])

    # Verify directly in PostgreSQL
    db = SessionLocal()
    try:
        db_picking = db.query(StockPicking).filter(StockPicking.id == picking_id).first()
        assert db_picking is not None
        assert str(db_picking.company_id) == cid
        assert db_picking.picking_type == "outgoing"
        assert db_picking.state == "done"

        db_moves = db.query(StockMove).filter(StockMove.picking_id == picking_id).all()
        assert len(db_moves) == 1
        move = db_moves[0]
        assert move.state == "done"
        assert Decimal(str(move.quantity_planned)) == Decimal("28300.0000")
        assert Decimal(str(move.quantity_done)) == Decimal("28300.0000")

        db_wb = db.query(WeighbridgeTicket).filter(WeighbridgeTicket.id == uuid.UUID(ticket_data["ticket_id"])).first()
        assert db_wb is not None
        assert Decimal(str(db_wb.gross_weight)) == Decimal("42500.0000")
        assert Decimal(str(db_wb.tare_weight)) == Decimal("14200.0000")
        assert Decimal(str(db_wb.net_weight)) == Decimal("28300.0000")
        assert db_wb.truck_number == "KSA-9988-XYZ"
    finally:
        db.close()

    # Verify listing via GET /api/operations
    list_resp = client.get("/api/operations", headers=headers)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert any(item["ticket_number"] == t_no for item in items)

    # Verify single item detail via GET /api/operations/{picking_id}
    detail_resp = client.get(f"/api/operations/{picking_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["picking_id"] == str(picking_id)
    assert detail["ticket_number"] == t_no


def test_weighbridge_operation_delete(weighbridge_test_company):
    """DELETE /api/operations/{picking_id} removes picking, move, and weighbridge records."""
    cid = weighbridge_test_company["cid"]
    headers = weighbridge_test_company["headers"]
    t_no = f"WB-DEL-{uuid.uuid4().hex[:6].upper()}"

    payload = {
        "partner_name": "Temporary Supplier",
        "product_name": "Standard Aggregate 20mm",
        "gross_weight": 30000.0,
        "tare_weight": 10000.0,
        "net_weight": 20000.0,
        "source_location_name": "WH/Raw",
        "dest_location_name": "WH/Crusher",
        "ticket_number": t_no,
        "truck_number": "TRK-DEL-01",
        "company_id": cid,
    }

    create_resp = client.post("/api/operations/weighbridge", json=payload, headers=headers)
    assert create_resp.status_code == 201
    picking_id = create_resp.json()["picking_id"]

    del_resp = client.delete(f"/api/operations/{picking_id}", headers=headers)
    assert del_resp.status_code in (200, 204)

    # Verify 404 on subsequent get
    get_resp = client.get(f"/api/operations/{picking_id}", headers=headers)
    assert get_resp.status_code == 404


def test_weighbridge_operation_identical_locations_rejected(weighbridge_test_company):
    """Weighbridge creation must fail validation if source and destination locations are identical."""
    cid = weighbridge_test_company["cid"]
    headers = weighbridge_test_company["headers"]

    payload = {
        "partner_name": "Al-Yamamah Steel Corp",
        "product_name": "Steel Rebar",
        "gross_weight": 20000.0,
        "tare_weight": 10000.0,
        "net_weight": 10000.0,
        "source_location_name": "WH/Stock",
        "dest_location_name": "WH/Stock",  # Identical!
        "ticket_number": "WB-INVALID-001",
        "company_id": cid,
    }

    resp = client.post("/api/operations/weighbridge", json=payload, headers=headers)
    assert resp.status_code == 422


@pytest.mark.parametrize("uom", ["MT طن", "kg", "truck", "CBM"])
def test_weighbridge_dynamic_uom_support(weighbridge_test_company, uom):
    """Verifies that weighbridge operations support dynamic units: MT طن, kg, truck, CBM."""
    cid = weighbridge_test_company["cid"]
    headers = weighbridge_test_company["headers"]
    t_no = f"WB-UOM-{uom.split()[0]}-{uuid.uuid4().hex[:4].upper()}"

    payload = {
        "partner_name": f"Supplier {uom}",
        "product_name": f"Material in {uom}",
        "gross_weight": 50000.0,
        "tare_weight": 20000.0,
        "net_weight": 30000.0,
        "source_location_name": "WH/SourceYard",
        "dest_location_name": "WH/DestDepot",
        "ticket_number": t_no,
        "truck_number": "TRK-UOM-01",
        "unit_of_measure": uom,
        "company_id": cid,
    }

    create_resp = client.post("/api/operations/weighbridge", json=payload, headers=headers)
    assert create_resp.status_code == 201
    ticket_data = create_resp.json()
    assert ticket_data["unit_of_measure"] == uom

    # Query DB to ensure persistence
    db = SessionLocal()
    try:
        db_wb = db.query(WeighbridgeTicket).filter(WeighbridgeTicket.id == uuid.UUID(ticket_data["ticket_id"])).first()
        assert db_wb is not None
        assert db_wb.unit_of_measure == uom
    finally:
        db.close()

