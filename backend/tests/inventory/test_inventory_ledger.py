import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
import pytest

from backend.main import app
from backend.database import SessionLocal
from backend.models import (
    Warehouse,
    Product,
    InventoryMovement,
    FinanceJournalEntry,
    ResCompany,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_post_inventory_movement_to_ledger_balanced(client):
    """Verify posting a valid inventory adjustment creates a balanced journal entry."""
    db = SessionLocal()
    company = db.query(ResCompany).first()
    assert company is not None
    tenant_id = company.id

    # Create warehouse
    wh = Warehouse(
        id=uuid.uuid4(),
        company_id=company.id,
        code=f"WH-{uuid.uuid4().hex[:5].upper()}",
        name="Test Regional Distribution Hub",
        is_active=True,
    )
    db.add(wh)

    # Create product
    prod = Product(
        id=uuid.uuid4(),
        company_id=company.id,
        sku=f"SKU-{uuid.uuid4().hex[:6].upper()}",
        name="Test Structural Steel I-Beam",
        standard_cost=Decimal("250.0000"),
        sale_price=Decimal("300.0000"),
        is_active=True,
    )
    db.add(prod)
    db.commit()

    # Create inventory movement (positive adjustment)
    movement = InventoryMovement(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        company_id=company.id,
        movement_number=f"MOV-TEST-{uuid.uuid4().hex[:6].upper()}",
        movement_type="ADJUSTMENT",
        warehouse_id=wh.id,
        product_id=prod.id,
        quantity=Decimal("10.0000"),
        unit_cost=Decimal("250.0000"),
        total_cost=Decimal("2500.0000"),
        reason="Stock count physical verification surplus",
        status="COMPLETED",
        is_posted=False,
    )
    db.add(movement)
    db.commit()

    # Post to general ledger
    response = client.post(f"/api/inventory/movements/{movement.id}/post-ledger")
    assert response.status_code == 200, response.text
    data = response.json()

    assert Decimal(str(data["total_debit"])) == Decimal("2500.0000")
    assert Decimal(str(data["total_credit"])) == Decimal("2500.0000")
    assert Decimal(str(data["total_debit"])) == Decimal(str(data["total_credit"]))
    assert len(data["lines"]) == 2

    # Verify inventory movement was updated
    db.refresh(movement)
    assert movement.is_posted is True
    assert movement.journal_entry_id is not None
    assert str(movement.journal_entry_id) == data["id"]

    # Duplicate post should be idempotent or return existing entry
    dup_res = client.post(f"/api/inventory/movements/{movement.id}/post-ledger")
    assert dup_res.status_code in [200, 400]
    db.close()


def test_post_inventory_movement_negative_adjustment_balanced(client):
    """Verify negative stock adjustment posts balanced debit and credit entries."""
    db = SessionLocal()
    company = db.query(ResCompany).first()
    assert company is not None
    tenant_id = company.id

    wh = db.query(Warehouse).first()
    prod = db.query(Product).first()

    movement = InventoryMovement(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        company_id=company.id,
        movement_number=f"MOV-SCRAP-{uuid.uuid4().hex[:6].upper()}",
        movement_type="SCRAP",
        warehouse_id=wh.id,
        product_id=prod.id,
        quantity=Decimal("-4.0000"),
        unit_cost=Decimal("150.0000"),
        total_cost=Decimal("600.0000"),
        reason="Damaged materials written off to scrap expense",
        status="COMPLETED",
        is_posted=False,
    )
    db.add(movement)
    db.commit()

    response = client.post(f"/api/inventory/movements/{movement.id}/post-ledger")
    assert response.status_code == 200, response.text
    data = response.json()

    assert Decimal(str(data["total_debit"])) == Decimal("600.0000")
    assert Decimal(str(data["total_credit"])) == Decimal("600.0000")
    assert Decimal(str(data["total_debit"])) == Decimal(str(data["total_credit"]))

    db.refresh(movement)
    assert movement.is_posted is True
    db.close()


def test_post_inventory_movement_zero_valuation_failure(client):
    """Verify zero-cost adjustment triggers 422 invariance failure."""
    db = SessionLocal()
    company = db.query(ResCompany).first()
    assert company is not None
    wh = db.query(Warehouse).first()
    prod = db.query(Product).first()

    zero_movement = InventoryMovement(
        id=uuid.uuid4(),
        tenant_id=company.id,
        company_id=company.id,
        movement_number=f"MOV-ZERO-{uuid.uuid4().hex[:6].upper()}",
        movement_type="ADJUSTMENT",
        warehouse_id=wh.id,
        product_id=prod.id,
        quantity=Decimal("0.0000"),
        unit_cost=Decimal("0.0000"),
        total_cost=Decimal("0.0000"),
        status="COMPLETED",
        is_posted=False,
    )
    db.add(zero_movement)
    db.commit()

    response = client.post(f"/api/inventory/movements/{zero_movement.id}/post-ledger")
    assert response.status_code == 422
    assert "Invariance Failure" in response.json()["detail"]
    db.close()
