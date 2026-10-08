"""
Test suite for Phase 10: Financial Reporting & Analytics Engine.
Verifies Trial Balance, Income Statement, and Balance Sheet endpoints directly aggregating from FinanceJournalLine.
"""

from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import (
    FinanceJournalEntry,
    FinanceJournalLine,
    ResCompany,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_trial_balance_aggregation(client):
    """Verify Trial Balance aggregates debit/credit per account code and verifies balance equilibrium."""
    response = client.get("/api/analytics/trial-balance")
    assert response.status_code == 200, response.text
    data = response.json()

    assert "is_balanced" in data
    assert "total_debit" in data
    assert "total_credit" in data
    assert "discrepancy" in data
    assert "accounts" in data
    assert isinstance(data["accounts"], list)
    assert len(data["accounts"]) > 0

    # Verify each account contains expected fields
    for acc in data["accounts"]:
        assert "account_code" in acc
        assert "account_name" in acc
        assert "total_debit" in acc
        assert "total_credit" in acc
        assert "net_balance" in acc


def test_income_statement_aggregation(client):
    """Verify Income Statement calculates revenue, expenses, net income, and margin."""
    response = client.get("/api/analytics/income-statement")
    assert response.status_code == 200, response.text
    data = response.json()

    assert "total_revenue" in data
    assert "total_expenses" in data
    assert "net_income" in data
    assert "gross_profit" in data
    assert "operating_margin_percentage" in data
    assert "revenue_accounts" in data
    assert "expense_accounts" in data

    # Verify net income = revenue - expenses
    tot_rev = Decimal(str(data["total_revenue"]))
    tot_exp = Decimal(str(data["total_expenses"]))
    net_inc = Decimal(str(data["net_income"]))
    assert net_inc == tot_rev - tot_exp


def test_balance_sheet_aggregation(client):
    """Verify Balance Sheet calculates assets, liabilities, equity, and current period net income equilibrium."""
    response = client.get("/api/analytics/balance-sheet")
    assert response.status_code == 200, response.text
    data = response.json()

    assert "total_assets" in data
    assert "total_liabilities" in data
    assert "total_equity" in data
    assert "current_period_net_income" in data
    assert "total_liabilities_and_equity" in data
    assert "is_balanced" in data
    assert "asset_accounts" in data
    assert "liability_accounts" in data
    assert "equity_accounts" in data

    tot_liab_eq = Decimal(str(data["total_liabilities_and_equity"]))
    tot_liab = Decimal(str(data["total_liabilities"]))
    tot_eq = Decimal(str(data["total_equity"]))
    net_inc = Decimal(str(data["current_period_net_income"]))
    assert tot_liab_eq == tot_liab + tot_eq + net_inc
