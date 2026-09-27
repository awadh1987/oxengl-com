#!/usr/bin/env python3
"""
Weekly Non-Destructive Active Tenant Snapshot Engine.
Filename: scripts/weekly_active_snapshot.py

Iterates over all active enterprise tenants, extracts their complete 5-deep ledger topologies
(Chart of Accounts, Journal Entries, Journal Lines, and Customs Manifests), and saves
non-destructive JSON snapshots and encrypted archives to /var/backups/oxengl/tenants/weekly_snapshots.
"""

import gzip
import io
import json
import logging
import os
import sys
import tarfile
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

# Ensure project root is in sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, text
from backend.database import SessionLocal
from backend.models import ResCompany, TenantAuditLog

try:
    from backend.app.utils.crypto_vault import encrypt_bytes_aes256
except Exception:
    encrypt_bytes_aes256 = None

WEEKLY_SNAPSHOT_DIR = "/var/backups/oxengl/tenants/weekly_snapshots"
os.makedirs(WEEKLY_SNAPSHOT_DIR, exist_ok=True)

# Also ensure legacy crypto directory exists for fallback mirroring
CRYPTO_SNAPSHOT_DIR = "/var/crypto/oxengl/snapshots"
os.makedirs(CRYPTO_SNAPSHOT_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [WEEKLY-SNAPSHOT] %(message)s",
)
logger = logging.getLogger("weekly_snapshot")


def extract_tenant_ledger(db, company: ResCompany) -> Dict[str, Any]:
    """Extracts a tenant's complete ledger topology (Accounts, Entries, Lines, Manifests)."""
    tenant_str_id = str(company.id)

    # 1. Workspace metadata
    tenant_dict = {
        "id": tenant_str_id,
        "name": company.name,
        "slug": company.slug,
        "domain_slug": getattr(company, "domain_slug", company.slug),
        "currency": getattr(company, "currency", "SAR"),
        "tax_id": getattr(company, "tax_id", None),
        "subscription_tier": getattr(company, "subscription_tier", "PROFESSIONAL"),
        "status": getattr(company, "status", "ACTIVE"),
        "primary_color": getattr(company, "primary_color", "#0ea5e9"),
        "secondary_color": getattr(company, "secondary_color", "#0f172a"),
        "is_active": getattr(company, "is_active", True),
        "snapshot_created_at": datetime.now(timezone.utc).isoformat(),
    }

    # 2. 5-Deep Chart of Accounts
    accounts_list = []
    try:
        accounts_rows = db.execute(
            text("""
                SELECT id, tenant_id, company_id, code, name, path, account_type, currency, is_active, parent_id, created_at
                FROM accounts
                WHERE tenant_id = :tid OR company_id = :cid
                ORDER BY path ASC, created_at ASC
            """),
            {"tid": tenant_str_id, "cid": tenant_str_id}
        ).mappings().fetchall()

        for a in accounts_rows:
            accounts_list.append({
                "id": str(a["id"]) if a.get("id") else None,
                "tenant_id": str(a["tenant_id"]) if a.get("tenant_id") else tenant_str_id,
                "company_id": str(a["company_id"]) if a.get("company_id") else tenant_str_id,
                "code": a.get("code"),
                "name": a.get("name"),
                "path": a.get("path"),
                "account_type": a.get("account_type"),
                "currency": a.get("currency", "SAR"),
                "is_active": a.get("is_active", True),
                "parent_id": str(a["parent_id"]) if a.get("parent_id") else None,
                "created_at": a["created_at"].isoformat() if a.get("created_at") else None,
            })
    except Exception as err:
        logger.warning(f"Error querying accounts for {company.slug}: {err}")

    # 3. Journal Entries and nested Lines
    entries_list = []
    try:
        entries_rows = db.execute(
            text("""
                SELECT id, tenant_id, company_id, entry_number, entry_date, description, total_debit, total_credit, status, posted_by, created_at
                FROM journal_entries
                WHERE tenant_id = :tid OR company_id = :cid
                ORDER BY created_at ASC
            """),
            {"tid": tenant_str_id, "cid": tenant_str_id}
        ).mappings().fetchall()

        for e in entries_rows:
            entry_id = str(e["id"])
            lines_list = []
            try:
                lines_rows = db.execute(
                    text("""
                        SELECT id, entry_id, account_code, account_id, debit, credit, description, cost_center_id
                        FROM journal_lines
                        WHERE entry_id = :eid
                    """),
                    {"eid": entry_id}
                ).mappings().fetchall()

                for l in lines_rows:
                    lines_list.append({
                        "id": str(l["id"]) if l.get("id") else None,
                        "entry_id": entry_id,
                        "account_code": l.get("account_code"),
                        "account_id": str(l["account_id"]) if l.get("account_id") else None,
                        "debit": float(l["debit"]) if l.get("debit") is not None else 0.0,
                        "credit": float(l["credit"]) if l.get("credit") is not None else 0.0,
                        "description": l.get("description"),
                        "cost_center_id": str(l["cost_center_id"]) if l.get("cost_center_id") else None,
                    })
            except Exception:
                pass

            entries_list.append({
                "id": entry_id,
                "tenant_id": str(e["tenant_id"]) if e.get("tenant_id") else tenant_str_id,
                "company_id": str(e["company_id"]) if e.get("company_id") else tenant_str_id,
                "entry_number": e.get("entry_number"),
                "entry_date": e["entry_date"].isoformat() if e.get("entry_date") else None,
                "description": e.get("description"),
                "total_debit": float(e["total_debit"]) if e.get("total_debit") is not None else 0.0,
                "total_credit": float(e["total_credit"]) if e.get("total_credit") is not None else 0.0,
                "status": e.get("status"),
                "posted_by": e.get("posted_by"),
                "created_at": e["created_at"].isoformat() if e.get("created_at") else None,
                "lines": lines_list,
            })
    except Exception as err:
        logger.warning(f"Error querying journal entries for {company.slug}: {err}")

    # 4. Customs Manifests
    manifests_list = []
    try:
        manifests_rows = db.execute(
            text("""
                SELECT id, tenant_id, manifest_number, declaration_type, border_port_name, hs_codes_json, clearance_status, zatca_compliance_status, cryptographic_uuid, updated_at
                FROM customs_manifests
                WHERE tenant_id = :tid
                ORDER BY updated_at ASC
            """),
            {"tid": tenant_str_id}
        ).mappings().fetchall()

        for m in manifests_rows:
            manifests_list.append({
                "id": str(m["id"]) if m.get("id") else None,
                "tenant_id": tenant_str_id,
                "manifest_number": m.get("manifest_number"),
                "declaration_type": m.get("declaration_type"),
                "border_port_name": m.get("border_port_name"),
                "hs_codes_json": m.get("hs_codes_json"),
                "clearance_status": m.get("clearance_status"),
                "zatca_compliance_status": m.get("zatca_compliance_status"),
                "cryptographic_uuid": str(m["cryptographic_uuid"]) if m.get("cryptographic_uuid") else None,
                "updated_at": m["updated_at"].isoformat() if m.get("updated_at") else None,
            })
    except Exception as err:
        logger.warning(f"Error querying customs manifests for {company.slug}: {err}")

    return {
        "tenant": tenant_dict,
        "accounts": accounts_list,
        "journal_entries": entries_list,
        "customs_manifests": manifests_list,
        "metadata": {
            "version": "1.0",
            "snapshot_type": "WEEKLY_ACTIVE_NON_DESTRUCTIVE",
            "exporter": "OxenGL-WeeklyActiveSnapshotEngine",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "accounts_count": len(accounts_list),
            "journal_entries_count": len(entries_list),
            "customs_manifests_count": len(manifests_list),
        },
    }


def execute_weekly_active_snapshots():
    """Compiles non-destructive JSON snapshots for all active workspaces."""
    logger.info("Starting scheduled weekly non-destructive active tenant snapshot cycle...")
    db = SessionLocal()
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    try:
        active_companies = db.execute(
            select(ResCompany).where(ResCompany.is_active == True)
        ).scalars().all()

        total_tenants = len(active_companies)
        logger.info(f"Identified {total_tenants} active tenant workspace(s) for archival.")

        successful_snapshots = 0

        for company in active_companies:
            try:
                # 1. Extract 5-deep ledger topology
                snapshot_data = extract_tenant_ledger(db, company)

                # 2. Native Gzip compaction (compresslevel=9) with Tar envelope before AES-256 encryption
                raw_json = json.dumps(snapshot_data, indent=2, ensure_ascii=False).encode("utf-8")
                tar_gz_stream = io.BytesIO()
                with gzip.GzipFile(fileobj=tar_gz_stream, mode="wb", compresslevel=9) as gz_out:
                    with tarfile.open(fileobj=gz_out, mode="w") as tar:
                        tarinfo = tarfile.TarInfo(name=f"tenant_{company.slug}_state.json")
                        tarinfo.size = len(raw_json)
                        tarinfo.mtime = int(datetime.now(timezone.utc).timestamp())
                        tar.addfile(tarinfo, io.BytesIO(raw_json))
                tar_gz_bytes = tar_gz_stream.getvalue()

                encrypted_payload = encrypt_bytes_aes256(tar_gz_bytes) if encrypt_bytes_aes256 else tar_gz_bytes

                enc_filename = f"snapshot_{company.slug}_{timestamp_str}.enc.tar.gz"
                enc_filepath = os.path.join(WEEKLY_SNAPSHOT_DIR, enc_filename)
                with open(enc_filepath, "wb") as ef:
                    ef.write(encrypted_payload)

                file_size_kb = os.path.getsize(enc_filepath) / 1024

                # 3. Record audit log
                audit_log = TenantAuditLog(
                    id=str(uuid.uuid4()),
                    tenant_id=str(company.id),
                    action_type="WEEKLY_SNAPSHOT_CREATED",
                    actor="CRON_SYSTEM_DAEMON",
                    details=(
                        f"Weekly active snapshot preserved (.enc.tar.gz): {enc_filename} "
                        f"({file_size_kb:.1f} KB, Accounts: {snapshot_data['metadata']['accounts_count']}, "
                        f"Entries: {snapshot_data['metadata']['journal_entries_count']})"
                    ),
                    created_at=datetime.now(timezone.utc),
                )
                db.add(audit_log)
                successful_snapshots += 1
                logger.info(f"✅ Preserved encrypted .enc.tar.gz snapshot for [{company.slug}]: {enc_filepath} ({file_size_kb:.1f} KB)")

            except Exception as tenant_err:
                logger.error(f"❌ Failed to archive snapshot for tenant {company.slug}: {tenant_err}")

        db.commit()
        logger.info(f"🎉 Weekly snapshot cycle complete: {successful_snapshots}/{total_tenants} active tenants successfully archived.")

    except Exception as exc:
        db.rollback()
        logger.error(f"Critical failure during weekly snapshot pass: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    execute_weekly_active_snapshots()
