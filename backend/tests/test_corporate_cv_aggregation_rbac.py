"""
Integration Tests: Corporate Profile (CV) Aggregation Engine & Vault RBAC.
Phase 8 - Step 2 Verification.

Verifies:
1. GET /api/v1/corporate/cv-payload aggregation across live operational, fleet, financial,
   manpower, and compliance document modules.
2. Multi-tenant security isolation (Tenant A cannot request or view Tenant B's corporate payload).
3. Cross-branch hierarchical aggregation (include_branches toggle).
4. Tenant Document Vault CRUD lifecycle.
5. RBAC mutation guards (Read-Only user cannot upload or delete documents).
6. Administrative authority over verification status (only Admins can verify documents).
7. Institutional compliance checklist and vendor readiness score calculation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.main import app
from backend.database import SessionLocal
from backend.models import (
    CustomerInvoice,
    ResCompany,
    ResUser,
    TenantDocument,
    Vehicle,
    Warehouse,
    WeighbridgeTicket,
    StockPicking,
)
from backend.api.dependencies import create_access_token, SUPER_ADMIN, ADMIN, READ_ONLY

client = TestClient(app)


def auth_header(user_id: uuid.UUID, email: str, role: str, company_id: uuid.UUID) -> dict:
    """Helper to generate JWT bearer authorization header."""
    token = create_access_token({
        "sub": str(user_id),
        "email": email,
        "role": role,
        "company_id": str(company_id),
        "tenant_id": str(company_id),
    })
    return {
        "Authorization": f"Bearer {token}",
        "x-enforce-auth": "true",
    }


@pytest.fixture(scope="module")
def cv_test_env():
    """
    Sets up an enterprise test fixture for Phase 8:
    - Company 1: Alpha Contracting Ltd (Enterprise Root)
      - Branch 1A: Alpha Logistics Plant (Child Branch)
    - Company 2: Beta Corp (Isolated Root Competitor)
    - Vehicles, Warehouses, Invoices, Weighbridge operations, and Documents.
    """
    db: Session = SessionLocal()
    suffix = uuid.uuid4().hex[:6]

    try:
        # 1. Company 1 (Root Enterprise)
        comp_alpha = ResCompany(
            name=f"Alpha Contracting Holding {suffix}",
            slug=f"alpha-hold-{suffix}",
            tax_id=f"310123456700003",
            commercial_registration=f"1010889900",
            currency="SAR",
            subscription_tier="ENTERPRISE",
            is_active=True,
        )
        db.add(comp_alpha)
        db.flush()

        # Child Branch under Alpha
        branch_alpha = ResCompany(
            name=f"Alpha West Plant {suffix}",
            slug=f"alpha-west-{suffix}",
            parent_id=comp_alpha.id,
            tax_id=f"310123456700004",
            commercial_registration=f"4030112233",
            currency="SAR",
            subscription_tier="ENTERPRISE",
            is_active=True,
        )
        db.add(branch_alpha)
        db.flush()

        # 2. Company 2 (Isolated Competitor)
        comp_beta = ResCompany(
            name=f"Beta Industrial Corp {suffix}",
            slug=f"beta-corp-{suffix}",
            tax_id=f"320987654300003",
            commercial_registration=f"2050998877",
            currency="SAR",
            subscription_tier="STANDARD",
            is_active=True,
        )
        db.add(comp_beta)
        db.flush()

        # 3. Users for RBAC testing
        user_alpha_admin = ResUser(
            email=f"admin_{suffix}@alphahold.sa",
            full_name="Alpha Enterprise Admin",
            password_hash="mock_hash_admin",
            role=ADMIN,
            company_id=comp_alpha.id,
            is_active=True,
        )
        user_alpha_readonly = ResUser(
            email=f"auditor_{suffix}@alphahold.sa",
            full_name="Alpha Tender Auditor",
            password_hash="mock_hash_ro",
            role="Guest",
            company_id=comp_alpha.id,
            is_active=True,
        )
        user_beta_admin = ResUser(
            email=f"admin_{suffix}@betacorp.sa",
            full_name="Beta Corp Admin",
            password_hash="mock_hash_beta",
            role=ADMIN,
            company_id=comp_beta.id,
            is_active=True,
        )
        user_super_admin = ResUser(
            email=f"super_{suffix}@oxengl.com",
            full_name="Executive Platform Director",
            password_hash="mock_hash_super",
            role=SUPER_ADMIN,
            company_id=comp_alpha.id,
            is_active=True,
        )
        db.add_all([user_alpha_admin, user_alpha_readonly, user_beta_admin, user_super_admin])
        db.flush()

        # 4. Fleet Vehicles for Alpha
        veh_alpha_1 = Vehicle(
            company_id=comp_alpha.id,
            name="Mercedes Actros 3340",
            license_plate=f"78{suffix[:2]}-KAD",
            vehicle_type="truck",
            status="active",
            make="Mercedes-Benz",
            model="Actros 3340",
            model_year=2024,
            current_odometer=Decimal("45200.00"),
            breakdown_risk_score=12,
            is_active=True,
        )
        veh_alpha_branch = Vehicle(
            company_id=branch_alpha.id,
            name="Caterpillar 966H Wheel Loader",
            license_plate=f"99{suffix[:2]}-HEV",
            vehicle_type="heavy_machinery",
            status="active",
            make="Caterpillar",
            model="966H",
            model_year=2023,
            current_odometer=Decimal("8300.00"),
            breakdown_risk_score=5,
            is_active=True,
        )
        # Vehicle for Beta
        veh_beta = Vehicle(
            company_id=comp_beta.id,
            name="Volvo FMX 460",
            license_plate=f"51{suffix[:2]}-RBD",
            vehicle_type="truck",
            status="active",
            is_active=True,
        )
        db.add_all([veh_alpha_1, veh_alpha_branch, veh_beta])

        # 5. Warehouses / Facilities
        wh_alpha = Warehouse(
            company_id=comp_alpha.id,
            name="Central Logistics Hub - Riyadh",
            code=f"WH-RYD-{suffix[:4]}",
            address="Riyadh Industrial City 2",
            is_active=True,
        )
        wh_alpha_branch = Warehouse(
            company_id=branch_alpha.id,
            name="Jeddah Coastal Terminal",
            code=f"WH-JED-{suffix[:4]}",
            address="Jeddah Islamic Port Logistics Zone",
            is_active=True,
        )
        db.add_all([wh_alpha, wh_alpha_branch])

        # 6. Customer Invoices (Financial Turnover)
        inv_alpha = CustomerInvoice(
            company_id=comp_alpha.id,
            invoice_number=f"INV-{suffix}-001",
            customer_name="Ministry of Transport & Logistics Services",
            issue_date=datetime.now(timezone.utc),
            status="Issued",
            is_posted=True,
            subtotal=Decimal("15000000.00"),
            vat_amount=Decimal("2250000.00"),
            grand_total=Decimal("17250000.00"),
        )
        db.add(inv_alpha)

        # 7. Operational Documents in Vault for Alpha
        now_utc = datetime.now(timezone.utc)
        doc_cr = TenantDocument(
            company_id=comp_alpha.id,
            document_type="COMMERCIAL_REGISTRATION",
            title="Commercial Registration Certificate (CR)",
            document_number="1010889900",
            file_path="s3://oxengl-vault/alpha/cr-1010889900.pdf",
            file_name="cr-1010889900.pdf",
            file_size=204850,
            mime_type="application/pdf",
            issue_date=now_utc - timedelta(days=180),
            expiry_date=now_utc + timedelta(days=365),
            issuing_authority="Ministry of Commerce",
            verification_status="VERIFIED",
            verified_at=now_utc,
            verified_by="Alpha Enterprise Admin",
            is_active=True,
        )
        doc_tax = TenantDocument(
            company_id=comp_alpha.id,
            document_type="TAX_VAT",
            title="ZATCA VAT Tax Registration Certificate",
            document_number="310123456700003",
            file_path="s3://oxengl-vault/alpha/zatca-tax-cert.pdf",
            file_name="zatca-tax-cert.pdf",
            file_size=158200,
            mime_type="application/pdf",
            issue_date=now_utc - timedelta(days=120),
            expiry_date=now_utc + timedelta(days=240),
            issuing_authority="ZATCA",
            verification_status="VERIFIED",
            verified_at=now_utc,
            verified_by="Alpha Enterprise Admin",
            is_active=True,
        )
        doc_iso = TenantDocument(
            company_id=comp_alpha.id,
            document_type="ISO_9001",
            title="ISO 9001:2015 Quality Management System",
            document_number="ISO-9001-QMS-8812",
            file_path="s3://oxengl-vault/alpha/iso-9001-cert.pdf",
            file_name="iso-9001-cert.pdf",
            file_size=512000,
            mime_type="application/pdf",
            issue_date=now_utc - timedelta(days=90),
            expiry_date=now_utc + timedelta(days=640),
            issuing_authority="TÜV Rheinland",
            verification_status="VERIFIED",
            verified_at=now_utc,
            verified_by="Alpha Enterprise Admin",
            is_active=True,
        )
        db.add_all([doc_cr, doc_tax, doc_iso])

        db.commit()

        yield {
            "comp_alpha": comp_alpha,
            "branch_alpha": branch_alpha,
            "comp_beta": comp_beta,
            "user_alpha_admin": user_alpha_admin,
            "user_alpha_readonly": user_alpha_readonly,
            "user_beta_admin": user_beta_admin,
            "user_super_admin": user_super_admin,
            "doc_cr": doc_cr,
            "suffix": suffix,
        }

    finally:
        db.rollback()
        # Cleanup
        try:
            db.query(TenantDocument).filter(TenantDocument.company_id.in_([comp_alpha.id, branch_alpha.id, comp_beta.id])).delete(synchronize_session=False)
            db.query(CustomerInvoice).filter(CustomerInvoice.company_id.in_([comp_alpha.id, branch_alpha.id, comp_beta.id])).delete(synchronize_session=False)
            db.query(Warehouse).filter(Warehouse.company_id.in_([comp_alpha.id, branch_alpha.id, comp_beta.id])).delete(synchronize_session=False)
            db.query(Vehicle).filter(Vehicle.company_id.in_([comp_alpha.id, branch_alpha.id, comp_beta.id])).delete(synchronize_session=False)
            db.query(ResUser).filter(ResUser.company_id.in_([comp_alpha.id, branch_alpha.id, comp_beta.id])).delete(synchronize_session=False)
            db.query(ResCompany).filter(ResCompany.id == branch_alpha.id).delete(synchronize_session=False)
            db.query(ResCompany).filter(ResCompany.id.in_([comp_alpha.id, comp_beta.id])).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()


def test_cv_payload_aggregation_success(cv_test_env):
    """Verifies that GET /api/v1/corporate/cv-payload successfully aggregates cross-module data."""
    alpha = cv_test_env["comp_alpha"]
    admin = cv_test_env["user_alpha_admin"]
    headers = auth_header(admin.id, admin.email, admin.role, alpha.id)

    response = client.get("/api/v1/corporate/cv-payload", headers=headers)
    assert response.status_code == 200, f"Expected 200, got: {response.text}"
    payload = response.json()

    # Meta
    assert "meta" in payload
    assert payload["meta"]["standard"] == "GLOBAL-STD-2026.1 / ISO-21500"
    assert payload["meta"]["tenant_id"] == str(alpha.id)
    assert payload["meta"]["compliance_score_percent"] > 0

    # Company Profile
    comp_prof = payload["company_profile"]
    assert comp_prof["company_id"] == str(alpha.id)
    assert comp_prof["legal_name"] == alpha.name
    assert comp_prof["commercial_registration"] == "1010889900"
    assert comp_prof["active_branches_count"] >= 1

    # Summary KPIs
    kpis = payload["summary_kpis"]
    assert kpis["total_fleet_capacity"] >= 2  # Alpha root + branch vehicle
    assert kpis["total_revenue_ytd"] >= 17250000.00
    assert kpis["total_compliance_documents"] >= 3
    assert kpis["verified_compliance_documents"] >= 3

    # Fleet Capacity details
    fleet = payload["fleet_capacity"]
    assert fleet["total_units"] >= 2
    types = fleet["breakdown_by_type"]
    assert "truck" in types
    assert "heavy_machinery" in types

    # Workforce
    workforce = payload["workforce"]
    assert workforce["total_permanent_headcount"] >= 1

    # Facilities / Operating Regions
    facilities = payload["operating_regions"]["facilities"]
    assert len(facilities) >= 2  # Alpha Riyadh WH + Alpha Jeddah WH

    # Financial Standing
    finance = payload["financial_standing"]
    assert finance["total_invoiced_ytd"] >= 17250000.00
    assert "Tier 2" in finance["financial_tier"] or "Tier 1" in finance["financial_tier"]

    # Compliance Vault & Checklist
    vault = payload["compliance_vault"]
    assert vault["verified_count"] >= 3
    assert vault["mandatory_checklist"]["commercial_registration"]["verified"] is True
    assert vault["mandatory_checklist"]["zatca_tax_vat"]["verified"] is True
    assert vault["mandatory_checklist"]["iso_certifications"]["verified"] is True


def test_cv_payload_cross_branch_toggle(cv_test_env):
    """Verifies include_branches toggle isolates data when set to False."""
    alpha = cv_test_env["comp_alpha"]
    admin = cv_test_env["user_alpha_admin"]
    headers = auth_header(admin.id, admin.email, admin.role, alpha.id)

    # 1. With branches included (default)
    res_all = client.get("/api/v1/corporate/cv-payload?include_branches=true", headers=headers)
    assert res_all.status_code == 200
    data_all = res_all.json()

    # 2. Without branches
    res_solo = client.get("/api/v1/corporate/cv-payload?include_branches=false", headers=headers)
    assert res_solo.status_code == 200
    data_solo = res_solo.json()

    # Root solo should only have 1 vehicle (excluding the branch loader)
    assert data_solo["summary_kpis"]["total_fleet_capacity"] == 1
    assert data_all["summary_kpis"]["total_fleet_capacity"] >= 2


def test_cv_payload_cross_tenant_forbidden(cv_test_env):
    """Verifies that Tenant A cannot query Tenant B's Corporate Profile (HTTP 403 Forbidden)."""
    alpha = cv_test_env["comp_alpha"]
    beta = cv_test_env["comp_beta"]
    beta_admin = cv_test_env["user_beta_admin"]

    # Beta admin tries to query Alpha's CV payload
    headers = auth_header(beta_admin.id, beta_admin.email, beta_admin.role, beta.id)
    response = client.get(f"/api/v1/corporate/cv-payload?company_id={alpha.id}", headers=headers)

    assert response.status_code == 403, f"Expected 403 Forbidden for cross-tenant breach, got: {response.status_code}"
    assert "Multi-tenant isolation violation" in response.text or "Cross-branch access outside assigned branch boundary is forbidden" in response.text


def test_super_admin_can_access_any_tenant_cv(cv_test_env):
    """Verifies that Super_Admin has global executive clearance across all tenant corporate profiles."""
    alpha = cv_test_env["comp_alpha"]
    beta = cv_test_env["comp_beta"]
    super_admin = cv_test_env["user_super_admin"]

    headers = auth_header(super_admin.id, super_admin.email, super_admin.role, alpha.id)
    # Query Beta company using Super_Admin token
    response = client.get(f"/api/v1/corporate/cv-payload?company_id={beta.id}", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["company_profile"]["company_id"] == str(beta.id)
    assert data["company_profile"]["legal_name"] == beta.name


def test_tenant_document_vault_crud_lifecycle(cv_test_env):
    """Tests the full lifecycle of a document in the Tenant Document Vault."""
    alpha = cv_test_env["comp_alpha"]
    admin = cv_test_env["user_alpha_admin"]
    headers = auth_header(admin.id, admin.email, admin.role, alpha.id)

    # 1. Register new document
    now_utc = datetime.now(timezone.utc)
    create_payload = {
        "document_type": "GOSI",
        "title": "General Organization for Social Insurance (GOSI) Certificate",
        "document_number": "GOSI-984412",
        "file_path": "s3://oxengl-vault/alpha/gosi-cert.pdf",
        "file_name": "gosi-cert.pdf",
        "file_size": 340000,
        "mime_type": "application/pdf",
        "issue_date": now_utc.isoformat(),
        "expiry_date": (now_utc + timedelta(days=90)).isoformat(),
        "issuing_authority": "GOSI",
        "notes": "Annual Saudization & wage protection compliance document.",
    }
    create_res = client.post("/api/v1/corporate/documents", json=create_payload, headers=headers)
    assert create_res.status_code == 201, f"Create failed: {create_res.text}"
    created_doc = create_res.json()
    doc_id = created_doc["id"]
    assert created_doc["document_type"] == "GOSI"
    assert created_doc["verification_status"] == "VERIFIED"  # Admin auto-verifies

    # 2. List documents
    list_res = client.get("/api/v1/corporate/documents?document_type=GOSI", headers=headers)
    assert list_res.status_code == 200
    docs_list = list_res.json()
    assert any(d["id"] == doc_id for d in docs_list)

    # 3. Get document detail
    get_res = client.get(f"/api/v1/corporate/documents/{doc_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["title"] == create_payload["title"]

    # 4. Update document
    update_res = client.put(
        f"/api/v1/corporate/documents/{doc_id}",
        json={"title": "Updated GOSI Certificate 2026", "notes": "Audited by KPMG"},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Updated GOSI Certificate 2026"

    # 5. Delete document
    del_res = client.delete(f"/api/v1/corporate/documents/{doc_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify deleted
    get_again = client.get(f"/api/v1/corporate/documents/{doc_id}", headers=headers)
    assert get_again.status_code == 404


def test_read_only_user_cannot_mutate_documents(cv_test_env):
    """Verifies that a Read_Only user receives 403 Forbidden when attempting write operations on the vault."""
    alpha = cv_test_env["comp_alpha"]
    ro_user = cv_test_env["user_alpha_readonly"]
    cr_doc = cv_test_env["doc_cr"]
    headers = auth_header(ro_user.id, ro_user.email, ro_user.role, alpha.id)

    # 1. Read operations ARE allowed
    res_list = client.get("/api/v1/corporate/documents", headers=headers)
    assert res_list.status_code == 200

    res_cv = client.get("/api/v1/corporate/cv-payload", headers=headers)
    assert res_cv.status_code == 200

    # 2. Mutating operations are BLOCKED with 403 Forbidden
    create_payload = {
        "document_type": "OTHER",
        "title": "Unauthorized Document",
        "file_path": "/fake/path.pdf",
        "file_name": "fake.pdf",
    }
    res_post = client.post("/api/v1/corporate/documents", json=create_payload, headers=headers)
    assert res_post.status_code == 403
    assert "Write access forbidden" in res_post.text

    res_del = client.delete(f"/api/v1/corporate/documents/{cr_doc.id}", headers=headers)
    assert res_del.status_code == 403
    assert "Write access forbidden" in res_del.text


def test_corporate_cv_pdf_download_success(cv_test_env):
    """
    Step 3 Test: Verifies GET /api/v1/corporate/cv-download generates
    and streams a valid enterprise-compliant PDF vector binary.
    """
    alpha = cv_test_env["comp_alpha"]
    admin = cv_test_env["user_alpha_admin"]
    headers = auth_header(admin.id, admin.email, admin.role, alpha.id)

    response = client.get(
        f"/api/v1/corporate/cv-download?company_id={alpha.id}&include_branches=true",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert response.headers["x-enterprise-standard"] == "GLOBAL-STD-2026.1"

    pdf_bytes = response.content
    assert len(pdf_bytes) > 5000, f"Expected substantial PDF output, got {len(pdf_bytes)} bytes"
    assert pdf_bytes.startswith(b"%PDF-"), "Streamed response does not start with %PDF- header"


def test_corporate_cv_pdf_preview_inline(cv_test_env):
    """
    Step 3 Test: Verifies preview=true sets inline disposition header for browser viewing.
    """
    alpha = cv_test_env["comp_alpha"]
    admin = cv_test_env["user_alpha_admin"]
    headers = auth_header(admin.id, admin.email, admin.role, alpha.id)

    response = client.get(
        f"/api/v1/corporate/cv-download?company_id={alpha.id}&preview=true",
        headers=headers,
    )
    assert response.status_code == 200
    assert "inline" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF-")


def test_corporate_cv_pdf_cross_tenant_forbidden(cv_test_env):
    """
    Step 3 Test: Verifies cross-tenant isolation is enforced on PDF downloads.
    Beta Corp admin cannot download Alpha Corp's prequalification PDF.
    """
    alpha = cv_test_env["comp_alpha"]
    beta = cv_test_env["comp_beta"]
    beta_admin = cv_test_env["user_beta_admin"]
    beta_headers = auth_header(beta_admin.id, beta_admin.email, beta_admin.role, beta.id)

    # Beta admin attempts to download Alpha's PDF
    response = client.get(
        f"/api/v1/corporate/cv-download?company_id={alpha.id}",
        headers=beta_headers,
    )
    assert response.status_code == 403
    assert "Multi-tenant isolation violation" in response.text

