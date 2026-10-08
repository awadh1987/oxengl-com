import pytest
import uuid
from fastapi import status
from app.domains.saas.models import TenantSubscription


@pytest.mark.asyncio
async def test_onb_01_subscription_seat_cap_enforcement(async_client, db_session):
    """ONB-01: Verifies that creating an employee rejects payload if seat cap is exceeded."""
    tenant_id = uuid.uuid4()
    plan_id = uuid.uuid4()

    # 1. Simulate a capped tenant contract record where current_seats_used == max_seats
    capped_sub = TenantSubscription(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        plan_id=plan_id,
        stripe_customer_id=f"cus_capped_{uuid.uuid4().hex[:6]}",
        status="active",
        current_seats_used=5,
        max_seats=5,  # Seat capacity fully saturated
        current_period_end=uuid.uuid4()  # Mock data boundary context
    )
    db_session.add(capped_sub)
    await db_session.commit()

    # 2. Attempt to force-provision a new employee record via the REST API
    payload = {
        "tenant_id": str(tenant_id),
        "employee_code": "EMP-ERR-OVERCAP",
        "first_name": "Rami",
        "last_name": "Al-Mansoori",
        "department": "Logistics Operations",
        "base_salary": 14000.00
    }

    res = await async_client.post(
        "/api/v1/hr/employees",
        json=payload,
        headers={"X-Role": "ADMIN", "X-Tenant-ID": str(tenant_id)},
    )
    # The registration handler must intercept usage checks and reject the payload
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "Subscription seat cap exceeded" in res.json()["detail"]


@pytest.mark.asyncio
async def test_onb_02_abac_role_boundary_interception(async_client):
    """ONB-02: Verifies that unprivileged roles cannot mutate payroll runs."""
    payload = {
        "tenant_id": str(uuid.uuid4()),
        "employee_id": str(uuid.uuid4()),
        "pay_period": "2026-09"
    }
    # A standard base LOGISTICS_DRIVER must be strictly blocked from issuing calculations
    res = await async_client.post(
        "/api/v1/hr/payroll/calculate", 
        json=payload, 
        headers={"X-Role": "LOGISTICS_DRIVER"}
    )
    assert res.status_code == status.HTTP_403_FORBIDDEN
