"""
OxenGL Universal Auto-Sequence Engine (REM-SEQ-01).
Centralized, tenant-isolated, concurrent-safe sequence generator for:
- Procurement (Purchase Orders: PO-{YYYY}-{XXXX})
- HR (Employees: EMP-{XXXX})
- Finance (Invoices: INV-{YYYY}-{XXXXX}, Vouchers: JV-{YYYY}-{XXXXX})
- Operations (Scale Tickets: TKT-{YYYY}-{XXXXX}, Waybills: WB-{YYYY}-{XXXXX}, Manifests: MAN-{YYYY}-{XXXXX})
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("oxengl.sequence_service")

# Entity configurations defining default prefixes, patterns, and fiscal year tracking
DEFAULT_ENTITY_CONFIGS: Dict[str, Dict[str, Any]] = {
    "purchase_order": {
        "prefix": "PO",
        "pattern": "PO-{YYYY}-{XXXX}",
        "track_fiscal_year": True,
        "table": "purchase_orders",
        "column": "po_number",
    },
    "employee": {
        "prefix": "EMP",
        "pattern": "EMP-{XXXX}",
        "track_fiscal_year": False,
        "table": "employees",
        "column": "employee_code",
    },
    "customer_invoice": {
        "prefix": "INV",
        "pattern": "INV-{YYYY}-{XXXXX}",
        "track_fiscal_year": True,
        "table": "customer_invoices",
        "column": "invoice_number",
    },
    "supplier_invoice": {
        "prefix": "SI",
        "pattern": "SI-{YYYY}-{XXXXX}",
        "track_fiscal_year": True,
        "table": "supplier_invoices",
        "column": "invoice_number",
    },
    "voucher": {
        "prefix": "JV",
        "pattern": "JV-{YYYY}-{XXXXX}",
        "track_fiscal_year": True,
        "table": "finance_journal_entries",
        "column": "entry_number",
    },
    "ticket": {
        "prefix": "TKT",
        "pattern": "TKT-{YYYY}-{XXXXX}",
        "track_fiscal_year": True,
        "table": "weighbridge_tickets",
        "column": "ticket_number",
    },
    "waybill": {
        "prefix": "WB",
        "pattern": "WB-{YYYY}-{XXXXX}",
        "track_fiscal_year": True,
        "table": "waybills",
        "column": "waybill_number",
    },
    "scale_ticket": {
        "prefix": "ST",
        "pattern": "ST-{YYYY}-{XXXXX}",
        "track_fiscal_year": True,
        "table": "weighbridge_tickets",
        "column": "ticket_number",
    },
    "customs_manifest": {
        "prefix": "MAN",
        "pattern": "MAN-{YYYY}-{XXXXX}",
        "track_fiscal_year": True,
        "table": "customs_manifests",
        "column": "manifest_number",
    },
    "tender_rfq": {
        "prefix": "RFQ",
        "pattern": "RFQ-{YYYY}{MM}-{XXXX}",
        "track_fiscal_year": True,
        "table": "procurement_tenders",
        "column": "tender_number",
    },
}

ALIAS_MAP: Dict[str, str] = {
    "po": "purchase_order",
    "pos": "purchase_order",
    "purchase_orders": "purchase_order",
    "purchaseorder": "purchase_order",
    "emp": "employee",
    "employees": "employee",
    "hr": "employee",
    "hr_employee": "employee",
    "personnel": "employee",
    "inv": "customer_invoice",
    "invoice": "customer_invoice",
    "invoices": "customer_invoice",
    "customer_invoices": "customer_invoice",
    "customerinvoice": "customer_invoice",
    "si": "supplier_invoice",
    "supplier_invoices": "supplier_invoice",
    "supplierinvoice": "supplier_invoice",
    "vendor_bill": "supplier_invoice",
    "bill": "supplier_invoice",
    "jv": "voucher",
    "vch": "voucher",
    "vouchers": "voucher",
    "journal_entry": "voucher",
    "financial_voucher": "voucher",
    "tkt": "ticket",
    "tickets": "ticket",
    "weighbridge": "ticket",
    "weighbridge_ticket": "ticket",
    "wb": "waybill",
    "waybills": "waybill",
    "st": "scale_ticket",
    "scale_tickets": "scale_ticket",
    "scale_ticket_no": "scale_ticket",
    "scaleticketno": "scale_ticket",
    "loading_invoice": "supplier_invoice",
    "loading_invoice_no": "supplier_invoice",
    "loadinginvoiceno": "supplier_invoice",
    "receipt_invoice": "customer_invoice",
    "receipt_invoice_no": "customer_invoice",
    "receiptinvoiceno": "customer_invoice",
    "manifest": "customs_manifest",
    "manifests": "customs_manifest",
    "customs_manifests": "customs_manifest",
    "rfq": "tender_rfq",
    "tender": "tender_rfq",
    "tenders": "tender_rfq",
    "tender_rfq": "tender_rfq",
}


def normalize_entity_type(raw_type: str) -> str:
    cleaned = raw_type.strip().lower().replace("-", "_").replace(" ", "_")
    return ALIAS_MAP.get(cleaned, cleaned)


def format_sequence(
    pattern: str,
    prefix: str,
    seq: int,
    year: int,
    month: int,
) -> str:
    """Safely formats a sequence number using format tokens."""
    res = pattern
    res = res.replace("{prefix}", prefix)
    res = res.replace("{YYYY}", f"{year:04d}")
    res = res.replace("{YY}", f"{year % 100:02d}")
    res = res.replace("{MM}", f"{month:02d}")
    res = res.replace("{XXXXXX}", f"{seq:06d}")
    res = res.replace("{XXXXX}", f"{seq:05d}")
    res = res.replace("{XXXX}", f"{seq:04d}")
    res = res.replace("{XXX}", f"{seq:03d}")

    # Fallback to python string format if standard format specifiers exist
    if "{seq" in res or "{num" in res:
        try:
            res = res.format(prefix=prefix, YYYY=year, YY=year % 100, MM=month, seq=seq, num=seq)
        except Exception:
            pass
    return res


class SequenceService:
    """Authoritative tenant-isolated sequence generator with PostgreSQL row-level concurrency protection."""

    @classmethod
    def ensure_table(cls, db: Session) -> None:
        """Guarantees the system_sequences table and composite unique index exist."""
        try:
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS system_sequences (
                    id UUID PRIMARY KEY,
                    tenant_id VARCHAR(100) NOT NULL,
                    entity_type VARCHAR(50) NOT NULL,
                    prefix VARCHAR(20) NOT NULL,
                    current_value BIGINT NOT NULL DEFAULT 0,
                    format_pattern VARCHAR(100) NOT NULL DEFAULT '{prefix}-{YYYY}-{XXXX}',
                    fiscal_year INTEGER NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_entity_fiscal 
                ON system_sequences (tenant_id, entity_type, COALESCE(fiscal_year, 0));
            """))
            db.commit()
        except Exception as e:
            db.rollback()
            logger.debug(f"system_sequences DDL check: {e}")

    @classmethod
    def get_next_sequence(
        cls,
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        entity_type: str,
        custom_prefix: Optional[str] = None,
        custom_pattern: Optional[str] = None,
    ) -> str:
        """
        Atomically increments and returns the next formatted sequence ID for the specified entity and tenant.
        Prevents race conditions using PostgreSQL row-level locks (ON CONFLICT DO UPDATE ... RETURNING).
        """
        norm_type = normalize_entity_type(entity_type)
        cfg = DEFAULT_ENTITY_CONFIGS.get(norm_type, {
            "prefix": norm_type[:4].upper(),
            "pattern": f"{norm_type[:4].upper()}-{{YYYY}}-{{XXXX}}",
            "track_fiscal_year": True,
            "table": None,
            "column": None,
        })

        prefix = custom_prefix or cfg["prefix"]
        pattern = custom_pattern or cfg["pattern"]
        track_year = cfg.get("track_fiscal_year", True)

        now = datetime.now(timezone.utc)
        fiscal_year = now.year if track_year else None
        tenant_str = str(tenant_id) if tenant_id else "global_tenant"

        upsert_stmt = text("""
            INSERT INTO system_sequences (
                id, tenant_id, entity_type, prefix, current_value, format_pattern, fiscal_year, created_at, updated_at
            )
            VALUES (
                :id, :tenant_id, :entity_type, :prefix, 1, :format_pattern, :fiscal_year, NOW(), NOW()
            )
            ON CONFLICT (tenant_id, entity_type, COALESCE(fiscal_year, 0))
            DO UPDATE SET
                current_value = system_sequences.current_value + 1,
                updated_at = NOW()
            RETURNING current_value, prefix, format_pattern;
        """)

        # Execute atomic row-locked UPSERT with collision safety
        max_attempts = 100
        for _ in range(max_attempts):
            row = db.execute(upsert_stmt, {
                "id": uuid.uuid4(),
                "tenant_id": tenant_str,
                "entity_type": norm_type,
                "prefix": prefix,
                "format_pattern": pattern,
                "fiscal_year": fiscal_year,
            }).fetchone()

            if not row:
                raise RuntimeError(f"Failed to generate sequence for {norm_type} in tenant {tenant_str}")

            current_val = int(row[0])
            active_prefix = row[1] or prefix
            active_pattern = row[2] or pattern

            formatted_id = format_sequence(
                pattern=active_pattern,
                prefix=active_prefix,
                seq=current_val,
                year=now.year,
                month=now.month,
            )

            # Check if this ID already exists in the destination table (avoid legacy collision)
            target_table = cfg.get("table")
            target_col = cfg.get("column")
            if target_table and target_col:
                try:
                    exists_stmt = text(f"SELECT 1 FROM {target_table} WHERE {target_col} = :seq_val LIMIT 1")
                    exists = db.execute(exists_stmt, {"seq_val": formatted_id}).scalar()
                    if exists:
                        # Existing record conflicts with this number, loop and increment again
                        continue
                except Exception as check_err:
                    logger.debug(f"Sequence collision check bypass: {check_err}")

            return formatted_id

        # Fallback if loop exceeded
        return format_sequence(pattern, prefix, current_val, now.year, now.month)

    @classmethod
    def preview_next_sequence(
        cls,
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        entity_type: str,
    ) -> str:
        """Returns what the next formatted sequence would be without mutating state."""
        norm_type = normalize_entity_type(entity_type)
        cfg = DEFAULT_ENTITY_CONFIGS.get(norm_type, {
            "prefix": norm_type[:4].upper(),
            "pattern": f"{norm_type[:4].upper()}-{{YYYY}}-{{XXXX}}",
            "track_fiscal_year": True,
        })
        prefix = cfg["prefix"]
        pattern = cfg["pattern"]
        track_year = cfg.get("track_fiscal_year", True)
        now = datetime.now(timezone.utc)
        fiscal_year = now.year if track_year else None
        tenant_str = str(tenant_id) if tenant_id else "global_tenant"

        query_stmt = text("""
            SELECT current_value, prefix, format_pattern
            FROM system_sequences
            WHERE tenant_id = :tenant_id 
              AND entity_type = :entity_type
              AND COALESCE(fiscal_year, 0) = COALESCE(:fiscal_year, 0)
            LIMIT 1;
        """)
        row = db.execute(query_stmt, {
            "tenant_id": tenant_str,
            "entity_type": norm_type,
            "fiscal_year": fiscal_year,
        }).fetchone()

        current_val = int(row[0]) if row else 0
        next_val = current_val + 1
        active_prefix = row[1] if row and row[1] else prefix
        active_pattern = row[2] if row and row[2] else pattern

        return format_sequence(
            pattern=active_pattern,
            prefix=active_prefix,
            seq=next_val,
            year=now.year,
            month=now.month,
        )


# Global helper shortcuts
def get_next_sequence(
    db: Session,
    tenant_id: Union[str, uuid.UUID],
    entity_type: str,
    custom_prefix: Optional[str] = None,
    custom_pattern: Optional[str] = None,
) -> str:
    """Convenience functional wrapper for SequenceService.get_next_sequence."""
    return SequenceService.get_next_sequence(
        db=db,
        tenant_id=tenant_id,
        entity_type=entity_type,
        custom_prefix=custom_prefix,
        custom_pattern=custom_pattern,
    )
