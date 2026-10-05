"""Supplier contracts, requisitions, allowances and adjustments carry custom_attributes."""

import uuid


from backend import models
from backend.app.api.v1.procurement import (
    PurchaseRequisitionCreate,
    SupplierContractPayload,
    create_purchase_requisition,
    create_supplier_contract,
    list_purchase_requisitions,
    list_supplier_contracts,
    update_supplier_contract,
)
from backend.app.services.custom_fields import canonical_entity
from backend.database import SessionLocal


def _company(db):
    c = models.ResCompany(id=uuid.uuid4(), name=f"Patch Co {uuid.uuid4().hex[:6]}")
    db.add(c)
    db.commit()
    return c


def test_aliases():
    assert canonical_entity("supplier_contract") == "supplier_contract"
    assert canonical_entity("stock_adjustment") == "stock_adjustment"
    assert canonical_entity("payroll_allowance") == "payroll_allowance"


def test_contract_and_requisition_tenant_scoped():
    db = SessionLocal()
    try:
        a, b = _company(db), _company(db)
        created = create_supplier_contract(
            SupplierContractPayload(supplier_name="Acme", title="Frame", custom_attributes={"incoterm": "FOB"}),
            db=db, company_id=a.id,
        )
        assert created["custom_attributes"] == {"incoterm": "FOB"}
        updated = update_supplier_contract(
            uuid.UUID(created["id"]), SupplierContractPayload(supplier_name="Acme", title="Frame", custom_attributes={"region": "KSA"}),
            db=db, company_id=a.id,
        )
        assert updated["custom_attributes"] == {"incoterm": "FOB", "region": "KSA"}
        assert list_supplier_contracts(db=db, company_id=b.id) == []

        create_purchase_requisition(
            PurchaseRequisitionCreate(title="Pens", department="Ops", lines=[{"line_total": 5}], custom_attributes={"urgency": "high"}),
            db=db, company_id=a.id, x_user_id=None,
        )
        rows = list_purchase_requisitions(db=db, company_id=a.id)
        assert rows[0]["custom_attributes"] == {"urgency": "high"}
        assert list_purchase_requisitions(db=db, company_id=b.id) == []
    finally:
        db.close()
