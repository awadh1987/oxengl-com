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


def export_table_to_csv(pg_conn_str: dict, table: str, export_dir: Path) -> Path | None:
    """Export a single PostgreSQL table to CSV using psycopg2 COPY or psql COPY."""
    out_path = export_dir / f"{table}.csv"
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=pg_conn_str["host"],
            port=pg_conn_str["port"],
            user=pg_conn_str["user"],
            password=pg_conn_str["password"],
            dbname=pg_conn_str["db"],
            connect_timeout=10,
        )
        cur = conn.cursor()
        with open(out_path, "w", encoding="utf-8") as f:
            cur.copy_expert(f"COPY (SELECT * FROM {table}) TO STDOUT WITH (FORMAT CSV, HEADER, ENCODING 'UTF8')", f)
        cur.close()
        conn.close()
        if out_path.exists() and out_path.stat().st_size > 0:
            rows = sum(1 for _ in open(out_path, encoding="utf-8")) - 1
            if rows >= 0:
                print(f"  ✅ {table}: {rows} rows → {out_path.name}")
                return out_path
        print(f"  ⚠ SKIP {table}: empty table")
        return None
    except Exception as e:
        # Fallback to psql command if available
        cmd = (
            f"PGPASSWORD={pg_conn_str['password']} psql "
            f"-h {pg_conn_str['host']} -p {pg_conn_str['port']} "
            f"-U {pg_conn_str['user']} -d {pg_conn_str['db']} "
            f"-c \"\\COPY (SELECT * FROM {table}) TO '{out_path}' WITH (FORMAT CSV, HEADER, ENCODING 'UTF8');\""
        )
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
            if result.returncode == 0 and out_path.exists() and out_path.stat().st_size > 0:
                rows = sum(1 for _ in open(out_path, encoding="utf-8")) - 1
                print(f"  ✅ {table}: {rows} rows → {out_path.name}")
                return out_path
            else:
                print(f"  ⚠ SKIP {table}: {e}")
                return None
        except Exception:
            print(f"  ❌ ERROR {table}: {e}")
            return None


gcs_available = True


def upload_to_gcs(local_path: Path, bucket: str, prefix: str) -> str:
    """Upload CSV to GCS using gsutil."""
    global gcs_available
    if not gcs_available:
        return ""
    gcs_uri = f"gs://{bucket}/{prefix}/{local_path.name}"
    cmd = f"/home/ahmed_awadh/google-cloud-sdk/bin/gsutil cp {local_path} {gcs_uri}"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
    if result.returncode == 0:
        print(f"  ☁️  Uploaded → {gcs_uri}")
        return gcs_uri
    else:
        if "does not exist" in result.stderr or "BucketNotFoundException" in result.stderr:
            gcs_available = False
            print(f"  ⚠ GCS bucket gs://{bucket} unavailable. Using direct local BigQuery load.")
        return ""


def load_to_bigquery(source_target: str, bq_project: str, bq_dataset: str, table: str) -> bool:
    """Load CSV (from GCS or local file) into BigQuery table."""
    bq_table = f"{bq_project}:{bq_dataset}.{table}"
    bq_bin = "/home/ahmed_awadh/google-cloud-sdk/bin/bq" if Path("/home/ahmed_awadh/google-cloud-sdk/bin/bq").exists() else "bq"
    cmd = (
        f"{bq_bin} load --project_id={bq_project} --label datacloud:antigravity --replace "
        f"--autodetect --source_format=CSV "
        f"--allow_quoted_newlines --skip_leading_rows=1 "
        f"{bq_table} {source_target}"
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
    default_user = os.getenv("PLATFORM_DB_USER") or os.getenv("DB_USER") or "oxengl_platform"
    default_pass = os.getenv("PLATFORM_DB_PASSWORD") or os.getenv("DB_PASSWORD") or "e0872cf6893fbdae77100ea7ad740cac0bbe21682af989f9307921a21a9953e0"

    parser.add_argument("--pg-host", default=os.getenv("DB_HOST", "127.0.0.1"))
    parser.add_argument("--pg-port", default=os.getenv("DB_PORT", "5432"))
    parser.add_argument("--pg-db", default=os.getenv("DB_NAME", "erp_db"))
    parser.add_argument("--pg-user", default=default_user)
    parser.add_argument("--pg-pass", default=default_pass)
    parser.add_argument("--skip-gcs", action="store_true", default=True, help="Load directly into BigQuery without GCS")
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
    from datetime import timezone
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

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
    gcs_uris = {}
    if not args.skip_gcs:
        print(f"\n☁️  Phase 2: Uploading to GCS ({args.gcs_bucket})...")
        for table, path in exported_files.items():
            uri = upload_to_gcs(path, args.gcs_bucket, f"exports/{timestamp}")
            if uri:
                gcs_uris[table] = uri
    else:
        print("\n⚡ Direct BigQuery load enabled (skipping GCS upload).")

    # Phase 3: Load into BigQuery
    print(f"\n📊 Phase 3: Loading into BigQuery ({args.bq_dataset})...")
    targets = gcs_uris if gcs_uris else exported_files
    loaded = 0
    for table, src in targets.items():
        if load_to_bigquery(str(src), args.bq_project, args.bq_dataset, table):
            loaded += 1

    print("\n" + "=" * 70)
    print(f"  ✅ Pipeline Complete")
    print(f"  Exported: {len(exported_files)}/{len(tables)} tables")
    print(f"  Loaded: {loaded}/{len(targets)} to BigQuery")
    print("=" * 70)


if __name__ == "__main__":
    main()
