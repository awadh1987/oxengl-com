"""
OxenGL HR & Automated Payroll Calculation Engine Test Suite.
Validates:
- PAY-01: Overtime Bonus Calculation (170 hours -> 10 overtime hours @ 1.5x premium)
- PAY-02: Penalty Shortage Calculation (150 hours -> 10 shortage hours penalty deduction)
- PAY-03: Multi-tenant isolation and rogue employee blocking (HTTP 403 / 404)
"""

import uuid
import pytest
from decimal import Decimal
from datetime import datetime, timezone, timedelta, date
from fastapi import status

from backend import models  # Ensures ResUser and all base models are registered
from backend.database import SessionLocal
from backend.app.domains.hr.models import Employee, AttendanceLog, PayrollRun
from backend.app.domains.hr.services import AutomatedPayrollEngine
try:
    from backend.app.domains.hr.integration import PayrollFinanceIntegrationEngine
except ImportError:
    from app.domains.hr.integration import PayrollFinanceIntegrationEngine
from backend.app.domains.finance.models import JournalEntry, JournalLine



@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.mark.asyncio
async def test_pay_01_overtime_bonus_calculation(db, async_client):
    """
    Test Case PAY-01 (Overtime Bonus):
    Clocking 170 total working hours must auto-generate a draft tracking record
    showing positive allowances equal to exactly 10 hours at 1.5x premium rate.
    
    Baseline: 160 hours/month.
    Base Salary: 16,000 SAR -> Hourly Rate = 100 SAR/hr.
    Logged Hours: 170 hours (17 days * 10 hrs).
    Overtime: 10 hrs * 100 SAR/hr * 1.5 = 1,500 SAR.
    Deductions: 0 SAR.
    Net Pay: 16,000 + 1,500 - 0 = 17,500 SAR.
    """
    tenant_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    user_id = uuid.uuid4()

    employee = Employee(
        id=emp_id,
        tenant_id=tenant_id,
        employee_code=f"EMP-{uuid.uuid4().hex[:6].upper()}",
        first_name="Ahmed",
        last_name="Al-Mansoor",
        department="Engineering",
        base_salary=Decimal("16000.00"),
        hire_date=date(2025, 1, 1),
        is_active=True,
    )
    db.add(employee)
    db.flush()

    base_time = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)
    for i in range(17):
        log = AttendanceLog(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            employee_id=emp_id,
            check_in=base_time + timedelta(days=i),
            check_out=base_time + timedelta(days=i, hours=10),
            device_id="BIO-GATE-01",
        )
        db.add(log)
    db.commit()

    try:
        # 1. Direct Engine Pipeline execution verification
        run_id = await AutomatedPayrollEngine.execute_monthly_payroll_pipeline(
            db=db,
            tenant_id=tenant_id,
            employee_id=emp_id,
            pay_period="2026-09",
        )
        assert run_id is not None

        payroll = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
        assert payroll is not None
        assert payroll.gross_earnings == Decimal("16000.00")
        assert payroll.allowances == Decimal("1500.00")
        assert payroll.deductions == Decimal("0.00")
        assert payroll.net_pay == Decimal("17500.00")
        assert payroll.status == "DRAFT"

        # 2. REST API endpoint calculation verification
        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-User-ID": str(user_id),
            "X-Role": "HR_ADMIN",
        }
        payload = {
            "tenant_id": str(tenant_id),
            "employee_id": str(emp_id),
            "pay_period": "2026-09",
        }
        res = await async_client.post("/api/v1/hr/payroll/calculate", json=payload, headers=headers)
        assert res.status_code == status.HTTP_201_CREATED
        body = res.json()
        assert body["status"] == "SUCCESS"
        assert "payroll_run_id" in body

    finally:
        db.query(PayrollRun).filter(PayrollRun.employee_id == emp_id).delete()
        db.query(AttendanceLog).filter(AttendanceLog.employee_id == emp_id).delete()
        db.delete(employee)
        db.commit()


@pytest.mark.asyncio
async def test_pay_02_penalty_shortage_calculation(db, async_client):
    """
    Test Case PAY-02 (Penalty Shortage):
    Clocking 150 hours must compute negative deductions equal to exactly 10 hours
    of missing base value.
    
    Baseline: 160 hours/month.
    Base Salary: 16,000 SAR -> Hourly Rate = 100 SAR/hr.
    Logged Hours: 150 hours (15 days * 10 hrs).
    Short Hours: 10 hrs -> Deductions = 10 * 100 SAR = 1,000 SAR.
    Allowances: 0 SAR.
    Net Pay: 16,000 - 1,000 = 15,000 SAR.
    """
    tenant_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    user_id = uuid.uuid4()

    employee = Employee(
        id=emp_id,
        tenant_id=tenant_id,
        employee_code=f"EMP-{uuid.uuid4().hex[:6].upper()}",
        first_name="Tariq",
        last_name="Al-Harbi",
        department="Operations",
        base_salary=Decimal("16000.00"),
        hire_date=date(2025, 1, 1),
        is_active=True,
    )
    db.add(employee)
    db.flush()

    base_time = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)
    for i in range(15):
        log = AttendanceLog(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            employee_id=emp_id,
            check_in=base_time + timedelta(days=i),
            check_out=base_time + timedelta(days=i, hours=10),
            device_id="BIO-GATE-02",
        )
        db.add(log)
    db.commit()

    try:
        # 1. Direct Engine Pipeline execution verification
        run_id = await AutomatedPayrollEngine.execute_monthly_payroll_pipeline(
            db=db,
            tenant_id=tenant_id,
            employee_id=emp_id,
            pay_period="2026-09",
        )
        assert run_id is not None

        payroll = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
        assert payroll is not None
        assert payroll.gross_earnings == Decimal("16000.00")
        assert payroll.allowances == Decimal("0.00")
        assert payroll.deductions == Decimal("1000.00")
        assert payroll.net_pay == Decimal("15000.00")
        assert payroll.status == "DRAFT"

        # 2. REST API endpoint calculation verification
        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-User-ID": str(user_id),
            "X-Role": "HR_ADMIN",
        }
        payload = {
            "tenant_id": str(tenant_id),
            "employee_id": str(emp_id),
            "pay_period": "2026-09",
        }
        res = await async_client.post("/api/v1/hr/payroll/calculate", json=payload, headers=headers)
        assert res.status_code == status.HTTP_201_CREATED
        body = res.json()
        assert body["status"] == "SUCCESS"
        assert "payroll_run_id" in body

    finally:
        db.query(PayrollRun).filter(PayrollRun.employee_id == emp_id).delete()
        db.query(AttendanceLog).filter(AttendanceLog.employee_id == emp_id).delete()
        db.delete(employee)
        db.commit()


@pytest.mark.asyncio
async def test_pay_03_tenant_block_and_isolation(db, async_client):
    """
    Test Case PAY-03 (Tenant Block):
    Requesting calculations using a rogue worker ID from another tenant space
    must trigger an immediate 404 Not Found or 403 Forbidden isolation exception.
    """
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()
    emp_b_id = uuid.uuid4()
    user_a_id = uuid.uuid4()

    # Create worker in Tenant B
    employee_b = Employee(
        id=emp_b_id,
        tenant_id=tenant_b,
        employee_code=f"EMP-{uuid.uuid4().hex[:6].upper()}",
        first_name="Zaid",
        last_name="Al-Otaibi",
        department="Finance",
        base_salary=Decimal("12000.00"),
        hire_date=date(2025, 2, 1),
        is_active=True,
    )
    db.add(employee_b)
    db.commit()

    try:
        # Case A: ABAC cross-tenant header mismatch (Tenant A user requests Tenant B resource) -> 403 Forbidden
        headers_tenant_a = {
            "X-Tenant-ID": str(tenant_a),
            "X-User-ID": str(user_a_id),
            "X-Role": "HR_ADMIN",
        }
        cross_tenant_payload = {
            "tenant_id": str(tenant_b),
            "employee_id": str(emp_b_id),
            "pay_period": "2026-09",
        }
        res_cross = await async_client.post(
            "/api/v1/hr/payroll/calculate",
            json=cross_tenant_payload,
            headers=headers_tenant_a,
        )
        assert res_cross.status_code == status.HTTP_403_FORBIDDEN

        # Case B: Requesting calculation within Tenant A using Tenant B worker ID (rogue ID) -> 404 Not Found
        rogue_worker_payload = {
            "tenant_id": str(tenant_a),
            "employee_id": str(emp_b_id),
            "pay_period": "2026-09",
        }
        res_rogue = await async_client.post(
            "/api/v1/hr/payroll/calculate",
            json=rogue_worker_payload,
            headers=headers_tenant_a,
        )
        assert res_rogue.status_code == status.HTTP_404_NOT_FOUND

        # Case C: Direct Service invocation with mismatched tenant/employee IDs -> 404 Not Found
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await AutomatedPayrollEngine.execute_monthly_payroll_pipeline(
                db=db,
                tenant_id=tenant_a,
                employee_id=emp_b_id,
                pay_period="2026-09",
            )
        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND

    finally:
        db.query(PayrollRun).filter(PayrollRun.employee_id == emp_b_id).delete()
        db.delete(employee_b)
        db.commit()


@pytest.mark.asyncio
async def test_acc_01_balanced_payroll_ledger_posting(db, async_client):
    """
    Test Case ACC-01 (Balanced Postings):
    Approving a valid payroll run must yield an APPROVED_AND_POSTED success flag
    and return a valid journal voucher UUID.
    Verifies that status transitions to APPROVED and double-entry ledger entries balance.
    """
    tenant_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    auditor_id = uuid.uuid4()

    employee = Employee(
        id=emp_id,
        tenant_id=tenant_id,
        employee_code=f"EMP-{uuid.uuid4().hex[:6].upper()}",
        first_name="Fahad",
        last_name="Al-Ghamdi",
        department="Finance",
        base_salary=Decimal("16000.00"),
        hire_date=date(2025, 1, 1),
        is_active=True,
    )
    db.add(employee)
    db.flush()

    # Balanced draft run: Gross (16000) + Allowances (1500) == Net (17000) + Deductions (500)
    payroll = PayrollRun(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        employee_id=emp_id,
        pay_period="2026-09",
        gross_earnings=Decimal("16000.00"),
        allowances=Decimal("1500.00"),
        deductions=Decimal("500.00"),
        net_pay=Decimal("17000.00"),
        status="DRAFT",
    )
    db.add(payroll)
    db.commit()

    entry_id = None
    try:
        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-User-ID": str(auditor_id),
            "X-Role": "FINANCE_ADMIN",
        }
        payload = {
            "tenant_id": str(tenant_id),
            "user_id": str(auditor_id),
        }

        res = await async_client.post(
            f"/api/v1/hr/payroll/{payroll.id}/approve",
            json=payload,
            headers=headers,
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["status"] == "APPROVED_AND_POSTED"
        assert "general_ledger_entry_id" in data
        entry_id = uuid.UUID(str(data["general_ledger_entry_id"]))

        # Database state validation
        db.refresh(payroll)
        assert payroll.status == "APPROVED"

        entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
        assert entry is not None
        assert entry.status == "POSTED"
        assert entry.total_debit == Decimal("17500.00")
        assert entry.total_credit == Decimal("17500.00")

        lines = db.query(JournalLine).filter(JournalLine.entry_id == entry_id).all()
        assert len(lines) >= 3  # Lines for 511000, 512000, 111101, 211200
        total_dr = sum(l.debit for l in lines)
        total_cr = sum(l.credit for l in lines)
        assert total_dr == total_cr == Decimal("17500.00")

    finally:
        if entry_id:
            db.query(JournalLine).filter(JournalLine.entry_id == entry_id).delete()
            db.query(JournalEntry).filter(JournalEntry.id == entry_id).delete()
        db.query(PayrollRun).filter(PayrollRun.employee_id == emp_id).delete()
        db.delete(employee)
        db.commit()


@pytest.mark.asyncio
async def test_acc_02_invariance_failure_block(db, async_client):
    """
    Test Case ACC-02 (Invariance Block):
    Forcing an asymmetric value change into the database parameters prior to running
    the approval hook must trigger an immediate 422 Unprocessable Entity validation failure,
    rolling back all data mutations.
    """
    tenant_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    auditor_id = uuid.uuid4()

    employee = Employee(
        id=emp_id,
        tenant_id=tenant_id,
        employee_code=f"EMP-{uuid.uuid4().hex[:6].upper()}",
        first_name="Mansour",
        last_name="Al-Shehri",
        department="Accounting",
        base_salary=Decimal("16000.00"),
        hire_date=date(2025, 1, 1),
        is_active=True,
    )
    db.add(employee)
    db.flush()

    # Asymmetric draft run: Gross (16000) + Allowances (0) != Net (15000) + Deductions (0)
    # Debits = 16000, Credits = 15000 -> Diff of 1000
    payroll = PayrollRun(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        employee_id=emp_id,
        pay_period="2026-09",
        gross_earnings=Decimal("16000.00"),
        allowances=Decimal("0.00"),
        deductions=Decimal("0.00"),
        net_pay=Decimal("15000.00"),  # Asymmetric!
        status="DRAFT",
    )
    db.add(payroll)
    db.commit()

    try:
        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-User-ID": str(auditor_id),
            "X-Role": "FINANCE_ADMIN",
        }
        payload = {
            "tenant_id": str(tenant_id),
            "user_id": str(auditor_id),
        }

        # 1. API endpoint validation of invariance failure
        res = await async_client.post(
            f"/api/v1/hr/payroll/{payroll.id}/approve",
            json=payload,
            headers=headers,
        )
        assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "Invariance Failure" in res.json()["detail"]

        # Confirm status remains DRAFT and no journal entries were generated
        db.refresh(payroll)
        assert payroll.status == "DRAFT"

        entries = db.query(JournalEntry).filter(JournalEntry.tenant_id == tenant_id).all()
        assert len(entries) == 0

        # 2. Direct Service invocation validation of invariance failure
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await PayrollFinanceIntegrationEngine.approve_and_post_payroll(
                db=db,
                tenant_id=tenant_id,
                payroll_run_id=payroll.id,
                auditor_id=auditor_id,
            )
        assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "Invariance Failure" in exc_info.value.detail

    finally:
        db.query(PayrollRun).filter(PayrollRun.employee_id == emp_id).delete()
        db.delete(employee)
        db.commit()


@pytest.mark.asyncio
async def test_hrms_biometric_attendance_tracking(db, async_client):
    """
    Validates Phase 2 biometric attendance logging into hrms_attendance_logs.
    Ensures biometric hashes, check-in timestamps, and employee validation execute properly.
    """
    from backend.app.domains.hr.models import HrmsAttendanceLog
    tenant_id = uuid.uuid4()
    emp_id = uuid.uuid4()

    employee = Employee(
        id=emp_id,
        tenant_id=tenant_id,
        employee_code=f"EMP-BIO-{uuid.uuid4().hex[:6].upper()}",
        first_name="Tariq",
        last_name="Al-Harbi",
        department="Operations",
        base_salary=12000.0,
        hire_date=date.today(),
        is_active=True,
    )
    db.add(employee)
    db.commit()

    try:
        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-User-Roles": "Admin",
            "X-User-Permissions": "WRITE,HR_WRITE",
        }
        check_in_time = datetime.now(timezone.utc).isoformat()
        payload = {
            "tenant_id": str(tenant_id),
            "employee_id": str(emp_id),
            "device_id": "BIO-DEVICE-GATE-01",
            "check_in": check_in_time,
            "verification_mode": "BIOMETRIC_FINGERPRINT",
        }

        res = await async_client.post(
            "/api/v1/hr/attendance/biometric",
            json=payload,
            headers=headers,
        )
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert data["status"] == "RECORDED"
        assert data["employee_id"] == str(emp_id)
        assert data["device_id"] == "BIO-DEVICE-GATE-01"
        assert len(data["biometric_hash"]) == 64  # SHA-256 hash length

        # Verify record exists in hrms_attendance_logs
        db_log = db.query(HrmsAttendanceLog).filter(HrmsAttendanceLog.employee_id == emp_id).first()
        assert db_log is not None
        assert db_log.device_id == "BIO-DEVICE-GATE-01"
        assert db_log.verification_mode == "BIOMETRIC_FINGERPRINT"

    finally:
        db.query(HrmsAttendanceLog).filter(HrmsAttendanceLog.employee_id == emp_id).delete()
        db.delete(employee)
        db.commit()


