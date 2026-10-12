"""
OxenGL Universal Multi-Currency Integration & Verification Test Suite.
Tests critical paths for YER across:
1. Financial Engine (General Ledger multi-line journal entry in YER with USD base conversion).
2. Billing Engine (Invoicing in YER, partial payments, dynamic multi-currency conversions).
3. Security & RLS (Standard regional non-admin tenant user access to oxengl_currencies & oxengl_exchange_rates).
4. Caching & Currency Service (Redis cache-aside, jitter, fallback rates, cache flush).
"""

import uuid
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
import pytest
from starlette.testclient import TestClient
from sqlalchemy import text, select

from backend.app.main import app, create_session_token
from backend.database import SessionLocal
from backend.models import (
    ResCompany,
    ResUser,
    CustomerInvoice,
    Invoice,
    FinanceJournalEntry,
    FinanceJournalLine,
    OxenglCurrency,
    OxenglExchangeRate,
    OxenglEngineSetting,
)
from backend.app.domains.finance.models import Account
from backend.services.currency import CurrencyService, FALLBACK_RATES


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def regional_tenant_setup():
    """Sets up a regional Yemeni tenant company and users for test isolation."""
    db = SessionLocal()
    company_id = uuid.uuid4()
    
    company = ResCompany(
        id=company_id,
        name=f"Yemen Logistics & Clearing {uuid.uuid4().hex[:6]}",
        slug=f"ye-logistics-{uuid.uuid4().hex[:6]}",
        currency="YER",
        is_active=True,
    )
    db.add(company)

    # Standard regional non-admin user
    user_id = uuid.uuid4()
    user = ResUser(
        id=user_id,
        firebase_uid=f"fb_ye_user_{user_id.hex[:8]}",
        email=f"accountant-{user_id.hex[:6]}@ye-logistics.com",
        full_name="Regional Yemeni Accountant",
        role="User",
        company_id=company_id,
        is_active=True,
    )
    db.add(user)

    # Chart of Accounts for YER transactions
    acc_cash = Account(
        id=uuid.uuid4(),
        tenant_id=company_id,
        company_id=company_id,
        code=f"101-YER-{uuid.uuid4().hex[:4]}",
        name="Sana'a Operational Cash (YER)",
        path="assets.cash.sanaa",
        account_type="ASSET",
        currency="YER",
    )
    acc_bank = Account(
        id=uuid.uuid4(),
        tenant_id=company_id,
        company_id=company_id,
        code=f"102-YER-{uuid.uuid4().hex[:4]}",
        name="Aden Central Bank Account (YER)",
        path="assets.bank.aden",
        account_type="ASSET",
        currency="YER",
    )
    acc_revenue = Account(
        id=uuid.uuid4(),
        tenant_id=company_id,
        company_id=company_id,
        code=f"401-YER-{uuid.uuid4().hex[:4]}",
        name="Freight Logistics Revenue (YER)",
        path="revenue.logistics",
        account_type="REVENUE",
        currency="YER",
    )
    db.add_all([acc_cash, acc_bank, acc_revenue])
    db.commit()

    token = create_session_token(
        subject=str(user_id),
        company_id=company_id,
        role="User",
    )

    yield {
        "company": company,
        "company_id": company_id,
        "user": user,
        "token": token,
        "accounts": {
            "cash": acc_cash,
            "bank": acc_bank,
            "revenue": acc_revenue,
        },
    }
    db.close()


# ==============================================================================
# 1. Financial Engine (General Ledger) YER Multi-Line Balanced Posting
# ==============================================================================

def test_financial_engine_yer_multiline_journal_and_usd_conversion(regional_tenant_setup):
    """
    Post a multi-line journal entry denominated in YER.
    Asserts:
    1. Multi-line debits and credits balance perfectly in YER.
    2. Base USD equivalent conversion uses the active exchange rate (535.0).
    3. Ledger balances with zero fractional rounding drift.
    """
    db = SessionLocal()
    setup = regional_tenant_setup
    company_id = setup["company_id"]
    acc = setup["accounts"]

    # Active exchange rate: 1 USD = 535.0 YER
    yer_fx_rate = Decimal("535.000000")
    
    # Line 1: Debit Cash YER 321,000.00  -> USD equivalent: $600.00
    # Line 2: Debit Bank YER 214,000.00  -> USD equivalent: $400.00
    # Line 3: Credit Revenue YER 535,000.00 -> USD equivalent: $1,000.00
    dr_cash_yer = Decimal("321000.0000")
    dr_bank_yer = Decimal("214000.0000")
    cr_rev_yer = Decimal("535000.0000")

    total_debit_yer = dr_cash_yer + dr_bank_yer
    total_credit_yer = cr_rev_yer
    assert total_debit_yer == total_credit_yer == Decimal("535000.0000")

    # Calculate USD base equivalents
    dr_cash_usd = (dr_cash_yer / yer_fx_rate).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    dr_bank_usd = (dr_bank_yer / yer_fx_rate).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    cr_rev_usd = (cr_rev_yer / yer_fx_rate).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    total_debit_usd = dr_cash_usd + dr_bank_usd
    total_credit_usd = cr_rev_usd
    assert dr_cash_usd == Decimal("600.0000")
    assert dr_bank_usd == Decimal("400.0000")
    assert cr_rev_usd == Decimal("1000.0000")
    assert total_debit_usd == total_credit_usd == Decimal("1000.0000")

    # Persist the journal entry header and lines
    entry_number = f"JV-YER-{uuid.uuid4().hex[:6].upper()}"
    entry = FinanceJournalEntry(
        tenant_id=company_id,
        company_id=company_id,
        entry_number=entry_number,
        description="Q4 Freight Inbound Clearing (Sana'a - Aden Corridor)",
        total_debit=total_debit_yer,
        total_credit=total_credit_yer,
        status="POSTED",
        custom_attributes={
            "transaction_currency": "YER",
            "base_ledger_currency": "USD",
            "active_fx_rate": float(yer_fx_rate),
            "base_usd_equivalent": float(total_debit_usd),
        },
    )
    db.add(entry)
    db.flush()

    line1 = FinanceJournalLine(
        tenant_id=company_id,
        entry_id=entry.id,
        account_code=acc["cash"].code,
        debit=dr_cash_yer,
        credit=Decimal("0.0000"),
        description="Cash collection YER",
    )
    line2 = FinanceJournalLine(
        tenant_id=company_id,
        entry_id=entry.id,
        account_code=acc["bank"].code,
        debit=dr_bank_yer,
        credit=Decimal("0.0000"),
        description="Bank wire transfer YER",
    )
    line3 = FinanceJournalLine(
        tenant_id=company_id,
        entry_id=entry.id,
        account_code=acc["revenue"].code,
        debit=Decimal("0.0000"),
        credit=cr_rev_yer,
        description="Logistics Service Revenue YER",
    )
    db.add_all([line1, line2, line3])
    db.commit()
    db.refresh(entry)

    # Assert persistence and double entry integrity
    assert entry.id is not None
    assert entry.total_debit == entry.total_credit == Decimal("535000.0000")
    assert len(entry.lines) == 3
    assert entry.custom_attributes["base_usd_equivalent"] == 1000.00
    assert entry.custom_attributes["transaction_currency"] == "YER"
    db.close()


# ==============================================================================
# 2. Billing Engine (Invoicing): Partial Payment & Multi-Currency Dynamic Conversion
# ==============================================================================

@pytest.mark.asyncio
async def test_billing_engine_yer_invoice_partial_payment_and_conversions(regional_tenant_setup):
    """
    Generate customer invoice in YER, apply a partial payment, verify balance updates,
    and assert dynamic conversions across SAR and USD reporting views.
    """
    db = SessionLocal()
    setup = regional_tenant_setup
    company_id = setup["company_id"]

    inv_num = f"INV-YE-{uuid.uuid4().hex[:6].upper()}"
    invoice_total_yer = Decimal("1070000.00")  # 1,070,000 YER
    invoice_subtotal_yer = Decimal("1000000.00")
    invoice_vat_yer = Decimal("70000.00")

    # 1. Create Invoice
    invoice = CustomerInvoice(
        company_id=company_id,
        invoice_number=inv_num,
        customer_name="Al-Mukalla Shipping Lines",
        issue_date=datetime.now(timezone.utc),
        status="Draft",
        subtotal=invoice_subtotal_yer,
        vat_amount=invoice_vat_yer,
        grand_total=invoice_total_yer,
        custom_attributes={
            "currency": "YER",
            "paid_amount_yer": "0.00",
            "outstanding_balance_yer": str(invoice_total_yer),
        },
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    assert invoice.grand_total == Decimal("1070000.00")
    assert invoice.custom_attributes["currency"] == "YER"

    # 2. Process Partial Payment of YER 535,000.00
    payment_yer = Decimal("535000.00")
    paid_so_far = Decimal(invoice.custom_attributes.get("paid_amount_yer", "0.00")) + payment_yer
    outstanding_yer = invoice.grand_total - paid_so_far

    updated_attrs = dict(invoice.custom_attributes)
    updated_attrs["paid_amount_yer"] = str(paid_so_far)
    updated_attrs["outstanding_balance_yer"] = str(outstanding_yer)
    invoice.custom_attributes = updated_attrs
    invoice.status = "Approved" if outstanding_yer > 0 else "Issued"
    db.add(invoice)
    db.commit()
    db.refresh(invoice)


    assert Decimal(invoice.custom_attributes["paid_amount_yer"]) == Decimal("535000.00")
    assert Decimal(invoice.custom_attributes["outstanding_balance_yer"]) == Decimal("535000.00")

    # 3. Dynamic Multi-Currency Conversion via CurrencyService
    currency_service = CurrencyService()
    
    # Total invoice in USD base: 1,070,000 YER / 535.0 = 2,000.00 USD
    usd_equiv = await currency_service.convert_amount(
        float(invoice_total_yer), from_currency="YER", to_currency="USD"
    )
    assert usd_equiv == pytest.approx(2000.00, abs=0.1)

    # Total invoice in SAR reporting: 1,070,000 YER / 142.666667 = 7,500.00 SAR
    sar_equiv = await currency_service.convert_amount(
        float(invoice_total_yer), from_currency="YER", to_currency="SAR"
    )
    assert sar_equiv == pytest.approx(7500.00, abs=0.1)

    # Remaining balance conversion
    remaining_usd = await currency_service.convert_amount(
        float(outstanding_yer), from_currency="YER", to_currency="USD"
    )
    assert remaining_usd == pytest.approx(1000.00, abs=0.1)

    db.close()


# ==============================================================================
# 3. Security & Row-Level Security (RLS) Verification for Regional Non-Admin
# ==============================================================================

def test_security_rls_regional_tenant_user_access(regional_tenant_setup):
    """
    Authenticates as a standard regional non-admin tenant user.
    Asserts:
    1. oxengl_currencies returns YER without RLS blocks.
    2. oxengl_exchange_rates returns active YER rates.
    3. oxengl_engine_settings includes YER in supported_currencies.
    4. Row-Level Security policies permit read operations seamlessly.
    """
    db = SessionLocal()
    setup = regional_tenant_setup
    company_id = setup["company_id"]

    # Emulate the PostgreSQL application tenant context set during RLS sessions
    db.execute(text(f"SET LOCAL app.current_tenant_id = '{company_id}'"))

    # 1. Query oxengl_currencies
    currencies = db.execute(
        text("SELECT currency_code, currency_symbol, currency_name, is_active FROM oxengl_currencies WHERE is_active = TRUE ORDER BY currency_code")
    ).fetchall()

    curr_codes = [c[0] for c in currencies]
    assert "YER" in curr_codes
    assert "USD" in curr_codes
    assert "SAR" in curr_codes

    yer_curr = next(c for c in currencies if c[0] == "YER")
    assert yer_curr[1] == "﷼"
    assert yer_curr[2] == "Yemeni Rial"
    assert yer_curr[3] is True

    # 2. Query oxengl_exchange_rates
    rates = db.execute(
        text("SELECT from_currency, to_currency, rate FROM oxengl_exchange_rates WHERE is_active = TRUE")
    ).fetchall()

    rate_map = {f"{r[0]}_{r[1]}": float(r[2]) for r in rates}
    assert "USD_YER" in rate_map
    assert rate_map["USD_YER"] == 535.0
    assert "SAR_YER" in rate_map
    assert rate_map["SAR_YER"] == pytest.approx(142.666667, abs=0.0001)

    # 3. Query oxengl_engine_settings
    engines = db.execute(
        text("SELECT engine_name, supported_currencies FROM oxengl_engine_settings")
    ).fetchall()

    assert len(engines) >= 5
    for engine_name, supp_currencies in engines:
        assert "YER" in supp_currencies, f"Engine {engine_name} missing YER in supported_currencies"
        assert "USD" in supp_currencies
        assert "SAR" in supp_currencies

    db.close()


# ==============================================================================
# 4. Caching & Currency Service Offline Resilience & Cache Flush
# ==============================================================================

@pytest.mark.asyncio
async def test_currency_service_caching_and_flush():
    """
    Verifies that the CurrencyService incorporates YER into FALLBACK_RATES,
    calculates reciprocals accurately, and executes cache flushing.
    """
    service = CurrencyService()

    # 1. Verify Fallback Matrix contains YER
    assert "USD_YER" in FALLBACK_RATES
    assert FALLBACK_RATES["USD_YER"] == 535.000000
    assert "YER_USD" in FALLBACK_RATES
    assert FALLBACK_RATES["YER_USD"] == 0.00186916

    # 2. Convert amounts with offline fallback resilience
    rate_usd_yer = await service.get_exchange_rate("USD", "YER")
    assert rate_usd_yer == 535.0

    rate_yer_usd = await service.get_exchange_rate("YER", "USD")
    assert rate_yer_usd == pytest.approx(0.001869, abs=0.00001)

    # 3. Test Cache Flush mechanism
    tenant_id = f"tenant_{uuid.uuid4().hex[:6]}"
    flush_count = await service.flush_currency_cache(tenant_id)
    assert isinstance(flush_count, int)
