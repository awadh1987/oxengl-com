"""
Integration Test Suite: Phase 10 - Procurement Tendering & Vendor Portals.
Tests:
1. Vendor Portal Registration & Two-Tier Authentication.
2. Enterprise Purchasing Organization binding to RFQ Tenders.
3. RFQ Generation from approved Purchase Requisition.
4. Cryptographic Sealed-Bid Submission (SHA-256 integrity seal).
5. Sealed-Bid Confidentiality (financial quotes masked prior to ceremony).
6. Official Unsealing Ceremony & Ranking Calculation.
7. Tender Awarding & Automatic Enterprise Purchase Order Generation.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.main import app
from backend.database import SessionLocal
from backend.models import (
    ResCompany,
    PurchasingOrganization,
    ResPartner,
    PurchaseRequisition,
    PurchaseRequisitionLine,
    PurchaseOrder,
    ProcurementTender,
    VendorPortalUser,
    ProcurementBid,
)

client = TestClient(app)


@pytest.fixture(scope="module")
def tender_test_env():
    """Sets up company, purchasing organization, partner, and test PR."""
    db: Session = SessionLocal()
    suffix = uuid.uuid4().hex[:6]

    company = ResCompany(
        id=uuid.uuid4(),
        name=f"Al-Bayan Industrial Group {suffix}",
        slug=f"al-bayan-{suffix}",
        currency="SAR",
        is_active=True,
    )
    db.add(company)
    db.flush()

    purchasing_org = PurchasingOrganization(
        id=uuid.uuid4(),
        company_id=company.id,
        code=f"PUR-RYD-{suffix.upper()}",
        name="منظمة مشتريات الرياض المركزية / Riyadh Central Purchasing Org",
        currency="SAR",
        is_active=True,
    )
    db.add(purchasing_org)
    db.flush()

    partner = ResPartner(
        id=uuid.uuid4(),
        company_id=company.id,
        name=f"Eastern Quarry Supplies Co. {suffix}",
        partner_type="raw_materials_supplier",
        commercial_registration=f"CR-{suffix}",
        tax_number=f"300{suffix}00003",
    )
    db.add(partner)
    db.flush()

    # Pre-populate a Purchase Requisition
    pr = PurchaseRequisition(
        id=uuid.uuid4(),
        tenant_id=company.id,
        pr_number=f"PR-{datetime.now(timezone.utc).strftime('%Y%m')}-{suffix}",
        requester_id=uuid.uuid4(),
        department="Operations & Civil Infrastructure",
        title=f"Quarry Aggregate Requirement {suffix}",
        justification="Required for Riyadh highway expansion project",
        currency="SAR",
        total_estimated_amount=Decimal("150000.0000"),
        status="APPROVED",
    )
    db.add(pr)
    db.flush()

    pr_line = PurchaseRequisitionLine(
        id=uuid.uuid4(),
        requisition_id=pr.id,
        item_description="Crushed Aggregate 3/4 inch",
        quantity_requested=Decimal("5000.0000"),
        uom="TON",
        estimated_unit_price=Decimal("30.0000"),
        line_total=Decimal("150000.0000"),
    )
    db.add(pr_line)
    db.commit()

    env_data = {
        "company_id": str(company.id),
        "purchasing_org_id": str(purchasing_org.id),
        "partner_id": str(partner.id),
        "pr_id": str(pr.id),
        "suffix": suffix,
    }
    db.close()
    return env_data


def test_01_vendor_portal_registration_and_login(tender_test_env):
    """Verifies external supplier registration and two-tier authentication."""
    suffix = tender_test_env["suffix"]
    email = f"supplier_{suffix}@easternquarry.com"
    password = "StrongPassword2026!"

    reg_payload = {
        "company_id": tender_test_env["company_id"],
        "email": email,
        "password": password,
        "contact_name": "Eng. Tariq Al-Ghamdi",
        "company_name": f"Eastern Quarry Trading {suffix}",
        "mobile_number": f"+9665{suffix[:8].ljust(8, '0')}",
        "commercial_registration": f"101{suffix}",
        "tax_id": f"310{suffix}00003",
    }

    # Register
    res = client.post("/api/v1/procurement/vendor/register", json=reg_payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert "access_token" in data
    assert data["role"] == "vendor"
    assert data["email"] == email

    token = data["access_token"]

    # Verify Profile endpoint with Bearer token
    profile_res = client.get(
        "/api/v1/procurement/vendor/profile",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert profile_res.status_code == 200
    assert profile_res.json()["contact_name"] == "Eng. Tariq Al-Ghamdi"

    # Login test
    login_res = client.post(
        "/api/v1/procurement/vendor/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()


def test_02_create_tender_bound_to_purchasing_organization(tender_test_env):
    """Verifies RFQ Tender creation strictly bound to Enterprise Purchasing Organization."""
    deadline = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    opening_date = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()

    payload = {
        "company_id": tender_test_env["company_id"],
        "purchasing_organization_id": tender_test_env["purchasing_org_id"],
        "title": "Supply of High-Grade Basalt Sub-base Material",
        "description": "Public tender for supply of 10,000 MT basalt aggregates.",
        "category": "Raw Materials",
        "submission_deadline": deadline,
        "bid_opening_date": opening_date,
        "currency": "SAR",
        "estimated_budget": 350000.0,
        "is_sealed_bid": True,
        "terms_and_conditions": "Sealed bids must conform to ASTM C33 specifications.",
        "lines": [
            {
                "item_code": "MAT-BASALT-01",
                "description": "Graded Basalt Aggregate 20mm-40mm",
                "quantity": 10000.0,
                "uom": "TON",
                "target_unit_price": 35.0,
                "technical_specifications": "Crush strength > 180 MPa",
            }
        ],
    }

    res = client.post("/api/v1/procurement/tenders", json=payload)
    assert res.status_code == 201, res.text
    tender = res.json()
    assert tender["tender_number"].startswith("RFQ-")
    assert tender["status"] == "OPEN"
    assert tender["purchasing_organization_id"] == tender_test_env["purchasing_org_id"]
    assert len(tender["lines"]) == 1
    assert tender["lines"][0]["item_code"] == "MAT-BASALT-01"


def test_03_generate_tender_from_purchase_requisition(tender_test_env):
    """Verifies RFQ generator directly converting PR into tender."""
    deadline = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    opening_date = (datetime.now(timezone.utc) + timedelta(days=8)).isoformat()

    gen_payload = {
        "purchase_requisition_id": tender_test_env["pr_id"],
        "purchasing_organization_id": tender_test_env["purchasing_org_id"],
        "submission_deadline": deadline,
        "bid_opening_date": opening_date,
        "title": "Aggregates Procurement from PR",
    }

    res = client.post("/api/v1/procurement/tenders/generate-from-pr", json=gen_payload)
    assert res.status_code == 201, res.text
    tender = res.json()
    assert tender["status"] == "OPEN"
    assert len(tender["lines"]) >= 1
    assert float(tender["estimated_budget"]) == 150000.0


def test_04_submit_sealed_bid_and_confidentiality(tender_test_env):
    """
    Verifies supplier sealed-bid submission and cryptographic concealment.
    Prices must be masked until the official unsealing ceremony.
    """
    # 1. Create a fresh tender
    deadline = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    opening_date = (datetime.now(timezone.utc) + timedelta(days=6)).isoformat()

    res = client.post(
        "/api/v1/procurement/tenders",
        json={
            "company_id": tender_test_env["company_id"],
            "purchasing_organization_id": tender_test_env["purchasing_org_id"],
            "title": "Road Grading Asphaltic Concrete Mix",
            "submission_deadline": deadline,
            "bid_opening_date": opening_date,
            "lines": [
                {
                    "item_code": "ASPH-01",
                    "description": "Hot Mix Asphalt Type B",
                    "quantity": 2000.0,
                    "uom": "TON",
                    "target_unit_price": 120.0,
                }
            ],
        },
    )
    assert res.status_code == 201
    tender_id = res.json()["id"]
    tender_line_id = res.json()["lines"][0]["id"]

    # 2. Supplier 1 submits sealed bid (quoted: 110 SAR/TON = 220,000 SAR)
    bid_payload_1 = {
        "tender_id": tender_id,
        "partner_id": tender_test_env["partner_id"],
        "technical_proposal": "Full compliance with AASHTO T166 standards.",
        "commercial_terms": "Net 30 days payment upon delivery.",
        "delivery_lead_time_days": 5,
        "validity_period_days": 60,
        "lines": [
            {
                "tender_line_id": tender_line_id,
                "quoted_quantity": 2000.0,
                "unit_price": 110.0,
            }
        ],
    }
    bid_res_1 = client.post(f"/api/v1/procurement/tenders/{tender_id}/bids", json=bid_payload_1)
    assert bid_res_1.status_code == 201, bid_res_1.text
    bid_1 = bid_res_1.json()
    assert bid_1["is_sealed"] is True
    assert "sealed_quote_hash" in bid_1
    assert float(bid_1["total_amount"]) == 220000.0

    # 3. Supplier 2 submits competitive bid (quoted: 105 SAR/TON = 210,000 SAR)
    bid_payload_2 = {
        "tender_id": tender_id,
        "technical_proposal": "Certified asphalt mixing facility.",
        "delivery_lead_time_days": 3,
        "validity_period_days": 60,
        "lines": [
            {
                "tender_line_id": tender_line_id,
                "quoted_quantity": 2000.0,
                "unit_price": 105.0,
            }
        ],
    }
    bid_res_2 = client.post(f"/api/v1/procurement/tenders/{tender_id}/bids", json=bid_payload_2)
    assert bid_res_2.status_code == 201
    bid_2 = bid_res_2.json()

    # 4. Check that public/unauthenticated list masks sealed amounts
    bids_list_res = client.get(f"/api/v1/procurement/tenders/{tender_id}/bids")
    assert bids_list_res.status_code == 200
    bids = bids_list_res.json()
    assert len(bids) == 2
    for b in bids:
        # Prior to unsealing ceremony, prices must be masked (None)
        assert b["total_amount"] is None
        assert b["is_sealed"] is True
        assert b["lines"][0]["unit_price"] is None

    # 5. Execute Official Unsealing Ceremony
    unseal_res = client.post(f"/api/v1/procurement/tenders/{tender_id}/unseal")
    assert unseal_res.status_code == 200, unseal_res.text
    unsealed_data = unseal_res.json()
    assert unsealed_data["status"] == "CEREMONY_COMPLETED"
    assert unsealed_data["bids_unsealed_count"] == 2

    # Verify bids are now unmasked and ranked by lowest price first (210,000 < 220,000)
    unsealed_bids = unsealed_data["bids"]
    assert float(unsealed_bids[0]["total_amount"]) == 210000.0
    assert float(unsealed_bids[1]["total_amount"]) == 220000.0
    assert unsealed_bids[0]["is_sealed"] is False
    assert float(unsealed_bids[0]["lines"][0]["unit_price"]) == 105.0

    # 6. Award Winning Bid to Supplier 2 and Verify PO Generation
    winning_bid_id = unsealed_bids[0]["id"]
    award_res = client.post(
        f"/api/v1/procurement/tenders/{tender_id}/award",
        json={
            "winning_bid_id": winning_bid_id,
            "justification_notes": "Awarded to lowest compliant bidder.",
        },
    )
    assert award_res.status_code == 200, award_res.text
    award_data = award_res.json()
    assert award_data["status"] == "AWARDED_SUCCESSFULLY"
    assert "purchase_order_id" in award_data
    assert award_data["purchase_order_number"].startswith("PO-")

    # Verify generated Purchase Order is in database bound to purchasing_organization_id
    db: Session = SessionLocal()
    po = db.execute(
        select(PurchaseOrder).where(PurchaseOrder.id == uuid.UUID(award_data["purchase_order_id"]))
    ).scalar_one_or_none()
    assert po is not None
    assert str(po.purchasing_organization_id) == tender_test_env["purchasing_org_id"]
    assert po.status == "confirmed"
    assert float(po.subtotal) == 210000.0
    db.close()
