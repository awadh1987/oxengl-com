"""
OxenGL Financial & Multi-Currency Reporting Service.
Implements:
1. Unrealized Foreign Exchange (FX) Gain/Loss Report Engine comparing original
   transaction date rates vs. current active rates for open AP/AR invoices.
2. Multi-Currency General Ledger Trial Balance aggregating journal entries
   by account across native currencies (USD, SAR, YER) alongside consolidated USD totals.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import func, text

from backend.models import (
    CustomerInvoice,
    SupplierInvoice,
    FinanceJournalEntry,
    FinanceJournalLine,
    Account,
    OxenglExchangeRate,
)

logger = logging.getLogger("oxengl.services.reports")

DEFAULT_RATES_TO_USD: Dict[str, Decimal] = {
    "USD": Decimal("1.000000"),
    "SAR": Decimal("0.266667"),  # 1 / 3.75
    "YER": Decimal("0.00186916"),  # 1 / 535.0
}


class FinancialReportService:
    """Enterprise multi-currency reporting and FX revaluation service."""

    @staticmethod
    def get_active_rates_to_usd(db: Session) -> Dict[str, Decimal]:
        """Loads the current active exchange rates to base currency USD."""
        rates = dict(DEFAULT_RATES_TO_USD)
        try:
            active_rows = (
                db.query(OxenglExchangeRate)
                .filter(
                    OxenglExchangeRate.to_currency == "USD",
                    OxenglExchangeRate.is_active == True,
                )
                .all()
            )
            for r in active_rows:
                rates[r.from_currency.upper()] = Decimal(str(r.rate))

            # Reciprocals if direct to_currency=='USD' wasn't seeded
            direct_from_usd = (
                db.query(OxenglExchangeRate)
                .filter(
                    OxenglExchangeRate.from_currency == "USD",
                    OxenglExchangeRate.is_active == True,
                )
                .all()
            )
            for r in direct_from_usd:
                cur = r.to_currency.upper()
                r_val = Decimal(str(r.rate))
                if cur not in rates and r_val > 0:
                    rates[cur] = (Decimal("1.0") / r_val).quantize(
                        Decimal("0.00000001"), rounding=ROUND_HALF_UP
                    )
        except Exception as exc:
            logger.warning("Error fetching active FX rates, using fallback: %s", exc)

        return rates

    @staticmethod
    def get_historical_rate_to_usd(
        db: Session,
        currency: str,
        transaction_date: Any,
        fallback_rate: Optional[Decimal] = None,
    ) -> Decimal:
        """Finds exchange rate to USD effective on or immediately before transaction date."""
        cur = currency.upper().strip()
        if cur == "USD":
            return Decimal("1.000000")

        if fallback_rate is not None and fallback_rate > 0:
            return fallback_rate

        try:
            dt = transaction_date if isinstance(transaction_date, datetime) else datetime.now(timezone.utc)
            row = (
                db.query(OxenglExchangeRate)
                .filter(
                    OxenglExchangeRate.from_currency == cur,
                    OxenglExchangeRate.to_currency == "USD",
                    OxenglExchangeRate.effective_date <= dt,
                )
                .order_by(OxenglExchangeRate.effective_date.desc())
                .first()
            )
            if row:
                return Decimal(str(row.rate))
        except Exception:
            pass

        return DEFAULT_RATES_TO_USD.get(cur, Decimal("1.000000"))

    # ==========================================================================
    # 1. Unrealized FX Gain / Loss Reporting Engine
    # ==========================================================================

    @classmethod
    def get_unrealized_fx_gain_loss(
        cls,
        db: Session,
        company_id: Optional[uuid.UUID] = None,
        tenant_id: Optional[uuid.UUID] = None,
        as_of_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Calculates unrealized foreign exchange gains and losses across open AP and AR
        by revaluing outstanding foreign balances from their historical rates to the current spot rate.
        """
        eval_date = as_of_date or datetime.now(timezone.utc)
        active_rates = cls.get_active_rates_to_usd(db)

        # ----------------------------------------------------------------------
        # 1. Accounts Receivable (Customer Invoices)
        # ----------------------------------------------------------------------
        ar_query = db.query(CustomerInvoice).filter(
            CustomerInvoice.status.in_(["Draft", "Approved", "Issued", "draft", "approved", "issued"])
        )
        if company_id:
            ar_query = ar_query.filter(CustomerInvoice.company_id == company_id)

        customer_invoices = ar_query.all()
        ar_items: List[Dict[str, Any]] = []
        total_ar_gain_loss_usd = Decimal("0.0000")
        total_open_ar_usd = Decimal("0.0000")

        for inv in customer_invoices:
            attrs = inv.custom_attributes or {}
            currency = str(attrs.get("currency", "SAR")).upper()

            # Determine outstanding foreign balance
            if "outstanding_balance_yer" in attrs and currency == "YER":
                outstanding = Decimal(str(attrs["outstanding_balance_yer"]))
            elif "outstanding_balance" in attrs:
                outstanding = Decimal(str(attrs["outstanding_balance"]))
            elif "paid_amount" in attrs:
                paid = Decimal(str(attrs["paid_amount"]))
                outstanding = Decimal(str(inv.grand_total)) - paid
            else:
                outstanding = Decimal(str(inv.grand_total))

            if outstanding <= Decimal("0"):
                continue

            # Original exchange rate to USD
            custom_orig_rate = None
            if "original_fx_rate" in attrs:
                custom_orig_rate = Decimal(str(attrs["original_fx_rate"]))
            elif "exchange_rate_to_usd" in attrs:
                custom_orig_rate = Decimal(str(attrs["exchange_rate_to_usd"]))
            elif "active_fx_rate" in attrs and currency != "USD":
                # If stored as quote currency per USD (e.g., 535 YER per USD)
                val = Decimal(str(attrs["active_fx_rate"]))
                if val > 1:
                    custom_orig_rate = (Decimal("1.0") / val).quantize(Decimal("0.00000001"))
                else:
                    custom_orig_rate = val

            orig_rate = cls.get_historical_rate_to_usd(
                db, currency, inv.issue_date, fallback_rate=custom_orig_rate
            )
            current_rate = active_rates.get(currency, Decimal("1.000000"))

            original_usd = (outstanding * orig_rate).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            current_usd = (outstanding * current_rate).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

            # For an Asset (AR Receivable): Higher current USD = Gain, Lower = Loss
            gain_loss_usd = current_usd - original_usd
            total_ar_gain_loss_usd += gain_loss_usd
            total_open_ar_usd += current_usd

            status_label = "GAIN" if gain_loss_usd > Decimal("0.005") else "LOSS" if gain_loss_usd < Decimal("-0.005") else "NEUTRAL"

            ar_items.append({
                "invoice_id": str(inv.id),
                "invoice_number": inv.invoice_number,
                "partner_name": inv.customer_name,
                "document_type": "CUSTOMER_INVOICE (AR)",
                "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
                "currency": currency,
                "outstanding_amount": float(outstanding),
                "original_rate_to_usd": float(orig_rate),
                "current_rate_to_usd": float(current_rate),
                "original_usd": float(original_usd),
                "current_usd": float(current_usd),
                "unrealized_gain_loss_usd": float(gain_loss_usd),
                "revaluation_status": status_label,
            })

        # ----------------------------------------------------------------------
        # 2. Accounts Payable (Supplier Invoices)
        # ----------------------------------------------------------------------
        ap_query = db.query(SupplierInvoice).filter(
            SupplierInvoice.status.notin_(["paid", "Paid", "cancelled", "Cancelled"])
        )
        if company_id:
            ap_query = ap_query.filter(SupplierInvoice.company_id == company_id)

        supplier_invoices = ap_query.all()
        ap_items: List[Dict[str, Any]] = []
        total_ap_gain_loss_usd = Decimal("0.0000")
        total_open_ap_usd = Decimal("0.0000")

        for sinv in supplier_invoices:
            # Supplier invoice currency from notes or default SAR/YER
            currency = "SAR"
            if sinv.notes and "YER" in sinv.notes.upper():
                currency = "YER"
            elif sinv.notes and "USD" in sinv.notes.upper():
                currency = "USD"

            outstanding = Decimal(str(sinv.total_amount))
            if outstanding <= Decimal("0"):
                continue

            orig_rate = cls.get_historical_rate_to_usd(db, currency, sinv.invoice_date)
            current_rate = active_rates.get(currency, Decimal("1.000000"))

            original_usd = (outstanding * orig_rate).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            current_usd = (outstanding * current_rate).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

            # For a Liability (AP Payable): Lower current USD to settle = Gain, Higher = Loss
            gain_loss_usd = original_usd - current_usd
            total_ap_gain_loss_usd += gain_loss_usd
            total_open_ap_usd += current_usd

            status_label = "GAIN" if gain_loss_usd > Decimal("0.005") else "LOSS" if gain_loss_usd < Decimal("-0.005") else "NEUTRAL"

            ap_items.append({
                "invoice_id": str(sinv.id),
                "invoice_number": sinv.invoice_number,
                "partner_name": sinv.partner.name if sinv.partner else "Supplier Vendor",
                "document_type": "SUPPLIER_INVOICE (AP)",
                "issue_date": sinv.invoice_date.isoformat() if sinv.invoice_date else None,
                "currency": currency,
                "outstanding_amount": float(outstanding),
                "original_rate_to_usd": float(orig_rate),
                "current_rate_to_usd": float(current_rate),
                "original_usd": float(original_usd),
                "current_usd": float(current_usd),
                "unrealized_gain_loss_usd": float(gain_loss_usd),
                "revaluation_status": status_label,
            })

        net_unrealized_usd = total_ar_gain_loss_usd + total_ap_gain_loss_usd
        net_exposure_usd = total_open_ar_usd - total_open_ap_usd

        return {
            "report_name": "Unrealized FX Gain/Loss & Foreign Currency Exposure",
            "as_of_date": eval_date.isoformat(),
            "base_currency": "USD",
            "active_rates": {k: float(v) for k, v in active_rates.items()},
            "summary": {
                "net_unrealized_gain_loss_usd": float(net_unrealized_usd.quantize(Decimal("0.01"))),
                "total_ar_gain_loss_usd": float(total_ar_gain_loss_usd.quantize(Decimal("0.01"))),
                "total_ap_gain_loss_usd": float(total_ap_gain_loss_usd.quantize(Decimal("0.01"))),
                "total_open_ar_usd": float(total_open_ar_usd.quantize(Decimal("0.01"))),
                "total_open_ap_usd": float(total_open_ap_usd.quantize(Decimal("0.01"))),
                "net_exposure_usd": float(net_exposure_usd.quantize(Decimal("0.01"))),
                "ar_count": len(ar_items),
                "ap_count": len(ap_items),
            },
            "ar_revaluation": ar_items,
            "ap_revaluation": ap_items,
        }

    # ==========================================================================
    # 2. Multi-Currency Trial Balance Engine
    # ==========================================================================

    @classmethod
    def get_multi_currency_trial_balance(
        cls,
        db: Session,
        company_id: Optional[uuid.UUID] = None,
        tenant_id: Optional[uuid.UUID] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Groups journal entries by account, computing native currency balances
        (USD, SAR, YER) alongside consolidated USD equivalents.
        """
        active_rates = cls.get_active_rates_to_usd(db)

        # 1. Accounts reference map
        accounts = db.query(Account).all()
        accounts_map = {acc.code: acc for acc in accounts}

        # 2. Query FinanceJournalLine joined with FinanceJournalEntry
        entry_query = (
            db.query(FinanceJournalLine, FinanceJournalEntry)
            .join(FinanceJournalEntry, FinanceJournalLine.entry_id == FinanceJournalEntry.id)
            .filter(FinanceJournalEntry.status != "CANCELLED")
        )

        if company_id:
            entry_query = entry_query.filter(FinanceJournalEntry.company_id == company_id)
        elif tenant_id:
            entry_query = entry_query.filter(FinanceJournalEntry.tenant_id == tenant_id)

        if from_date:
            entry_query = entry_query.filter(FinanceJournalEntry.entry_date >= from_date)
        if to_date:
            entry_query = entry_query.filter(FinanceJournalEntry.entry_date <= to_date)

        rows = entry_query.all()

        # Group data per account_code -> currency -> {debit, credit}
        grouped_accounts: Dict[str, Dict[str, Any]] = {}

        for line, entry in rows:
            code = line.account_code
            attrs = entry.custom_attributes or {}
            cur = str(attrs.get("transaction_currency") or attrs.get("currency") or "SAR").upper().strip()

            if code not in grouped_accounts:
                acc_obj = accounts_map.get(code)
                acc_type_val = "ASSET"
                if acc_obj:
                    if hasattr(acc_obj, "account_type"):
                        acc_type_val = str(getattr(acc_obj, "account_type"))
                    elif hasattr(acc_obj, "type"):
                        acc_type_val = str(getattr(acc_obj, "type"))

                grouped_accounts[code] = {
                    "account_code": code,
                    "account_name": acc_obj.name if acc_obj else f"Account {code}",
                    "account_name_ar": acc_obj.name_ar if acc_obj and hasattr(acc_obj, "name_ar") else (acc_obj.name if acc_obj else f"حساب {code}"),
                    "account_type": acc_type_val,
                    "currencies": {
                        "USD": {"debit": Decimal("0"), "credit": Decimal("0")},
                        "SAR": {"debit": Decimal("0"), "credit": Decimal("0")},
                        "YER": {"debit": Decimal("0"), "credit": Decimal("0")},
                    },
                }

            if cur not in grouped_accounts[code]["currencies"]:
                grouped_accounts[code]["currencies"][cur] = {"debit": Decimal("0"), "credit": Decimal("0")}

            grouped_accounts[code]["currencies"][cur]["debit"] += Decimal(str(line.debit))
            grouped_accounts[code]["currencies"][cur]["credit"] += Decimal(str(line.credit))

        # 3. Calculate Consolidated USD and Prepare Formatted Account List
        account_results: List[Dict[str, Any]] = []
        grand_total_debit_usd = Decimal("0.0000")
        grand_total_credit_usd = Decimal("0.0000")

        native_totals: Dict[str, Dict[str, Decimal]] = {
            "USD": {"debit": Decimal("0"), "credit": Decimal("0")},
            "SAR": {"debit": Decimal("0"), "credit": Decimal("0")},
            "YER": {"debit": Decimal("0"), "credit": Decimal("0")},
        }

        for code in sorted(grouped_accounts.keys()):
            data = grouped_accounts[code]
            cur_map = data["currencies"]

            account_debit_usd = Decimal("0.0000")
            account_credit_usd = Decimal("0.0000")

            formatted_native: Dict[str, Dict[str, float]] = {}

            for c_name in ["USD", "SAR", "YER"]:
                c_data = cur_map.get(c_name, {"debit": Decimal("0"), "credit": Decimal("0")})
                dr = c_data["debit"]
                cr = c_data["credit"]
                net = dr - cr

                rate_to_usd = active_rates.get(c_name, Decimal("1.000000"))
                conv_dr = (dr * rate_to_usd).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                conv_cr = (cr * rate_to_usd).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                account_debit_usd += conv_dr
                account_credit_usd += conv_cr

                native_totals[c_name]["debit"] += dr
                native_totals[c_name]["credit"] += cr

                formatted_native[c_name] = {
                    "debit": float(dr),
                    "credit": float(cr),
                    "net_balance": float(net),
                    "converted_debit_usd": float(conv_dr),
                    "converted_credit_usd": float(conv_cr),
                }

            net_usd = account_debit_usd - account_credit_usd
            grand_total_debit_usd += account_debit_usd
            grand_total_credit_usd += account_credit_usd

            account_results.append({
                "account_code": data["account_code"],
                "account_name": data["account_name"],
                "account_name_ar": data["account_name_ar"],
                "account_type": data["account_type"],
                "native_balances": formatted_native,
                "consolidated_usd": {
                    "total_debit": float(account_debit_usd.quantize(Decimal("0.01"))),
                    "total_credit": float(account_credit_usd.quantize(Decimal("0.01"))),
                    "net_balance": float(net_usd.quantize(Decimal("0.01"))),
                },
            })

        discrepancy_usd = abs(grand_total_debit_usd - grand_total_credit_usd)
        is_balanced = discrepancy_usd < Decimal("0.01")

        return {
            "report_name": "Multi-Currency General Ledger Trial Balance",
            "base_currency": "USD",
            "supported_currencies": ["USD", "SAR", "YER"],
            "is_balanced": is_balanced,
            "discrepancy_usd": float(discrepancy_usd.quantize(Decimal("0.01"))),
            "consolidated_totals": {
                "total_debit_usd": float(grand_total_debit_usd.quantize(Decimal("0.01"))),
                "total_credit_usd": float(grand_total_credit_usd.quantize(Decimal("0.01"))),
            },
            "native_totals": {
                c: {
                    "debit": float(native_totals[c]["debit"].quantize(Decimal("0.01"))),
                    "credit": float(native_totals[c]["credit"].quantize(Decimal("0.01"))),
                }
                for c in ["USD", "SAR", "YER"]
            },
            "active_rates": {k: float(v) for k, v in active_rates.items()},
            "accounts": account_results,
        }
