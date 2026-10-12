"""
OxenGL Automated Payroll Engine Service.
Computes hours delta, applies overtime allowances and under-hours penalties,
and persists draft PayrollRun records.
"""

import inspect
import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Dict, Any, Optional, Union
from sqlalchemy import select, func
from fastapi import HTTPException, status

try:
    from backend.app.domains.hr.models import Employee, AttendanceLog, PayrollRun
    from backend.app.domains.finance.models import JournalEntry, JournalLine
except ImportError:
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
        cls, db: Any, tenant_id: Union[uuid.UUID, str], employee_id: Union[uuid.UUID, str], pay_period: str
    ) -> uuid.UUID:
        """Processes clock logs, applies mathematical rules, and drafts a PayrollRun record."""
        if isinstance(tenant_id, str):
            tenant_id = uuid.UUID(tenant_id)
        if isinstance(employee_id, str):
            employee_id = uuid.UUID(employee_id)

        # 1. Fetch Employee base profiles parameters
        emp_stmt = select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
        emp_res = db.execute(emp_stmt)
        if inspect.isawaitable(emp_res):
            emp_res = await emp_res
        employee = emp_res.scalar_one_or_none()
        if not employee or not employee.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active employee record not found.")

        # 2. Asynchronously aggregate all completed biometric check-ins
        log_stmt = select(AttendanceLog).where(
            AttendanceLog.employee_id == employee_id,
            AttendanceLog.tenant_id == tenant_id,
            AttendanceLog.check_out.isnot(None)
        )
        log_res = db.execute(log_stmt)
        if inspect.isawaitable(log_res):
            log_res = await log_res
        logs = log_res.scalars().all()

        # 3. Apply operational threshold calculations (Baseline: 160 hours per month)
        total_hours = sum((cls.calculate_hours_delta(log.check_in, log.check_out) for log in logs), Decimal("0.0000"))
        hourly_rate = Decimal(str(employee.base_salary)) / Decimal("160.0000")
        
        gross_earnings = Decimal(str(employee.base_salary))
        allowances = Decimal("0.0000")
        deductions = Decimal("0.0000")

        if total_hours > Decimal("160.0000"):
            # Apply overtime calculation bonus (1.5x)
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
        commit_res = db.commit()
        if inspect.isawaitable(commit_res):
            await commit_res
        return payroll_record.id
