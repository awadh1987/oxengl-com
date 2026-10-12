"""
Integration Tests: Enterprise Multi-Tier Organization Hierarchy & Cross-Branch RBAC Isolation.
Phase 7 - Step 2 Verification.

Verifies:
1. Super Admin hierarchy provisioning (Company Code -> Branches -> Cost Centers & Purchasing Orgs).
2. Tree structure traversal via /api/v1/organization/tree (nested enterprise hierarchy).
3. Tenant Admin access spanning root company and descendant branches.
4. Strict Cross-Branch Isolation (Branch A user cannot read, write, or switch context to Branch B).
5. Strict Cross-Tenant Isolation (Tenant X user cannot access Tenant Y resources).
6. Role-Based Access Control (Read-Only user cannot write or mutate organization assets).
7. Anti-cycle guards (preventing circular parent-child loops).
8. Business rule enforcement (unique code constraints per branch/company).
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.main import app
from backend.database import SessionLocal
from backend.models import CostCenter, PurchasingOrganization, ResCompany, ResUser
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
def org_test_env():
    """
    Sets up a complete enterprise organization hierarchy for testing:
    - Tenant 1: Holding Corp (Root)
      - Branch Riyadh (Child)
        - Cost Center: CC-RYD-HQ
        - Purchasing Org: PUR-RYD-01
      - Branch Jeddah (Child)
        - Cost Center: CC-JED-01
        - Purchasing Org: PUR-JED-01
    - Tenant 2: Competitor Ltd (Isolated Root)
      - Branch Dammam (Child)
        - Cost Center: CC-DMM-01
    """
    db: Session = SessionLocal()
    suffix = uuid.uuid4().hex[:6]

    # --- Tenant 1: Root Holding Corp ---
    holding_id = uuid.uuid4()
    holding = ResCompany(
        id=holding_id,
        name=f"Al-Bayan Holding Corp {suffix}",
        slug=f"al-bayan-holding-{suffix}",
        currency="SAR",
        is_active=True,
    )
    db.add(holding)

    # --- Super Admin ---
    super_admin_id = uuid.uuid4()
    super_admin_user = ResUser(
        id=super_admin_id,
        email=f"superadmin_{suffix}@oxengl.me",
        full_name="Global Super Admin",
        company_id=holding_id,
        role=SUPER_ADMIN,
        is_active=True,
    )
    db.add(super_admin_user)

    # Tenant 1 Admin (assigned to Holding Corp)
    t1_admin_id = uuid.uuid4()
    t1_admin = ResUser(
        id=t1_admin_id,
        email=f"holding_admin_{suffix}@albayan.com",
        full_name="Holding General Manager",
        company_id=holding_id,
        role=ADMIN,
        is_active=True,
    )
    db.add(t1_admin)

    # --- Tenant 1: Child Branch Riyadh ---
    riyadh_id = uuid.uuid4()
    riyadh_branch = ResCompany(
        id=riyadh_id,
        parent_id=holding_id,
        name=f"Al-Bayan Riyadh Plant {suffix}",
        slug=f"bayan-riyadh-{suffix}",
        currency="SAR",
        is_active=True,
    )
    db.add(riyadh_branch)

    # Branch Riyadh Admin
    ryd_admin_id = uuid.uuid4()
    ryd_admin = ResUser(
        id=ryd_admin_id,
        email=f"ryd_admin_{suffix}@albayan.com",
        full_name="Riyadh Branch Manager",
        company_id=riyadh_id,
        role=ADMIN,
        is_active=True,
    )
    db.add(ryd_admin)

    # Branch Riyadh Read-Only User
    ryd_readonly_id = uuid.uuid4()
    ryd_readonly = ResUser(
        id=ryd_readonly_id,
        email=f"ryd_auditor_{suffix}@albayan.com",
        full_name="Riyadh Internal Auditor",
        company_id=riyadh_id,
        role="Guest",
        is_active=True,
    )
    db.add(ryd_readonly)

    # Cost Center under Riyadh
    cc_ryd_id = uuid.uuid4()
    cc_ryd = CostCenter(
        id=cc_ryd_id,
        company_id=riyadh_id,
        code=f"CC-RYD-{suffix}".upper()[:32],
        name="Riyadh Production Floor",
        is_active=True,
    )
    db.add(cc_ryd)

    # Purchasing Org under Riyadh
    po_ryd_id = uuid.uuid4()
    po_ryd = PurchasingOrganization(
        id=po_ryd_id,
        company_id=riyadh_id,
        code=f"PO-RYD-{suffix}".upper()[:32],
        name="Riyadh Central Procurement",
        currency="SAR",
        is_active=True,
    )
    db.add(po_ryd)

    # --- Tenant 1: Child Branch Jeddah ---
    jeddah_id = uuid.uuid4()
    jeddah_branch = ResCompany(
        id=jeddah_id,
        parent_id=holding_id,
        name=f"Al-Bayan Jeddah Logistics {suffix}",
        slug=f"bayan-jeddah-{suffix}",
        currency="SAR",
        is_active=True,
    )
    db.add(jeddah_branch)

    # Branch Jeddah Admin
    jed_admin_id = uuid.uuid4()
    jed_admin = ResUser(
        id=jed_admin_id,
        email=f"jed_admin_{suffix}@albayan.com",
        full_name="Jeddah Branch Manager",
        company_id=jeddah_id,
        role=ADMIN,
        is_active=True,
    )
    db.add(jed_admin)

    # Cost Center under Jeddah
    cc_jed_id = uuid.uuid4()
    cc_jed = CostCenter(
        id=cc_jed_id,
        company_id=jeddah_id,
        code=f"CC-JED-{suffix}".upper()[:32],
        name="Jeddah Port Logistics",
        is_active=True,
    )
    db.add(cc_jed)

    # Purchasing Org under Jeddah
    po_jed_id = uuid.uuid4()
    po_jed = PurchasingOrganization(
        id=po_jed_id,
        company_id=jeddah_id,
        code=f"PO-JED-{suffix}".upper()[:32],
        name="Jeddah Maritime Procurement",
        currency="SAR",
        is_active=True,
    )
    db.add(po_jed)

    # --- Tenant 2: Separate Competitor Root ---
    tenant2_id = uuid.uuid4()
    tenant2_corp = ResCompany(
        id=tenant2_id,
        name=f"Competitor Global Logistics {suffix}",
        slug=f"competitor-global-{suffix}",
        currency="SAR",
        is_active=True,
    )
    db.add(tenant2_corp)

    t2_admin_id = uuid.uuid4()
    t2_admin = ResUser(
        id=t2_admin_id,
        email=f"t2_admin_{suffix}@competitor.com",
        full_name="Competitor Tenant Admin",
        company_id=tenant2_id,
        role=ADMIN,
        is_active=True,
    )
    db.add(t2_admin)

    # Branch under Tenant 2
    dammam_id = uuid.uuid4()
    dammam_branch = ResCompany(
        id=dammam_id,
        parent_id=tenant2_id,
        name=f"Competitor Dammam Hub {suffix}",
        slug=f"comp-dammam-{suffix}",
        currency="SAR",
        is_active=True,
    )
    db.add(dammam_branch)

    cc_dmm_id = uuid.uuid4()
    cc_dmm = CostCenter(
        id=cc_dmm_id,
        company_id=dammam_id,
        code=f"CC-DMM-{suffix}".upper()[:32],
        name="Dammam Petrochemical Fleet",
        is_active=True,
    )
    db.add(cc_dmm)

    db.commit()

    env_data = {
        "suffix": suffix,
        "super_admin": {"id": super_admin_id, "email": super_admin_user.email, "role": SUPER_ADMIN, "company_id": holding_id},
        "holding": {"id": holding_id, "name": holding.name, "admin": {"id": t1_admin_id, "email": t1_admin.email, "role": ADMIN, "company_id": holding_id}},
        "riyadh": {
            "id": riyadh_id,
            "name": riyadh_branch.name,
            "admin": {"id": ryd_admin_id, "email": ryd_admin.email, "role": ADMIN, "company_id": riyadh_id},
            "readonly": {"id": ryd_readonly_id, "email": ryd_readonly.email, "role": READ_ONLY, "company_id": riyadh_id},
            "cost_center": {"id": cc_ryd_id, "code": cc_ryd.code},
            "purchasing_org": {"id": po_ryd_id, "code": po_ryd.code},
        },
        "jeddah": {
            "id": jeddah_id,
            "name": jeddah_branch.name,
            "admin": {"id": jed_admin_id, "email": jed_admin.email, "role": ADMIN, "company_id": jeddah_id},
            "cost_center": {"id": cc_jed_id, "code": cc_jed.code},
            "purchasing_org": {"id": po_jed_id, "code": po_jed.code},
        },
        "tenant2": {
            "id": tenant2_id,
            "admin": {"id": t2_admin_id, "email": t2_admin.email, "role": ADMIN, "company_id": tenant2_id},
            "dammam": {"id": dammam_id, "cost_center_id": cc_dmm_id},
        },
    }
    yield env_data
    db.close()


def test_hierarchy_tree_structure(org_test_env):
    """
    Verifies that calling /api/v1/organization/tree?root_id=...
    returns a fully populated nested tree containing the root legal entity,
    both branches, and their respective cost centers & purchasing orgs.
    """
    env = org_test_env
    headers = auth_header(
        env["super_admin"]["id"],
        env["super_admin"]["email"],
        env["super_admin"]["role"],
        env["holding"]["id"],
    )

    resp = client.get(f"/api/v1/organization/tree?root_id={env['holding']['id']}", headers=headers)
    assert resp.status_code == 200, f"Failed to retrieve tree: {resp.text}"

    data = resp.json()
    assert len(data) == 1
    root = data[0]
    assert root["id"] == str(env["holding"]["id"])
    assert root["org_type"] == "company_code"

    # Verify both child branches are attached
    branch_ids = [b["id"] for b in root["branches"]]
    assert str(env["riyadh"]["id"]) in branch_ids
    assert str(env["jeddah"]["id"]) in branch_ids

    # Find Riyadh branch in tree
    riyadh_node = next(b for b in root["branches"] if b["id"] == str(env["riyadh"]["id"]))
    assert riyadh_node["org_type"] == "branch"
    assert any(cc["id"] == str(env["riyadh"]["cost_center"]["id"]) for cc in riyadh_node["cost_centers"])
    assert any(po["id"] == str(env["riyadh"]["purchasing_org"]["id"]) for po in riyadh_node["purchasing_organizations"])

    # Find Jeddah branch in tree
    jeddah_node = next(b for b in root["branches"] if b["id"] == str(env["jeddah"]["id"]))
    assert jeddah_node["org_type"] == "branch"
    assert any(cc["id"] == str(env["jeddah"]["cost_center"]["id"]) for cc in jeddah_node["cost_centers"])
    assert any(po["id"] == str(env["jeddah"]["purchasing_org"]["id"]) for po in jeddah_node["purchasing_organizations"])


def test_tenant_admin_multi_branch_scope(org_test_env):
    """
    Verifies that Tenant Admin assigned to root Holding Corp can view and manage
    resources across all child branches (Riyadh and Jeddah).
    """
    env = org_test_env
    admin_info = env["holding"]["admin"]
    headers = auth_header(admin_info["id"], admin_info["email"], admin_info["role"], admin_info["company_id"])

    # 1. Tenant admin can list companies and see both branches
    resp = client.get("/api/v1/organization/companies", headers=headers)
    assert resp.status_code == 200
    company_ids = [c["id"] for c in resp.json()]
    assert str(env["holding"]["id"]) in company_ids
    assert str(env["riyadh"]["id"]) in company_ids
    assert str(env["jeddah"]["id"]) in company_ids

    # 2. Tenant admin can create a cost center under Riyadh branch
    new_cc_code = f"CC-HOLDING-RYD-{env['suffix']}".upper()[:32]
    create_resp = client.post(
        "/api/v1/organization/cost-centers",
        headers=headers,
        json={
            "company_id": str(env["riyadh"]["id"]),
            "code": new_cc_code,
            "name": "Riyadh Executive Office",
        },
    )
    assert create_resp.status_code == 201
    assert create_resp.json()["code"] == new_cc_code

    # 3. Tenant admin can create a purchasing org under Jeddah branch
    new_po_code = f"PO-HOLDING-JED-{env['suffix']}".upper()[:32]
    create_po_resp = client.post(
        "/api/v1/organization/purchasing-orgs",
        headers=headers,
        json={
            "company_id": str(env["jeddah"]["id"]),
            "code": new_po_code,
            "name": "Jeddah Holding Procurement Unit",
            "currency": "SAR",
        },
    )
    assert create_po_resp.status_code == 201
    assert create_po_resp.json()["code"] == new_po_code


def test_cross_branch_isolation_forbidden(org_test_env):
    """
    SECURITY TEST: Cross-Branch Isolation.
    A user/admin assigned to Branch Riyadh CANNOT read, write, or access
    Branch Jeddah resources, and cannot switch context to Branch Jeddah.
    """
    env = org_test_env
    ryd_admin = env["riyadh"]["admin"]
    headers = auth_header(ryd_admin["id"], ryd_admin["email"], ryd_admin["role"], ryd_admin["company_id"])

    # 1. Legitimate access: Riyadh Admin CAN view Riyadh branch details
    resp_ryd = client.get(f"/api/v1/organization/companies/{env['riyadh']['id']}", headers=headers)
    assert resp_ryd.status_code == 200

    # 2. Cross-Branch VIOLATION: Riyadh Admin attempts to view Jeddah branch details
    resp_jed = client.get(f"/api/v1/organization/companies/{env['jeddah']['id']}", headers=headers)
    assert resp_jed.status_code == 403, f"Expected 403 Forbidden for cross-branch read, got {resp_jed.status_code}"
    assert "isolation violation" in resp_jed.text.lower() or "forbidden" in resp_jed.text.lower()

    # 3. Cross-Branch VIOLATION: Riyadh Admin attempts to read Jeddah Cost Center
    resp_cc = client.get(f"/api/v1/organization/cost-centers/{env['jeddah']['cost_center']['id']}", headers=headers)
    assert resp_cc.status_code == 403, f"Expected 403 Forbidden for cross-branch cost center, got {resp_cc.status_code}"

    # 4. Cross-Branch VIOLATION: Riyadh Admin attempts to create Cost Center under Jeddah
    resp_create_cc = client.post(
        "/api/v1/organization/cost-centers",
        headers=headers,
        json={
            "company_id": str(env["jeddah"]["id"]),
            "code": f"CC-HACK-{env['suffix']}".upper()[:32],
            "name": "Unauthorized Intrusion Cost Center",
        },
    )
    assert resp_create_cc.status_code == 403, f"Expected 403 for unauthorized branch CC create, got {resp_create_cc.status_code}"

    # 5. Cross-Branch VIOLATION: Riyadh Admin attempts to read Jeddah Purchasing Org
    resp_po = client.get(f"/api/v1/organization/purchasing-orgs/{env['jeddah']['purchasing_org']['id']}", headers=headers)
    assert resp_po.status_code == 403, f"Expected 403 for cross-branch purchasing org read, got {resp_po.status_code}"

    # 6. Cross-Branch VIOLATION: Riyadh Admin attempts to create Purchasing Org under Jeddah
    resp_create_po = client.post(
        "/api/v1/organization/purchasing-orgs",
        headers=headers,
        json={
            "company_id": str(env["jeddah"]["id"]),
            "code": f"PO-HACK-{env['suffix']}".upper()[:32],
            "name": "Unauthorized Intrusion Purchasing Org",
            "currency": "SAR",
        },
    )
    assert resp_create_po.status_code == 403, f"Expected 403 for unauthorized branch PO create, got {resp_create_po.status_code}"

    # 7. Cross-Branch Context Hijacking: Passing x-company-id: <jeddah_id> header is blocked
    hijack_headers = dict(headers)
    hijack_headers["x-company-id"] = str(env["jeddah"]["id"])
    resp_hijack = client.get("/api/v1/organization/companies", headers=hijack_headers)
    assert resp_hijack.status_code == 403, f"Expected 403 for cross-branch x-company-id header, got {resp_hijack.status_code}"


def test_cross_tenant_isolation_forbidden(org_test_env):
    """
    SECURITY TEST: Cross-Tenant Isolation.
    A user from Tenant 2 (Competitor Ltd) CANNOT read, write, or access any
    Tenant 1 resources (Holding Corp, Riyadh Branch, Jeddah Branch).
    """
    env = org_test_env
    t2_admin = env["tenant2"]["admin"]
    headers = auth_header(t2_admin["id"], t2_admin["email"], t2_admin["role"], t2_admin["company_id"])

    # 1. Attempting to read Holding Corp
    resp1 = client.get(f"/api/v1/organization/companies/{env['holding']['id']}", headers=headers)
    assert resp1.status_code == 403

    # 2. Attempting to read Riyadh Branch
    resp2 = client.get(f"/api/v1/organization/companies/{env['riyadh']['id']}", headers=headers)
    assert resp2.status_code == 403

    # 3. Attempting to read Riyadh Cost Center
    resp3 = client.get(f"/api/v1/organization/cost-centers/{env['riyadh']['cost_center']['id']}", headers=headers)
    assert resp3.status_code == 403

    # 4. Attempting to read Riyadh Purchasing Org
    resp4 = client.get(f"/api/v1/organization/purchasing-orgs/{env['riyadh']['purchasing_org']['id']}", headers=headers)
    assert resp4.status_code == 403

    # 5. Attempting to create resource in Tenant 1's company
    resp5 = client.post(
        "/api/v1/organization/cost-centers",
        headers=headers,
        json={
            "company_id": str(env["holding"]["id"]),
            "code": f"CC-INTRUDER-{env['suffix']}".upper()[:32],
            "name": "Cross Tenant Intrusion Attempt",
        },
    )
    assert resp5.status_code == 403


def test_read_only_role_restrictions(org_test_env):
    """
    SECURITY TEST: Role-Based Write Restrictions.
    A user with READ_ONLY role can inspect branch organization data,
    but all mutation endpoints (POST, PUT, DELETE) must reject with 403 Forbidden.
    """
    env = org_test_env
    ro_user = env["riyadh"]["readonly"]
    headers = auth_header(ro_user["id"], ro_user["email"], ro_user["role"], ro_user["company_id"])

    # 1. READ is allowed
    resp_read = client.get(f"/api/v1/organization/companies/{env['riyadh']['id']}", headers=headers)
    assert resp_read.status_code == 200

    resp_read_cc = client.get(f"/api/v1/organization/cost-centers/{env['riyadh']['cost_center']['id']}", headers=headers)
    assert resp_read_cc.status_code == 200

    # 2. POST Cost Center is forbidden
    resp_post_cc = client.post(
        "/api/v1/organization/cost-centers",
        headers=headers,
        json={
            "company_id": str(env["riyadh"]["id"]),
            "code": f"CC-RO-TEST-{env['suffix']}".upper()[:32],
            "name": "Read-Only Attempt",
        },
    )
    assert resp_post_cc.status_code == 403, f"Expected 403 for Read_Only write attempt, got {resp_post_cc.status_code}"

    # 3. PUT Cost Center is forbidden
    resp_put_cc = client.put(
        f"/api/v1/organization/cost-centers/{env['riyadh']['cost_center']['id']}",
        headers=headers,
        json={"name": "Hacked Title"},
    )
    assert resp_put_cc.status_code == 403

    # 4. DELETE Cost Center is forbidden
    resp_del_cc = client.delete(
        f"/api/v1/organization/cost-centers/{env['riyadh']['cost_center']['id']}",
        headers=headers,
    )
    assert resp_del_cc.status_code == 403

    # 5. POST Purchasing Org is forbidden
    resp_post_po = client.post(
        "/api/v1/organization/purchasing-orgs",
        headers=headers,
        json={
            "company_id": str(env["riyadh"]["id"]),
            "code": f"PO-RO-TEST-{env['suffix']}".upper()[:32],
            "name": "Read-Only PO Attempt",
            "currency": "SAR",
        },
    )
    assert resp_post_po.status_code == 403


def test_hierarchy_cycle_prevention(org_test_env):
    """
    BUSINESS RULE: Anti-Cycle Protection.
    Preventing circular tree loops:
    - Setting parent_id to itself -> 400 Bad Request
    - Setting parent_id of root to one of its child branches -> 400 Bad Request
    """
    env = org_test_env
    headers = auth_header(
        env["super_admin"]["id"],
        env["super_admin"]["email"],
        env["super_admin"]["role"],
        env["holding"]["id"],
    )

    # 1. Attempting to make Riyadh branch its own parent
    resp1 = client.put(
        f"/api/v1/organization/companies/{env['riyadh']['id']}",
        headers=headers,
        json={"parent_id": str(env["riyadh"]["id"])},
    )
    assert resp1.status_code == 400
    assert "circular" in resp1.text.lower() or "cannot be its own" in resp1.text.lower()

    # 2. Attempting to make Holding Corp's parent = Riyadh Branch (its child)
    resp2 = client.put(
        f"/api/v1/organization/companies/{env['holding']['id']}",
        headers=headers,
        json={"parent_id": str(env["riyadh"]["id"])},
    )
    assert resp2.status_code == 400
    assert "circular" in resp2.text.lower() or "ancestor" in resp2.text.lower()


def test_code_uniqueness_constraints(org_test_env):
    """
    BUSINESS RULE: Uniqueness per branch.
    - Duplicate cost center code in the SAME branch -> 409 Conflict
    - Duplicate cost center code in a DIFFERENT branch -> Allowed
    """
    env = org_test_env
    admin_info = env["holding"]["admin"]
    headers = auth_header(admin_info["id"], admin_info["email"], admin_info["role"], admin_info["company_id"])

    existing_code = env["riyadh"]["cost_center"]["code"]

    # 1. Duplicate code in Riyadh branch -> 409 Conflict
    resp_dup = client.post(
        "/api/v1/organization/cost-centers",
        headers=headers,
        json={
            "company_id": str(env["riyadh"]["id"]),
            "code": existing_code,
            "name": "Duplicate Code Attempt",
        },
    )
    assert resp_dup.status_code == 409
    assert "already exists" in resp_dup.text.lower()

    # 2. Duplicate code in Jeddah branch -> Allowed (scoped per branch)
    resp_allowed = client.post(
        "/api/v1/organization/cost-centers",
        headers=headers,
        json={
            "company_id": str(env["jeddah"]["id"]),
            "code": existing_code,
            "name": "Same Code In Different Branch",
        },
    )
    assert resp_allowed.status_code == 201
    assert resp_allowed.json()["code"] == existing_code
