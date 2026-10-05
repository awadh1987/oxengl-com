"""Helpers for tenant-scoped dynamic (JSONB ``custom_attributes``) form fields."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import models

# Public entity keys -> canonical entity name stored on definitions.
ENTITY_ALIASES: Dict[str, str] = {
    "partner": "partner",
    "customer": "partner",
    "crusher": "partner",
    "material_supplier": "partner",
    "transporter": "partner",
    "service_supplier": "partner",
    "supplier": "partner",
    "weighbridge_ticket": "weighbridge_ticket",
    "operation": "weighbridge_ticket",
    "fleet_trip": "fleet_trip",
    "trip": "fleet_trip",
    "invoice": "invoice",
    "customer_invoice": "invoice",
    "voucher": "voucher",
    "purchase_order": "purchase_order",
    "procurement": "purchase_order",
    "requisition": "purchase_order",
    "purchase_requisition": "purchase_order",
    "inventory_item": "inventory_item",
    "stock_item": "inventory_item",
    "stock_lot": "inventory_item",
    "warehouse_lot": "inventory_item",
    "employee": "employee",
    "hr_profile": "employee",
    "payroll": "employee",
    "payment_voucher": "voucher",
    "receipt_voucher": "voucher",
}
DATA_TYPES = ("text", "number", "date", "boolean", "select")
MAX_KEY_LEN = 96
MAX_VALUE_LEN = 2000
MAX_ATTRIBUTES = 200


def canonical_entity(entity: str) -> Optional[str]:
    return ENTITY_ALIASES.get(str(entity or "").strip().lower())


def slugify_key(raw: Any) -> str:
    key = re.sub(r"[^\w]+", "_", str(raw or "").strip().lower(), flags=re.UNICODE).strip("_")
    return key[:MAX_KEY_LEN]


def _json_scalar(value: Any) -> Any:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)[:MAX_VALUE_LEN]


def infer_data_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float, Decimal)):
        return "number"
    if isinstance(value, (datetime, date)):
        return "date"
    return "text"


def sanitize_attributes(attrs: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Normalise keys and restrict values to bounded JSON scalars."""
    clean: Dict[str, Any] = {}
    for raw_key, value in (attrs or {}).items():
        key = slugify_key(raw_key)
        if not key or len(clean) >= MAX_ATTRIBUTES:
            continue
        clean[key] = _json_scalar(value)
    return clean


def register_discovered_fields(
    db: Session,
    company_id: uuid.UUID,
    entity: str,
    fields: Iterable[tuple[str, str, Any]],
) -> int:
    """Create definitions (source=import) for unseen (key, label, sample_value) tuples. Tenant-scoped."""
    existing = {
        k
        for (k,) in db.execute(
            select(models.CustomFieldDefinition.field_key).where(
                models.CustomFieldDefinition.company_id == company_id,
                models.CustomFieldDefinition.entity == entity,
            )
        )
    }
    created = 0
    for key, label, sample in fields:
        if not key or key in existing:
            continue
        db.add(
            models.CustomFieldDefinition(
                company_id=company_id,
                entity=entity,
                field_key=key,
                label=str(label)[:255] or key,
                data_type=infer_data_type(sample),
                source="import",
                sort_order=len(existing) + created,
            )
        )
        existing.add(key)
        created += 1
    if created:
        db.flush()
    return created
