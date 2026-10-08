# OxenGL Enterprise Platform: Quality Assurance & Testing Runbook
**Target Audience:** Core QA Engineers, SDETs, Backend Developers
**Objective:** Best practices and structural conventions for extending OxenGL's active 23/23 testing matrix using Pytest and FastAPI test utilities [tiangolo.com].

---

## 1. THE TESTING CORE DESIGN PRINCIPLES
To maintain our 100% test success rate, any newly introduced test suite must strictly respect these architectural boundaries:
*   **Database Isolation Enforced:** Always inject the asynchronous `db_session` fixture. Tests must run inside transactional isolation frames and automatically roll back post-execution to keep the production schema clean [tiangolo.com].
*   **Multi-Tenant Sandboxing Matrix:** When asserting access states, you must manually mock headers with varying `X-Tenant-ID` keys to explicitly verify that the ABAC engine blocks cross-tenant traffic [tiangolo.com].

---

## 2. STRUCTURAL CONVENTIONS: APPENDING A NEW UNIT TEST

All test files must reside inside the `backend/tests/` folder tree, categorized cleanly by their functional domain sub-module (e.g., `tests/auth/`, `tests/logistics/`, `tests/hr/`, `tests/procurement/`).

### Code Blueprint Template: `backend/tests/domain/test_new_feature.py`
Use this exact pattern when writing a new test case to ensure seamless integration into the test runner:

```python
import pytest
import uuid
from fastapi import status

@pytest.mark.asyncio
async def test_feat_01_permission_isolation_gate(async_client):
    """FEAT-01: Verifies that unauthorized endpoints drop traffic immediately with HTTP 403."""
    payload = {
        "resource_id": str(uuid.uuid4()),
        "action_token": "EXECUTE_RUN"
    }
    
    # Dispatch payload across the unified reverse proxy gateway channels
    response = await async_client.post(
        "/api/v1/new-feature/execute", 
        json=payload,
        headers={"X-Role": "UNPRIVILEGED_GUEST", "X-Tenant-ID": str(uuid.uuid4())}
    )
    
    # Assert security engine behavior matches core specifications [tiangolo.com]
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "Access denied" in response.json()["detail"]
```

---

## 3. CORE COMMAND RUNBOOK Execution Loops
Before dispatching a release branch to our private repository staging servers, the QA pipeline must execute these validations:

```bash
# 1. Execute the entire testing matrix concurrently
PYTHONPATH=.:backend backend/.venv/bin/pytest backend/tests/ -v

# 2. Run a filtered execution target on a specific single domain sub-module
PYTHONPATH=.:backend backend/.venv/bin/pytest backend/tests/logistics/ -v

# 3. Check code coverage metrics across our service modules
PYTHONPATH=.:backend backend/.venv/bin/pytest --cov=app backend/tests/
```
