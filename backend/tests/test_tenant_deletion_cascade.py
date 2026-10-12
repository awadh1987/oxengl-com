import uuid
from decimal import Decimal
from datetime import datetime
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.database import SessionLocal
from backend import models
from backend.tests.auth_helpers import platform_superadmin_headers
from backend.app.domains.inventory.models import Material

client = TestClient(app)


def test_tenant_deletion_cascade_cleans_child_records_and_returns_clean_json():
    """
    Sprint 3 Verification:
    Tests that DELETE /api/master/platform/tenants/{tenant_id} safely cascades
    and purges child records (users, partners, pickings, trips, invoices, materials)
    and returns clean JSON responses without 500 HTML/text errors.
    """
    db = SessionLocal()
    cid = uuid.uuid4()
    slug = f"test-del-{cid.hex[:6]}"
    
    # 1. Create company
    comp = models.ResCompany(id=cid, name=f"Delete Test Corp {cid.hex[:6]}", slug=slug, domain_slug=slug)
    db.add(comp)
    db.commit()

    # 2. Add child records:
    admin_headers, admin_user = platform_superadmin_headers(db)
    admin_id = admin_user.id
    user = models.ResUser(email=f"del_{cid.hex[:6]}@oxen.sa", company_id=cid, full_name="Del User")
    partner = models.ResPartner(company_id=cid, name=f"Partner {cid.hex[:6]}")
    db.add_all([user, partner])
    db.commit()

    loc1 = models.StockLocation(company_id=cid, name=f"Loc 1 {cid.hex[:6]}", location_type="internal")
    loc2 = models.StockLocation(company_id=cid, name=f"Loc 2 {cid.hex[:6]}", location_type="customer")
    db.add_all([loc1, loc2])
    db.commit()

    picking = models.StockPicking(
        company_id=cid, partner_id=partner.id, reference=f"PICK-DEL-{cid.hex[:6]}", picking_type="outgoing"
    )
    db.add(picking)
    db.commit()

    trip = models.WeighbridgeTicket(
        company_id=cid,
        picking_id=picking.id,
        ticket_number=f"TKT-DEL-{cid.hex[:6]}",
        truck_number="TRK-DEL-1",
        gross_weight=Decimal("45.0"),
        tare_weight=Decimal("15.0"),
        net_weight=Decimal("30.0"),
        uom="MT"
    )
    inv = models.CustomerInvoice(
        company_id=cid,
        invoice_number=f"INV-DEL-{cid.hex[:6]}",
        customer_name="Del Customer",
        issue_date=datetime.now()
    )
    mat = Material(
        tenant_id=cid,
        company_id=cid,
        code=f"MAT-DEL-{cid.hex[:6]}",
        name="Cascade Material",
        primary_uom="KG",
        standard_cost=Decimal("20.00"),
        current_moving_avg_cost=Decimal("20.00")
    )
    db.add_all([trip, inv, mat])
    db.commit()
    db.close()

    # 3. Test wrong confirmation phrase returns 400 clean JSON:
    res_wrong = client.request("DELETE", f"/api/master/platform/tenants/{cid}", json={"confirm_phrase": "WRONG-PHRASE"}, headers=admin_headers)
    assert res_wrong.status_code == 400
    wrong_json = res_wrong.json()
    assert "detail" in wrong_json
    assert "Destructive safety check failed" in wrong_json["detail"]

    # 4. Test correct confirmation phrase:
    res_correct = client.request("DELETE", f"/api/master/platform/tenants/{cid}", json={"confirm_phrase": f"CONFIRM-DELETE-{slug}"}, headers=admin_headers)
    assert res_correct.status_code == 200
    correct_json = res_correct.json()
    assert correct_json.get("success") is True
    assert correct_json.get("tenant_slug") == slug

    # 5. Verify all records purged from database without orphans:
    db = SessionLocal()
    try:
        assert db.query(models.ResCompany).filter(models.ResCompany.id == cid).first() is None
        assert db.query(models.ResUser).filter(models.ResUser.company_id == cid).first() is None
        assert db.query(models.ResPartner).filter(models.ResPartner.company_id == cid).first() is None
        assert db.query(models.StockLocation).filter(models.StockLocation.company_id == cid).first() is None
        assert db.query(models.StockPicking).filter(models.StockPicking.company_id == cid).first() is None
        assert db.query(models.WeighbridgeTicket).filter(models.WeighbridgeTicket.company_id == cid).first() is None
        assert db.query(models.CustomerInvoice).filter(models.CustomerInvoice.company_id == cid).first() is None
        assert db.query(Material).filter(Material.company_id == cid).first() is None
    finally:
        db.rollback()
        db.query(models.ResUser).filter(models.ResUser.id == admin_id).delete()
        db.commit()
        db.close()
