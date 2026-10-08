"""
Financial Reporting & Analytics Engine API Router.
Implements Phase 10:
- Trial Balance (sums debits and credits per account to ensure overall ledger balance)
- Income Statement / P&L (aggregates revenues and expenses to calculate net income)
- Balance Sheet (aggregates assets, liabilities, and equity with current period earnings)

Directly aggregates data from active FinanceJournalLine and FinanceJournalEntry records.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

try:
    from backend.database import get_db
    from backend.models import (
        Account,
        FinanceJournalEntry,
        FinanceJournalLine,
        ResCompany,
    )
    from backend.api.dependencies import (
        TenantContext,
        get_tenant_context,
    )
except ImportError:
    from database import get_db
    from models import (
        Account,
        FinanceJournalEntry,
        FinanceJournalLine,
        ResCompany,
    )
    from dependencies import (  # type: ignore
        TenantContext,
        get_tenant_context,
    )

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["Financial Reporting & Analytics Engine"])



# ==============================================================================
# Canonical Chart of Accounts Dictionary & Classification Helpers
# ==============================================================================

DEFAULT_ACCOUNT_METADATA: Dict[str, Dict[str, str]] = {
    "111000": {"name_en": "Cash & Bank Accounts", "name_ar": "النقد وما في حكمه والبنوك", "type": "ASSET"},
    "111101": {"name_en": "Cash in Vault - Treasury", "name_ar": "خزينة النقد الرئيسية", "type": "ASSET"},
    "111102": {"name_en": "Operating Bank Account - Al Rajhi", "name_ar": "الحساب البنكي الجاري - الراجحي", "type": "ASSET"},
    "112000": {"name_en": "Accounts Receivable (Debtors)", "name_ar": "العملاء والذمم المدينة التجارية", "type": "ASSET"},
    "113000": {"name_en": "Inventory Asset - Aggregates & Raw Materials", "name_ar": "مخزون الركام والمواد الأولية", "type": "ASSET"},
    "120000": {"name_en": "Fixed Assets - Plant, Equipment & Fleet", "name_ar": "الأصول الثابتة والآلات والأسطول", "type": "ASSET"},
    "211000": {"name_en": "Accounts Payable (Creditors)", "name_ar": "الموردون والذمم الدائنة التجارية", "type": "LIABILITY"},
    "212000": {"name_en": "Accrued Payroll & Employee Benefits", "name_ar": "مستحقات الرواتب والأجور ومنافع الموظفين", "type": "LIABILITY"},
    "213000": {"name_en": "Social Insurance / GOSI Payable", "name_ar": "مستحقات التأمينات الاجتماعية (GOSI)", "type": "LIABILITY"},
    "214000": {"name_en": "VAT Output / Tax Payable", "name_ar": "ضريبة القيمة المضافة المستحقة (مخرجات)", "type": "LIABILITY"},
    "214100": {"name_en": "VAT Input Tax (Recoverable)", "name_ar": "ضريبة القيمة المضافة المدخلة (مستردة)", "type": "ASSET"},
    "310000": {"name_en": "Shareholders' Capital & Equity", "name_ar": "رأس المال المدفوع وحقوق الملكية", "type": "EQUITY"},
    "320000": {"name_en": "Retained Earnings", "name_ar": "الأرباح المبقاة والمحتجزة", "type": "EQUITY"},
    "410000": {"name_en": "Sales & Operating Revenue", "name_ar": "إيرادات المبيعات والتشغيل", "type": "REVENUE"},
    "420000": {"name_en": "Other Operating Income", "name_ar": "إيرادات تشغيلية أخرى", "type": "REVENUE"},
    "500000": {"name_en": "Cost of Goods Sold (COGS)", "name_ar": "تكلفة البضاعة المباعة (المشتريات)", "type": "EXPENSE"},
    "510000": {"name_en": "Salaries & Wages Expense", "name_ar": "مصروفات الرواتب والأجور", "type": "EXPENSE"},
    "511000": {"name_en": "Base Wages Expense", "name_ar": "مصروفات الأجور الأساسية", "type": "EXPENSE"},
    "520000": {"name_en": "Inventory Variance & Shrinkage Expense", "name_ar": "فروقات وفاقد المخزون", "type": "EXPENSE"},
    "610000": {"name_en": "General & Administrative Expenses", "name_ar": "المصروفات العمومية والإدارية", "type": "EXPENSE"},
}


def classify_account(code: str, db_accounts_map: Dict[str, Account]) -> tuple[str, str, str]:
    """
    Returns (account_name_en, account_name_ar, account_type).
    Resolves in priority order:
    1. Active database Account record
    2. Canonical CoA dictionary
    3. Prefix heuristic (1=ASSET, 2=LIABILITY, 3=EQUITY, 4=REVENUE, 5/6=EXPENSE)
    """
    clean_code = str(code).strip()
    if clean_code in db_accounts_map:
        db_acc = db_accounts_map[clean_code]
        raw_type = str(db_acc.account_type).upper()
        norm_type = raw_type if raw_type in ("ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE") else "EXPENSE"
        return db_acc.name, db_acc.name, norm_type

    if clean_code in DEFAULT_ACCOUNT_METADATA:
        meta = DEFAULT_ACCOUNT_METADATA[clean_code]
        return meta["name_en"], meta["name_ar"], meta["type"]

    # Prefix fallback
    if clean_code.startswith("1"):
        return f"Asset Account ({clean_code})", f"حساب أصول ({clean_code})", "ASSET"
    elif clean_code.startswith("2"):
        return f"Liability Account ({clean_code})", f"حساب خصوم ({clean_code})", "LIABILITY"
    elif clean_code.startswith("3"):
        return f"Equity Account ({clean_code})", f"حساب حقوق ملكية ({clean_code})", "EQUITY"
    elif clean_code.startswith("4"):
        return f"Revenue Account ({clean_code})", f"حساب إيرادات ({clean_code})", "REVENUE"
    elif clean_code.startswith(("5", "6")):
        return f"Expense Account ({clean_code})", f"حساب مصروفات ({clean_code})", "EXPENSE"

    return f"General Ledger Account ({clean_code})", f"حساب دفتر أستاذ ({clean_code})", "EXPENSE"


# ==============================================================================
# Pydantic Response Schemas
# ==============================================================================

class TrialBalanceAccountItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_code: str
    account_name: str
    account_name_ar: Optional[str] = None
    account_type: str
    total_debit: Decimal
    total_credit: Decimal
    net_balance: Decimal
    debit_balance: Decimal
    credit_balance: Decimal


class TrialBalanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    is_balanced: bool
    total_debit: Decimal
    total_credit: Decimal
    discrepancy: Decimal
    as_of_date: datetime
    accounts: List[TrialBalanceAccountItem]


class FinancialReportAccountItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_code: str
    account_name: str
    account_name_ar: Optional[str] = None
    account_type: str
    amount: Decimal
    total_debit: Decimal
    total_credit: Decimal


class IncomeStatementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_revenue: Decimal
    total_expenses: Decimal
    net_income: Decimal
    gross_profit: Decimal
    operating_margin_percentage: float
    as_of_date: datetime
    revenue_accounts: List[FinancialReportAccountItem]
    expense_accounts: List[FinancialReportAccountItem]


class BalanceSheetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_assets: Decimal
    total_liabilities: Decimal
    total_equity: Decimal
    current_period_net_income: Decimal
    total_liabilities_and_equity: Decimal
    is_balanced: bool
    discrepancy: Decimal
    as_of_date: datetime
    asset_accounts: List[FinancialReportAccountItem]
    liability_accounts: List[FinancialReportAccountItem]
    equity_accounts: List[FinancialReportAccountItem]


# ==============================================================================
# API Routes
# ==============================================================================

@router.get("/trial-balance", response_model=TrialBalanceResponse)
def get_trial_balance(
    company_id: Optional[str] = Query(None, description="Optional Company or Tenant UUID filter"),
    tenant_id: Optional[str] = Query(None, description="Optional Tenant UUID filter"),
    from_date: Optional[datetime] = Query(None, description="Filter transactions starting from this date"),
    to_date: Optional[datetime] = Query(None, description="Filter transactions up to this date"),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
) -> TrialBalanceResponse:
    """
    Computes consolidated Trial Balance directly aggregating from active FinanceJournalLine entries.
    Sums debits and credits per account to verify general ledger balance invariance.
    """
    # 1. Access verification & tenant boundary enforcement
    if company_id or tenant_id:
        context.check_access(target_tenant_id=tenant_id, target_company_id=company_id)

    target_comp = company_id or (context.company_id if not context.is_super_admin else None)
    target_ten = tenant_id or (context.tenant_id if not context.is_super_admin else None)

    # 2. Load available chart of accounts for rich naming
    db_accounts = db.query(Account).all()
    db_accounts_map = {acc.code: acc for acc in db_accounts}

    # 3. Build aggregated query over FinanceJournalLine & FinanceJournalEntry
    query = (
        db.query(
            FinanceJournalLine.account_code,
            func.coalesce(func.sum(FinanceJournalLine.debit), Decimal("0.0000")).label("sum_debit"),
            func.coalesce(func.sum(FinanceJournalLine.credit), Decimal("0.0000")).label("sum_credit"),
        )
        .join(FinanceJournalEntry, FinanceJournalLine.entry_id == FinanceJournalEntry.id)
        .filter(FinanceJournalEntry.status != "CANCELLED")
    )

    # Multi-tenant and company boundary filtering
    if target_comp:
        try:
            cid_uuid = uuid.UUID(str(target_comp))
            query = query.filter(FinanceJournalEntry.company_id == cid_uuid)
        except ValueError:
            pass
    elif target_ten:
        try:
            tid_uuid = uuid.UUID(str(target_ten))
            query = query.filter(FinanceJournalEntry.tenant_id == tid_uuid)
        except ValueError:
            pass
    elif not context.is_super_admin:
        if context.company_id:
            query = query.filter(FinanceJournalEntry.company_id == context.company_id)
        elif context.tenant_id:
            query = query.filter(FinanceJournalEntry.tenant_id == context.tenant_id)

    if from_date:
        query = query.filter(FinanceJournalEntry.entry_date >= from_date)
    if to_date:
        query = query.filter(FinanceJournalEntry.entry_date <= to_date)

    query = query.group_by(FinanceJournalLine.account_code).order_by(FinanceJournalLine.account_code)
    aggregated_rows = query.all()

    accounts: List[TrialBalanceAccountItem] = []
    grand_total_debit = Decimal("0.0000")
    grand_total_credit = Decimal("0.0000")

    for row in aggregated_rows:
        code = str(row.account_code)
        dr = Decimal(str(row.sum_debit)).quantize(Decimal("0.0001"))
        cr = Decimal(str(row.sum_credit)).quantize(Decimal("0.0001"))

        name_en, name_ar, acc_type = classify_account(code, db_accounts_map)
        net_balance = dr - cr
        debit_bal = net_balance if net_balance > Decimal("0") else Decimal("0.0000")
        credit_bal = abs(net_balance) if net_balance < Decimal("0") else Decimal("0.0000")

        accounts.append(
            TrialBalanceAccountItem(
                account_code=code,
                account_name=name_en,
                account_name_ar=name_ar,
                account_type=acc_type,
                total_debit=dr,
                total_credit=cr,
                net_balance=net_balance,
                debit_balance=debit_bal,
                credit_balance=credit_bal,
            )
        )

        grand_total_debit += dr
        grand_total_credit += cr

    discrepancy = abs(grand_total_debit - grand_total_credit)
    is_balanced = discrepancy < Decimal("0.01")

    return TrialBalanceResponse(
        is_balanced=is_balanced,
        total_debit=grand_total_debit,
        total_credit=grand_total_credit,
        discrepancy=discrepancy,
        as_of_date=datetime.now(),
        accounts=accounts,
    )


@router.get("/income-statement", response_model=IncomeStatementResponse)
def get_income_statement(
    company_id: Optional[str] = Query(None, description="Optional Company or Tenant UUID filter"),
    tenant_id: Optional[str] = Query(None, description="Optional Tenant UUID filter"),
    from_date: Optional[datetime] = Query(None, description="Filter starting from this date"),
    to_date: Optional[datetime] = Query(None, description="Filter up to this date"),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
) -> IncomeStatementResponse:
    """
    Computes Income Statement (P&L) from active FinanceJournalLine entries.
    Filters for Revenue (Credit normal) and Expense (Debit normal) accounts to determine Net Income.
    """
    if company_id or tenant_id:
        context.check_access(target_tenant_id=tenant_id, target_company_id=company_id)

    target_comp = company_id or (context.company_id if not context.is_super_admin else None)
    target_ten = tenant_id or (context.tenant_id if not context.is_super_admin else None)

    db_accounts = db.query(Account).all()
    db_accounts_map = {acc.code: acc for acc in db_accounts}

    query = (
        db.query(
            FinanceJournalLine.account_code,
            func.coalesce(func.sum(FinanceJournalLine.debit), Decimal("0.0000")).label("sum_debit"),
            func.coalesce(func.sum(FinanceJournalLine.credit), Decimal("0.0000")).label("sum_credit"),
        )
        .join(FinanceJournalEntry, FinanceJournalLine.entry_id == FinanceJournalEntry.id)
        .filter(FinanceJournalEntry.status != "CANCELLED")
    )

    if target_comp:
        try:
            cid_uuid = uuid.UUID(str(target_comp))
            query = query.filter(FinanceJournalEntry.company_id == cid_uuid)
        except ValueError:
            pass
    elif target_ten:
        try:
            tid_uuid = uuid.UUID(str(target_ten))
            query = query.filter(FinanceJournalEntry.tenant_id == tid_uuid)
        except ValueError:
            pass
    elif not context.is_super_admin:
        if context.company_id:
            query = query.filter(FinanceJournalEntry.company_id == context.company_id)
        elif context.tenant_id:
            query = query.filter(FinanceJournalEntry.tenant_id == context.tenant_id)

    if from_date:
        query = query.filter(FinanceJournalEntry.entry_date >= from_date)
    if to_date:
        query = query.filter(FinanceJournalEntry.entry_date <= to_date)

    query = query.group_by(FinanceJournalLine.account_code).order_by(FinanceJournalLine.account_code)
    rows = query.all()

    revenue_accounts: List[FinancialReportAccountItem] = []
    expense_accounts: List[FinancialReportAccountItem] = []

    total_revenue = Decimal("0.0000")
    total_cogs = Decimal("0.0000")
    total_expenses = Decimal("0.0000")

    for row in rows:
        code = str(row.account_code)
        dr = Decimal(str(row.sum_debit)).quantize(Decimal("0.0001"))
        cr = Decimal(str(row.sum_credit)).quantize(Decimal("0.0001"))
        name_en, name_ar, acc_type = classify_account(code, db_accounts_map)

        if acc_type == "REVENUE":
            # Normal credit balance for revenue
            amount = cr - dr
            revenue_accounts.append(
                FinancialReportAccountItem(
                    account_code=code,
                    account_name=name_en,
                    account_name_ar=name_ar,
                    account_type=acc_type,
                    amount=amount,
                    total_debit=dr,
                    total_credit=cr,
                )
            )
            total_revenue += amount
        elif acc_type == "EXPENSE":
            # Normal debit balance for expense
            amount = dr - cr
            expense_accounts.append(
                FinancialReportAccountItem(
                    account_code=code,
                    account_name=name_en,
                    account_name_ar=name_ar,
                    account_type=acc_type,
                    amount=amount,
                    total_debit=dr,
                    total_credit=cr,
                )
            )
            total_expenses += amount
            if code.startswith("50"):
                total_cogs += amount

    net_income = total_revenue - total_expenses
    gross_profit = total_revenue - total_cogs
    margin_pct = float(round((net_income / total_revenue * Decimal("100")), 2)) if total_revenue > Decimal("0") else 0.0

    return IncomeStatementResponse(
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        net_income=net_income,
        gross_profit=gross_profit,
        operating_margin_percentage=margin_pct,
        as_of_date=datetime.now(),
        revenue_accounts=revenue_accounts,
        expense_accounts=expense_accounts,
    )


@router.get("/balance-sheet", response_model=BalanceSheetResponse)
def get_balance_sheet(
    company_id: Optional[str] = Query(None, description="Optional Company or Tenant UUID filter"),
    tenant_id: Optional[str] = Query(None, description="Optional Tenant UUID filter"),
    as_of_date: Optional[datetime] = Query(None, description="As-of date filter"),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
) -> BalanceSheetResponse:
    """
    Computes Balance Sheet (Statement of Financial Position) from active FinanceJournalLine entries.
    Aggregates Assets (debit normal), Liabilities (credit normal), Equity (credit normal),
    and incorporates Current Period Net Income into total equity to guarantee balance sheet equilibrium:
    Assets == Liabilities + Equity (+ Net Income).
    """
    if company_id or tenant_id:
        context.check_access(target_tenant_id=tenant_id, target_company_id=company_id)

    target_comp = company_id or (context.company_id if not context.is_super_admin else None)
    target_ten = tenant_id or (context.tenant_id if not context.is_super_admin else None)

    db_accounts = db.query(Account).all()
    db_accounts_map = {acc.code: acc for acc in db_accounts}

    query = (
        db.query(
            FinanceJournalLine.account_code,
            func.coalesce(func.sum(FinanceJournalLine.debit), Decimal("0.0000")).label("sum_debit"),
            func.coalesce(func.sum(FinanceJournalLine.credit), Decimal("0.0000")).label("sum_credit"),
        )
        .join(FinanceJournalEntry, FinanceJournalLine.entry_id == FinanceJournalEntry.id)
        .filter(FinanceJournalEntry.status != "CANCELLED")
    )

    if target_comp:
        try:
            cid_uuid = uuid.UUID(str(target_comp))
            query = query.filter(FinanceJournalEntry.company_id == cid_uuid)
        except ValueError:
            pass
    elif target_ten:
        try:
            tid_uuid = uuid.UUID(str(target_ten))
            query = query.filter(FinanceJournalEntry.tenant_id == tid_uuid)
        except ValueError:
            pass
    elif not context.is_super_admin:
        if context.company_id:
            query = query.filter(FinanceJournalEntry.company_id == context.company_id)
        elif context.tenant_id:
            query = query.filter(FinanceJournalEntry.tenant_id == context.tenant_id)

    if as_of_date:
        query = query.filter(FinanceJournalEntry.entry_date <= as_of_date)

    query = query.group_by(FinanceJournalLine.account_code).order_by(FinanceJournalLine.account_code)
    rows = query.all()

    asset_accounts: List[FinancialReportAccountItem] = []
    liability_accounts: List[FinancialReportAccountItem] = []
    equity_accounts: List[FinancialReportAccountItem] = []

    total_assets = Decimal("0.0000")
    total_liabilities = Decimal("0.0000")
    total_equity = Decimal("0.0000")

    # Also compute Net Income across P&L accounts for retained earnings integration
    pnl_revenue = Decimal("0.0000")
    pnl_expenses = Decimal("0.0000")

    for row in rows:
        code = str(row.account_code)
        dr = Decimal(str(row.sum_debit)).quantize(Decimal("0.0001"))
        cr = Decimal(str(row.sum_credit)).quantize(Decimal("0.0001"))
        name_en, name_ar, acc_type = classify_account(code, db_accounts_map)

        if acc_type == "ASSET":
            amount = dr - cr
            asset_accounts.append(
                FinancialReportAccountItem(
                    account_code=code,
                    account_name=name_en,
                    account_name_ar=name_ar,
                    account_type=acc_type,
                    amount=amount,
                    total_debit=dr,
                    total_credit=cr,
                )
            )
            total_assets += amount
        elif acc_type == "LIABILITY":
            amount = cr - dr
            liability_accounts.append(
                FinancialReportAccountItem(
                    account_code=code,
                    account_name=name_en,
                    account_name_ar=name_ar,
                    account_type=acc_type,
                    amount=amount,
                    total_debit=dr,
                    total_credit=cr,
                )
            )
            total_liabilities += amount
        elif acc_type == "EQUITY":
            amount = cr - dr
            equity_accounts.append(
                FinancialReportAccountItem(
                    account_code=code,
                    account_name=name_en,
                    account_name_ar=name_ar,
                    account_type=acc_type,
                    amount=amount,
                    total_debit=dr,
                    total_credit=cr,
                )
            )
            total_equity += amount
        elif acc_type == "REVENUE":
            pnl_revenue += (cr - dr)
        elif acc_type == "EXPENSE":
            pnl_expenses += (dr - cr)

    current_period_net_income = pnl_revenue - pnl_expenses
    total_liabilities_and_equity = total_liabilities + total_equity + current_period_net_income

    discrepancy = abs(total_assets - total_liabilities_and_equity)
    is_balanced = discrepancy < Decimal("0.01")

    return BalanceSheetResponse(
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        total_equity=total_equity,
        current_period_net_income=current_period_net_income,
        total_liabilities_and_equity=total_liabilities_and_equity,
        is_balanced=is_balanced,
        discrepancy=discrepancy,
        as_of_date=datetime.now(),
        asset_accounts=asset_accounts,
        liability_accounts=liability_accounts,
        equity_accounts=equity_accounts,
    )
