"""
Phase 11 RBAC & Multi-Tenant Data Isolation Tests.

Tests:
1. Standard roles: Super_Admin, Admin, Accountant, Read_Only.
2. Route Protection: Read_Only role blocked with HTTP 403 Forbidden on POST/PUT/DELETE.
3. Strict Multi-Tenant Isolation:
   - Administrator managing operations for "Al-Waha school" has ZERO API access
     to "Bani Hashish chalet" financial data.
   - Cross-tenant/company access requests explicitly return HTTP 403 Forbidden.
   - Super_Admin has unrestricted oversight access.
"""

import uuid
from decimal import Decimal
import jwt
import pytest
from fastapi import status
from httpx import AsyncClient, ASGITransport

from backend.app.main import app
from backend.api.dependencies import (
    StandardRole,
    JWT_SECRET_KEY,
    JWT_ALGORITHM,
)
from backend.database import PlatformSessionLocal as SessionLocal
from backend.models import (
    FinanceJournalEntry,
    FinanceJournalLine,
    ResCompany,
    ResUser,
    Warehouse,
    InventoryMovement,
)


def _generate_test_token(
    user_id: str,
    role: str,
    tenant_id: str,
    company_id: str,
    email: str = "user@example.com",
) -> str:
    payload = {
        "sub": user_id,
        "user_id": user_id,
        "role": role,
        "tenant_id": tenant_id,
        "company_id": company_id,
        "email": email,
    }
    # Auth requires a registered res_users account; the token role overrides the stored one.
    seeded_email = f"{user_id[:8]}-{email}"
    nil = uuid.UUID(int=0)
    db = SessionLocal()
    try:
        if db.get(ResUser, uuid.UUID(user_id)) is None:
            db.add(ResUser(
                id=uuid.UUID(user_id),
                firebase_uid=f"native-{user_id}",
                email=seeded_email,
                full_name="RBAC Test User",
                password_hash="x",
                company_id=None if uuid.UUID(company_id) == nil else uuid.UUID(company_id),
                role="Admin",
                is_active=True,
            ))
            db.commit()
    finally:
        db.close()
    payload["email"] = seeded_email
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


@pytest.fixture
def isolation_setup():
    """Sets up two isolated corporate entities: Al-Waha School and Bani Hashish Chalet."""
    db = SessionLocal()
    try:
        al_waha_cid = uuid.uuid4()
        chalet_cid = uuid.uuid4()

        # Seed companies with unique names
        u_suffix = uuid.uuid4().hex[:6]
        al_waha_comp = ResCompany(
            id=al_waha_cid,
            name=f"Al-Waha International School {u_suffix}",
            currency="SAR",
        )
        chalet_comp = ResCompany(
            id=chalet_cid,
            name=f"Bani Hashish Luxury Chalet Resort {u_suffix}",
            currency="SAR",
        )
        db.add_all([al_waha_comp, chalet_comp])
        db.flush()

        # Seed GL Entries for Al-Waha School
        entry_al_waha = FinanceJournalEntry(
            id=uuid.uuid4(),
            tenant_id=al_waha_cid,
            company_id=al_waha_cid,
            entry_number=f"JE-ALWAHA-{uuid.uuid4().hex[:6].upper()}",
            description="Al-Waha School Tuition Revenue",
            total_debit=Decimal("50000.00"),
            total_credit=Decimal("50000.00"),
            status="POSTED",
        )
        line_al_waha_dr = FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=al_waha_cid,
            entry_id=entry_al_waha.id,
            account_code="111000",
            description="School Bank Account",
            debit=Decimal("50000.00"),
            credit=Decimal("0.00"),
        )
        line_al_waha_cr = FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=al_waha_cid,
            entry_id=entry_al_waha.id,
            account_code="410000",
            description="Tuition Sales Revenue",
            debit=Decimal("0.00"),
            credit=Decimal("50000.00"),
        )

        # Seed GL Entries for Bani Hashish Chalet (strictly confidential)
        entry_chalet = FinanceJournalEntry(
            id=uuid.uuid4(),
            tenant_id=chalet_cid,
            company_id=chalet_cid,
            entry_number=f"JE-CHALET-{uuid.uuid4().hex[:6].upper()}",
            description="Bani Hashish VIP Chalet Booking Revenue",
            total_debit=Decimal("120000.00"),
            total_credit=Decimal("120000.00"),
            status="POSTED",
        )
        line_chalet_dr = FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=chalet_cid,
            entry_id=entry_chalet.id,
            account_code="111000",
            description="Chalet Treasury Vault",
            debit=Decimal("120000.00"),
            credit=Decimal("0.00"),
        )
        line_chalet_cr = FinanceJournalLine(
            id=uuid.uuid4(),
            tenant_id=chalet_cid,
            entry_id=entry_chalet.id,
            account_code="410000",
            description="Chalet Rental Sales Revenue",
            debit=Decimal("0.00"),
            credit=Decimal("120000.00"),
        )

        # Seed confidential Inventory Movement for Bani Hashish Chalet
        wh_chalet = Warehouse(
            id=uuid.uuid4(),
            company_id=chalet_cid,
            code=f"WH-{uuid.uuid4().hex[:5].upper()}",
            name="Chalet Luxury Spa Warehouse",
            is_active=True,
        )
        db.add(wh_chalet)
        db.flush()

        movement_chalet = InventoryMovement(
            id=uuid.uuid4(),
            tenant_id=chalet_cid,
            company_id=chalet_cid,
            movement_number=f"MOV-CHALET-{uuid.uuid4().hex[:6].upper()}",
            movement_type="ADJUSTMENT",
            warehouse_id=wh_chalet.id,
            quantity=Decimal("10.0"),
            unit_cost=Decimal("500.00"),
            total_cost=Decimal("5000.00"),
            reason="VIP Chalet Wine & Spa Amenities",
            status="COMPLETED",
            is_posted=False,
        )

        db.add_all([
            entry_al_waha, line_al_waha_dr, line_al_waha_cr,
            entry_chalet, line_chalet_dr, line_chalet_cr,
            movement_chalet,
        ])
        db.commit()

        yield {
            "al_waha_company_id": str(al_waha_cid),
            "chalet_company_id": str(chalet_cid),
            "chalet_movement_id": str(movement_chalet.id),
        }
    finally:
        db.close()


@pytest.mark.asyncio
async def test_read_only_role_cannot_post_mutations(isolation_setup):
    """Verifies that a user with Read_Only role is strictly blocked (HTTP 403) from POST/PUT/DELETE."""
    al_waha_cid = isolation_setup["al_waha_company_id"]
    token_readonly = _generate_test_token(
        user_id=str(uuid.uuid4()),
        role=StandardRole.READ_ONLY,
        tenant_id=al_waha_cid,
        company_id=al_waha_cid,
        email="auditor@alwaha-school.edu.sa",
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Attempt POST to attendance (HR)
        resp_hr = await client.post(
            "/api/hrms/attendance",
            headers={"Authorization": f"Bearer {token_readonly}"},
            json={
                "employee_id": str(uuid.uuid4()),
                "timestamp": "2026-09-25T08:00:00Z",
                "attendance_type": "CHECK_IN",
            },
        )
        assert resp_hr.status_code == status.HTTP_403_FORBIDDEN
        assert "Read_Only" in resp_hr.json().get("detail", "")

        # 2. Attempt POST to bills (Procurement)
        resp_bill = await client.post(
            "/api/procurement/bills",
            headers={"Authorization": f"Bearer {token_readonly}"},
            json={
                "vendor_id": str(uuid.uuid4()),
                "bill_number": "BILL-TEST-RO",
                "subtotal": 1000.0,
                "tax_amount": 150.0,
                "total_amount": 1150.0,
            },
        )
        assert resp_bill.status_code == status.HTTP_403_FORBIDDEN

        # 3. Attempt POST to movements (Inventory)
        resp_inv = await client.post(
            "/api/inventory/movements",
            headers={"Authorization": f"Bearer {token_readonly}"},
            json={
                "warehouse_id": str(uuid.uuid4()),
                "movement_type": "ADJUSTMENT",
                "quantity": 10.0,
                "unit_cost": 25.0,
            },
        )
        assert resp_inv.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_al_waha_admin_cannot_access_chalet_financial_data(isolation_setup):
    """
    Verifies Multi-Tenant Isolation:
    Administrator managing operations for Al-Waha school must have ZERO access
    to Bani Hashish chalet financial data.
    """
    al_waha_cid = isolation_setup["al_waha_company_id"]
    chalet_cid = isolation_setup["chalet_company_id"]
    chalet_movement_id = isolation_setup["chalet_movement_id"]

    token_al_waha = _generate_test_token(
        user_id=str(uuid.uuid4()),
        role=StandardRole.ADMIN,
        tenant_id=al_waha_cid,
        company_id=al_waha_cid,
        email="principal@alwaha-school.edu.sa",
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Unparameterized query to trial balance: must only see Al-Waha data, zero Chalet data
        resp_tb = await client.get(
            "/api/analytics/trial-balance",
            headers={"Authorization": f"Bearer {token_al_waha}"},
        )
        assert resp_tb.status_code == status.HTTP_200_OK
        tb_data = resp_tb.json()
        assert float(tb_data["total_debit"]) == 50000.0  # Exactly Al-Waha's 50,000, zero Chalet 120,000 data

        # 2. Attempt to query Chalet's trial balance explicitly by passing Chalet company_id: MUST return 403 Forbidden
        resp_cross_comp = await client.get(
            f"/api/analytics/trial-balance?company_id={chalet_cid}",
            headers={"Authorization": f"Bearer {token_al_waha}"},
        )
        assert resp_cross_comp.status_code == status.HTTP_403_FORBIDDEN
        assert "Multi-tenant isolation violation" in resp_cross_comp.json().get("detail", "")

        # 3. Attempt to query Chalet's income statement: MUST return 403 Forbidden
        resp_cross_is = await client.get(
            f"/api/analytics/income-statement?company_id={chalet_cid}",
            headers={"Authorization": f"Bearer {token_al_waha}"},
        )
        assert resp_cross_is.status_code == status.HTTP_403_FORBIDDEN

        # 4. Attempt to query Chalet's balance sheet: MUST return 403 Forbidden
        resp_cross_bs = await client.get(
            f"/api/analytics/balance-sheet?company_id={chalet_cid}",
            headers={"Authorization": f"Bearer {token_al_waha}"},
        )
        assert resp_cross_bs.status_code == status.HTTP_403_FORBIDDEN

        # 5. Attempt to post Chalet's confidential inventory movement to ledger: MUST return 403 Forbidden
        resp_post_mov = await client.post(
            f"/api/inventory/movements/{chalet_movement_id}/post-ledger",
            headers={"Authorization": f"Bearer {token_al_waha}"},
        )
        assert resp_post_mov.status_code == status.HTTP_403_FORBIDDEN
        assert "Multi-tenant isolation violation" in resp_post_mov.json().get("detail", "")



@pytest.mark.asyncio
async def test_super_admin_unrestricted_cross_tenant_access(isolation_setup):
    """Verifies that Super_Admin has system-wide administrative oversight across tenants."""
    al_waha_cid = isolation_setup["al_waha_company_id"]
    chalet_cid = isolation_setup["chalet_company_id"]

    token_super = _generate_test_token(
        user_id="00000000-0000-0000-0000-000000000000",
        role=StandardRole.SUPER_ADMIN,
        tenant_id="00000000-0000-0000-0000-000000000000",
        company_id="00000000-0000-0000-0000-000000000000",
        email="admin@oxengl.com",
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Super admin can query Chalet company trial balance
        resp_chalet = await client.get(
            f"/api/analytics/trial-balance?company_id={chalet_cid}",
            headers={"Authorization": f"Bearer {token_super}"},
        )
        assert resp_chalet.status_code == status.HTTP_200_OK
        assert float(resp_chalet.json()["total_debit"]) == 120000.0

        # Super admin can query Al-Waha company trial balance
        resp_alwaha = await client.get(
            f"/api/analytics/trial-balance?company_id={al_waha_cid}",
            headers={"Authorization": f"Bearer {token_super}"},
        )
        assert resp_alwaha.status_code == status.HTTP_200_OK
        assert float(resp_alwaha.json()["total_debit"]) == 50000.0
