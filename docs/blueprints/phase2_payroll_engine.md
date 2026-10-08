# OxenGL Phase 2 Blueprint: Automated Payroll Calculation Engine
**Target Role:** Principal ERP Engineer, HRMS Developer, Financial Systems Architect
**Objective:** Deploy an asynchronous processing pipeline to evaluate biometric work durations, compute overtimes or dynamic deductions, and post payroll balances automatically to the General Ledger.

---

## 1. COMPENSATION LOGIC & MATHEMATICAL METRICS
The engine processes a multi-stage validation loop for each worker profile per pay period:
1. **Gross Hours Analysis**: Aggregate total durations from `attendance_logs` where checkout is verified [docs.sqlalchemy.org].
2. **Absence / Under-Hours Penalties**: Deduct prorated salary amounts if calculated hours drop below monthly baselines.
3. **Overtime Allowances**: Apply premium multipliers (\(1.5\times\) base hourly rate) for tracking codes flagged as holiday slots.
4. **Double-Entry Accrual Posting**: Auto-generate balanced journal entries on run approvals (\(\sum \text{Debits} == \sum \text{Credits}\)) [docs.sqlalchemy.org].

---

## 2. REPOSITORY RULES PIPELINE (`backend/app/domains/hr/services.py`)

Implement the asynchronous processing calculations core using your database session context [://tiangolo.com]:

```python
import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException, status
from app.domains.hr.models import Employee, AttendanceLog, PayrollRun
from app.domains.finance.models import JournalEntry, JournalLine

class AutomatedPayrollEngine:
    @staticmethod
    def calculate_hours_delta(check_in: datetime, check_out: datetime) -> Decimal:
        """Computes exact time delta between clock endpoints."""
        delta = check_out - check_in
        return Decimal(str(max(0.0, delta.total_seconds() / 3600.0)))

    @classmethod
    async def execute_monthly_payroll_pipeline(
        cls, db: AsyncSession, tenant_id: uuid.UUID, employee_id: uuid.UUID, pay_period: str
    ) -> uuid.UUID:
        """Processes clock logs, applies mathematical rules, and drafts a PayrollRun record."""
        # 1. Fetch Employee base profiles parameters
        emp_stmt = select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
        emp_res = await db.execute(emp_stmt)
        employee = emp_res.scalar_one_or_none()
        if not employee or not employee.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active employee record not found.")

        # 2. Asynchronously aggregate all completed biometric check-ins
        log_stmt = select(AttendanceLog).where(
            AttendanceLog.employee_id == employee_id,
            AttendanceLog.tenant_id == tenant_id,
            AttendanceLog.check_out.isnot(None)
        )
        log_res = await db.execute(log_stmt)
        logs = log_res.scalars().all()

        # 3. Apply operational threshold calculations (Baseline: 160 hours per month)
        total_hours = sum((cls.calculate_hours_delta(log.check_in, log.check_out) for log in logs), Decimal("0.0000"))
        hourly_rate = Decimal(str(employee.base_salary)) / Decimal("160.0000")
        
        gross_earnings = Decimal(str(employee.base_salary))
        allowances = Decimal("0.0000")
        deductions = Decimal("0.0000")

        if total_hours > Decimal("160.0000"):
            # Apply overtime calculation bonus
            overtime_hours = total_hours - Decimal("160.0000")
            allowances = overtime_hours * hourly_rate * Decimal("1.5000")
        elif total_hours < Decimal("160.0000"):
            # Apply short-hours salary deduction penalty
            short_hours = Decimal("160.0000") - total_hours
            deductions = short_hours * hourly_rate

        net_pay = gross_earnings + allowances - deductions

        # 4. Upsert persistent payroll tracking ledger record
        payroll_record = PayrollRun(
            tenant_id=tenant_id,
            employee_id=employee_id,
            pay_period=pay_period,
            gross_earnings=gross_earnings,
            allowances=allowances,
            deductions=deductions,
            net_pay=net_pay,
            status="DRAFT"
        )
        db.add(payroll_record)
        await db.commit()
        return payroll_record.id
```

---

## 3. COMPLIANCE ROUTING CONTROLLERS (`backend/app/api/v1/hr.py`)

Expose the calculation endpoints protected under your ABAC data permission scopes [://tiangolo.com]:

```python
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.security.abac import enforce_abac
from app.domains.hr.services import AutomatedPayrollEngine

router = APIRouter()

@router.post("/payroll/calculate", status_code=status.HTTP_201_CREATED, dependencies=[Depends(enforce_abac("PAYROLL_WRITE"))])
async def trigger_payroll_calculation(payload: dict, db: AsyncSession = Depends(get_db)):
    """Triggers the async compensation compilation workflow for a worker."""
    run_id = await AutomatedPayrollEngine.execute_monthly_payroll_pipeline(
        db=db,
        tenant_id=payload.get("tenant_id"),
        employee_id=payload.get("employee_id"),
        pay_period=payload.get("pay_period")
    )
    return {"status": "SUCCESS", "payroll_run_id": run_id}
```

---

## 4. SYSTEM CALCULATION ASSURANCE TESTS
Automate validations inside `backend/tests/hr/` to ensure accounting precision:
- **Test Case PAY-01 (Overtime Bonus)**: Clocking 170 total working hours must auto-generate a draft tracking record showing positive allowances equal to exactly 10 hours at $1.5\times$ premium rate.
- **Test Case PAY-02 (Penalty Shortage)**: Clocking 150 hours must compute negative deductions equal to exactly 10 hours of missing base value.
- **Test Case PAY-03 (Tenant Block)**: Requesting calculations using a rogue worker ID from another tenant space must trigger an immediate `404 Not Found` or `403 Forbidden` isolation exception [://tiangolo.com].

# Instructions
Read and parse the automated calculation specifications saved at `docs/blueprints/phase2_payroll_engine.md`.

# Sub-Tasks
1. BACKEND SERVICES: Add the `AutomatedPayrollEngine` pipeline class exactly as written into `backend/app/domains/hr/services.py`.
2. ROUTE MAPS: Create `backend/app/api/v1/hr.py` with the `/payroll/calculate` endpoint. Register the `hr_router` prefix under `/api/v1/hr` within `backend/app/main.py`.
3. AUTOMATED TESTS: Write the validation tests (PAY-01, PAY-02, PAY-03) to `backend/tests/hr/test_payroll_calculation.py`.
4. VERIFICATION: Execute the test suite inside our python runtime:
   `PYTHONPATH=.:backend backend/.venv/bin/pytest backend/tests/hr/ -v`

Print out the final test passing counts and performance duration metrics logs.
