#!/usr/bin/env python3
"""
OxenGL ERP — PostgreSQL to BigQuery Export Pipeline
=====================================================
Exports all ERP PostgreSQL tables to CSV, uploads to GCS, and loads into BigQuery.

Usage:
  python3 data-pipeline/scripts/pg_to_bigquery.py \
    --pg-host 127.0.0.1 --pg-db erp_db --pg-user postgres --pg-pass postgres \
    --gcs-bucket oxengl-erp-data \
    --bq-project project-587cf20f-74ef-484a-ba6 \
    --bq-dataset oxengl_raw \
    --tables core finance procurement inventory fleet hr tax \
    --export-dir /tmp/oxengl_export
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path


# ─── Table Domain Mappings ─────────────────────────────────────────────────
TABLE_DOMAINS = {
    "core": [
        "res_companies",
        "res_users",
        "res_partners",
        "tenants",
        "tenant_audit_logs",
        "tenant_documents",
        "tenant_users",
        "system_sequences",
    ],
    "finance": [
        "chart_of_accounts",
        "account_accounts",
        "account_journals",
        "account_moves",
        "account_move_lines",
        "finance_journal_entries",
        "finance_journal_lines",
        "customer_invoices",
        "invoices",
        "fiscal_years",
        "cost_centers",
        "exchange_rates",
        "supplier_settlements",
        "transporter_ledger",
    ],
    "procurement": [
        "purchase_orders",
        "purchase_order_lines",
        "purchase_requisitions",
        "purchase_requisition_lines",
        "purchasing_organizations",
        "vendor_bills",
        "vendors",
        "goods_receipts",
        "goods_receipt_batch_logs",
        "procurement_tenders",
        "tender_rfq_lines",
        "procurement_bids",
        "procurement_bid_lines",
        "vendor_portal_users",
        "approval_rules",
        "workflow_instances",
        "workflow_steps",
    ],
    "inventory": [
        "inventory_movements",
        "stock_quants",
        "stock_balances",
        "stock_moves",
        "stock_pickings",
        "warehouses",
        "warehouse_zones",
        "product_products",
        "materials",
        "stock_locations",
        "landed_cost_allocations",
        "landed_cost_items",
        "weighbridge_tickets",
    ],
    "fleet": [
        "vehicles",
        "waybills",
        "drivers",
        "gps_events",
        "fuel_transactions",
        "maintenance_work_orders",
        "part_requirements",
        "fleet_trips",
        "trip_inspection_logs",
        "yard_gate_appointments",
        "delivery_manifests",
        "delivery_proofs",
        "manifest_stops",
    ],
    "hr": [
        "employees",
        "attendance_logs",
        "hrms_attendance_logs",
        "payroll_runs",
    ],
    "tax": [
        "tax_profiles",
        "tax_rules",
        "zatca_logs",
        "supplier_invoices",
    ],
    "security": [
        "user_sessions",
        "login_attempts",
        "security_events",
        "security_tokens",
        "refresh_tokens",
        "device_registrations",
        "sync_queue_events",
    ],
    "ai": [
        "ai_knowledge_documents",
        "ai_knowledge_chunks",
        "ai_governance_logs",
        "ai_model_configs",
    ],
    "saas": [
        "subscription_plans",
        "tenant_subscriptions",
        "saas_invoices",
        "platform_audit_logs",
    ],
}


def get_tables_for_domains(domains: list[str]) -> list[str]:
    """Return flat list of table names for the given domain group(s)."""
    if "all" in domains:
        domains = list(TABLE_DOMAINS.keys())
    tables = []
    for d in domains:
        tables.extend(TABLE_DOMAINS.get(d, []))
    return tables


def export_table_to_csv(pg_conn_str: str, table: str, export_dir: Path) -> Path | None:
    """Export a single PostgreSQL table to CSV using psql COPY."""
    out_path = export_dir / f"{table}.csv"
    cmd = (
        f"PGPASSWORD={pg_conn_str['password']} psql "
        f"-h {pg_conn_str['host']} -p {pg_conn_str['port']} "
        f"-U {pg_conn_str['user']} -d {pg_conn_str['db']} "
        f"-c \"\\COPY (SELECT * FROM {table}) TO '{out_path}' WITH (FORMAT CSV, HEADER, ENCODING 'UTF8');\""
    )
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            if "does not exist" in result.stderr or "ERROR" in result.stderr:
                print(f"  ⚠ SKIP {table}: {result.stderr.strip()}")
                return None
        # Check if file has data
        if out_path.exists() and out_path.stat().st_size > 0:
            rows = sum(1 for _ in open(out_path)) - 1  # minus header
            print(f"  ✅ {table}: {rows} rows → {out_path.name}")
            return out_path
        else:
            print(f"  ⚠ SKIP {table}: empty table")
            return None
    except subprocess.TimeoutExpired:
        print(f"  ❌ TIMEOUT {table}")
        return None
    except Exception as e:
        print(f"  ❌ ERROR {table}: {e}")
        return None


def upload_to_gcs(local_path: Path, bucket: str, prefix: str) -> str:
    """Upload CSV to GCS using gsutil."""
    gcs_uri = f"gs://{bucket}/{prefix}/{local_path.name}"
    cmd = f"gsutil cp {local_path} {gcs_uri}"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
    if result.returncode == 0:
        print(f"  ☁️  Uploaded → {gcs_uri}")
        return gcs_uri
    else:
        print(f"  ❌ GCS upload failed: {result.stderr}")
        return ""


def load_to_bigquery(gcs_uri: str, bq_project: str, bq_dataset: str, table: str) -> bool:
    """Load CSV from GCS into BigQuery table."""
    bq_table = f"{bq_project}:{bq_dataset}.{table}"
    cmd = (
        f"bq load --autodetect --source_format=CSV "
        f"--allow_quoted_newlines --skip_leading_rows=1 "
        f"{bq_table} {gcs_uri}"
    )
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
    if result.returncode == 0:
        print(f"  📊 Loaded → {bq_table}")
        return True
    else:
        print(f"  ❌ BQ load failed: {result.stderr[:200]}")
        return False


def main():
    parser = argparse.ArgumentParser(description="OxenGL PostgreSQL → BigQuery Export Pipeline")
    parser.add_argument("--pg-host", default="127.0.0.1")
    parser.add_argument("--pg-port", default="5432")
    parser.add_argument("--pg-db", default="erp_db")
    parser.add_argument("--pg-user", default="postgres")
    parser.add_argument("--pg-pass", default="postgres")
    parser.add_argument("--gcs-bucket", default="oxengl-erp-data")
    parser.add_argument("--bq-project", default="project-587cf20f-74ef-484a-ba6")
    parser.add_argument("--bq-dataset", default="oxengl_raw")
    parser.add_argument("--tables", nargs="+", default=["all"], help="Domain groups: core, finance, procurement, etc.")
    parser.add_argument("--export-dir", default="/tmp/oxengl_export")
    parser.add_argument("--csv-only", action="store_true", help="Only export to CSV, skip GCS/BQ upload")
    args = parser.parse_args()

    export_dir = Path(args.export_dir)
    export_dir.mkdir(parents=True, exist_ok=True)

    pg_conn = {
        "host": args.pg_host,
        "port": args.pg_port,
        "db": args.pg_db,
        "user": args.pg_user,
        "password": args.pg_pass,
    }

    tables = get_tables_for_domains(args.tables)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    print("=" * 70)
    print(f"  OxenGL PostgreSQL → BigQuery Export Pipeline")
    print(f"  Timestamp: {timestamp}")
    print(f"  Tables: {len(tables)} across {len(args.tables)} domains")
    print(f"  Export Dir: {export_dir}")
    print("=" * 70)

    # Phase 1: Export PostgreSQL → CSV
    print(f"\n📦 Phase 1: Exporting PostgreSQL tables to CSV...")
    exported_files = {}
    for table in tables:
        path = export_table_to_csv(pg_conn, table, export_dir)
        if path:
            exported_files[table] = path

    print(f"\n✅ Exported {len(exported_files)}/{len(tables)} tables")

    if args.csv_only:
        print("\n🏁 CSV-only mode. Skipping GCS/BQ upload.")
        # Generate manifest
        manifest = {
            "timestamp": timestamp,
            "tables_exported": len(exported_files),
            "tables_total": len(tables),
            "files": {t: str(p) for t, p in exported_files.items()},
        }
        manifest_path = export_dir / "export_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"📋 Manifest: {manifest_path}")
        return

    # Phase 2: Upload to GCS
    print(f"\n☁️  Phase 2: Uploading to GCS ({args.gcs_bucket})...")
    gcs_uris = {}
    for table, path in exported_files.items():
        uri = upload_to_gcs(path, args.gcs_bucket, f"exports/{timestamp}")
        if uri:
            gcs_uris[table] = uri

    # Phase 3: Load into BigQuery
    print(f"\n📊 Phase 3: Loading into BigQuery ({args.bq_dataset})...")
    loaded = 0
    for table, uri in gcs_uris.items():
        if load_to_bigquery(uri, args.bq_project, args.bq_dataset, table):
            loaded += 1

    print("\n" + "=" * 70)
    print(f"  ✅ Pipeline Complete")
    print(f"  Exported: {len(exported_files)}/{len(tables)} tables")
    print(f"  Uploaded: {len(gcs_uris)}/{len(exported_files)} to GCS")
    print(f"  Loaded: {loaded}/{len(gcs_uris)} to BigQuery")
    print("=" * 70)


if __name__ == "__main__":
    main()
