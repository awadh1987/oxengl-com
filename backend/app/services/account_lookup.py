"""Account / phone resolution helpers for password recovery.

Searches the per-tenant ``<schema>.users`` tables (only when they actually expose a phone column) and the
public identity tables. All identifiers reaching SQL are either bound parameters or quoted schema/column names
that were validated against ``information_schema``.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("oxengl.account_lookup")

PHONE_COLUMNS = ("phone", "mobile_number", "mobile", "phone_number")
_SCHEMA_RE = re.compile(r"^[A-Za-z0-9_]{1,63}$")
_PHONE_RE = re.compile(r"^\+?[0-9][0-9 ()\-.]{5,24}$")

# (table, phone column) pairs in the public schema.
PUBLIC_PHONE_TABLES = (
    ("public.tenant_users", "mobile_number"),
    ("public.master_users", "mobile_number"),
    ("public.res_users", "phone"),
)


def looks_like_phone(identifier: str) -> bool:
    value = (identifier or "").strip()
    return "@" not in value and bool(_PHONE_RE.fullmatch(value))


def phone_digits(identifier: str) -> str:
    """Digits only; a leading '00' international prefix is folded away."""
    digits = re.sub(r"\D", "", identifier or "")
    return digits[2:] if digits.startswith("00") else digits


def _rollback(db: Session) -> None:
    try:
        db.rollback()
    except Exception:
        pass


def tenant_phone_columns(db: Session, schema: str) -> list[str]:
    """Phone-like columns that exist on ``<schema>.users`` (empty if the table/schema is absent)."""
    if not _SCHEMA_RE.fullmatch(schema or ""):
        return []
    try:
        rows = db.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = :s AND table_name = 'users' AND column_name = ANY(:cols)"
            ),
            {"s": schema, "cols": list(PHONE_COLUMNS)},
        ).scalars().all()
    except Exception:
        _rollback(db)
        return []
    return [c for c in PHONE_COLUMNS if c in set(rows)]


def find_phone_for_email(db: Session, schemas: Iterable[str], email: str) -> Optional[str]:
    """Phone number of the account with this email inside any of the tenant schemas, or None."""
    for schema in dict.fromkeys(schemas):
        for column in tenant_phone_columns(db, schema):
            try:
                row = db.execute(
                    text(f'SELECT "{column}" AS phone FROM "{schema}".users WHERE LOWER(email) = :e LIMIT 1'),
                    {"e": email},
                ).first()
            except Exception:
                _rollback(db)
                continue
            if row and row[0]:
                return str(row[0])
    return None


def _match_sql(table: str, column: str) -> str:
    return (
        f"SELECT LOWER(email) AS email, {column} AS phone FROM {table} "
        f"WHERE {column} IS NOT NULL AND regexp_replace({column}::text, '[^0-9]', '', 'g') IN (:d1, :d2) LIMIT 3"
    )


def find_account_by_phone(db: Session, schemas: Iterable[str], identifier: str) -> Optional[dict[str, Any]]:
    """Resolve a phone number to ``{"email", "phone"}``.

    Returns None when nothing matches or when the number is ambiguous (several distinct accounts), so a shared
    number can never be used to reset somebody else's password.
    """
    digits = phone_digits(identifier)
    if len(digits) < 6:
        return None
    # Tolerate stored numbers written with or without the leading national zero / country code prefix.
    params = {"d1": digits, "d2": digits.lstrip("0") or digits}
    matches: dict[str, str] = {}

    def collect(sql: str) -> None:
        try:
            for row in db.execute(text(sql), params).mappings().all():
                if row["email"]:
                    matches[str(row["email"]).strip().lower()] = str(row["phone"])
        except Exception:
            _rollback(db)

    for schema in dict.fromkeys(schemas):
        for column in tenant_phone_columns(db, schema):
            collect(_match_sql(f'"{schema}".users', f'"{column}"'))
    if not matches:
        for table, column in PUBLIC_PHONE_TABLES:
            collect(_match_sql(table, column))
    if len(matches) != 1:
        if len(matches) > 1:
            logger.warning("Phone recovery identifier matched multiple accounts; refusing to resolve")
        return None
    email, phone = next(iter(matches.items()))
    return {"email": email, "phone": phone}
