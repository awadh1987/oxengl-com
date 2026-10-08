"""
Tests for OxenGL Double-Entry Mathematical Guard & Financial Voucher Balancing.
Verifies sum(Debits) == sum(Credits) invariance and 400 Bad Request rejection on imbalance.
"""

import uuid
import pytest
from decimal import Decimal
from fastapi import HTTPException
from starlette.testclient import TestClient

from backend.app.main import app, create_session_token
from backend.database import SessionLocal
from backend.models import ResCompany, ResUser, AccountMove, AccountMoveLine, AccountAccount, AccountJournal, FiscalYear
from backend.app.domains.finance.guards import (
    enforce_double_entry_balance,
    validate_double_entry_invariance,
)


def test_guard_valid_balanced_lines():
    """Balanced debits and credits must validate successfully without error."""
    lines = [
        {"account_code": "511000", "debit": 15000.0, "credit": 0.0},
        {"account_code": "512000", "debit": 2500.0, "credit": 0.0},
        {"account_code": "111101", "debit": 0.0, "credit": 16000.0},
        {"account_code": "211200", "debit": 0.0, "credit": 1500.0},
    ]
    dr, cr = validate_double_entry_invariance(lines)
    assert dr == Decimal("17500.0000")
    assert cr == Decimal("17500.0000")
    assert dr == cr


def test_guard_unbalanced_lines_rejection():
    """Unbalanced debits and credits must trigger immediate 400 Bad Request ledger isolation error."""
    lines = [
        {"account_code": "511000", "debit": 15000.0, "credit": 0.0},
        {"account_code": "111101", "debit": 0.0, "credit": 14000.0},  # 1000 discrepancy
    ]
    with pytest.raises(HTTPException) as exc_info:
        validate_double_entry_invariance(lines)

    assert exc_info.value.status_code == 400
    assert "Ledger isolation error" in exc_info.value.detail
    assert "Unbalanced transaction" in exc_info.value.detail


def test_guard_negative_value_rejection():
    """Negative values in debit or credit must be rejected with 400 Bad Request."""
    lines = [
        {"account_code": "511000", "debit": -500.0, "credit": 0.0},
        {"account_code": "111101", "debit": 0.0, "credit": -500.0},
    ]
    with pytest.raises(HTTPException) as exc_info:
        validate_double_entry_invariance(lines)

    assert exc_info.value.status_code == 400
    assert "negative" in exc_info.value.detail.lower()


def test_guard_decorator_on_custom_function():
    """Decorator must intercept execution and reject unbalanced payload before target function executes."""
    executed = False

    @enforce_double_entry_balance
    def mock_post_transaction(lines, memo="Test"):
        nonlocal executed
        executed = True
        return "SUCCESS"

    # 1. Balanced call should execute
    res = mock_post_transaction([
        {"account_code": "1001", "debit": 500.0, "credit": 0.0},
        {"account_code": "2001", "debit": 0.0, "credit": 500.0},
    ])
    assert res == "SUCCESS"
    assert executed is True

    # 2. Unbalanced call must abort before executing
    executed = False
    with pytest.raises(HTTPException) as exc_info:
        mock_post_transaction([
            {"account_code": "1001", "debit": 500.0, "credit": 0.0},
            {"account_code": "2001", "debit": 0.0, "credit": 400.0},
        ])
    assert exc_info.value.status_code == 400
    assert executed is False


def test_api_balanced_voucher_endpoint():
    """POST /api/v1/finance/vouchers/balanced accepts balanced voucher and rejects unbalanced with 400."""
    client = TestClient(app)

    # 1. Reject unbalanced voucher
    unbalanced_payload = {
        "description": "Unbalanced Test Payroll Voucher",
        "lines": [
            {"account_code": "511000", "debit": 10000.0, "credit": 0.0},
            {"account_code": "111101", "debit": 0.0, "credit": 9500.0},
        ],
    }
    resp = client.post("/api/v1/finance/vouchers/balanced", json=unbalanced_payload)
    assert resp.status_code == 400
    assert "Ledger isolation error" in resp.json()["detail"]

    # 2. Accept balanced voucher
    balanced_payload = {
        "description": "Balanced Test Payroll Voucher",
        "lines": [
            {"account_code": "511000", "debit": 10000.0, "credit": 0.0},
            {"account_code": "111101", "debit": 0.0, "credit": 10000.0},
        ],
    }
    resp_ok = client.post("/api/v1/finance/vouchers/balanced", json=balanced_payload)
    assert resp_ok.status_code == 201
    data = resp_ok.json()
    assert data["status"] == "SUCCESS"
    assert data["total_debit"] == 10000.0
    assert data["total_credit"] == 10000.0


@pytest.fixture
def accounting_test_company():
    """Provides a temporary company, admin user, and auth headers for accounting move tests."""
    db = SessionLocal()
    cid = uuid.uuid4()
    company = ResCompany(
        id=cid,
        name=f"Accounting Test Corp {cid.hex[:6]}",
        slug=f"acct-{cid.hex[:6]}",
        domain_slug=f"acct-{cid.hex[:6]}",
        currency="SAR",
        tax_id=f"300{cid.hex[:8]}",
        commercial_registration=f"101{cid.hex[:7]}",
        is_active=True,
    )
    db.add(company)

    user = ResUser(
        id=uuid.uuid4(),
        firebase_uid=f"acct-user-{cid.hex[:6]}",
        email=f"acct-{cid.hex[:6]}@example.com",
        full_name="Accounting Test Admin",
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

    db.query(AccountMoveLine).filter(AccountMoveLine.company_id == cid).delete(synchronize_session=False)
    db.query(AccountMove).filter(AccountMove.company_id == cid).delete(synchronize_session=False)
    db.query(AccountAccount).filter(AccountAccount.company_id == cid).delete(synchronize_session=False)
    db.query(AccountJournal).filter(AccountJournal.company_id == cid).delete(synchronize_session=False)
    db.query(FiscalYear).filter(FiscalYear.company_id == cid).delete(synchronize_session=False)
    db.delete(user)
    db.delete(company)
    db.commit()
    db.close()


def test_accounting_move_balanced_posting(accounting_test_company):
    """POST /api/accounting/moves creates a balanced posted AccountMove and lines."""
    client = TestClient(app)
    cid = accounting_test_company["cid"]
    headers = accounting_test_company["headers"]

    payload = {
        "date": "2026-09-18",
        "journal_code": "GEN",
        "ref": "VOUCH-TEST-2026-001",
        "narration": "Voucher settlement payroll allocation",
        "company_id": cid,
        "lines": [
            {
                "account_code": "511000",
                "name": "Direct Labor Payroll",
                "debit": 15000.0,
                "credit": 0.0,
            },
            {
                "account_code": "111101",
                "name": "Al Rajhi Main Operating",
                "debit": 0.0,
                "credit": 15000.0,
            },
        ],
    }

    resp = client.post("/api/accounting/moves", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    assert data["id"] is not None
    assert data["state"] == "posted"
    assert data["ref"] == "VOUCH-TEST-2026-001"
    assert len(data["lines"]) == 2
    assert Decimal(str(data["amount_total"])) == Decimal("15000.0000")

    # Verify via GET endpoint
    move_id = data["id"]
    get_resp = client.get(f"/api/accounting/moves/{move_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == move_id

    # Verify in list
    list_resp = client.get("/api/accounting/moves", headers=headers)
    assert list_resp.status_code == 200
    assert any(m["id"] == move_id for m in list_resp.json())


def test_accounting_move_unbalanced_rejection(accounting_test_company):
    """POST /api/accounting/moves rejects unbalanced lines with 400 or 422."""
    client = TestClient(app)
    cid = accounting_test_company["cid"]
    headers = accounting_test_company["headers"]

    unbalanced_payload = {
        "date": "2026-09-18",
        "journal_code": "GEN",
        "ref": "VOUCH-TEST-FAIL",
        "narration": "Unbalanced Voucher",
        "company_id": cid,
        "lines": [
            {
                "account_code": "511000",
                "name": "Direct Labor Payroll",
                "debit": 15000.0,
                "credit": 0.0,
            },
            {
                "account_code": "111101",
                "name": "Al Rajhi Main Operating",
                "debit": 0.0,
                "credit": 14000.0,  # 1000 SAR gap
            },
        ],
    }

    resp = client.post("/api/accounting/moves", json=unbalanced_payload, headers=headers)
    # Either pydantic validator (422) or guard (400) catches imbalance
    assert resp.status_code in (400, 422)


def test_accounting_move_post_action(accounting_test_company):
    """POST /api/accounting/moves/{move_id}/post transitions draft move to posted."""
    client = TestClient(app)
    cid = accounting_test_company["cid"]
    headers = accounting_test_company["headers"]

    # First create a balanced move
    payload = {
        "date": "2026-09-18",
        "journal_code": "GEN",
        "ref": "MOVE-POST-TRANSITION",
        "narration": "Testing post transition endpoint",
        "company_id": cid,
        "lines": [
            {
                "account_code": "511000",
                "name": "Expense",
                "debit": 500.0,
                "credit": 0.0,
            },
            {
                "account_code": "111101",
                "name": "Bank",
                "debit": 0.0,
                "credit": 500.0,
            },
        ],
    }

    create_resp = client.post("/api/accounting/moves", json=payload, headers=headers)
    assert create_resp.status_code == 201
    move_id = create_resp.json()["id"]

    post_resp = client.post(f"/api/accounting/moves/{move_id}/post", headers=headers)
    assert post_resp.status_code == 200
    assert post_resp.json()["state"] == "posted"

