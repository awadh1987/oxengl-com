"""
OxenGL Finance Domain Services.
Provides double-entry ledger processing, account lookups, and transaction posting pipelines.
"""
import logging
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi import HTTPException, status

from backend.app.domains.finance.models import (
    Account,
    JournalEntry,
    JournalLine,
    FinanceJournalEntry,
    FinanceJournalLine,
)
from backend.app.domains.finance.guards import (
    enforce_double_entry_balance,
    validate_double_entry_invariance,
)

logger = logging.getLogger("oxengl.domains.finance")


class TransactionProcessingService:
    """Core transaction processing engine with strict double-entry ledger isolation."""

    @classmethod
    @enforce_double_entry_balance
    def post_balanced_entry(
        cls,
        db: Session,
        tenant_id: uuid.UUID,
        description: str,
        lines: List[Dict[str, Any]],
        company_id: Optional[uuid.UUID] = None,
        posted_by: Optional[uuid.UUID] = None,
    ) -> FinanceJournalEntry:
        """
        Posts a verified, balanced double-entry voucher directly into finance_journal_entries.
        Enforces sum(Debits) == sum(Credits) at the transactional boundary.
        """
        total_debit, total_credit = validate_double_entry_invariance(lines)

        entry_number = f"JV-{uuid.uuid4().hex[:8].upper()}"
        entry = FinanceJournalEntry(
            tenant_id=tenant_id,
            company_id=company_id,
            entry_number=entry_number,
            description=description,
            total_debit=total_debit,
            total_credit=total_credit,
            status="POSTED",
            posted_by=posted_by,
        )
        db.add(entry)
        db.flush()

        for line_data in lines:
            dr = Decimal(str(line_data.get("debit", 0.0) or "0.0000"))
            cr = Decimal(str(line_data.get("credit", 0.0) or "0.0000"))
            account_code = str(line_data.get("account_code", ""))
            line_desc = line_data.get("description") or description

            jl = FinanceJournalLine(
                tenant_id=tenant_id,
                entry_id=entry.id,
                account_code=account_code,
                description=line_desc,
                debit=dr,
                credit=cr,
            )
            db.add(jl)

        db.commit()
        db.refresh(entry)
        logger.info(
            f"Successfully posted balanced journal entry {entry.entry_number} for tenant {tenant_id}: "
            f"Debits={total_debit}, Credits={total_credit}"
        )
        return entry

    @classmethod
    @enforce_double_entry_balance
    def create_posted_account_move(
        cls,
        database: Session,
        company_id: uuid.UUID,
        payload: Any,
    ) -> Any:
        """
        Posts a strictly balanced double-entry AccountMove with AccountMoveLine entries.
        Enforces sum(debits) == sum(credits) in Decimal(18, 4).
        """
        from datetime import datetime, timezone
        from backend import models
        from backend.app.services.custom_fields import sanitize_attributes

        # 1. Enforce mathematical double-entry invariance
        total_dr, total_cr = validate_double_entry_invariance(payload.lines)

        # 2. Determine Journal
        journal_code = getattr(payload, "journal_code", "MISC") or "MISC"
        if journal_code == "STK":
            journal_name = "Stock Valuation Journal"
            journal_type = "general"
        elif journal_code == "BILL":
            journal_name = "Purchase Journal"
            journal_type = "purchase"
        elif journal_code == "MISC":
            journal_name = "Miscellaneous Journal"
            journal_type = "general"
        else:
            journal_name = "Sales Journal"
            journal_type = "sale"

        move_date = getattr(payload, "date", None) or datetime.now(timezone.utc)

        # Lookup or create journal
        journal = database.scalar(
            select(models.AccountJournal)
            .where(models.AccountJournal.company_id == company_id, models.AccountJournal.code == journal_code)
            .with_for_update()
        )
        if journal is None:
            journal = models.AccountJournal(
                company_id=company_id,
                code=journal_code,
                name=journal_name,
                journal_type=journal_type,
                sequence_prefix=journal_code,
                next_sequence=1,
            )
            database.add(journal)
            database.flush()

        # Lookup or create fiscal year
        year_name = str(move_date.year)
        fiscal_year = database.scalar(
            select(models.FiscalYear)
            .where(models.FiscalYear.company_id == company_id, models.FiscalYear.name == year_name)
        )
        if fiscal_year is None:
            fiscal_year = models.FiscalYear(
                company_id=company_id,
                name=year_name,
                date_start=datetime(move_date.year, 1, 1, tzinfo=timezone.utc),
                date_end=datetime(move_date.year, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
                state="open",
            )
            database.add(fiscal_year)
            database.flush()

        if fiscal_year.state in {"closed", "locked"}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Fiscal year is closed or locked")

        # 3. Resolve and validate accounts
        line_accounts: list[tuple[Any, uuid.UUID]] = []
        for line in payload.lines:
            acc_id = getattr(line, "account_id", None)
            acc_code = getattr(line, "account_code", None)

            if acc_id:
                account = database.scalar(
                    select(models.AccountAccount)
                    .where(models.AccountAccount.company_id == company_id, models.AccountAccount.id == acc_id)
                )
                if not account:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Account ID {acc_id} does not belong to active company",
                    )
                line_accounts.append((line, account.id))
            elif acc_code:
                account = database.scalar(
                    select(models.AccountAccount)
                    .where(models.AccountAccount.company_id == company_id, models.AccountAccount.code == acc_code)
                )
                if not account:
                    company = database.get(models.ResCompany, company_id)
                    internal_type = "expense" if str(acc_code).startswith("5") else ("asset" if str(acc_code).startswith("1") else "liability")
                    account = models.AccountAccount(
                        company_id=company_id,
                        code=acc_code,
                        name=getattr(line, "name", None) or f"Account {acc_code}",
                        internal_type=internal_type,
                        currency=company.currency if company else "SAR",
                    )
                    database.add(account)
                    database.flush()
                line_accounts.append((line, account.id))
            else:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Line must provide either account_id or account_code",
                )

        # 4. Resolve partner if given
        partner_id = getattr(payload, "partner_id", None)
        if partner_id:
            partner = database.scalar(
                select(models.ResPartner.id)
                .where(models.ResPartner.company_id == company_id, models.ResPartner.id == partner_id)
            )
            if not partner:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner does not belong to active company")

        # 5. Build Move and lines
        seq = journal.next_sequence
        journal.next_sequence += 1
        name = getattr(payload, "name", None) or f"{journal.sequence_prefix}/{move_date:%Y}/{seq:05d}"
        move_type = getattr(payload, "move_type", "entry") or "entry"

        move = models.AccountMove(
            company_id=company_id,
            journal_id=journal.id,
            fiscal_year_id=fiscal_year.id,
            name=name,
            sequence_number=seq,
            move_type=move_type,
            partner_id=partner_id,
            cost_center_id=getattr(payload, "cost_center_id", None),
            date=move_date,
            state="posted",
            ref=getattr(payload, "ref", None),
            custom_attributes=sanitize_attributes(getattr(payload, "custom_attributes", None)),
            posted_at=datetime.now(timezone.utc),
        )
        database.add(move)
        database.flush()

        for line, resolved_acc_id in line_accounts:
            dr = Decimal(str(getattr(line, "debit", 0.0) or "0.0000")).quantize(Decimal("0.0001"))
            cr = Decimal(str(getattr(line, "credit", 0.0) or "0.0000")).quantize(Decimal("0.0001"))
            line_name = getattr(line, "name", "Voucher Line")
            database.add(
                models.AccountMoveLine(
                    company_id=company_id,
                    move_id=move.id,
                    account_id=resolved_acc_id,
                    partner_id=getattr(line, "partner_id", None) or partner_id,
                    cost_center_id=getattr(line, "cost_center_id", None) or getattr(payload, "cost_center_id", None),
                    debit=dr,
                    credit=cr,
                    name=line_name,
                )
            )

        logger.info(
            f"Successfully posted AccountMove {move.name} ({move.id}) for company {company_id}: "
            f"total_debit={total_dr}, total_credit={total_cr}"
        )
        return move
