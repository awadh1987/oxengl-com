#!/usr/bin/env python3
"""
Maintenance Daemon: Automated Stale Schema Compaction & Purge Script
Environment: Multi-Tenant Monolith System Stack (OxenGL Engine)
Safely discovers physical PostgreSQL schemas and removes dangling, unmapped development partitions.
"""

import logging
import os
import re
import sys
from pathlib import Path

# Add backend to Python path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from sqlalchemy import create_engine, text
from backend.database import get_database_url

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [schema-purge-daemon]: %(message)s"
)
logger = logging.getLogger("oxengl.schema_purge")

# Protected system and production schemas that must NEVER be touched under any condition
IMMUTABLE_SCHEMAS = {
    "public",
    "information_schema",
    "pg_catalog",
    "pg_toast",
    "tiger",
    "topology",
    "myon",
    "way_ye",
    "way-ye",
    "tenant_company_alpha",
}

def sanitize_identifier(name: str) -> str:
    """Sanitize schema identifier to prevent SQL injection."""
    return re.sub(r'[^a-zA-Z0-9_\-]', '', name)

def get_active_tenant_schemas(conn) -> set[str]:
    """Extract active tenant schemas from public.tenants, master_tenants, and res_companies."""
    active_schemas = set(IMMUTABLE_SCHEMAS)

    # 1. Fetch from public.tenants
    try:
        rows = conn.execute(text("SELECT schema_name FROM public.tenants WHERE is_active = true;")).fetchall()
        for r in rows:
            if r[0]:
                raw = r[0].strip()
                active_schemas.add(raw)
                active_schemas.add(raw.replace("-", "_"))
                active_schemas.add(raw.replace("_", "-"))
    except Exception as e:
        logger.warning(f"Could not read public.tenants: {e}")

    # 2. Fetch from master_tenants
    try:
        rows = conn.execute(text("SELECT slug FROM master_tenants WHERE status = 'active';")).fetchall()
        for r in rows:
            if r[0]:
                raw = r[0].strip()
                active_schemas.add(raw)
                active_schemas.add(raw.replace("-", "_"))
                active_schemas.add(raw.replace("_", "-"))
    except Exception as e:
        logger.warning(f"Could not read master_tenants: {e}")

    # 3. Fetch from res_companies
    try:
        rows = conn.execute(text("SELECT slug, domain_slug FROM res_companies WHERE is_active = true OR status = 'ACTIVE';")).fetchall()
        for r in rows:
            for s in [r[0], r[1]]:
                if s:
                    raw = s.strip()
                    active_schemas.add(raw)
                    active_schemas.add(raw.replace("-", "_"))
                    active_schemas.add(raw.replace("_", "-"))
    except Exception as e:
        logger.warning(f"Could not read res_companies: {e}")

    return active_schemas

def run_schema_purge():
    """Main execution routine for stale schema pruning."""
    db_url = get_database_url()
    logger.info("Initializing connection to OxenGL database engine...")
    engine = create_engine(db_url, pool_pre_ping=True)

    with engine.begin() as conn:
        # Retrieve all physical schemas
        all_schemas_res = conn.execute(
            text("SELECT schema_name FROM information_schema.schemata;")
        ).fetchall()
        physical_schemas = [r[0] for r in all_schemas_res]

        active_schemas = get_active_tenant_schemas(conn)
        logger.info(f"Verified {len(active_schemas)} protected active schema descriptors.")

        purged_count = 0
        preserved_count = 0

        for schema in physical_schemas:
            if schema.startswith("pg_") or schema in IMMUTABLE_SCHEMAS:
                preserved_count += 1
                continue

            if schema in active_schemas:
                logger.info(f"Preserving active tenant partition: '{schema}'")
                preserved_count += 1
                continue

            # Schema is unmapped and stale: drop safely
            clean_schema = sanitize_identifier(schema)
            logger.warning(f"Purging unmapped stale schema partition: '{clean_schema}'")
            try:
                conn.execute(text(f'DROP SCHEMA IF EXISTS "{clean_schema}" CASCADE;'))
                purged_count += 1
            except Exception as drop_err:
                logger.error(f"Failed to drop schema '{clean_schema}': {drop_err}")

        logger.info("=" * 60)
        logger.info(f"COMPACTION SUMMARY: {purged_count} stale schemas dropped, {preserved_count} live schemas preserved.")
        logger.info("=" * 60)

if __name__ == "__main__":
    run_schema_purge()
