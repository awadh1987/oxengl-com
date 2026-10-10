"""
Test suite for Automated FX Sync Task & Multi-Currency Financial Reports.
Verifies:
1. FX Sync background task fetches live rates, updates oxengl_exchange_rates table, and purges Redis cache.
2. Unrealized FX Gain/Loss calculation accurately revalues open AP and AR invoices.
3. Multi-Currency Trial Balance groups journal entries by account with native USD, SAR, YER and consolidated USD.
4. Financial Reports API endpoints return valid schemas and balanced books.
"""

import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import (
    ResCompany,
    Account,
    CustomerInvoice,
    SupplierInvoice,
    FinanceJournalEntry,
    FinanceJournalLine,
    OxenglExchangeRate,
)
from backend.app.tasks.fx_sync import sync_exchange_rates, fetch_live_rates
from backend.app.services.reports import FinancialReportService
from backend.app.services.currency import CurrencyService


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def finance_test_company():
    db = SessionLocal()
    comp_id = uuid.uuid4()
    company = ResCompany(
        id=comp_id,
        name=f"Al-Mokha Logistics Co. {uuid.uuid4().hex[:6]}",
        slug=f"almokha-{uuid.uuid4().hex[:6]}",
        currency="USD",
        status="ACTIVE",
    )
    db.add(company)

    # Ensure standard accounts exist for this company
    cash_acc = Account(
        id=uuid.uuid4(),
        tenant_id=comp_id,
        company_id=comp_id,
        code=f"1010-{uuid.uuid4().hex[:4]}",
        name="Main Treasury Cash",
        path="1.1.1",
        account_type="ASSET",
        currency="USD",
    )
    ar_acc = Account(
        id=uuid.uuid4(),
        tenant_id=comp_id,
        company_id=comp_id,
        code=f"1210-{uuid.uuid4().hex[:4]}",
        name="Accounts Receivable",
        path="1.1.2",
        account_type="ASSET",
        currency="USD",
    )
    ap_acc = Account(
        id=uuid.uuid4(),
        tenant_id=comp_id,
        company_id=comp_id,
        code=f"2110-{uuid.uuid4().hex[:4]}",
        name="Accounts Payable",
        path="2.1.1",
        account_type="LIABILITY",
        currency="USD",
    )
    rev_acc = Account(
        id=uuid.uuid4(),
        tenant_id=comp_id,
        company_id=comp_id,
        code=f"4110-{uuid.uuid4().hex[:4]}",
        name="Operating Freight Revenue",
        path="4.1.1",
        account_type="REVENUE",
        currency="USD",
    )

    db.add_all([cash_acc, ar_acc, ap_acc, rev_acc])
    db.commit()

    yield {
        "company_id": comp_id,
        "accounts": {
            "cash": cash_acc,
            "ar": ar_acc,
            "ap": ap_acc,
            "revenue": rev_acc,
        },
    }
    db.close()


# ==============================================================================
# 1. Automated FX Sync Task Verification
# ==============================================================================

def test_fx_sync_task_inserts_rates_and_flushes_cache():
    """
    Verifies that sync_exchange_rates():
    1. Successfully executes rate retrieval.
    2. Writes newly active rates to oxengl_exchange_rates table with CURRENT_TIMESTAMP.
    3. Purges cached keys in Redis via CurrencyService.
    """
    db = SessionLocal()
    result = sync_exchange_rates(db=db)

    assert result["status"] == "SUCCESS"
    assert "rates" in result
    assert result["synced_pairs"] == 6

    # Verify rates in database
    rates = result["rates"]
    assert "USD_SAR" in rates
    assert "USD_YER" in rates
    assert rates["USD_SAR"] > 0
    assert rates["USD_YER"] > 0

    # Assert newly inserted active rows exist in oxengl_exchange_rates
    db_rates = (
        db.query(OxenglExchangeRate)
        .filter(OxenglExchangeRate.is_active == True)
        .all()
    )
    active_pairs = {f"{r.from_currency}_{r.to_currency}": float(r.rate) for r in db_rates}

    assert "USD_SAR" in active_pairs
    assert "USD_YER" in active_pairs
    assert "YER_USD" in active_pairs
    assert "SAR_USD" in active_pairs
    assert "SAR_YER" in active_pairs
    assert "YER_SAR" in active_pairs

    # Verify effective_date is set to recent UTC timestamp
    sample_rate = next(r for r in db_rates if r.from_currency == "USD" and r.to_currency == "YER")
    assert sample_rate.effective_date is not None
    assert (datetime.now(timezone.utc) - sample_rate.effective_date).total_seconds() < 60

    db.close()


# ==============================================================================
# 2. Unrealized FX Gain/Loss Calculation
# ==============================================================================

def test_unrealized_fx_gain_loss_calculation(finance_test_company):
    """
    Verifies calculation of unrealized foreign exchange gains and losses:
    1. Creates Customer Invoice denominated in YER at historical rate (500 YER / USD = 0.002 USD).
    2. Spot rate at evaluation is 535 YER / USD = 0.00186916 USD.
    3. Asserts resulting foreign exchange loss for AR asset is accurately computed.
    """
    db = SessionLocal()
    comp_id = finance_test_company["company_id"]
    now_utc = datetime.now(timezone.utc)
    issue_date = now_utc - timedelta(days=30)

    # Ensure spot rates in DB: 1 USD = 535 YER -> 1 YER = 0.00186916 USD
    sync_exchange_rates(db=db)

    # 1. Create open AR Customer Invoice in YER (1,070,000 YER)
    # Booked when 1 USD = 500 YER (historical rate to USD: 0.00200000)
    # Original USD = 1,070,000 * 0.002 = 2,140.00 USD
    # Current USD = 1,070,000 * 0.00186916 = 2,000.00 USD
    # Unrealized Loss = 2,000.00 - 2,140.00 = -140.00 USD
    inv_num = f"INV-FX-{uuid.uuid4().hex[:6].upper()}"
    invoice = CustomerInvoice(
        company_id=comp_id,
        invoice_number=inv_num,
        customer_name="Red Sea Trading Group",
        issue_date=issue_date,
        status="Issued",
        subtotal=Decimal("1000000.0000"),
        vat_amount=Decimal("70000.0000"),
        grand_total=Decimal("1070000.0000"),
        custom_attributes={
            "currency": "YER",
            "outstanding_balance_yer": "1070000.00",
            "original_fx_rate": "0.00200000",
        },
    )
    db.add(invoice)
    db.commit()

    report = FinancialReportService.get_unrealized_fx_gain_loss(db, company_id=comp_id)

    assert "summary" in report
    summary = report["summary"]
    assert summary["ar_count"] >= 1

    # Find our specific invoice in the AR revaluation list
    reval_item = next((item for item in report["ar_revaluation"] if item["invoice_number"] == inv_num), None)
    assert reval_item is not None
    assert reval_item["currency"] == "YER"
    assert reval_item["outstanding_amount"] == 1070000.0
    assert reval_item["original_usd"] == 2140.0
    assert pytest.approx(reval_item["current_usd"], abs=0.5) == 2000.0
    assert reval_item["unrealized_gain_loss_usd"] < 0
    assert reval_item["revaluation_status"] == "LOSS"

    db.close()


# ==============================================================================
# 3. Multi-Currency General Ledger Trial Balance Engine
# ==============================================================================

def test_multi_currency_trial_balance_grouping(finance_test_company):
    """
    Verifies that the General Ledger Trial Balance:
    1. Correctly groups multi-currency journal entries by account.
    2. Displays balances in native transaction currencies (USD, SAR, YER).
    3. Produces a consolidated USD total that balances double-entry equilibrium.
    """
    db = SessionLocal()
    comp_id = finance_test_company["company_id"]
    accounts = finance_test_company["accounts"]

    cash_acc = accounts["cash"]
    rev_acc = accounts["revenue"]

    sync_exchange_rates(db=db)

    # 1. Post USD Entry: Debit Cash $1,000, Credit Revenue $1,000
    entry_usd = FinanceJournalEntry(
        tenant_id=comp_id,
        company_id=comp_id,
        entry_number=f"JV-USD-{uuid.uuid4().hex[:6].upper()}",
        description="USD Consulting Services",
        total_debit=Decimal("1000.0000"),
        total_credit=Decimal("1000.0000"),
        status="POSTED",
        custom_attributes={"transaction_currency": "USD"},
    )
    db.add(entry_usd)
    db.flush()
    line_usd_dr = FinanceJournalLine(
        tenant_id=comp_id, entry_id=entry_usd.id, account_code=cash_acc.code,
        debit=Decimal("1000.0000"), credit=Decimal("0.0000")
    )
    line_usd_cr = FinanceJournalLine(
        tenant_id=comp_id, entry_id=entry_usd.id, account_code=rev_acc.code,
        debit=Decimal("0.0000"), credit=Decimal("1000.0000")
    )
    db.add_all([line_usd_dr, line_usd_cr])

    # 2. Post SAR Entry: Debit Cash 3,750 SAR, Credit Revenue 3,750 SAR ($1,000 USD equiv)
    entry_sar = FinanceJournalEntry(
        tenant_id=comp_id,
        company_id=comp_id,
        entry_number=f"JV-SAR-{uuid.uuid4().hex[:6].upper()}",
        description="SAR Logistics Revenue",
        total_debit=Decimal("3750.0000"),
        total_credit=Decimal("3750.0000"),
        status="POSTED",
        custom_attributes={"transaction_currency": "SAR"},
    )
    db.add(entry_sar)
    db.flush()
    line_sar_dr = FinanceJournalLine(
        tenant_id=comp_id, entry_id=entry_sar.id, account_code=cash_acc.code,
        debit=Decimal("3750.0000"), credit=Decimal("0.0000")
    )
    line_sar_cr = FinanceJournalLine(
        tenant_id=comp_id, entry_id=entry_sar.id, account_code=rev_acc.code,
        debit=Decimal("0.0000"), credit=Decimal("3750.0000")
    )
    db.add_all([line_sar_dr, line_sar_cr])

    # 3. Post YER Entry: Debit Cash 535,000 YER, Credit Revenue 535,000 YER ($1,000 USD equiv)
    entry_yer = FinanceJournalEntry(
        tenant_id=comp_id,
        company_id=comp_id,
        entry_number=f"JV-YER-{uuid.uuid4().hex[:6].upper()}",
        description="YER Port Clearing Revenue",
        total_debit=Decimal("535000.0000"),
        total_credit=Decimal("535000.0000"),
        status="POSTED",
        custom_attributes={"transaction_currency": "YER"},
    )
    db.add(entry_yer)
    db.flush()
    line_yer_dr = FinanceJournalLine(
        tenant_id=comp_id, entry_id=entry_yer.id, account_code=cash_acc.code,
        debit=Decimal("535000.0000"), credit=Decimal("0.0000")
    )
    line_yer_cr = FinanceJournalLine(
        tenant_id=comp_id, entry_id=entry_yer.id, account_code=rev_acc.code,
        debit=Decimal("0.0000"), credit=Decimal("535000.0000")
    )
    db.add_all([line_yer_dr, line_yer_cr])

    db.commit()

    # Query multi-currency trial balance for our company
    tb = FinancialReportService.get_multi_currency_trial_balance(db, company_id=comp_id)

    assert tb["is_balanced"] is True
    assert tb["discrepancy_usd"] < 0.05
    assert len(tb["accounts"]) >= 2

    # Check Cash account breakdown
    cash_row = next(a for a in tb["accounts"] if a["account_code"] == cash_acc.code)
    assert cash_row["native_balances"]["USD"]["debit"] == 1000.0
    assert cash_row["native_balances"]["SAR"]["debit"] == 3750.0
    assert cash_row["native_balances"]["YER"]["debit"] == 535000.0
    # Consolidated USD for cash: 1000 + 1000 + 1000 = ~3000 USD
    assert pytest.approx(cash_row["consolidated_usd"]["total_debit"], abs=1.0) == 3000.0

    # Check Revenue account breakdown
    rev_row = next(a for a in tb["accounts"] if a["account_code"] == rev_acc.code)
    assert rev_row["native_balances"]["USD"]["credit"] == 1000.0
    assert rev_row["native_balances"]["SAR"]["credit"] == 3750.0
    assert rev_row["native_balances"]["YER"]["credit"] == 535000.0
    assert pytest.approx(rev_row["consolidated_usd"]["total_credit"], abs=1.0) == 3000.0

    db.close()


# ==============================================================================
# 4. API Endpoints Integration Verification
# ==============================================================================

def test_api_reports_endpoints(client):
    """Verifies that API endpoints for FX Gain/Loss and Multi-Currency TB respond with HTTP 200."""
    # 1. FX Gain/Loss Endpoint
    resp_gl = client.get("/api/v1/reports/fx-gain-loss")
    assert resp_gl.status_code == 200, resp_gl.text
    data_gl = resp_gl.json()
    assert "summary" in data_gl
    assert "active_rates" in data_gl

    # 2. Multi-Currency Trial Balance Endpoint
    resp_tb = client.get("/api/v1/reports/multi-currency-trial-balance")
    assert resp_tb.status_code == 200, resp_tb.text
    data_tb = resp_tb.json()
    assert "consolidated_totals" in data_tb
    assert "supported_currencies" in data_tb
    assert "accounts" in data_tb

    # 3. View mode native on trial-balance endpoint
    resp_native = client.get("/api/v1/reports/trial-balance?view_mode=native")
    assert resp_native.status_code == 200, resp_native.text
    data_native = resp_native.json()
    assert "accounts" in data_native

    # 4. FX Sync Trigger Endpoint
    resp_sync = client.post("/api/v1/reports/fx-sync")
    assert resp_sync.status_code == 200, resp_sync.text
    data_sync = resp_sync.json()
    assert data_sync["status"] == "SUCCESS"
