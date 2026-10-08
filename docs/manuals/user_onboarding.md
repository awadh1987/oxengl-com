# OxenGL Enterprise Platform: Multi-Tenant User Onboarding & Access Manual
**Target Audience:** Operations Administrators, Tenant Managers, System Integrators
**Objective:** Operational guidelines for registering corporate users, defining tenant boundaries, and provisioning permission matrices safely without cross-tenant leaks.

---

## 1. THE DATA ISOLATION MANDATE
OxenGL utilizes deep **Row-Level Schema Isolation**. Every request processed by the backend requires a validated `tenant_id` context. 
*   **The Golden Rule:** System staff must *never* manually modify a user's `tenant_id` inside the database unless performing an audited corporate restructuring. A mismatch will instantly lock the user out or block their queries via the ABAC Engine.

---

## 2. STEP-BY-STEP USER REGISTRATION PIPELINE

### Step 1: Corporate Tenant Space Verification
Before assigning an employee to a seat, ensure their organization possesses an active subscription profile. Query the status via the database console:
```sql
SELECT tenant_id, plan_id, status, current_seats_used, max_seats 
FROM tenant_subscriptions 
WHERE tenant_id = 'fc04f267-47ac-4bb4-bcd3-285425c4df69';
```
*   **Guardrail:** If `current_seats_used` matches or exceeds `max_seats`, the provisioning endpoint will automatically throw an `HTTP 422 Unprocessable Entity` error. The tenant must upgrade their subscription tier via the Billing Panel before new staff can be added.

### Step 2: Provisioning the Personnel Core
Register the worker's master file inside the HR module using an asynchronous POST call or via the Administrative Cockpit:
*   **Endpoint:** `POST /api/v1/hr/employees`
*   **Payload Constraints:** Explicitly bind the target organizational `tenant_id`, their unique corporate alphanumeric `employee_code`, and their allocated department profile.

### Step 3: Mapping Security Matrix Scopes
Assign specific role codes inside the IAM domain to control application boundaries:

*   **`SUPER_ADMIN`**: Grants unrestricted access (`*` wildcard permission bypass code). Reserved strictly for regional platform operations leads.
*   **`FINANCE_MANAGER`**: Grants `FINANCE_READ`, `FINANCE_WRITE`, and `PAYROLL_APPROVE`. Allows posting double-entry general ledger vouchers.
*   **`PROCUREMENT_MANAGER`**: Grants `PROCUREMENT_READ`, `PROCUREMENT_WRITE`, and `WORKFLOW_APPROVE`. Authorizes purchase requisitions matching threshold matrices.
*   **`LOGISTICS_DIRECTOR`**: Grants `FLEET_READ`, `FLEET_WRITE`, and `FLEET_ADJUST`. Authorizes driver waybills and live telemetry monitoring access.

---

## 3. AUDIT & TROUBLESHOOTING RUNBOOK

### Incident A: User receives an "Invalid email or password" or "HTTP 500" at Login
*   **Fix:** Ensure the hash format inside the `users` table matches an encrypted Blowfish or Argon2 standard. Check that the user input email matches exactly, and verify that the tenant's primary company status is set to active.

### Incident B: User receives an "HTTP 403 Access Denied" during a resource edit
*   **Fix:** This is an ABAC Engine interception. Check the backend log traces using:
    `docker compose logs backend --tail=50`
    Verify if the user's `allowed_warehouse_ids` or `allowed_company_ids` attributes match the metadata parameters of the record they are trying to manipulate.

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
        current_period_end=uuid.uuid4() # Mock data boundary context
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
    
    res = await async_client.post("/api/v1/hr/employees", json=payload, headers={"X-Role": "ADMIN"})
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
