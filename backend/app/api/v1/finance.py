"""
OxenGL General Ledger API Endpoints.
Guarantees strict Double-Entry balancing and audit validation.
"""

import uuid
from decimal import Decimal
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from backend.database import get_db
from backend.app.services.sequence_service import SequenceService
from backend.app.services.custom_fields import sanitize_attributes
from backend.app.domains.finance.models import (
    Account,
    JournalEntry,
    JournalLine,
    FinanceJournalEntry,
    FinanceJournalLine,
)
from backend.app.domains.finance.guards import enforce_double_entry_balance
from backend.app.security.abac import enforce_abac
from backend.app.core.cache import enterprise_cache, build_cache_key

router = APIRouter(prefix="/api/v1/finance", tags=["General Ledger"])

# TTL for chart-of-accounts cache: 3600 seconds (1 hour), per spec
_COA_CACHE_TTL = 3600


def _invalidate_coa_cache(tenant_id: str) -> None:
    """
    Evicts cached chart-of-accounts payload for the given tenant whenever
    a journal entry or voucher posting mutates account balances.
    Uses wildcard pattern invalidation via EnterpriseCache.invalidate_resource().
    """
    try:
        enterprise_cache.invalidate_resource(
            tenant_id=tenant_id,
            domain="finance",
            resource="chart_of_accounts",
        )
    except Exception:
        pass  # Cache invalidation failures must never block write operations


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class JournalLineItem(BaseModel):
    account_code: str
    debit: float = 0.0
    credit: float = 0.0
    description: Optional[str] = None
    cost_center_id: Optional[uuid.UUID] = None


class JournalEntryCreate(BaseModel):
    description: Optional[str] = None
    entry_date: Optional[str] = None
    voucher_number: Optional[str] = None
    type: Optional[str] = None
    voucher_type: Optional[str] = None
    category: Optional[str] = None
    party_name: Optional[str] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    cost_center_id: Optional[uuid.UUID] = None
    custom_attributes: Dict[str, Any] = Field(default_factory=dict)
    lines: List[JournalLineItem] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def populate_balanced_lines_if_missing(cls, data: Any) -> Any:
        if isinstance(data, dict):
            lines = data.get("lines")
            if not lines and data.get("amount") is not None:
                amt = float(data["amount"])
                vtype = (data.get("type") or data.get("voucher_type") or "Receipt").capitalize()
                party = data.get("party_name") or "Party"
                desc = data.get("description") or data.get("purpose") or f"{vtype} Voucher - {party}"
                data["description"] = desc
                cash_code = "101000"
                counter_code = "120000" if vtype == "Receipt" else "201000"
                if vtype == "Receipt":
                    data["lines"] = [
                        {"account_code": cash_code, "debit": amt, "credit": 0.0, "description": desc},
                        {"account_code": counter_code, "debit": 0.0, "credit": amt, "description": desc},
                    ]
                else:
                    data["lines"] = [
                        {"account_code": counter_code, "debit": amt, "credit": 0.0, "description": desc},
                        {"account_code": cash_code, "debit": 0.0, "credit": amt, "description": desc},
                    ]
            elif not data.get("description") and data.get("lines"):
                data["description"] = "Journal Entry"
        return data


# ==============================================================================
# Endpoints
# ==============================================================================

@router.post(
    "/journals",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_abac("WRITE"))],
)
@enforce_double_entry_balance
def create_journal_entry(
    payload: JournalEntryCreate,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
):
    """
    Creates and posts a new balanced General Ledger Journal Entry.
    Enforces strict mathematical Double-Entry constraint (Sum Debits == Sum Credits).
    """
    if not payload.lines or len(payload.lines) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Journal entry must contain at least two transaction lines.",
        )

    tenant_uuid = uuid.UUID(x_tenant_id) if x_tenant_id else uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
    company_uuid = uuid.UUID(x_company_id) if x_company_id else uuid.UUID("f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c")
    user_uuid = uuid.UUID(x_user_id) if x_user_id else None

    # 1. Calculate Sum Debits and Credits using high-precision Decimal
    total_debit = Decimal("0.0000")
    total_credit = Decimal("0.0000")

    for line in payload.lines:
        dr = Decimal(str(line.debit))
        cr = Decimal(str(line.credit))
        if dr < 0 or cr < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debit and credit amounts must be non-negative.",
            )
        if dr > 0 and cr > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A journal line cannot possess both debit and credit amounts.",
            )
        total_debit += dr
        total_credit += cr

    # 2. Strict Double-Entry Balancing Verification
    discrepancy = abs(total_debit - total_credit)
    if discrepancy > Decimal("0.0001"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unbalanced journal entry: Total debits ({total_debit:.2f}) "
                f"must strictly equal total credits ({total_credit:.2f}). "
                f"Discrepancy: {discrepancy:.2f}"
            ),
        )

    if total_debit <= Decimal("0.0000"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Journal entry total must be greater than zero.",
        )

    entry_number = f"JV-{uuid.uuid4().hex[:8].upper()}"

    # 3. Create Journal Entry Header
    entry = JournalEntry(
        tenant_id=tenant_uuid,
        company_id=company_uuid,
        entry_number=entry_number,
        description=payload.description,
        total_debit=total_debit,
        total_credit=total_credit,
        status="POSTED",
        custom_attributes=sanitize_attributes(payload.custom_attributes),
        posted_by=user_uuid,
    )
    db.add(entry)
    db.flush()

    # 4. Create Journal Lines
    for line in payload.lines:
        dr = Decimal(str(line.debit))
        cr = Decimal(str(line.credit))
        j_line = JournalLine(
            entry_id=entry.id,
            account_code=line.account_code,
            debit=dr,
            credit=cr,
            description=line.description or payload.description,
            cost_center_id=line.cost_center_id,
        )
        db.add(j_line)

    db.commit()
    db.refresh(entry)

    # Invalidate chart-of-accounts cache — account balances may have changed
    _invalidate_coa_cache(str(x_tenant_id or "default"))

    return {
        "id": str(entry.id),
        "entry_number": entry.entry_number,
        "description": entry.description,
        "total_debit": float(entry.total_debit),
        "total_credit": float(entry.total_credit),
        "status": entry.status,
    }


# ==============================================================================
# Chart of Accounts — Hierarchical ltree Query with Redis Cache-Aside
# ==============================================================================

@router.get("/chart-of-accounts")
def get_chart_of_accounts(
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
):
    """
    Returns the full hierarchical Chart of Accounts tree for the tenant.
    Uses PostgreSQL ltree path ordering to return accounts in natural
    accounting hierarchy order (Assets → Liabilities → Equity → Revenue → Expenses).

    Redis Cache-Aside pattern:
      Key   : oxengl:{env}:{tenant_id}:finance:chart_of_accounts:hierarchy:v1
      TTL   : 3600 seconds (1 hour)
      Eviction: auto-invalidated on any journal entry or voucher POST.
    """
    tenant_id = x_tenant_id or "default"
    cache_key = build_cache_key(
        tenant_id=tenant_id,
        domain="finance",
        resource="chart_of_accounts",
        identifier="hierarchy",
    )

    # 1. Cache hit — return serialised tree directly
    cached = enterprise_cache.get(cache_key)
    if cached is not None:
        return cached

    # 2. Cache miss — query PostgreSQL ltree hierarchy
    try:
        tenant_uuid = uuid.UUID(tenant_id)
    except (ValueError, AttributeError):
        tenant_uuid = uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")

    accounts = db.execute(
        select(Account)
        .where(Account.tenant_id == tenant_uuid)
        .order_by(Account.path)  # ltree path gives natural accounting hierarchy order
        .limit(200)
    ).scalars().all()

    result = [
        {
            "id": str(a.id),
            "code": a.code,
            "name": a.name,
            "account_type": a.account_type,
            "path": str(a.path) if a.path else None,
            "parent_id": str(a.parent_id) if a.parent_id else None,
            "balance": float(a.balance) if hasattr(a, "balance") and a.balance is not None else 0.0,
            "currency": a.currency if hasattr(a, "currency") else "SAR",
            "is_active": a.is_active if hasattr(a, "is_active") else True,
        }
        for a in accounts
    ]

    # 3. Populate cache (with_jitter=False — we control TTL precisely here)
    enterprise_cache.set(cache_key, result, base_ttl=_COA_CACHE_TTL, with_jitter=False)

    return result


@router.get("/journals")
def list_journal_entries(
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
):
    """Lists posted journal vouchers."""
    entries = db.execute(
        select(JournalEntry).order_by(JournalEntry.created_at.desc()).limit(100)
    ).scalars().all()

    return [
        {
            "id": str(e.id),
            "entry_number": e.entry_number,
            "description": e.description,
            "entry_date": e.entry_date.isoformat(),
            "total_debit": float(e.total_debit),
            "total_credit": float(e.total_credit),
            "status": e.status,
        }
        for e in entries
    ]


@router.post(
    "/vouchers",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_abac("WRITE"))],
)
@router.post(
    "/vouchers/balanced",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_abac("WRITE"))],
)
@enforce_double_entry_balance
def post_balanced_financial_voucher(
    payload: JournalEntryCreate,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
):
    """
    Directly posts a validated and balanced double-entry financial voucher into finance_journal_entries.
    Protected by the strict double-entry mathematical guard decorator.
    """
    tenant_uuid = uuid.UUID(x_tenant_id) if x_tenant_id else uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
    company_uuid = uuid.UUID(x_company_id) if x_company_id else None
    user_uuid = uuid.UUID(x_user_id) if x_user_id else None

    total_debit = sum(Decimal(str(l.debit)) for l in payload.lines)
    total_credit = sum(Decimal(str(l.credit)) for l in payload.lines)

    vch_raw = (payload.voucher_number or "").strip()
    if not vch_raw or "auto" in vch_raw.lower() or "توليد" in vch_raw or (vch_raw.startswith("JV-") and len(vch_raw) == 11):
        entry_number = SequenceService.get_next_sequence(db, company_uuid or tenant_uuid, "voucher")
    else:
        entry_number = vch_raw
    entry = FinanceJournalEntry(
        tenant_id=tenant_uuid,
        company_id=company_uuid,
        entry_number=entry_number,
        description=payload.description or "Financial Voucher",
        total_debit=total_debit,
        total_credit=total_credit,
        status="SUCCESS",
        custom_attributes=sanitize_attributes(payload.custom_attributes),
        posted_by=user_uuid,
    )
    db.add(entry)
    db.flush()

    for line in payload.lines:
        jl = FinanceJournalLine(
            tenant_id=tenant_uuid,
            entry_id=entry.id,
            account_code=line.account_code,
            description=line.description or payload.description or "Voucher line",
            debit=Decimal(str(line.debit)),
            credit=Decimal(str(line.credit)),
        )
        db.add(jl)

    db.commit()
    db.refresh(entry)
    _invalidate_coa_cache(str(tenant_uuid))
    return entry


@router.get("/vouchers")
@router.get("/vouchers/balanced")
def list_balanced_financial_vouchers(
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """Lists posted balanced financial vouchers from finance_journal_entries."""
    stmt = (
        select(FinanceJournalEntry)
        .options(selectinload(FinanceJournalEntry.lines))
        .order_by(FinanceJournalEntry.created_at.desc())
        .limit(100)
    )
    if x_tenant_id:
        try:
            stmt = stmt.where(FinanceJournalEntry.tenant_id == uuid.UUID(x_tenant_id))
        except ValueError:
            pass
    if x_company_id:
        try:
            stmt = stmt.where(FinanceJournalEntry.company_id == uuid.UUID(x_company_id))
        except ValueError:
            pass

    return db.execute(stmt).scalars().all()

