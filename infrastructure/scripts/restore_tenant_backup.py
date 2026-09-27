#!/usr/bin/env python3
"""
Pre-Purge Tenant Archival Reconstitution & Restoration Engine.
Filename: scripts/restore_tenant_backup.py

Safely reads pre-purge JSON snapshots (or .enc.tar.gz encrypted archives),
recreates the res_companies row, and re-injects the complete 5-deep Chart of Accounts,
Journal Entries, Journal Lines, and Customs Manifests inside a unified atomic transaction.
"""

import argparse
import glob
import io
import json
import logging
import os
import sys
import tarfile
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Ensure project root is in sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, text
from backend.database import SessionLocal
from backend.models import ResCompany, TenantAuditLog

try:
    from backend.app.utils.crypto_vault import decrypt_bytes_aes256
except Exception:
    decrypt_bytes_aes256 = None

BACKUP_DIR = "/var/crypto/oxengl/backups"

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [RESTORE] %(message)s",
)
logger = logging.getLogger("tenant_restore")


def load_backup_payload(file_path: str) -> Dict[str, Any]:
    """Reads either a raw pre-purge JSON file or an AES-256-GCM encrypted .enc.tar.gz archive."""
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"Backup file not found at: {file_path}")

    logger.info(f"Loading backup payload from: {file_path}")

    # Handle encrypted tar.gz
    if file_path.endswith(".enc.tar.gz"):
        if not decrypt_bytes_aes256:
            raise RuntimeError("Cryptographic vault utility is required to decrypt .enc.tar.gz archives.")
        with open(file_path, "rb") as f:
            encrypted_data = f.read()
        decrypted_bytes = decrypt_bytes_aes256(encrypted_data)
        tar_stream = io.BytesIO(decrypted_bytes)
        with tarfile.open(fileobj=tar_stream, mode="r:gz") as tar:
            json_member = next((m for m in tar.getmembers() if m.name.endswith(".json")), None)
            if not json_member:
                raise ValueError("Corrupted archive: No JSON topology member found inside tarball.")
            extracted_file = tar.extractfile(json_member)
            if not extracted_file:
                raise ValueError("Unable to read topology member from archive.")
            return json.loads(extracted_file.read().decode("utf-8"))

    # Handle raw JSON
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def restore_tenant_from_backup(
    file_path: str,
    slug_override: Optional[str] = None,
    name_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes the full restoration lifecycle inside a single atomic database transaction.
    Recreates res_companies, 5-deep Chart of Accounts, Journal Entries + Lines, and Customs Manifests.
    """
    payload = load_backup_payload(file_path)

    tenant_data = payload.get("tenant", {})
    accounts_data = payload.get("accounts", [])
    entries_data = payload.get("journal_entries", [])
    manifests_data = payload.get("customs_manifests", [])

    original_slug = tenant_data.get("slug") or "restored_tenant"
    target_slug = (slug_override or original_slug).strip().lower()
    target_name = (name_override or tenant_data.get("name") or target_slug).strip()

    db = SessionLocal()
    try:
        with db.begin():
            # 1. Resolve / allocate res_companies record
            existing_company = db.execute(
                select(ResCompany).where(ResCompany.slug == target_slug)
            ).scalar_one_or_none()

            if existing_company:
                logger.warning(f"Tenant with slug '{target_slug}' already exists (ID: {existing_company.id}). Reusing existing tenant container.")
                tenant_id = existing_company.id
                existing_company.is_active = True
                existing_company.status = "ACTIVE"
                existing_company.primary_color = tenant_data.get("primary_color", existing_company.primary_color or "#0ea5e9")
                existing_company.secondary_color = tenant_data.get("secondary_color", existing_company.secondary_color or "#0f172a")
            else:
                try:
                    tenant_id = uuid.UUID(str(tenant_data.get("id")))
                except (ValueError, TypeError):
                    tenant_id = uuid.uuid4()

                # Check UUID collision
                uuid_check = db.execute(select(ResCompany).where(ResCompany.id == tenant_id)).scalar_one_or_none()
                if uuid_check:
                    tenant_id = uuid.uuid4()

                existing_name = db.execute(select(ResCompany).where(ResCompany.name == target_name)).scalar_one_or_none()
                if existing_name:
                    target_name = f"{target_name} (Restored {uuid.uuid4().hex[:4].upper()})"

                new_company = ResCompany(
                    id=tenant_id,
                    name=target_name,
                    slug=target_slug,
                    domain_slug=target_slug,
                    currency=tenant_data.get("currency", "SAR"),
                    tax_id=tenant_data.get("tax_id"),
                    subscription_tier=tenant_data.get("subscription_tier", "PROFESSIONAL"),
                    is_active=True,
                    status="ACTIVE",
                    primary_color=tenant_data.get("primary_color", "#0ea5e9"),
                    secondary_color=tenant_data.get("secondary_color", "#0f172a"),
                )
                db.add(new_company)
                db.flush()
                logger.info(f"✅ Recreated res_companies row: '{target_name}' [{target_slug}] (UUID: {tenant_id})")

            tenant_id_str = str(tenant_id)

            # 2. Re-inject 5-Deep Chart of Accounts
            # Sort accounts by path length / parent existence so root accounts are seeded before children
            def sort_key(acc):
                path = acc.get("path") or ""
                return (len(path.split(".")), path)

            sorted_accounts = sorted(accounts_data, key=sort_key)
            inserted_accounts = 0

            for acc in sorted_accounts:
                acc_code = acc.get("code")
                if not acc_code:
                    continue

                acc_id = acc.get("id") or str(uuid.uuid4())
                parent_id = acc.get("parent_id")

                # Upsert account
                db.execute(
                    text("""
                        INSERT INTO accounts (id, tenant_id, company_id, code, name, path, account_type, currency, is_active, parent_id, created_at)
                        VALUES (:id, :tid, :cid, :code, :name, :path, :account_type, :currency, :is_active, :parent_id, :created_at)
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            path = EXCLUDED.path,
                            account_type = EXCLUDED.account_type,
                            is_active = EXCLUDED.is_active;
                    """),
                    {
                        "id": acc_id,
                        "tid": tenant_id_str,
                        "cid": tenant_id_str,
                        "code": acc_code,
                        "name": acc.get("name", "Account"),
                        "path": acc.get("path", "1"),
                        "account_type": acc.get("account_type", "ASSET"),
                        "currency": acc.get("currency", "SAR"),
                        "is_active": acc.get("is_active", True),
                        "parent_id": parent_id,
                        "created_at": datetime.now(timezone.utc),
                    }
                )
                inserted_accounts += 1

            logger.info(f"✅ Re-injected {inserted_accounts} Chart of Accounts nodes.")

            # 3. Re-inject Journal Entries & Lines
            inserted_entries = 0
            inserted_lines = 0

            for entry in entries_data:
                entry_id = entry.get("id") or str(uuid.uuid4())
                db.execute(
                    text("""
                        INSERT INTO journal_entries (id, tenant_id, company_id, entry_number, entry_date, description, total_debit, total_credit, status, posted_by, created_at)
                        VALUES (:id, :tid, :cid, :entry_number, :entry_date, :description, :total_debit, :total_credit, :status, :posted_by, :created_at)
                        ON CONFLICT (id) DO UPDATE SET
                            description = EXCLUDED.description,
                            total_debit = EXCLUDED.total_debit,
                            total_credit = EXCLUDED.total_credit;
                    """),
                    {
                        "id": entry_id,
                        "tid": tenant_id_str,
                        "cid": tenant_id_str,
                        "entry_number": entry.get("entry_number", f"JE-{uuid.uuid4().hex[:6].upper()}"),
                        "entry_date": entry.get("entry_date") or datetime.now(timezone.utc).date().isoformat(),
                        "description": entry.get("description", "Restored journal entry"),
                        "total_debit": entry.get("total_debit", 0.0),
                        "total_credit": entry.get("total_credit", 0.0),
                        "status": entry.get("status", "POSTED"),
                        "posted_by": entry.get("posted_by", "RESTORE_SCRIPT"),
                        "created_at": datetime.now(timezone.utc),
                    }
                )
                inserted_entries += 1

                for line in entry.get("lines", []):
                    line_id = line.get("id") or str(uuid.uuid4())
                    db.execute(
                        text("""
                            INSERT INTO journal_lines (id, entry_id, account_code, account_id, debit, credit, description, cost_center_id)
                            VALUES (:id, :entry_id, :account_code, :account_id, :debit, :credit, :description, :cost_center_id)
                            ON CONFLICT (id) DO NOTHING;
                        """),
                        {
                            "id": line_id,
                            "entry_id": entry_id,
                            "account_code": line.get("account_code", "10000"),
                            "account_id": line.get("account_id"),
                            "debit": line.get("debit", 0.0),
                            "credit": line.get("credit", 0.0),
                            "description": line.get("description", ""),
                            "cost_center_id": line.get("cost_center_id"),
                        }
                    )
                    inserted_lines += 1

            logger.info(f"✅ Re-injected {inserted_entries} Journal Entries and {inserted_lines} Journal Lines.")

            # 4. Re-inject Customs Manifests
            inserted_manifests = 0
            for manifest in manifests_data:
                man_id = manifest.get("id") or str(uuid.uuid4())
                db.execute(
                    text("""
                        INSERT INTO customs_manifests (id, tenant_id, manifest_number, declaration_type, border_port_name, hs_codes_json, clearance_status, zatca_compliance_status, cryptographic_uuid, updated_at)
                        VALUES (:id, :tid, :manifest_number, :declaration_type, :border_port_name, :hs_codes_json, :clearance_status, :zatca_compliance_status, :cryptographic_uuid, :updated_at)
                        ON CONFLICT (id) DO UPDATE SET
                            clearance_status = EXCLUDED.clearance_status,
                            zatca_compliance_status = EXCLUDED.zatca_compliance_status;
                    """),
                    {
                        "id": man_id,
                        "tid": tenant_id_str,
                        "manifest_number": manifest.get("manifest_number", f"MAN-{uuid.uuid4().hex[:6].upper()}"),
                        "declaration_type": manifest.get("declaration_type", "IMPORT"),
                        "border_port_name": manifest.get("border_port_name", "Jeddah Islamic Port"),
                        "hs_codes_json": json.dumps(manifest.get("hs_codes_json") or []),
                        "clearance_status": manifest.get("clearance_status", "CLEARED"),
                        "zatca_compliance_status": manifest.get("zatca_compliance_status", "COMPLIANT"),
                        "cryptographic_uuid": manifest.get("cryptographic_uuid") or str(uuid.uuid4()),
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                inserted_manifests += 1

            logger.info(f"✅ Re-injected {inserted_manifests} Customs Manifests.")

            # 5. Insert Audit Log
            audit_entry = TenantAuditLog(
                id=str(uuid.uuid4()),
                tenant_id=str(tenant_id),
                action_type="TENANT_RESTORED_CLI",
                actor="RESTORE_SCRIPT",
                details=f"Tenant '{target_name}' [{target_slug}] restored from {os.path.basename(file_path)}: {inserted_accounts} accounts, {inserted_entries} entries, {inserted_manifests} manifests.",
                created_at=datetime.now(timezone.utc),
            )
            db.add(audit_entry)

        logger.info(f"🎉 Transaction committed successfully! Tenant '{target_name}' [{target_slug}] fully reconstituted.")

        return {
            "status": "success",
            "tenant_id": str(tenant_id),
            "name": target_name,
            "slug": target_slug,
            "reconstituted_counts": {
                "accounts": inserted_accounts,
                "journal_entries": inserted_entries,
                "journal_lines": inserted_lines,
                "customs_manifests": inserted_manifests,
            },
        }

    except Exception as exc:
        logger.error(f"❌ Atomic restoration transaction failed and was rolled back: {exc}")
        raise
    finally:
        db.close()


def list_available_backups():
    """Enumerates all JSON and encrypted archives located in the central backup repository."""
    print("\n📦 Available Tenant Backup Snapshots:")
    print("-" * 75)
    files = sorted(glob.glob(f"{BACKUP_DIR}/pre_purge_*.json") + glob.glob(f"{BACKUP_DIR}/purge_*.enc.tar.gz"))
    if not files:
        print("  (No pre-purge JSON or encrypted snapshot archives found in /var/crypto/oxengl/backups)")
        return

    for idx, fpath in enumerate(files, start=1):
        size_kb = os.path.getsize(fpath) / 1024
        mtime = datetime.fromtimestamp(os.path.getmtime(fpath)).strftime("%Y-%m-%d %H:%M:%S")
        print(f"  [{idx}] {os.path.basename(fpath)}  ({size_kb:.1f} KB, Modified: {mtime})")
    print("-" * 75)


def main():
    parser = argparse.ArgumentParser(description="OxenGL Pre-Purge Tenant Archival Reconstitution Engine")
    parser.add_argument("--file", "-f", help="Path to pre-purge JSON backup file or .enc.tar.gz archive")
    parser.add_argument("--slug", "-s", help="Override destination domain slug for the reconstituted tenant")
    parser.add_argument("--name", "-n", help="Override company name for the reconstituted tenant")
    parser.add_argument("--list", "-l", action="store_true", help="List available archives in backup repository")

    args = parser.parse_args()

    if args.list:
        list_available_backups()
        return

    if not args.file:
        list_available_backups()
        print("\nSpecify a file to restore using --file <path>")
        sys.exit(1)

    result = restore_tenant_from_backup(
        file_path=args.file,
        slug_override=args.slug,
        name_override=args.name,
    )
    print("\nRestoration Result Summary:")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
