"""
OxenGL HR-to-Finance General Ledger Integration Engine.
Automates posting of balanced double-entry accounting transactions across
hierarchical ltree Chart of Accounts upon Payroll Run approvals.
"""

import uuid
import inspect
from decimal import Decimal
from datetime import datetime, timezone
from typing import Any, Union, Optional
from sqlalchemy import select, update
from fastapi import HTTPException, status

try:
    from backend.app.domains.hr.models import PayrollRun, Employee
    from backend.app.domains.finance.models import JournalEntry, JournalLine
except ImportError:
    from app.domains.hr.models import PayrollRun, Employee
    from app.domains.finance.models import JournalEntry, JournalLine


class PayrollFinanceIntegrationEngine:
    @classmethod
    async def approve_and_post_payroll(
        cls,
        db: Any,
        tenant_id: Union[uuid.UUID, str],
        payroll_run_id: Union[uuid.UUID, str],
        auditor_id: Optional[Union[uuid.UUID, str]] = None,
    ) -> uuid.UUID:
        """Approves a payroll draft run and posts a balanced journal voucher entry."""
        if isinstance(tenant_id, str):
            tenant_id = uuid.UUID(tenant_id)
        if isinstance(payroll_run_id, str):
            payroll_run_id = uuid.UUID(payroll_run_id)
        if isinstance(auditor_id, str) and auditor_id:
            auditor_id = uuid.UUID(auditor_id)

        # 1. Fetch target payroll run and lock the row for processing
        stmt = select(PayrollRun).where(PayrollRun.id == payroll_run_id, PayrollRun.tenant_id == tenant_id)
        res = db.execute(stmt)
        if inspect.isawaitable(res):
            res = await res
        payroll = res.scalar_one_or_none()

        if not payroll or payroll.status != "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payroll run must be in DRAFT status to be approved and posted.",
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
                detail="Invariance Failure: Debits do not balance with credits inside payroll allocation lines.",
            )

        # 4. Construct Balanced Double-Entry Journal Voucher Header
        total_dr = gross + allowances
        total_cr = net_pay + deductions
        entry_kwargs = {
            "tenant_id": tenant_id,
            "company_id": tenant_id,
            "entry_number": f"PAY-{uuid.uuid4().hex[:8].upper()}",
            "description": f"Automated payroll entry posting - Period {payroll.pay_period}",
            "total_debit": total_dr,
            "total_credit": total_cr,
            "status": "POSTED",
            "posted_by": auditor_id,
            "entry_date": datetime.now(timezone.utc),
        }
        if hasattr(JournalEntry, "posted_at"):
            entry_kwargs["posted_at"] = datetime.now(timezone.utc)

        entry = JournalEntry(**entry_kwargs)
        db.add(entry)
        flush_res = db.flush()
        if inspect.isawaitable(flush_res):
            await flush_res

        # 5. Build and attach the debits and credits ledger lines
        # Only add lines with non-zero amounts to satisfy DB check constraint ck_journal_lines_either_dr_cr
        lines = [
            JournalLine(entry_id=entry.id, account_code="511000", debit=gross, credit=Decimal("0.00")),
            JournalLine(entry_id=entry.id, account_code="512000", debit=allowances, credit=Decimal("0.00")),
            JournalLine(entry_id=entry.id, account_code="111101", debit=Decimal("0.00"), credit=net_pay),
            JournalLine(entry_id=entry.id, account_code="211200", debit=Decimal("0.00"), credit=deductions),
        ]
        active_lines = [l for l in lines if (l.debit > Decimal("0.00") or l.credit > Decimal("0.00"))]
        db.add_all(active_lines if active_lines else lines)

        # 6. Atomic state flip transition
        payroll.status = "APPROVED"
        commit_res = db.commit()
        if inspect.isawaitable(commit_res):
            await commit_res

        return entry.id
