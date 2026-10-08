"""Excel/CSV import for purchase orders, inventory items and employees.

Recognised columns map to first-class fields; every other column is captured into the
record's ``custom_attributes`` and auto-registered as a tenant custom field definition.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, List

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import models
from backend.app.services.custom_fields import sanitize_attributes
from backend.app.services.finance_document_import import _date, _dec, _register, split_row

_PO_COLUMNS: Dict[str, tuple] = {
    "po_number": ("po_number", "po_no", "po", "purchase_order", "رقم أمر الشراء"),
    "supplier_name": ("supplier_name", "supplier", "vendor", "vendor_name", "المورد", "اسم المورد"),
    "order_date": ("order_date", "date", "التاريخ", "تاريخ الأمر"),
    "expected_delivery_date": ("expected_delivery_date", "delivery_date", "تاريخ التسليم"),
    "currency": ("currency", "العملة"),
    "subtotal": ("subtotal", "net", "amount", "المبلغ"),
    "tax_amount": ("tax_amount", "vat", "tax", "الضريبة"),
    "total_amount": ("total_amount", "total", "الإجمالي"),
    "notes": ("notes", "remarks", "ملاحظات"),
}
_ITEM_COLUMNS: Dict[str, tuple] = {
    "sku": ("sku", "item_code", "code", "كود الصنف", "رمز الصنف"),
    "name": ("name", "item_name", "description", "اسم الصنف", "الصنف"),
    "base_uom": ("base_uom", "uom", "unit", "الوحدة"),
    "secondary_uom": ("secondary_uom", "الوحدة الثانوية"),
    "conversion_factor": ("conversion_factor", "معامل التحويل"),
    "reorder_point": ("reorder_point", "نقطة إعادة الطلب"),
    "maximum_stock": ("maximum_stock", "max_stock", "الحد الأقصى"),
    "standard_cost": ("standard_cost", "cost", "unit_cost", "التكلفة"),
}
_EMPLOYEE_COLUMNS: Dict[str, tuple] = {
    "employee_code": ("employee_code", "employee_id", "emp_code", "employee_number", "الرقم الوظيفي"),
    "first_name": ("first_name", "الاسم الأول"),
    "last_name": ("last_name", "الاسم الأخير", "العائلة"),
    "full_name": ("name", "full_name", "employee_name", "الاسم", "اسم الموظف"),
    "department": ("department", "dept", "القسم"),
    "job_title": ("job_title", "title", "position", "المسمى الوظيفي"),
    "hire_date": ("hire_date", "join_date", "تاريخ التعيين"),
    "base_salary": ("base_salary", "salary", "basic_salary", "الراتب الأساسي", "الراتب"),
    "nationality": ("nationality", "الجنسية"),
    "personal_mobile": ("mobile", "phone", "personal_mobile", "الجوال"),
    "personal_email": ("email", "personal_email", "البريد الإلكتروني"),
}


def _success(imported: int, updated: int, errors: List[str], keys: List[str]) -> Dict[str, Any]:
    return {"success": True, "imported_count": imported, "updated_count": updated, "errors": errors,
            "custom_field_keys": keys, "custom_fields_registered": len(keys)}


def import_purchase_orders(db: Session, company_id: uuid.UUID, rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    from backend.app.services.sequence_service import SequenceService

    imported = updated = 0
    errors: List[str] = []
    samples: Dict[str, Any] = {}
    labels: Dict[str, str] = {}
    for idx, raw in enumerate(rows):
        sp = db.begin_nested()
        is_new = False
        try:
            known, extras, lbl = split_row(raw, _PO_COLUMNS)
            supplier = str(known.get("supplier_name") or "").strip()
            if not supplier:
                sp.rollback()
                errors.append(f"Row {idx + 1}: supplier name is required")
                continue
            attrs = sanitize_attributes(extras)
            number = str(known.get("po_number") or "").strip()
            po = None
            if number:
                po = db.scalar(select(models.PurchaseOrder).where(
                    models.PurchaseOrder.company_id == company_id, models.PurchaseOrder.po_number == number))
            if po is not None:
                if po.status != "draft":
                    sp.rollback()
                    errors.append(f"Row {idx + 1}: purchase order {number} is not a draft")
                    continue
                po.custom_attributes = {**(po.custom_attributes or {}), **attrs}
                is_new = False
            else:
                partner = db.scalar(select(models.ResPartner).where(
                    models.ResPartner.company_id == company_id, models.ResPartner.name == supplier))
                if partner is None:
                    partner = models.ResPartner(company_id=company_id, name=supplier, partner_type="supplier")
                    db.add(partner)
                    db.flush()
                subtotal, tax = _dec(known.get("subtotal")), _dec(known.get("tax_amount"))
                total = _dec(known.get("total_amount")) if known.get("total_amount") not in (None, "") else subtotal + tax
                if not number:
                    number = SequenceService.get_next_sequence(db, company_id, "purchase_order")
                po = models.PurchaseOrder(
                    company_id=company_id, po_number=number, partner_id=partner.id,
                    order_date=_date(known.get("order_date")) or datetime.now().astimezone(),
                    expected_delivery_date=_date(known.get("expected_delivery_date")),
                    currency=(str(known.get("currency") or "SAR").strip().upper() or "SAR")[:3],
                    subtotal=subtotal, tax_amount=tax, total_amount=total,
                    notes=str(known.get("notes") or "") or None, status="draft", custom_attributes=attrs,
                )
                db.add(po)
                is_new = True
            db.flush()
            sp.commit()
            imported, updated = (imported + 1, updated) if is_new else (imported, updated + 1)
            samples.update(extras)
            labels.update(lbl)
        except Exception as exc:
            sp.rollback()
            errors.append(f"Row {idx + 1}: {exc}")
    keys = _register(db, company_id, "purchase_order", samples, labels)
    db.commit()
    return _success(imported, updated, errors, keys)


def import_stock_items(db: Session, company_id: uuid.UUID, rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    imported = updated = 0
    errors: List[str] = []
    samples: Dict[str, Any] = {}
    labels: Dict[str, str] = {}
    for idx, raw in enumerate(rows):
        sp = db.begin_nested()
        is_new = False
        try:
            known, extras, lbl = split_row(raw, _ITEM_COLUMNS)
            sku = str(known.get("sku") or "").strip()
            name = str(known.get("name") or "").strip()
            if len(sku) < 2 or len(name) < 2:
                sp.rollback()
                errors.append(f"Row {idx + 1}: SKU and item name are required")
                continue
            attrs = sanitize_attributes(extras)
            item = db.scalar(select(models.StockItem).where(
                models.StockItem.company_id == company_id, models.StockItem.sku == sku))
            if item is not None:
                item.custom_attributes = {**(item.custom_attributes or {}), **attrs}
                is_new = False
            else:
                uom = str(known.get("base_uom") or "kg").strip()[:32] or "kg"
                product = db.scalar(select(models.ProductProduct).where(models.ProductProduct.sku == sku))
                if product is not None and product.company_id != company_id:
                    raise ValueError(f"SKU {sku} is already used by another record")
                if product is None:
                    product = models.ProductProduct(
                        company_id=company_id, sku=sku, name=name, unit_of_measure=uom,
                        standard_cost=_dec(known.get("standard_cost")))
                    db.add(product)
                    db.flush()
                conversion = _dec(known.get("conversion_factor"))
                db.add(models.StockItem(
                    company_id=company_id, product_id=product.id, sku=sku, name=name, base_uom=uom,
                    secondary_uom=str(known.get("secondary_uom") or "") or None,
                    conversion_factor=conversion if conversion > 0 else Decimal("1"),
                    reorder_point=_dec(known.get("reorder_point")), maximum_stock=_dec(known.get("maximum_stock")),
                    custom_attributes=attrs,
                ))
                is_new = True
            db.flush()
            sp.commit()
            imported, updated = (imported + 1, updated) if is_new else (imported, updated + 1)
            samples.update(extras)
            labels.update(lbl)
        except Exception as exc:
            sp.rollback()
            errors.append(f"Row {idx + 1}: {exc}")
    keys = _register(db, company_id, "inventory_item", samples, labels)
    db.commit()
    return _success(imported, updated, errors, keys)


def import_employees(
    db: Session, tenant_id: uuid.UUID, rows: Iterable[Dict[str, Any]], seats_available: int | None = None
) -> Dict[str, Any]:
    from backend.app.domains.hr.models import Employee

    imported = updated = 0
    errors: List[str] = []
    samples: Dict[str, Any] = {}
    labels: Dict[str, str] = {}
    for idx, raw in enumerate(rows):
        sp = db.begin_nested()
        is_new = False
        try:
            known, extras, lbl = split_row(raw, _EMPLOYEE_COLUMNS)
            code = str(known.get("employee_code") or "").strip()
            first = str(known.get("first_name") or "").strip()
            last = str(known.get("last_name") or "").strip()
            full = str(known.get("full_name") or "").strip()
            if full and not first:
                first, _, rest = full.partition(" ")
                last = last or rest.strip()
            if not code or not first:
                sp.rollback()
                errors.append(f"Row {idx + 1}: employee code and name are required")
                continue
            attrs = sanitize_attributes(extras)
            emp = db.scalar(select(Employee).where(Employee.employee_code == code))
            if emp is not None:
                if emp.tenant_id != tenant_id:
                    raise ValueError(f"employee code {code} is already in use")
                emp.custom_attributes = {**(emp.custom_attributes or {}), **attrs}
                is_new = False
            else:
                if seats_available is not None and imported >= seats_available:
                    raise ValueError("subscription seat cap exceeded")
                hired = _date(known.get("hire_date"))
                salary = _dec(known.get("base_salary"))
                db.add(Employee(
                    tenant_id=tenant_id, employee_code=code, first_name=first, last_name=last or "-",
                    department=str(known.get("department") or "General").strip() or "General",
                    job_title=str(known.get("job_title") or "") or None,
                    nationality=str(known.get("nationality") or "") or None,
                    personal_mobile=str(known.get("personal_mobile") or "") or None,
                    personal_email=str(known.get("personal_email") or "") or None,
                    base_salary=salary, hire_date=hired.date() if hired else date.today(),
                    is_active=True, custom_attributes=attrs,
                ))
                is_new = True
            db.flush()
            sp.commit()
            imported, updated = (imported + 1, updated) if is_new else (imported, updated + 1)
            samples.update(extras)
            labels.update(lbl)
        except Exception as exc:
            sp.rollback()
            errors.append(f"Row {idx + 1}: {exc}")
    keys = _register(db, tenant_id, "employee", samples, labels)
    db.commit()
    return _success(imported, updated, errors, keys)


async def read_import_rows(request) -> list:
    """Parse rows from a multipart Excel/CSV upload or a JSON body."""
    from fastapi import HTTPException, status

    from backend.app.services.bulk_import_service import stream_raw_rows_from_csv, stream_raw_rows_from_excel

    content_type = request.headers.get("content-type", "").lower()
    rows = None
    if "multipart/form-data" in content_type:
        form = await request.form()
        upload = form.get("file")
        if upload is not None and hasattr(upload, "read"):
            content = await upload.read()
            filename = (getattr(upload, "filename", "") or "").lower()
            rows = stream_raw_rows_from_excel(content) if filename.endswith((".xlsx", ".xls")) else stream_raw_rows_from_csv(content)
    else:
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON payload: {exc}")
        if isinstance(body, list):
            rows = body
        elif isinstance(body, dict):
            rows = body.get("records") or body.get("rows") or body.get("items")
    if rows is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No rows or file provided for bulk import")
    return list(rows)
