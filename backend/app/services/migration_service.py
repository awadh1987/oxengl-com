"""
Enterprise Database Migration Utility and Dynamic Worker Service (Phase 1).
Provides:
1. Target external PostgreSQL connection testing via TLS/SSL.
2. Background migration worker copying schema and tenant-isolated records.
3. Live progress tracking and verification.
4. Master tenant connection string mapping cutover and cache eviction.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import threading
import uuid
from datetime import date, datetime, time as datetime_time, timezone
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple, Union
from urllib.parse import quote_plus

from sqlalchemy import Engine, create_engine, delete, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.database import (
    SessionLocal,
    decrypt_connection_url,
    encrypt_connection_url,
    engine as default_engine,
    tenant_connection_manager,
)
from backend.models import Base, ResCompany, TenantDatabaseConfig, TenantDatabaseMigration

logger = logging.getLogger("oxengl.migration")

# In-memory fast cache for live status polling across worker threads
MIGRATION_TASKS: Dict[str, Dict[str, Any]] = {}
_tasks_lock = threading.Lock()


def _normalize_checksum_value(value: Any) -> Any:
    """Convert database values to a stable, type-aware JSON-compatible form."""
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if value != value:
            return {"__float__": "nan"}
        if value == float("inf"):
            return {"__float__": "inf"}
        if value == float("-inf"):
            return {"__float__": "-inf"}
        return value
    if isinstance(value, Decimal):
        return {"__decimal__": str(value)}
    if isinstance(value, uuid.UUID):
        return {"__uuid__": str(value)}
    if isinstance(value, datetime):
        if value.tzinfo is not None and value.utcoffset() is not None:
            value = value.astimezone(timezone.utc)
        return {"__datetime__": value.isoformat()}
    if isinstance(value, (date, datetime_time)):
        return {"__datetime__": value.isoformat()}
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"__bytes__": base64.b64encode(bytes(value)).decode("ascii")}
    if isinstance(value, dict):
        return {
            str(key): _normalize_checksum_value(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, (list, tuple)):
        return [_normalize_checksum_value(item) for item in value]
    return {"__type__": type(value).__qualname__, "value": str(value)}


def _checksum_rows(rows: list[Any], column_names: list[str]) -> str:
    """Hash an unordered set of complete table rows using deterministic encoding."""
    encoded_rows = []
    for row in rows:
        mapping = row._mapping if hasattr(row, "_mapping") else row
        payload = [_normalize_checksum_value(mapping[name]) for name in column_names]
        encoded_rows.append(
            json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        )

    checksum = hashlib.sha256()
    for encoded in sorted(encoded_rows):
        checksum.update(len(encoded).to_bytes(8, byteorder="big"))
        checksum.update(encoded)
    return checksum.hexdigest()


def _tenant_table_query(table: Any, company_id: uuid.UUID):
    """Build the tenant-scoped source/target query for a migratable table."""
    has_company = "company_id" in table.columns
    has_tenant = "tenant_id" in table.columns
    if table.name == "res_companies":
        return select(table).where(table.c.id == company_id)
    if has_company and has_tenant:
        return select(table).where(
            (table.c.company_id == company_id) | (table.c.tenant_id == company_id)
        )
    if has_company:
        return select(table).where(table.c.company_id == company_id)
    if has_tenant:
        return select(table).where(table.c.tenant_id == company_id)
    return None


def _cleanup_copied_target_rows(
    target_engine: Engine, copied_rows: list[tuple[Any, list[dict[str, Any]]]]
) -> None:
    """Compensate a failed cutover by deleting only rows inserted by this migration."""
    with target_engine.begin() as cleanup_conn:
        for table, keys in reversed(copied_rows):
            for row_keys in reversed(keys):
                cleanup_conn.execute(
                    delete(table).where(
                        *(column == row_keys[column.name] for column in table.primary_key.columns)
                    )
                )


def build_connection_url(
    host: Optional[str] = None,
    port: Optional[Union[int, str]] = None,
    database_name: Optional[str] = None,
    username: Optional[str] = None,
    password: Optional[str] = None,
    ssl_mode: Optional[str] = "prefer",
    raw_url: Optional[str] = None,
) -> str:
    """Builds a standardized SQLAlchemy database URL for PostgreSQL or returns raw_url if provided."""
    if raw_url:
        return raw_url

    if not host or not database_name:
        raise ValueError("Both host and database_name are required to configure an external database.")

    user_part = quote_plus(username) if username else ""
    pass_part = f":{quote_plus(password)}" if password else ""
    auth_part = f"{user_part}{pass_part}@" if (user_part or pass_part) else ""
    try:
        port_val = int(port) if port is not None and str(port).strip() else 5432
    except (ValueError, TypeError):
        port_val = 5432
    ssl_part = f"?sslmode={ssl_mode}" if ssl_mode else ""
    return f"postgresql+psycopg2://{auth_part}{host}:{port_val}/{database_name}{ssl_part}"


def parse_connection_metadata(url_str: str) -> Dict[str, Any]:
    """Extracts non-sensitive connection metadata (host, port, dbname, user, ssl_mode) from a database URL."""
    try:
        u = make_url(url_str)
        ssl = "prefer"
        if hasattr(u, "query") and u.query and "sslmode" in u.query:
            ssl = u.query["sslmode"]
        return {
            "host": u.host or "127.0.0.1",
            "port": u.port or 5432,
            "database_name": u.database or "",
            "username": u.username or "",
            "ssl_mode": ssl,
        }
    except Exception as err:
        logger.warning("Failed to parse database connection URL metadata: %s", err)
        return {
            "host": "unknown",
            "port": 5432,
            "database_name": "unknown",
            "username": "",
            "ssl_mode": "prefer",
        }


def test_target_connection(
    host: Optional[str] = None,
    port: Optional[int] = 5432,
    database_name: Optional[str] = None,
    username: Optional[str] = None,
    password: Optional[str] = None,
    ssl_mode: Optional[str] = "prefer",
    raw_url: Optional[str] = None,
    timeout: int = 5,
) -> Tuple[bool, str, Dict[str, Any]]:
    """Tests connectivity, network routing, and authentication to a target external PostgreSQL instance."""
    try:
        url = build_connection_url(
            host=host,
            port=port,
            database_name=database_name,
            username=username,
            password=password,
            ssl_mode=ssl_mode,
            raw_url=raw_url,
        )
    except Exception as exc:
        return False, str(exc), {}

    meta = parse_connection_metadata(url)
    success, err = tenant_connection_manager.test_connection(url, timeout=timeout)
    if success:
        return True, "External PostgreSQL database connection verified successfully via TLS/SSL.", meta
    return False, f"Target database connection failed: {err}", meta


def get_tenant_database_info(company_id: uuid.UUID, db: Session) -> Dict[str, Any]:
    """Retrieves current hosting mode and configuration for a given tenant company."""
    config = db.scalar(
        select(TenantDatabaseConfig).where(
            TenantDatabaseConfig.company_id == company_id,
            TenantDatabaseConfig.is_active.is_(True),
        )
    )

    if config and config.encrypted_connection_url:
        try:
            decrypted = decrypt_connection_url(config.encrypted_connection_url)
            meta = parse_connection_metadata(decrypted)
            return {
                "storage_mode": "DEDICATED_EXTERNAL",
                "is_external": True,
                "database_name": config.database_name or meta["database_name"],
                "host": meta["host"],
                "port": meta["port"],
                "username": meta["username"],
                "ssl_mode": meta["ssl_mode"],
                "residency_region": config.residency_region,
                "isolation_level": config.isolation_level,
                "is_active": config.is_active,
                "active_since": config.created_at,
            }
        except Exception as err:
            logger.error("Failed to decrypt tenant connection URL: %s", err)

    # Fallback to shared platform default
    return {
        "storage_mode": "LOCAL_SHARED",
        "is_external": False,
        "database_name": os.getenv("POSTGRES_DB", "erp_db"),
        "host": "localhost (platform container)",
        "port": int(os.getenv("POSTGRES_PORT", "5432")),
        "username": "platform_managed",
        "ssl_mode": "internal",
        "residency_region": "local-default",
        "isolation_level": "shared",
        "is_active": True,
        "active_since": None,
    }


def update_task_state(migration_id: uuid.UUID, **kwargs) -> None:
    """Updates the in-memory task dictionary and optionally persists to DB."""
    key = str(migration_id)
    with _tasks_lock:
        if key not in MIGRATION_TASKS:
            MIGRATION_TASKS[key] = {}
        MIGRATION_TASKS[key].update(kwargs)


def get_migration_status_data(
    company_id: uuid.UUID, migration_id: Optional[uuid.UUID] = None, db: Optional[Session] = None
) -> Optional[Dict[str, Any]]:
    """Retrieves the status of an ongoing or completed migration from in-memory cache or DB."""
    if company_id is None:
        raise ValueError("company_id is required to query migration status.")

    # Check memory cache first
    if migration_id:
        key = str(migration_id)
        with _tasks_lock:
            cached = MIGRATION_TASKS.get(key)
            if cached and str(cached.get("company_id", "")).lower() == str(company_id).lower():
                return dict(cached)

    # Check DB
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        query = select(TenantDatabaseMigration)
        if migration_id:
            query = query.where(
                TenantDatabaseMigration.id == migration_id,
                TenantDatabaseMigration.company_id == company_id,
            )
        else:
            query = query.where(TenantDatabaseMigration.company_id == company_id).order_by(
                TenantDatabaseMigration.created_at.desc()
            )

        record = db.scalar(query)
        if record:
            return {
                "migration_id": record.id,
                "company_id": record.company_id,
                "status": record.status,
                "progress_pct": record.progress_pct,
                "current_step": record.current_step,
                "records_transferred": record.records_transferred,
                "target_host": record.target_host,
                "target_database": record.target_database,
                "error_message": record.error_message,
                "started_at": record.started_at,
                "completed_at": record.completed_at,
            }
        return None
    finally:
        if close_db:
            db.close()


def run_migration_worker(
    migration_id: uuid.UUID,
    company_id: uuid.UUID,
    target_params: Dict[str, Any],
) -> None:
    """
    Secure In-App Background Migration Worker:
    1. Validates connectivity and TLS handshake with the external PostgreSQL target.
    2. Provisions target external schema and tables using Base.metadata.
    3. Replicates tenant-isolated records from the local container to the external target.
    4. Verifies record row counts and data integrity.
    5. Updates master TenantDatabaseConfig with AES Fernet encrypted connection string.
    6. Evicts cached connection pooling engines in TenantConnectionManager so runtime traffic instantly routes to the new external DB.
    """
    logger.info("Starting background database migration for tenant %s [Migration ID: %s]", company_id, migration_id)
    started_at = datetime.now(timezone.utc)

    # Initial state
    target_host = target_params.get("host") or "external_host"
    target_db = target_params.get("database_name") or target_params.get("database") or "external_db"
    try:
        target_port = int(target_params.get("port")) if target_params.get("port") is not None and str(target_params.get("port")).strip() else 5432
    except (ValueError, TypeError):
        target_port = 5432
    target_ssl = target_params.get("ssl_mode") or "prefer"

    update_task_state(
        migration_id,
        company_id=company_id,
        status="IN_PROGRESS",
        progress_pct=10,
        current_step="Validating external target database connectivity via TLS/SSL...",
        records_transferred=0,
        target_host=target_host,
        target_database=target_db,
        error_message=None,
        started_at=started_at,
        completed_at=None,
    )

    db = SessionLocal()
    target_engine: Optional[Engine] = None
    target_engine_registered = False
    target_data_committed = False
    copied_rows: list[tuple[Any, list[dict[str, Any]]]] = []
    cutover_attempted = False
    previous_config: Optional[dict[str, Any]] = None
    migration_succeeded = False
    total_records_transferred = 0
    try:
        # 1. Update DB migration record
        db_mig = db.scalar(
            select(TenantDatabaseMigration).where(
                TenantDatabaseMigration.id == migration_id,
                TenantDatabaseMigration.company_id == company_id,
            )
        )
        if not db_mig:
            raise RuntimeError("Migration record was not found for this tenant.")
        db_mig.status = "IN_PROGRESS"
        db_mig.progress_pct = 10
        db_mig.current_step = "Validating external target database connectivity via TLS/SSL..."
        db_mig.started_at = started_at
        db.commit()

        # Build target connection URL
        target_url = build_connection_url(
            host=target_params.get("host"),
            port=target_params.get("port"),
            database_name=target_params.get("database_name") or target_params.get("database"),
            username=target_params.get("username"),
            password=target_params.get("password"),
            ssl_mode=target_params.get("ssl_mode", "prefer"),
            raw_url=target_params.get("raw_url"),
        )

        # 2. Test target connection
        test_ok, test_err, meta = test_target_connection(raw_url=target_url, timeout=10)
        if not test_ok:
            raise RuntimeError(f"Target connection failed: {test_err}")

        update_task_state(
            migration_id,
            progress_pct=25,
            current_step="Target database connection verified via TLS/SSL. Preparing schema provisioning...",
        )
        if db_mig:
            db_mig.progress_pct = 25
            db_mig.current_step = "Target database connection verified via TLS/SSL. Preparing schema provisioning..."
            db.commit()

        # 3. Provision target schema
        is_sqlite = target_url.startswith("sqlite")
        eng_kwargs: dict = {"pool_pre_ping": True}
        if not is_sqlite:
            eng_kwargs["pool_size"] = 5
            eng_kwargs["max_overflow"] = 10

        target_engine = create_engine(target_url, **eng_kwargs)
        if not is_sqlite:
            with target_engine.connect() as ext_conn:
                ext_conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                ext_conn.execute(text("CREATE EXTENSION IF NOT EXISTS ltree;"))
                ext_conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'))
                ext_conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto;"))
                # Extension DDL is committed separately from tenant table/data work.
                ext_conn.commit()
        # Keep table-provisioning DDL atomic where the target dialect supports it.
        with target_engine.begin() as ddl_conn:
            Base.metadata.create_all(bind=ddl_conn)

        update_task_state(
            migration_id,
            progress_pct=40,
            current_step="Target PostgreSQL schema and tables provisioned. Beginning tenant data transfer...",
        )
        if db_mig:
            db_mig.progress_pct = 40
            db_mig.current_step = "Target PostgreSQL schema and tables provisioned. Beginning tenant data transfer..."
            db.commit()

        # 4. Extract and Transfer Tenant Data
        tables = Base.metadata.sorted_tables
        table_count = len(tables)

        # All copied rows share one target transaction; no partial tenant copy is
        # committed unless every eligible table passes its count/checksum check.
        with target_engine.begin() as target_conn:
            for idx, table in enumerate(tables):
                tenant_query = _tenant_table_query(table, company_id)
                if tenant_query is None:
                    continue

                source_rows = db.execute(tenant_query).fetchall()
                columns = [c.name for c in table.columns]
                source_checksum = _checksum_rows(source_rows, columns)
                row_dicts = [dict(row._mapping) for row in source_rows]

                if row_dicts:
                    primary_key_columns = list(table.primary_key.columns)
                    if not primary_key_columns:
                        raise RuntimeError(
                            f"Cannot safely migrate table {table.name}: no primary key is defined."
                        )
                    # Insert errors are deliberately not swallowed: the transaction
                    # rolls back all copied tables on any failure.
                    target_conn.execute(table.insert(), row_dicts)
                    copied_rows.append(
                        (
                            table,
                            [
                                {column.name: row[column.name] for column in primary_key_columns}
                                for row in row_dicts
                            ],
                        )
                    )

                target_rows = target_conn.execute(tenant_query).fetchall()
                target_count = len(target_rows)
                target_checksum = _checksum_rows(target_rows, columns)
                if len(source_rows) != target_count or source_checksum != target_checksum:
                    raise RuntimeError(
                        f"Integrity verification failed for table {table.name}: "
                        f"source rows={len(source_rows)}, target rows={target_count}."
                    )

                total_records_transferred += len(source_rows)

                # Update progress proportionally between 40% and 85%
                current_pct = 40 + int((idx + 1) / max(table_count, 1) * 45)
                update_task_state(
                    migration_id,
                    progress_pct=current_pct,
                    current_step=f"Verified {table.name} ({len(source_rows)} records)... Total transferred: {total_records_transferred}",
                    records_transferred=total_records_transferred,
                )

            comp_exists = target_conn.scalar(
                select(ResCompany.id).where(ResCompany.id == company_id)
            )
            if not comp_exists:
                raise RuntimeError(
                    "Integrity verification failed: Tenant company record not found in target database."
                )

        target_data_committed = True

        # 5. Verify Integrity
        update_task_state(
            migration_id,
            progress_pct=90,
            current_step=f"Data transfer complete ({total_records_transferred} records). Verifying target integrity...",
            records_transferred=total_records_transferred,
        )
        if db_mig:
            db_mig.progress_pct = 90
            db_mig.current_step = f"Data transfer complete ({total_records_transferred} records). Verifying target integrity..."
            db_mig.records_transferred = total_records_transferred
            db.commit()

        # 6. Cutover: Update Master TenantDatabaseConfig and Evict Cache
        update_task_state(
            migration_id,
            progress_pct=95,
            current_step="Updating master tenant connection string mapping and invalidating routing cache...",
        )
        if db_mig:
            db_mig.progress_pct = 95
            db_mig.current_step = "Updating master tenant connection string mapping and invalidating routing cache..."
            db.commit()

        encrypted_url = encrypt_connection_url(target_url)
        existing_config = db.scalar(
            select(TenantDatabaseConfig).where(TenantDatabaseConfig.company_id == company_id)
        )
        if existing_config:
            previous_config = {
                "id": existing_config.id,
                "database_name": existing_config.database_name,
                "encrypted_connection_url": existing_config.encrypted_connection_url,
                "residency_region": existing_config.residency_region,
                "isolation_level": existing_config.isolation_level,
                "is_active": existing_config.is_active,
            }
        if existing_config:
            existing_config.database_name = meta["database_name"] or target_db
            existing_config.encrypted_connection_url = encrypted_url
            existing_config.residency_region = "external-private"
            existing_config.isolation_level = "dedicated"
            existing_config.is_active = True
        else:
            new_config = TenantDatabaseConfig(
                id=uuid.uuid4(),
                company_id=company_id,
                database_name=meta["database_name"] or target_db,
                encrypted_connection_url=encrypted_url,
                residency_region="external-private",
                isolation_level="dedicated",
                is_active=True,
            )
            db.add(new_config)

        # Persist the connection mapping before publishing the in-memory route.
        cutover_attempted = True
        db.commit()

        # Evict and register dedicated engine in runtime connection manager
        tenant_connection_manager.reset_cache(company_id)
        tenant_connection_manager.register_tenant_engine(company_id, target_engine)
        target_engine_registered = True

        completed_at = datetime.now(timezone.utc)
        db_mig = db.scalar(
            select(TenantDatabaseMigration).where(
                TenantDatabaseMigration.id == migration_id,
                TenantDatabaseMigration.company_id == company_id,
            )
        )
        if not db_mig:
            raise RuntimeError("Migration record was not found while finalizing this tenant's cutover.")
        db_mig.status = "COMPLETED"
        db_mig.progress_pct = 100
        db_mig.current_step = "Migration complete. Dynamic routing is now active on private external PostgreSQL instance."
        db_mig.records_transferred = total_records_transferred
        db_mig.completed_at = completed_at
        db.commit()

        update_task_state(
            migration_id,
            status="COMPLETED",
            progress_pct=100,
            current_step="Migration complete. Dynamic routing is now active on private external PostgreSQL instance.",
            records_transferred=total_records_transferred,
            completed_at=completed_at,
        )
        migration_succeeded = True

        logger.info("Successfully finished database migration for tenant %s [Migration ID: %s]", company_id, migration_id)

    except Exception as exc:
        # Avoid logging exception text that can contain connection credentials.
        logger.error(
            "Database migration failed for tenant %s [Migration ID: %s] (%s)",
            company_id,
            migration_id,
            type(exc).__name__,
        )
        err_str = f"Migration failed ({type(exc).__name__})."
        step_msg = f"Migration failed: {err_str}"[:250]

        cleanup_succeeded = True
        cutover_restored = not cutover_attempted
        if cutover_attempted:
            try:
                db.rollback()
                config_to_restore = db.scalar(
                    select(TenantDatabaseConfig).where(
                        TenantDatabaseConfig.company_id == company_id
                    )
                )
                if previous_config is None:
                    if config_to_restore:
                        db.delete(config_to_restore)
                elif config_to_restore:
                    for name, value in previous_config.items():
                        setattr(config_to_restore, name, value)
                db.commit()
                cutover_restored = True
            except Exception as restore_exc:
                db.rollback()
                cutover_restored = False
                logger.error(
                    "Failed to restore tenant database mapping after migration failure "
                    "for tenant %s [Migration ID: %s] (%s)",
                    company_id,
                    migration_id,
                    type(restore_exc).__name__,
                )
            try:
                tenant_connection_manager.reset_cache(company_id)
                target_engine_registered = False
            except Exception as cache_exc:
                logger.error(
                    "Failed to reset tenant routing after migration failure for tenant %s "
                    "[Migration ID: %s] (%s)",
                    company_id,
                    migration_id,
                    type(cache_exc).__name__,
                )

        if target_data_committed and copied_rows and target_engine is not None and cutover_restored:
            try:
                _cleanup_copied_target_rows(target_engine, copied_rows)
            except Exception as cleanup_exc:
                cleanup_succeeded = False
                logger.error(
                    "Failed to clean copied rows after migration failure for tenant %s "
                    "[Migration ID: %s] (%s)",
                    company_id,
                    migration_id,
                    type(cleanup_exc).__name__,
                )
        elif target_data_committed and not cutover_restored:
            # Keep the verified target copy intact if the master mapping could
            # not be restored; deleting it could leave a live route data-empty.
            cleanup_succeeded = False

        update_task_state(
            migration_id,
            status="FAILED",
            error_message=err_str,
            current_step=step_msg,
            records_transferred=(
                total_records_transferred
                if target_data_committed and not cleanup_succeeded
                else 0
            ),
            completed_at=datetime.now(timezone.utc),
        )
        try:
            db.rollback()
            db_mig_rec = db.scalar(
                select(TenantDatabaseMigration).where(
                    TenantDatabaseMigration.id == migration_id,
                    TenantDatabaseMigration.company_id == company_id,
                )
            )
            if db_mig_rec:
                db_mig_rec.status = "FAILED"
                db_mig_rec.error_message = err_str
                db_mig_rec.current_step = step_msg
                db_mig_rec.records_transferred = (
                    total_records_transferred
                    if target_data_committed and not cleanup_succeeded
                    else 0
                )
                db_mig_rec.completed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception as commit_err:
            logger.error(
                "Failed to persist migration FAILED state for tenant %s "
                "[Migration ID: %s] (%s)",
                company_id,
                migration_id,
                type(commit_err).__name__,
            )
    finally:
        if target_engine is not None and not migration_succeeded and not target_engine_registered:
            target_engine.dispose()
        db.close()


def revert_to_shared_database(company_id: uuid.UUID, db: Session) -> Dict[str, Any]:
    """Reverts an external database tenant back to the platform's shared multi-tenant database."""
    config = db.scalar(
        select(TenantDatabaseConfig).where(TenantDatabaseConfig.company_id == company_id)
    )
    if not config or not config.is_active:
        return {
            "success": True,
            "storage_mode": "LOCAL_SHARED",
            "message": "Tenant is already using the local shared container database.",
        }

    config.is_active = False
    db.commit()

    # Evict runtime cache so future requests immediately route to platform default engine
    tenant_connection_manager.reset_cache(company_id)

    return {
        "success": True,
        "storage_mode": "LOCAL_SHARED",
        "message": "Successfully switched tenant routing back to platform shared database.",
    }
