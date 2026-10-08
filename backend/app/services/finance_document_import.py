"""Excel/CSV import for customer invoices and journal vouchers.

Recognised columns map to first-class fields; every other column is captured into the
document's ``custom_attributes`` and auto-registered as a tenant custom field definition.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, List

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import models
from backend.app.services.custom_fields import register_discovered_fields, sanitize_attributes, slugify_key

_INVOICE_COLUMNS: Dict[str, tuple] = {
    "invoice_number": ("invoice_number", "invoice_no", "invoice", "رقم الفاتورة"),
    "customer_name": ("customer_name", "customer", "client", "اسم العميل", "العميل"),
    "customer_tax_number": ("customer_tax_number", "tax_number", "vat_number", "الرقم الضريبي"),
    "issue_date": ("issue_date", "date", "invoice_date", "التاريخ", "تاريخ الفاتورة"),
    "due_date": ("due_date", "تاريخ الاستحقاق"),
    "subtotal": ("subtotal", "net", "amount", "المبلغ", "الإجمالي قبل الضريبة"),
    "vat_amount": ("vat_amount", "vat", "tax", "الضريبة", "ضريبة القيمة المضافة"),
    "grand_total": ("grand_total", "total", "الإجمالي", "المجموع"),
}
_VOUCHER_COLUMNS: Dict[str, tuple] = {
    "voucher_number": ("voucher_number", "voucher_no", "entry_number", "رقم السند"),
    "description": ("description", "narration", "البيان", "الوصف"),
    "entry_date": ("entry_date", "date", "التاريخ"),
    "account_code": ("account_code", "account", "رقم الحساب", "كود الحساب"),
    "debit": ("debit", "مدين"),
    "credit": ("credit", "دائن"),
}


def _dec(value: Any) -> Decimal:
    try:
        return Decimal(str(value).replace(",", "").strip() or "0")
    except Exception:
        return Decimal("0")


def _date(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).strip()[:19])
        return parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def split_row(raw: Dict[str, Any], columns: Dict[str, tuple]) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, str]]:
    """Return (known values, unrecognised column values, key->original label)."""
    lookup = {slugify_key(a): field for field, aliases in columns.items() for a in aliases}
    known: Dict[str, Any] = {}
    extras: Dict[str, Any] = {}
    labels: Dict[str, str] = {}
    for header, value in raw.items():
        key = slugify_key(header)
        if not key:
            continue
        field = lookup.get(key)
        if field:
            known.setdefault(field, value)
        elif value not in (None, ""):
            extras[key] = value
            labels[key] = str(header)
    return known, extras, labels


def _register(db: Session, company_id: uuid.UUID, entity: str, samples: Dict[str, Any], labels: Dict[str, str]) -> List[str]:
    if not samples:
        return []
    register_discovered_fields(db, company_id, entity, [(k, labels.get(k, k), v) for k, v in samples.items()])
    return sorted(samples)


def import_customer_invoices(db: Session, company_id: uuid.UUID, rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    imported = updated = 0
    errors: List[str] = []
    samples: Dict[str, Any] = {}
    labels: Dict[str, str] = {}
    for idx, raw in enumerate(rows):
        sp = db.begin_nested()
        try:
            known, extras, lbl = split_row(raw, _INVOICE_COLUMNS)
            number = str(known.get("invoice_number") or "").strip()
            name = str(known.get("customer_name") or "").strip()
            if not number or not name:
                sp.rollback()
                errors.append(f"Row {idx + 1}: invoice number and customer name are required")
                continue
            attrs = sanitize_attributes(extras)
            subtotal, vat = _dec(known.get("subtotal")), _dec(known.get("vat_amount"))
            grand = _dec(known.get("grand_total")) if known.get("grand_total") not in (None, "") else subtotal + vat
            inv = db.scalar(select(models.CustomerInvoice).where(
                models.CustomerInvoice.company_id == company_id, models.CustomerInvoice.invoice_number == number))
            if inv is None:
                inv = models.CustomerInvoice(
                    company_id=company_id, invoice_number=number, customer_name=name,
                    customer_tax_number=str(known.get("customer_tax_number") or "") or None,
                    issue_date=_date(known.get("issue_date")) or datetime.now(timezone.utc),
                    due_date=_date(known.get("due_date")), subtotal=subtotal, vat_amount=vat,
                    grand_total=grand, status="Draft", custom_attributes=attrs,
                )
                db.add(inv)
                imported += 1
            elif inv.status == "Draft":
                inv.custom_attributes = {**(inv.custom_attributes or {}), **attrs}
                updated += 1
            else:
                sp.rollback()
                errors.append(f"Row {idx + 1}: invoice {number} is not a draft")
                continue
            db.flush()
            sp.commit()
            samples.update(extras)
            labels.update(lbl)
        except Exception as exc:
            sp.rollback()
            errors.append(f"Row {idx + 1}: {exc}")
    keys = _register(db, company_id, "invoice", samples, labels)
    db.commit()
    return {"success": True, "imported_count": imported, "updated_count": updated, "errors": errors,
            "custom_field_keys": keys, "custom_fields_registered": len(keys)}


def import_journal_vouchers(db: Session, company_id: uuid.UUID, rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """Rows sharing a voucher number form one balanced voucher (one row per line)."""
    from backend.app.domains.finance.models import FinanceJournalEntry, FinanceJournalLine

    groups: Dict[str, Dict[str, Any]] = {}
    errors: List[str] = []
    samples: Dict[str, Any] = {}
    labels: Dict[str, str] = {}
    for idx, raw in enumerate(rows):
        known, extras, lbl = split_row(raw, _VOUCHER_COLUMNS)
        number = str(known.get("voucher_number") or "").strip()
        if not number or not known.get("account_code"):
            errors.append(f"Row {idx + 1}: voucher number and account code are required")
            continue
        g = groups.setdefault(number, {"description": "", "date": None, "lines": [], "extras": {}})
        g["description"] = g["description"] or str(known.get("description") or "")
        g["date"] = g["date"] or _date(known.get("entry_date"))
        g["lines"].append((str(known["account_code"]).strip(), _dec(known.get("debit")), _dec(known.get("credit")), known.get("description")))
        g["extras"].update(extras)
        samples.update(extras)
        labels.update(lbl)

    imported = 0
    for number, g in groups.items():
        debit = sum((l[1] for l in g["lines"]), Decimal("0"))
        credit = sum((l[2] for l in g["lines"]), Decimal("0"))
        if debit != credit or debit <= 0:
            errors.append(f"Voucher {number}: unbalanced or empty (debit {debit}, credit {credit})")
            continue
        if db.scalar(select(FinanceJournalEntry.id).where(FinanceJournalEntry.entry_number == number)):
            errors.append(f"Voucher {number}: already exists")
            continue
        sp = db.begin_nested()
        try:
            entry = FinanceJournalEntry(
                tenant_id=company_id, company_id=company_id, entry_number=number,
                description=(g["description"] or "Imported Voucher")[:255], total_debit=debit, total_credit=credit,
                status="SUCCESS", custom_attributes=sanitize_attributes(g["extras"]),
            )
            if g["date"]:
                entry.entry_date = g["date"]
            db.add(entry)
            db.flush()
            for code, dr, cr, desc in g["lines"]:
                db.add(FinanceJournalLine(tenant_id=company_id, entry_id=entry.id, account_code=code,
                                          description=str(desc or g["description"] or "Voucher line")[:255], debit=dr, credit=cr))
            sp.commit()
            imported += 1
        except Exception as exc:
            sp.rollback()
            errors.append(f"Voucher {number}: {exc}")
    keys = _register(db, company_id, "voucher", samples, labels)
    db.commit()
    return {"success": True, "imported_count": imported, "updated_count": 0, "errors": errors,
            "custom_field_keys": keys, "custom_fields_registered": len(keys)}
