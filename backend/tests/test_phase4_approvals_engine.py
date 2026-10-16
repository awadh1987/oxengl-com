"""
OxenGL Phase 4 Test Suite: Enterprise Workflow & Governance Approvals Engine (Point 4).
Tests:
1. Tenant approval matrix auto-seeding, CRUD, and module-level toggles (/api/v1/procurement/approvals/matrix & /rules).
2. Threshold evaluation across Operations, Procurement POs/Vendor Bills, Financial Vouchers, Crusher Payments, Fleet Work Orders, and HRMS.
3. Multi-step approve, reject, and escalate workflow execution with immutable audit trail logging.
4. GL posting block on PENDING_APPROVAL vendor bills and financial vouchers, and unlock after full approval.
5. Strict multi-tenant RLS isolation on approval_rules, workflow_instances, and workflow_steps (PostgreSQL RLS + JWT boundary enforcement).
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.app.domains.procurement.models import ApprovalRule, WorkflowInstance, WorkflowStep
from backend.app.main import app
from backend.database import PlatformSessionLocal, SessionLocal
from backend.models import (
    AccountAccount,
    AccountJournal,
    AccountMove,
    AccountMoveLine,
    MasterTenant,
    ResCompany,
)
from backend.tests.auth_helpers import tenant_admin_headers


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def platform_db():
    db = PlatformSessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def _create_tenant(db, prefix: str = "p4") -> tuple[MasterTenant, dict]:
    slug = f"{prefix}-{uuid.uuid4().hex[:8]}"
    tenant_id = uuid.uuid4()
    master = MasterTenant(
        id=tenant_id,
        slug=slug,
        name=f"Phase 4 Tenant ({slug})",
        owner_full_name="Fahad Al-Harbi",
        owner_email=f"owner_{slug}@oxengl.me",
        owner_mobile="+966500000000",
        subscription_tier="enterprise",
        status="active",
        is_active=True,
    )
    company = ResCompany(
        id=tenant_id,
        name=master.name,
        slug=slug,
        currency="SAR",
        is_active=True,
    )
    db.add(master)
    db.add(company)
    db.commit()
    headers = tenant_admin_headers(db, tenant_id)
    return master, headers


def test_01_approval_matrix_seeding_crud_and_module_toggle(client: TestClient, platform_db):
    """Verifies tenant matrix seeding across all 8 module categories, custom rule CRUD, and module toggles."""
    tenant, headers = _create_tenant(platform_db, "p4-matrix")

    # 1. Fetch approval matrix — should auto-seed default rules across all modules
    resp = client.get("/api/v1/procurement/approvals/matrix", headers=headers)
    assert resp.status_code == 200, resp.text
    matrix = resp.json()
    assert matrix["tenant_id"] == str(tenant.id)
    assert set(matrix["supported_modules"]) >= {
        "OPERATIONS",
        "PURCHASE_ORDER",
        "VENDOR_BILL",
        "PURCHASE_REQUISITION",
        "FINANCIAL_VOUCHER",
        "CRUSHER_PAYMENT",
        "FLEET_WORK_ORDER",
        "HRMS",
    }
    assert len(matrix["rules"]) >= 10

    # 2. Create a custom threshold rule for OPERATIONS
    create_resp = client.post(
        "/api/v1/procurement/approvals/rules",
        headers=headers,
        json={
            "document_type": "OPERATIONS",
            "min_amount": 100000.0,
            "max_amount": None,
            "required_role": "BOARD_CHAIRMAN",
            "step_order": 3,
            "is_active": True,
        },
    )
    assert create_resp.status_code in (200, 201), create_resp.text
    created_rule = create_resp.json()["rule"]
    rule_id = created_rule["id"]
    assert created_rule["document_type"] == "OPERATIONS"
    assert created_rule["required_role"] == "BOARD_CHAIRMAN"
    assert created_rule["step_order"] == 3

    # 3. Update the custom rule
    update_resp = client.put(
        f"/api/v1/procurement/approvals/rules/{rule_id}",
        headers=headers,
        json={"min_amount": 120000.0, "required_role": "CEO"},
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["rule"]["min_amount"] == 120000.0
    assert update_resp.json()["rule"]["required_role"] == "CEO"

    # 4. Toggle entire HRMS module off and back on
    toggle_off = client.post(
        "/api/v1/procurement/approvals/rules/module-toggle",
        headers=headers,
        json={"document_type": "HRMS", "is_active": False},
    )
    assert toggle_off.status_code == 200, toggle_off.text
    assert all(r["is_active"] is False for r in toggle_off.json()["rules"])

    toggle_on = client.post(
        "/api/v1/procurement/approvals/rules/module-toggle",
        headers=headers,
        json={"document_type": "HRMS", "is_active": True},
    )
    assert toggle_on.status_code == 200, toggle_on.text
    assert all(r["is_active"] is True for r in toggle_on.json()["rules"])

    # 5. Delete custom rule
    del_resp = client.delete(f"/api/v1/procurement/approvals/rules/{rule_id}", headers=headers)
    assert del_resp.status_code == 200, del_resp.text
    assert del_resp.json()["status"] == "deleted"


def test_02_threshold_evaluation_and_approve_escalate_reject_audit_trail(client: TestClient, platform_db):
    """Verifies multi-step workflow creation, escalation, approval, rejection, and audit trail logging."""
    tenant, headers = _create_tenant(platform_db, "p4-eval")

    # Below threshold for OPERATIONS (< 15,000 SAR) -> AUTO_APPROVED
    low_eval = client.post(
        "/api/v1/procurement/approvals/evaluate",
        headers=headers,
        json={
            "document_type": "OPERATIONS",
            "document_id": f"TRIP-LOW-{uuid.uuid4().hex[:6]}",
            "amount": 4500.0,
            "requested_by": "ops_dispatcher@oxengl.me",
        },
    )
    assert low_eval.status_code == 200, low_eval.text
    assert low_eval.json()["requires_approval"] is False
    assert low_eval.json()["status"] in ("AUTO_APPROVED", "APPROVED")

    # Above threshold for OPERATIONS (>= 50,000 SAR) -> 2-step PENDING_APPROVAL (OPERATIONS_MANAGER -> CEO)
    high_doc_uuid = str(uuid.uuid4())
    high_eval = client.post(
        "/api/v1/procurement/approvals/evaluate",
        headers=headers,
        json={
            "document_type": "OPERATIONS",
            "document_id": high_doc_uuid,
            "amount": 65000.0,
            "requested_by": "ops_dispatcher@oxengl.me",
        },
    )
    assert high_eval.status_code == 200, high_eval.text
    high_data = high_eval.json()
    assert high_data["requires_approval"] is True
    assert high_data["status"] == "PENDING_APPROVAL"
    assert len(high_data["steps"]) == 2
    step1_id = high_data["steps"][0]["id"]

    # Escalate Step 1 to CFO
    esc_resp = client.post(
        f"/api/v1/procurement/approvals/steps/{step1_id}/escalate",
        headers=headers,
        json={
            "user_id": "ops_mgr@oxengl.me",
            "escalated_to_role": "CFO",
            "reason": "Unusual aggregate haulage surcharge requires CFO review",
        },
    )
    assert esc_resp.status_code == 200, esc_resp.text
    esc_data = esc_resp.json()
    assert esc_data["step_status"] == "ESCALATED"
    assert esc_data["workflow_status"] in ("PENDING", "IN_PROGRESS", "ESCALATED")
    new_escalated_step_id = esc_data["escalated_step"]["id"]

    # Approve the escalated step (step 2)
    app_step2 = client.post(
        f"/api/v1/procurement/approvals/steps/{new_escalated_step_id}/approve",
        headers=headers,
        json={
            "user_id": "cfo@oxengl.me",
            "remarks": "Surcharge verified against diesel index contract",
        },
    )
    assert app_step2.status_code == 200, app_step2.text
    assert app_step2.json()["workflow_status"] in ("PENDING", "IN_PROGRESS")

    # Fetch queue to get final step ID
    queue_resp = client.get("/api/v1/procurement/approvals/queue?include_history=true", headers=headers)
    assert queue_resp.status_code == 200, queue_resp.text
    queue_items = queue_resp.json()
    matching = [q for q in queue_items if q["document_id"] == high_doc_uuid]
    assert len(matching) == 1
    final_pending_steps = [s for s in matching[0]["steps"] if s["status"] == "PENDING"]
    assert len(final_pending_steps) == 1

    # Approve final step (CEO)
    app_final = client.post(
        f"/api/v1/procurement/approvals/steps/{final_pending_steps[0]['step_id']}/approve",
        headers=headers,
        json={
            "user_id": "ceo@oxengl.me",
            "remarks": "Final executive sign-off granted",
        },
    )
    assert app_final.status_code == 200, app_final.text
    assert app_final.json()["workflow_status"] == "APPROVED"

    # Verify rejection workflow on a Crusher Payment
    crusher_doc_uuid = str(uuid.uuid4())
    crusher_eval = client.post(
        "/api/v1/procurement/approvals/evaluate",
        headers=headers,
        json={
            "document_type": "CRUSHER_PAYMENT",
            "document_id": crusher_doc_uuid,
            "amount": 40000.0,
            "requested_by": "payables@oxengl.me",
        },
    )
    assert crusher_eval.status_code == 200, crusher_eval.text
    crusher_step_id = crusher_eval.json()["steps"][0]["id"]

    rej_resp = client.post(
        f"/api/v1/procurement/approvals/steps/{crusher_step_id}/reject",
        headers=headers,
        json={
            "user_id": "finance_mgr@oxengl.me",
            "reason": "Missing signed weighbridge settlement statement",
        },
    )
    assert rej_resp.status_code == 200, rej_resp.text
    assert rej_resp.json()["workflow_status"] == "REJECTED"

    # Verify Audit Logs recorded all workflow actions
    audit_resp = client.get("/api/v1/procurement/approvals/audit-logs", headers=headers)
    assert audit_resp.status_code == 200, audit_resp.text
    logs = audit_resp.json()["audit_logs"]
    actions = [entry["action"] for entry in logs]
    assert "ESCALATED" in actions
    assert "APPROVED" in actions
    assert "REJECTED" in actions


def test_03_gl_posting_blocked_until_approved(client: TestClient, platform_db):
    """Verifies that Vendor Bills and Financial Vouchers exceeding approval thresholds cannot post to GL until approved."""
    tenant, headers = _create_tenant(platform_db, "p4-glblock")

    # 1. Create a Vendor Bill above the VENDOR_BILL threshold (>= 10,000 SAR)
    bill_resp = client.post(
        "/api/procurement/bills",
        headers=headers,
        json={
            "invoice_number": f"BILL-{uuid.uuid4().hex[:6].upper()}",
            "amount": 20000.0,
            "tax_amount": 3000.0,
            "total_billed": 23000.0,
            "currency": "SAR",
        },
    )
    assert bill_resp.status_code == 201, bill_resp.text
    bill_data = bill_resp.json()
    bill_id = bill_data["id"]
    assert bill_data["match_status"] == "PENDING_APPROVAL"

    # Attempt to post the PENDING_APPROVAL bill to the General Ledger -> must be blocked with 403
    blocked_post = client.post(f"/api/procurement/bills/{bill_id}/post-ledger", headers=headers)
    assert blocked_post.status_code == 403, blocked_post.text
    assert "pending_approval" in blocked_post.json()["detail"].lower() or "approved" in blocked_post.json()["detail"].lower()

    # Approve the Vendor Bill's pending workflow step(s)
    queue_resp = client.get("/api/v1/procurement/approvals/queue?include_history=true", headers=headers)
    bill_wf = next(q for q in queue_resp.json() if q["document_id"] == bill_id)
    for step in bill_wf["steps"]:
        if step["status"] == "PENDING":
            r = client.post(
                f"/api/v1/procurement/approvals/steps/{step['step_id']}/approve",
                headers=headers,
                json={"user_id": "finance_mgr@oxengl.me", "remarks": "Three-way match verified"},
            )
            assert r.status_code == 200, r.text

    # Now post the approved bill to the General Ledger -> must succeed (200)
    allowed_post = client.post(f"/api/procurement/bills/{bill_id}/post-ledger", headers=headers)
    assert allowed_post.status_code == 200, allowed_post.text
    assert allowed_post.json()["status"] == "POSTED"

    # 2. Verify Financial Voucher (AccountMove) GL post blocking when pending approval
    journal = AccountJournal(
        id=uuid.uuid4(),
        company_id=tenant.id,
        name="General Journal",
        code="GEN4",
        journal_type="general",
    )
    acct_debit = AccountAccount(
        id=uuid.uuid4(),
        company_id=tenant.id,
        code="5101",
        name="Crusher Operating Expense",
        internal_type="expense",
    )
    acct_credit = AccountAccount(
        id=uuid.uuid4(),
        company_id=tenant.id,
        code="1010",
        name="Main Bank Account",
        internal_type="asset",
    )
    move = AccountMove(
        id=uuid.uuid4(),
        company_id=tenant.id,
        journal_id=journal.id,
        name=f"JV-2026-{uuid.uuid4().hex[:4].upper()}",
        date=date(2026, 10, 15),
        state="draft",
        move_type="entry",
        custom_attributes={"approval_status": "PENDING_APPROVAL"},
    )
    platform_db.add_all([journal, acct_debit, acct_credit, move])
    platform_db.flush()
    platform_db.add_all(
        [
            AccountMoveLine(
                id=uuid.uuid4(),
                company_id=tenant.id,
                move_id=move.id,
                account_id=acct_debit.id,
                name="Subcontractor settlement",
                debit=Decimal("18000.00"),
                credit=Decimal("0.00"),
            ),
            AccountMoveLine(
                id=uuid.uuid4(),
                company_id=tenant.id,
                move_id=move.id,
                account_id=acct_credit.id,
                name="Bank disbursement",
                debit=Decimal("0.00"),
                credit=Decimal("18000.00"),
            ),
        ]
    )
    platform_db.commit()

    # Initialize workflow for the Financial Voucher
    eval_voucher = client.post(
        "/api/v1/procurement/approvals/evaluate",
        headers=headers,
        json={
            "document_type": "FINANCIAL_VOUCHER",
            "document_id": str(move.id),
            "amount": 18000.0,
            "requested_by": "accountant@oxengl.me",
        },
    )
    assert eval_voucher.status_code == 200, eval_voucher.text
    assert eval_voucher.json()["requires_approval"] is True

    # Attempt to post draft AccountMove while PENDING_APPROVAL -> must return 403
    blocked_move_post = client.post(f"/api/accounting/moves/{move.id}/post", headers=headers)
    assert blocked_move_post.status_code == 403, blocked_move_post.text

    # Approve the Financial Voucher step (note: _sync_target_document_status also marks move approved/posted)
    voucher_step_id = eval_voucher.json()["steps"][0]["id"]
    app_v_resp = client.post(
        f"/api/v1/procurement/approvals/steps/{voucher_step_id}/approve",
        headers=headers,
        json={"user_id": "finance_mgr@oxengl.me", "remarks": "Approved for GL posting"},
    )
    assert app_v_resp.status_code == 200, app_v_resp.text
    assert app_v_resp.json()["workflow_status"] == "APPROVED"

    # Verify the AccountMove is now posted or can be posted without 403
    platform_db.expire_all()
    refreshed_move = platform_db.get(AccountMove, move.id)
    assert refreshed_move.custom_attributes.get("approval_status") == "APPROVED"
    assert refreshed_move.state == "posted"


def test_04_multi_tenant_rls_isolation_on_approvals(client: TestClient, platform_db):
    """Verifies strict PostgreSQL RLS and API tenant isolation across approval_rules, workflow_instances, and workflow_steps."""
    tenant_a, headers_a = _create_tenant(platform_db, "p4-rls-a")
    tenant_b, headers_b = _create_tenant(platform_db, "p4-rls-b")

    # Tenant A triggers a workflow instance
    doc_a = str(uuid.uuid4())
    eval_a = client.post(
        "/api/v1/procurement/approvals/evaluate",
        headers=headers_a,
        json={
            "document_type": "FLEET_WORK_ORDER",
            "document_id": doc_a,
            "amount": 12000.0,
            "requested_by": "fleet_a@oxengl.me",
        },
    )
    assert eval_a.status_code == 200, eval_a.text
    step_a_id = eval_a.json()["steps"][0]["id"]

    # 1. Tenant B cannot see Tenant A's workflow in its queue
    queue_b = client.get("/api/v1/procurement/approvals/queue?include_history=true", headers=headers_b)
    assert queue_b.status_code == 200, queue_b.text
    assert all(q["document_id"] != doc_a for q in queue_b.json())

    # 2. Tenant B cannot approve Tenant A's workflow step (blocked by RLS / tenant check)
    cross_approve = client.post(
        f"/api/v1/procurement/approvals/steps/{step_a_id}/approve",
        headers=headers_b,
        json={"user_id": "attacker_b@oxengl.me"},
    )
    assert cross_approve.status_code in (400, 403, 404), cross_approve.text

    # 3. Tenant B spoofing X-Tenant-ID header for Tenant A is blocked with 403
    spoofed_headers = dict(headers_b)
    spoofed_headers["X-Tenant-ID"] = str(tenant_a.id)
    spoof_resp = client.get("/api/v1/procurement/approvals/queue", headers=spoofed_headers)
    assert spoof_resp.status_code == 403, spoof_resp.text

    # 4. Verify PostgreSQL Row-Level Security directly on oxengl_app session (SessionLocal)
    app_db = SessionLocal()
    try:
        app_db.info["tenant_id"] = str(tenant_b.id)
        app_db.execute(
            text("SELECT set_config('app.current_tenant_id', :tid, true)"),
            {"tid": str(tenant_b.id)},
        )
        instances_for_b = (
            app_db.query(WorkflowInstance).filter(WorkflowInstance.document_id == uuid.UUID(doc_a)).all()
        )
        assert len(instances_for_b) == 0

        steps_for_b = app_db.query(WorkflowStep).filter(WorkflowStep.id == uuid.UUID(step_a_id)).all()
        assert len(steps_for_b) == 0

        rules_for_b_from_a = (
            app_db.query(ApprovalRule).filter(ApprovalRule.tenant_id == tenant_a.id).all()
        )
        assert len(rules_for_b_from_a) == 0
    finally:
        app_db.rollback()
        app_db.close()
