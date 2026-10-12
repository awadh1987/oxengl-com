# OxenGL Enterprise Phase 1 Core Integration Test Specification
**Target Role:** Software Engineer in Test (SDET), QA Automation Lead, Security Reviewer
**Objective:** Automate functional verification gates to prove transaction mapping validity, multi-tenant/warehouse data boundaries, and financial calculation correctness across the platform.

---

## 1. BACKEND ATTRIBUTE-BASED ACCESS CONTROL (ABAC) SECURITY BOUNDS
Validate that the interceptor layer dynamically blocks data leaks and unauthorized record edits based on user contexts.

### Test Script File: `backend/tests/security/test_abac_boundaries.py`
```python
import pytest
from uuid import uuid4
from fastapi import status
from httpx import AsyncClient
from app.security.abac import ABACUserContext, ResourceAttributes, ABACEngine

def test_abac_tenant_isolation_enforcement():
    """Rule: Users must be unconditionally blocked from accessing other tenants."""
    tenant_a = uuid4()
    tenant_b = uuid4()
    
    user = ABACUserContext(user_id=uuid4(), tenant_id=tenant_a, allowed_company_ids=[uuid4()], allowed_warehouse_ids=[uuid4()], allowed_fleet_regions=["NORTH"])
    resource = ResourceAttributes(tenant_id=tenant_b, company_id=uuid4(), warehouse_id=uuid4())
    
    assert ABACEngine.authorize(user, resource, "READ") is False

@pytest.mark.asyncio
async def test_warehouse_manager_restricted_adjustments(client: AsyncClient, auth_headers_wh01: dict):
    """Rule: WMS users cannot adjust inventory outside their allowed warehouse attributes."""
    payload = {
        "warehouse_id": str(uuid4()),  # Unassigned rogue warehouse target
        "material_id": str(uuid4()),
        "quantity": 50.0,
        "transaction_type": "ADJUSTMENT"
    }
    response = await client.post("/api/v1/inventory/adjust", json=payload, headers=auth_headers_wh01)
    assert response.status_code == status.HTTP_403_FORBIDDEN
```

---

## 2. PROCUREMENT THREE-WAY MATCHING ENGINE ACCURACY
Validate that supplier invoice processing matches the mathematical constraints of the procurement pipeline.

### Test Script File: `backend/tests/procurement/test_three_way_match.py`
```python
import pytest
from fastapi import status
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_three_way_match_happy_path(client: AsyncClient, valid_po_grn_ids: dict, manager_headers: dict):
    """Rule: Confirmed totals (PO Qty == GRN Qty == Bill Qty) must transition smoothly to MATCHED."""
    po_id, grn_id = valid_po_grn_ids["po_id"], valid_po_grn_ids["grn_id"]
    payload = {
        "purchase_order_id": po_id,
        "goods_receipt_id": grn_id,
        "invoice_no": "INV-2026-999",
        "amount": 12000.00
    }
    response = await client.post(f"/api/v1/procurement/vendor-invoices/match", json=payload, headers=manager_headers)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "MATCHED"

@pytest.mark.asyncio
async def test_three_way_match_quantity_variance_hold(client: AsyncClient, incomplete_grn_ids: dict, manager_headers: dict):
    """Rule: Invoiced values exceeding physically received values must lock into a discrepancy hold."""
    po_id, partial_grn_id = incomplete_grn_ids["po_id"], incomplete_grn_ids["grn_id"]
    payload = {
        "purchase_order_id": po_id,
        "goods_receipt_id": partial_grn_id,
        "invoice_no": "INV-2026-ERR",
        "amount": 12000.00  # Full price billed for short-shipped cargo
    }
    response = await client.post(f"/api/v1/procurement/vendor-invoices/match", json=payload, headers=manager_headers)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "HOLD_DISCREPANCY"
```

---

## 3. DOUBLE-ENTRY LEDGER & TREE CALCULATIONS INTEGRITY
Verify that financial postings balance perfectly and that hierarchical paths calculate child node metrics correctly.

### Test Script File: `backend/tests/finance/test_ledger_accounting.py`
```python
import pytest
from fastapi import status
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_unbalanced_journal_entry_exception(client: AsyncClient, accountant_headers: dict):
    """Rule: Asymmetrical debit/credit lines must instantly trigger errors and roll back transactions."""
    payload = {
        "description": "Imbalanced operational expense ledger entry test",
        "lines": [
            {"account_code": "500000", "debit": 500.00, "credit": 0.00},
            {"account_code": "111101", "debit": 0.00, "credit": 450.00}  # \$50 gap causing imbalance
        ]
    }
    response = await client.post("/api/v1/finance/journals", json=payload, headers=accountant_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
```
