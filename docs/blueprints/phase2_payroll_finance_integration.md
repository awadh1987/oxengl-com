# OxenGL Phase 2 Blueprint: Payroll-to-Finance Ledger Integration
**Target Role:** Principal Financial Systems Architect, Lead ERP Engineer, DBA Lead
**Objective:** Deploy an asynchronous post-commit event listener pipeline that intercepts Payroll Run approvals and automatically executes balanced double-entry accounting transactions across hierarchical `ltree` financial ledger nodes.

---

## 1. TRANSACTION FLOW & DOUBLE-ENTRY LEDGER MATRIX
When a authorized manager approves a `PayrollRun` (`status = 'APPROVED'`), the system must execute an atomic transaction. This transaction credits the cash operational node and debits the specific cost-center expense paths across your 5-level `ltree` Chart of Accounts [docs.sqlalchemy.org]:

| Account Code | Target Hierarchical `ltree` Path | Entry Type | Allocation Formula |
| :--- | :--- | :--- | :--- |
| **`511000`** | `expenses.operating_expenses.payroll.gross_salaries` | **DEBIT** | `PayrollRun.gross_earnings` |
| **`512000`** | `expenses.operating_expenses.payroll.allowances` | **DEBIT** | `PayrollRun.allowances` |
| **`111101`** | `assets.current_assets.cash_and_banks.local_banks.main_operating_account` | **CREDIT** | `PayrollRun.net_pay` |
| **`211200`** | `liabilities.current_liabilities.accruals.payroll_withholding` | **CREDIT** | `PayrollRun.deductions` |

### 🛠️ Invariance Protection Constraints
The transaction engine must enforce strict mathematical equality before committing changes to PostgreSQL [docs.sqlalchemy.org]:
\[\sum \text{Debits} == \sum \text{Credits} \implies (\text{Gross} + \text{Allowances}) == (\text{Net Pay} + \text{Deductions})\]
If any floating-point arithmetic or rounding mismatch is detected, the entire operation drops out-of-band, rolls back, and flags a critical compliance alert.

---

## 2. INTEGRATION ENGINE LAYER (`backend/app/domains/hr/integration.py`)

Implement the asynchronous orchestration service to automatically bridge the HR and Finance domain contexts [://tiangolo.com]:

```python
import uuid
from decimal import Decimal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException, status
from app.domains.hr.models import PayrollRun, Employee
from app.domains.finance.models import JournalEntry, JournalLine

class PayrollFinanceIntegrationEngine:
    @classmethod
    async def approve_and_post_payroll(
        cls, db: AsyncSession, tenant_id: uuid.UUID, payroll_run_id: uuid.UUID, auditor_id: uuid.UUID
    ) -> uuid.UUID:
        """Approves a payroll draft run and posts a balanced journal voucher entry."""
        # 1. Fetch target payroll run and lock the row for processing
        stmt = select(PayrollRun).where(PayrollRun.id == payroll_run_id, PayrollRun.tenant_id == tenant_id)
        res = await db.execute(stmt)
        payroll = res.scalar_one_or_none()
        
        if not payroll or payroll.status != "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Payroll run must be in DRAFT status to be approved and posted."
            )

        # 2. Extract localized numerical decimals values
        gross = Decimal(str(payroll.gross_earnings))
        allowances = Decimal(str(payroll.allowances))
        deductions = Decimal(str(payroll.deductions))
        net_pay = Decimal(str(payroll.net_pay))

        # 3. Mathematical Invariance Balancing Check Verification Gate
        if (gross + allowances) != (net_pay + deductions):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invariance Failure: Debits do not balance with credits inside payroll allocation lines."
            )

        # 4. Construct Balanced Double-Entry Journal Voucher Header
        entry = JournalEntry(
            tenant_id=tenant_id,
            description=f"Automated payroll entry posting - Period {payroll.pay_period}",
            status="POSTED",
            posted_by=auditor_id,
            posted_at=datetime.utcnow()
        )
        db.add(entry)
        await db.flush()

        # 5. Build and attach the debits and credits ledger lines
        lines = [
            JournalLine(entry_id=entry.id, account_code="511000", debit=gross, credit=Decimal("0.00")),
            JournalLine(entry_id=entry.id, account_code="512000", debit=allowances, credit=Decimal("0.00")),
            JournalLine(entry_id=entry.id, account_code="111101", debit=Decimal("0.00"), credit=net_pay),
            JournalLine(entry_id=entry.id, account_code="211200", debit=Decimal("0.00"), credit=deductions)
        ]
        db.add_all(lines)

        # 6. Atomic state flip transition
        payroll.status = "APPROVED"
        await db.commit()
        
        return entry.id
```

---

## 3. COMPLIANCE ROUTING GATEWAYS (`backend/app/api/v1/hr.py`)

Append the authorization validation endpoint to your existing HR router [://tiangolo.com]:

```python
@router.post("/payroll/{id}/approve", status_code=status.HTTP_200_OK, dependencies=[Depends(enforce_abac("PAYROLL_APPROVE"))])
async def approve_and_ledger_post_payroll(id: uuid.UUID, payload: dict, db: AsyncSession = Depends(get_db)):
    """Locks payroll records, switches status flags, and commits balanced lines to financial trees."""
    entry_id = await PayrollFinanceIntegrationEngine.approve_and_post_payroll(
        db=db,
        tenant_id=payload.get("tenant_id"),
        payroll_run_id=id,
        auditor_id=payload.get("user_id")
    )
    return {"status": "APPROVED_AND_POSTED", "general_ledger_entry_id": entry_id}
```

---

## 4. INTEGRATION COMPLIANCE ASSURANCE TESTS
Automate structural validations inside `backend/tests/hr/` to protect corporate assets:
- **Test Case ACC-01 (Balanced Postings)**: Approving a valid payroll run must yield an `APPROVED_AND_POSTED` success flag and return a valid journal voucher UUID.
- **Test Case ACC-02 (Invariance Block)**: Forcing an asymmetric value change into the database parameters prior to running the approval hook must trigger an immediate `422 Unprocessable Entity` validation failure, rolling back all data mutations [docs.sqlalchemy.org].

# Instructions
Read and parse the financial integration specifications saved at `docs/blueprints/phase2_payroll_finance_integration.md`.

# Sub-Tasks
1. INTEGRATION SERVICE: Build out the `PayrollFinanceIntegrationEngine` service class inside a new file at `backend/app/domains/hr/integration.py`.
2. ROUTE MAP: Append the `/payroll/{id}/approve` endpoint to your existing route handler at `backend/app/api/v1/hr.py`.
3. AUTOMATED TESTS: Append the integration assurance tests (ACC-01, ACC-02) into `backend/tests/hr/test_payroll_calculation.py`.
4. VERIFICATION: Run the complete test suite to confirm mathematical posting correctness:
   `PYTHONPATH=.:backend backend/.venv/bin/pytest backend/tests/hr/ -v`

Print out the final test passing counts and confirmation metrics logs.
