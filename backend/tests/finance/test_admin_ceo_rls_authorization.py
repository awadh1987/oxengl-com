"""
Tests for OxenGL Sprint 4: Tenant Security & Authorization (RLS) Fix.
Verifies that Admin and CEO roles are fully authorized to access the Balanced Journal,
Financial Vouchers, and General Ledger routes without 403 Access Denied errors.
"""

import uuid
import pytest
from starlette.testclient import TestClient

from backend.app.main import app, create_session_token
from backend.database import SessionLocal
from backend.models import ResCompany, ResUser
from backend.app.domains.finance.models import Account


@pytest.fixture
def test_setup():
    db = SessionLocal()
    company_id = uuid.uuid4()
    company = ResCompany(
        id=company_id,
        name=f"Sprint 4 Exec Co {uuid.uuid4().hex[:8]}",
        slug=f"sprint4-co-{uuid.uuid4().hex[:6]}",
        currency="SAR",
        is_active=True,
    )
    db.add(company)

    # Seed basic accounts for balanced vouchers
    acc_debit = Account(
        id=uuid.uuid4(),
        tenant_id=company_id,
        company_id=company_id,
        code=f"101{uuid.uuid4().hex[:3]}",
        name="Operating Cash",
        path="assets.cash",
        account_type="ASSET",
    )
    acc_credit = Account(
        id=uuid.uuid4(),
        tenant_id=company_id,
        company_id=company_id,
        code=f"201{uuid.uuid4().hex[:3]}",
        name="Accounts Payable",
        path="liabilities.payable",
        account_type="LIABILITY",
    )
    db.add(acc_debit)
    db.add(acc_credit)

    # Admin user
    admin_id = uuid.uuid4()
    admin_user = ResUser(
        id=admin_id,
        firebase_uid=f"fb_admin_{admin_id.hex[:8]}",
        email=f"admin-{admin_id.hex[:6]}@example.com",
        full_name="Operations Administrator",
        role="Admin",
        company_id=company_id,
        is_active=True,
    )
    db.add(admin_user)

    # CEO user
    ceo_id = uuid.uuid4()
    ceo_user = ResUser(
        id=ceo_id,
        firebase_uid=f"fb_ceo_{ceo_id.hex[:8]}",
        email=f"ceo-{ceo_id.hex[:6]}@example.com",
        full_name="Chief Executive Officer",
        role="CEO",
        company_id=company_id,
        is_active=True,
    )
    db.add(ceo_user)

    db.commit()

    admin_token = create_session_token(
        subject=str(admin_id),
        company_id=company_id,
        role="Admin",
    )
    ceo_token = create_session_token(
        subject=str(ceo_id),
        company_id=company_id,
        role="CEO",
    )

    yield {
        "company_id": company_id,
        "admin_user": admin_user,
        "admin_token": admin_token,
        "ceo_user": ceo_user,
        "ceo_token": ceo_token,
        "acc_debit": acc_debit,
        "acc_credit": acc_credit,
    }

    db.close()


def test_ceo_can_access_balanced_vouchers_get(test_setup):
    """CEO role must be permitted to read balanced vouchers without 403."""
    client = TestClient(app)
    cid = str(test_setup["company_id"])
    token = test_setup["ceo_token"]

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": cid,
        "X-Company-ID": cid,
    }

    response = client.get("/api/v1/finance/vouchers/balanced", headers=headers)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    assert isinstance(response.json(), list)


def test_admin_can_access_balanced_vouchers_get(test_setup):
    """Admin role must be permitted to read balanced vouchers without 403."""
    client = TestClient(app)
    cid = str(test_setup["company_id"])
    token = test_setup["admin_token"]

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": cid,
        "X-Company-ID": cid,
    }

    response = client.get("/api/v1/finance/vouchers/balanced", headers=headers)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    assert isinstance(response.json(), list)


def test_ceo_can_post_balanced_voucher(test_setup):
    """CEO role must be permitted to post a balanced journal voucher without 403 ABAC rejection."""
    client = TestClient(app)
    cid = str(test_setup["company_id"])
    token = test_setup["ceo_token"]
    debit_code = test_setup["acc_debit"].code
    credit_code = test_setup["acc_credit"].code

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": cid,
        "X-Company-ID": cid,
    }

    payload = {
        "description": "Executive Payroll Allocation Approved by CEO",
        "entry_date": "2026-09-22T00:00:00",
        "lines": [
            {
                "account_code": debit_code,
                "description": "Operating Cash Debit",
                "debit": 25000.0,
                "credit": 0.0,
            },
            {
                "account_code": credit_code,
                "description": "Payables Credit",
                "debit": 0.0,
                "credit": 25000.0,
            },
        ],
    }

    response = client.post("/api/v1/finance/vouchers/balanced", json=payload, headers=headers)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] in ("SUCCESS", "POSTED")
    assert float(data["total_debit"]) == 25000.0
    assert float(data["total_credit"]) == 25000.0


def test_admin_can_post_balanced_voucher(test_setup):
    """Admin role must be permitted to post a balanced journal voucher without 403 ABAC rejection."""
    client = TestClient(app)
    cid = str(test_setup["company_id"])
    token = test_setup["admin_token"]
    debit_code = test_setup["acc_debit"].code
    credit_code = test_setup["acc_credit"].code

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": cid,
        "X-Company-ID": cid,
    }

    payload = {
        "description": "Monthly Operating Expenses posted by Admin",
        "entry_date": "2026-09-22T00:00:00",
        "lines": [
            {
                "account_code": debit_code,
                "description": "Operating Cash",
                "debit": 12000.0,
                "credit": 0.0,
            },
            {
                "account_code": credit_code,
                "description": "Accounts Payable",
                "debit": 0.0,
                "credit": 12000.0,
            },
        ],
    }

    response = client.post("/api/v1/finance/vouchers/balanced", json=payload, headers=headers)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] in ("SUCCESS", "POSTED")
    assert float(data["total_debit"]) == 12000.0


def test_ceo_can_access_journals_list(test_setup):
    """CEO role must be permitted to list journal entries without 403."""
    client = TestClient(app)
    cid = str(test_setup["company_id"])
    token = test_setup["ceo_token"]

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": cid,
        "X-Company-ID": cid,
    }

    response = client.get("/api/v1/finance/journals", headers=headers)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
