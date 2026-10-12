"""
Tests for OxenGL Cross-Border Customs & Regulatory Manifests (REM-P2-03).
Verifies:
1. Manifest creation with automatic SHA-256 blockchain hash chaining.
2. Strict tenant isolation between Tenant A and Tenant B across all customs endpoints.
3. Valid and invalid regulatory status transitions (DRAFT -> SUBMITTED -> INSPECTION -> CLEARED).
"""
import uuid
import hashlib
from decimal import Decimal
import pytest
from starlette.testclient import TestClient

from backend.app.main import app, create_session_token
from backend.database import SessionLocal
from backend.models import ResCompany, ResUser
from backend.app.domains.logistics.customs_models import CustomsManifest

client = TestClient(app)


@pytest.fixture
def customs_test_tenants():
    """Provides two isolated tenants (Tenant A and Tenant B) with admin credentials."""
    db = SessionLocal()
    
    # 1. Tenant A
    cid_a = uuid.uuid4()
    company_a = ResCompany(
        id=cid_a,
        name=f"Customs Tenant A {cid_a.hex[:6]}",
        slug=f"tenant-a-{cid_a.hex[:6]}",
        domain_slug=f"tenant-a-{cid_a.hex[:6]}",
        currency="SAR",
        tax_id=f"300{cid_a.hex[:8]}",
        commercial_registration=f"101{cid_a.hex[:7]}",
        is_active=True,
    )
    db.add(company_a)

    user_a = ResUser(
        id=uuid.uuid4(),
        firebase_uid=f"user-a-{cid_a.hex[:6]}",
        email=f"admin-a-{cid_a.hex[:6]}@example.com",
        full_name="Customs Admin A",
        company_id=cid_a,
        role="Admin",
        is_active=True,
    )
    db.add(user_a)

    # 2. Tenant B
    cid_b = uuid.uuid4()
    company_b = ResCompany(
        id=cid_b,
        name=f"Customs Tenant B {cid_b.hex[:6]}",
        slug=f"tenant-b-{cid_b.hex[:6]}",
        domain_slug=f"tenant-b-{cid_b.hex[:6]}",
        currency="SAR",
        tax_id=f"300{cid_b.hex[:8]}",
        commercial_registration=f"101{cid_b.hex[:7]}",
        is_active=True,
    )
    db.add(company_b)

    user_b = ResUser(
        id=uuid.uuid4(),
        firebase_uid=f"user-b-{cid_b.hex[:6]}",
        email=f"admin-b-{cid_b.hex[:6]}@example.com",
        full_name="Customs Admin B",
        company_id=cid_b,
        role="Admin",
        is_active=True,
    )
    db.add(user_b)
    db.commit()

    token_a = create_session_token(
        subject=user_a.email,
        company_id=company_a.id,
        role="Admin",
        tenant_slug=company_a.slug,
    )
    headers_a = {
        "Authorization": f"Bearer {token_a}",
        "X-Tenant-ID": str(company_a.id),
        "X-Company-ID": str(company_a.id),
    }

    token_b = create_session_token(
        subject=user_b.email,
        company_id=company_b.id,
        role="Admin",
        tenant_slug=company_b.slug,
    )
    headers_b = {
        "Authorization": f"Bearer {token_b}",
        "X-Tenant-ID": str(company_b.id),
        "X-Company-ID": str(company_b.id),
    }

    yield {
        "tenant_a": {"id": str(cid_a), "headers": headers_a, "user": user_a},
        "tenant_b": {"id": str(cid_b), "headers": headers_b, "user": user_b},
    }

    # Cleanup
    db.query(CustomsManifest).filter(CustomsManifest.tenant_id.in_([cid_a, cid_b])).delete(synchronize_session=False)
    db.delete(user_a)
    db.delete(user_b)
    db.delete(company_a)
    db.delete(company_b)
    db.commit()
    db.close()


def test_manifest_creation_and_hash_chaining(customs_test_tenants):
    """POST /api/v1/logistics/customs/manifests creates manifest and chains SHA-256 hashes."""
    tenant_a = customs_test_tenants["tenant_a"]
    headers = tenant_a["headers"]

    # Manifest 1 (Genesis block for Tenant A)
    m1_number = f"MANIFEST-TEST-001-{uuid.uuid4().hex[:6].upper()}"
    payload_1 = {
        "manifest_number": m1_number,
        "declaration_type": "IMPORT",
        "border_port_name": "King Khalid International Airport (RUH)",
        "duty_amount": 15000.0,
        "vat_amount": 2250.0,
        "total_value_sar": 150000.0,
        "hs_codes": ["8708.29.90", "8504.40.90"],
    }

    resp1 = client.post("/api/v1/logistics/customs/manifests", json=payload_1, headers=headers)
    assert resp1.status_code == 201, resp1.text
    data1 = resp1.json()

    assert data1["id"] is not None
    assert data1["manifest_number"] == m1_number
    assert data1["block_index"] == 1
    assert data1["previous_hash"] == "0" * 64
    assert len(data1["payload_hash"]) == 64
    assert data1["block_hash"] == data1["payload_hash"]
    assert data1["clearance_status"] == "PENDING_DOCUMENTATION"
    assert data1["zatca_compliance_status"] == "NOT_SUBMITTED"

    # Manifest 2 (Chained to Manifest 1)
    m2_number = f"MANIFEST-TEST-002-{uuid.uuid4().hex[:6].upper()}"
    payload_2 = {
        "manifest_number": m2_number,
        "declaration_type": "TRANSIT",
        "border_port_name": "Batha Border Control Plane (UAE Gate)",
        "duty_amount": 25000.0,
        "vat_amount": 3750.0,
        "total_value_sar": 250000.0,
        "hs_codes": ["8471.30.00"],
    }

    resp2 = client.post("/api/v1/logistics/customs/manifests", json=payload_2, headers=headers)
    assert resp2.status_code == 201, resp2.text
    data2 = resp2.json()

    assert data2["block_index"] == 2
    assert data2["previous_hash"] == data1["payload_hash"], "Block 2 must chain to Block 1 hash"
    assert len(data2["payload_hash"]) == 64
    assert data2["payload_hash"] != data1["payload_hash"]

    # Verify listing via GET /api/v1/logistics/customs/manifests
    list_resp = client.get("/api/v1/logistics/customs/manifests", headers=headers)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) >= 2
    assert items[0]["manifest_number"] == m2_number  # Most recent first
    assert items[1]["manifest_number"] == m1_number


def test_strict_tenant_isolation(customs_test_tenants):
    """Tenant A's customs manifests cannot be read, listed, or altered by Tenant B."""
    headers_a = customs_test_tenants["tenant_a"]["headers"]
    headers_b = customs_test_tenants["tenant_b"]["headers"]

    # Create manifest in Tenant A
    m_number = f"MANIFEST-ISOLATION-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "manifest_number": m_number,
        "declaration_type": "IMPORT",
        "border_port_name": "King Abdulaziz Port Dammam (KAP)",
        "duty_amount": 5000.0,
        "vat_amount": 750.0,
        "total_value_sar": 50000.0,
        "hs_codes": ["3902.10.00"],
    }

    create_resp = client.post("/api/v1/logistics/customs/manifests", json=payload, headers=headers_a)
    assert create_resp.status_code == 201
    manifest_id = create_resp.json()["id"]

    # 1. Tenant B listing must NOT contain Tenant A's manifest
    list_b = client.get("/api/v1/logistics/customs/manifests", headers=headers_b)
    assert list_b.status_code == 200
    assert not any(item["id"] == manifest_id for item in list_b.json())

    # 2. Tenant B direct GET /manifests/{id} must be REJECTED (403 or 404)
    get_b = client.get(f"/api/v1/logistics/customs/manifests/{manifest_id}", headers=headers_b)
    assert get_b.status_code in (403, 404)

    # 3. Tenant B status update attempt must be REJECTED (403 or 404)
    update_b = client.put(
        f"/api/v1/logistics/customs/manifests/{manifest_id}/status",
        json={"status": "CLEARED"},
        headers=headers_b,
    )
    assert update_b.status_code in (403, 404)

    # 4. Also verify via alias route /api/logistics/customs/manifests
    alias_resp = client.get("/api/logistics/customs/manifests", headers=headers_a)
    assert alias_resp.status_code == 200
    assert any(item["id"] == manifest_id for item in alias_resp.json())


def test_status_transitions_valid_and_invalid(customs_test_tenants):
    """Manifest status progression: DRAFT -> SUBMITTED -> INSPECTION -> CLEARED (terminal)."""
    headers = customs_test_tenants["tenant_a"]["headers"]

    # Create manifest (starts in DRAFT)
    m_number = f"MANIFEST-STATUS-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "manifest_number": m_number,
        "declaration_type": "EXPORT",
        "border_port_name": "Jeddah Islamic Port",
        "duty_amount": 1000.0,
        "vat_amount": 150.0,
        "total_value_sar": 20000.0,
        "status": "DRAFT",
    }

    create_resp = client.post("/api/v1/logistics/customs/manifests", json=payload, headers=headers)
    assert create_resp.status_code == 201
    manifest_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "DRAFT"

    # 1. Valid Transition: DRAFT -> SUBMITTED
    sub_resp = client.put(
        f"/api/v1/logistics/customs/manifests/{manifest_id}/status",
        json={"status": "SUBMITTED"},
        headers=headers,
    )
    assert sub_resp.status_code == 200
    assert sub_resp.json()["status"] == "SUBMITTED"
    assert sub_resp.json()["clearance_status"] == "PENDING_DOCUMENTATION"

    # 2. Valid Transition: SUBMITTED -> INSPECTION
    insp_resp = client.put(
        f"/api/v1/logistics/customs/manifests/{manifest_id}/status",
        json={"status": "INSPECTION"},
        headers=headers,
    )
    assert insp_resp.status_code == 200
    assert insp_resp.json()["status"] == "INSPECTION"
    assert insp_resp.json()["clearance_status"] == "UNDER_INSPECTION"

    # 3. Valid Transition: INSPECTION -> CLEARED
    clear_resp = client.put(
        f"/api/v1/logistics/customs/manifests/{manifest_id}/status",
        json={"status": "CLEARED"},
        headers=headers,
    )
    assert clear_resp.status_code == 200
    assert clear_resp.json()["status"] == "CLEARED"
    assert clear_resp.json()["clearance_status"] == "CLEARED"
    assert clear_resp.json()["zatca_compliance_status"] == "REPORTED"

    # 4. Invalid Transition: CLEARED is terminal, cannot transition back to DRAFT or SUBMITTED
    fail_resp = client.put(
        f"/api/v1/logistics/customs/manifests/{manifest_id}/status",
        json={"status": "DRAFT"},
        headers=headers,
    )
    assert fail_resp.status_code == 400

    # 5. Invalid Transition: Unknown status value
    invalid_resp = client.put(
        f"/api/v1/logistics/customs/manifests/{manifest_id}/status",
        json={"status": "ARBITRARY_UNKNOWN_STATUS"},
        headers=headers,
    )
    assert invalid_resp.status_code == 400
