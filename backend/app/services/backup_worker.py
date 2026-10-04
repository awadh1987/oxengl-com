"""
OxenGL Production Backup Scheduling Worker & Daemon.

Automates scheduled daily and weekly full-scope backups (database schema/dumps +
media/logo/attachment/invoice file assets) across Platform and Tenant partitions
using BackupService. Supports dual-execution paradigms:
  1. Celery Beat periodic task runner
  2. Asyncio background worker daemon (FastAPI startup / standalone CLI)
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.database import SessionLocal
from backend.app.services.backup_service import (
    BackupKind,
    BackupPolicy,
    BackupRunStatus,
    BackupScope,
    BackupService,
    StorageLayout,
    select_for_deletion,
)

logger = logging.getLogger("oxengl.backup_worker")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("[%(asctime)s] [%(levelname)s] [backup_worker] %(message)s")
    )
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


# ==============================================================================
# Configuration Defaults
# ==============================================================================

def get_env_bool(key: str, default: bool = True) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on", "enabled"}


def get_env_int(key: str, default: int) -> int:
    val = os.getenv(key)
    if val is None:
        return default
    try:
        return int(val.strip())
    except ValueError:
        return default


BACKUP_SCHEDULE_ENABLED: bool = get_env_bool("OXENGL_BACKUP_SCHEDULE_ENABLED", True)
BACKUP_DAILY_HOUR: int = get_env_int("OXENGL_BACKUP_DAILY_HOUR", 2)  # 02:00 UTC
BACKUP_WEEKLY_DAY: int = get_env_int("OXENGL_BACKUP_WEEKLY_DAY", 6)  # Sunday
BACKUP_WEEKLY_HOUR: int = get_env_int("OXENGL_BACKUP_WEEKLY_HOUR", 3)  # 03:00 UTC
BACKUP_KEEP_DAILY: int = get_env_int("OXENGL_BACKUP_KEEP_DAILY", 7)
BACKUP_KEEP_WEEKLY: int = get_env_int("OXENGL_BACKUP_KEEP_WEEKLY", 4)
BACKUP_DEFAULT_SCOPES: str = os.getenv("OXENGL_BACKUP_SCOPES", "platform,tenants")


# ==============================================================================
# Local Staging Retention Pruner
# ==============================================================================

def prune_local_artifacts(
    output_dir: Path,
    scope: BackupScope,
    kind: BackupKind,
    keep: int,
) -> int:
    """Safely prunes stale encrypted archives and checksum sidecars from local staging directory."""
    if not output_dir.exists():
        return 0
    all_files = [f.name for f in output_dir.iterdir() if f.is_file()]
    to_delete = select_for_deletion(all_files, keep, scope=scope, kind=kind)
    count = 0
    for fname in to_delete:
        try:
            (output_dir / fname).unlink(missing_ok=True)
            (output_dir / (fname + ".sha256")).unlink(missing_ok=True)
            count += 1
        except Exception as e:
            logger.warning("Failed to delete local archive %s: %s", fname, e)
    return count


# ==============================================================================
# Tenant Discovery & Database Helpers
# ==============================================================================

def get_active_tenants(db: Session) -> List[Dict[str, Any]]:
    """
    Retrieves all active tenant partitions for scheduled backup capture.
    Queries res_companies first, falling back to tenants table.
    """
    tenants: List[Dict[str, Any]] = []

    # Try res_companies table
    try:
        query = text("""
            SELECT id, name, slug 
            FROM public.res_companies 
            WHERE is_active = true
            ORDER BY created_at ASC;
        """)
        rows = db.execute(query).mappings().all()
        for r in rows:
            tenants.append({
                "id": str(r["id"]),
                "name": str(r["name"]),
                "slug": str(r.get("slug") or ""),
            })
        if tenants:
            return tenants
    except Exception as e:
        logger.debug("Querying res_companies for backup tenants encountered: %s", e)

    # Fallback to public.tenants
    try:
        query = text("""
            SELECT id, name, slug 
            FROM public.tenants 
            WHERE is_active = true
            ORDER BY created_at ASC;
        """)
        rows = db.execute(query).mappings().all()
        for r in rows:
            tenants.append({
                "id": str(r["id"]),
                "name": str(r["name"]),
                "slug": str(r.get("slug") or ""),
            })
    except Exception as e:
        logger.warning("Could not query active tenants: %s", e)

    return tenants


# ==============================================================================
# Core Scheduled Execution Routine
# ==============================================================================

def execute_scheduled_backups(
    scopes: Optional[List[str]] = None,
    backup_kind: str = "full",
    layout: Optional[StorageLayout] = None,
) -> Dict[str, Any]:
    """
    Synchronous execution routine invoked by Celery Beat workers or Asyncio daemon threads.
    Performs full-scope backups and pruning retention enforcement across configured scopes.
    """
    start_time = time.monotonic()
    timestamp_iso = datetime.now(timezone.utc).isoformat()
    logger.info("Starting scheduled backup run (kind=%s, scopes=%s)...", backup_kind, scopes)

    if scopes is None:
        raw_scopes = [s.strip().lower() for s in BACKUP_DEFAULT_SCOPES.split(",") if s.strip()]
        scopes = raw_scopes or ["platform", "tenants"]

    try:
        kind = BackupKind(backup_kind.lower())
    except (ValueError, AttributeError):
        kind = BackupKind.FULL

    service = BackupService(layout=layout, keep_local_artifacts=True)
    results: Dict[str, Any] = {
        "status": "SUCCESS",
        "started_at": timestamp_iso,
        "backup_kind": kind.value,
        "platform_backup": None,
        "tenant_backups": [],
        "errors": [],
    }

    # 1. Platform-Level Backup
    if "platform" in scopes:
        logger.info("[Platform] Initiating full platform backup...")
        try:
            policy = BackupPolicy(
                id=uuid.uuid4(),
                scope=BackupScope.PLATFORM,
                tenant_id=None,
                destinations=[],
                retention_daily=BACKUP_KEEP_DAILY,
                retention_weekly=BACKUP_KEEP_WEEKLY,
            )
            p_run = service.run_policy(policy, kind)
            if p_run.status == BackupRunStatus.FAILED:
                raise RuntimeError(p_run.error or "Platform backup execution failed")

            keep_count = BACKUP_KEEP_DAILY if kind == BackupKind.INCREMENTAL else BACKUP_KEEP_WEEKLY
            pruned_count = p_run.pruned + prune_local_artifacts(
                service.output_dir, BackupScope.PLATFORM, kind, keep_count
            )

            results["platform_backup"] = {
                "archive_name": p_run.artifact.path.name if p_run.artifact else None,
                "size_bytes": p_run.artifact.size_bytes if p_run.artifact else 0,
                "sha256": p_run.artifact.sha256 if p_run.artifact else None,
                "pruned_archives": pruned_count,
                "duration_seconds": round(
                    (p_run.finished_at - p_run.started_at).total_seconds()
                    if p_run.finished_at and p_run.started_at else 0.0, 2
                ),
            }
            logger.info(
                "[Platform] Backup completed successfully: %s (%s bytes, %d pruned)",
                results["platform_backup"]["archive_name"],
                results["platform_backup"]["size_bytes"],
                pruned_count,
            )
        except Exception as exc:
            err_msg = f"Platform backup failed: {exc}"
            logger.error(err_msg, exc_info=True)
            results["errors"].append({"scope": "platform", "error": str(exc)})
            results["status"] = "PARTIAL_FAILURE"

    # 2. Tenant-Level Backups
    if "tenants" in scopes:
        with SessionLocal() as db:
            active_tenants = get_active_tenants(db)

        logger.info("[Tenants] Discovered %d active tenant partitions.", len(active_tenants))
        for tenant in active_tenants:
            t_id_str = tenant["id"]
            t_name = tenant["name"]
            try:
                t_uuid = uuid.UUID(t_id_str)
            except (ValueError, TypeError):
                logger.warning("[Tenant:%s] Skipping invalid tenant UUID: %s", t_id_str, t_id_str)
                continue

            logger.info("[Tenant:%s] Initiating backup for %s (%s)...", t_id_str[:8], t_name, t_id_str)
            try:
                policy = BackupPolicy(
                    id=uuid.uuid4(),
                    scope=BackupScope.TENANT,
                    tenant_id=t_uuid,
                    destinations=[],
                    retention_daily=BACKUP_KEEP_DAILY,
                    retention_weekly=BACKUP_KEEP_WEEKLY,
                )
                t_run = service.run_policy(policy, kind)
                if t_run.status == BackupRunStatus.FAILED:
                    raise RuntimeError(t_run.error or f"Tenant {t_id_str} backup execution failed")

                keep_count = BACKUP_KEEP_DAILY if kind == BackupKind.INCREMENTAL else BACKUP_KEEP_WEEKLY
                t_pruned = t_run.pruned + prune_local_artifacts(
                    service.output_dir, BackupScope.TENANT, kind, keep_count
                )

                results["tenant_backups"].append({
                    "tenant_id": t_id_str,
                    "tenant_name": t_name,
                    "archive_name": t_run.artifact.path.name if t_run.artifact else None,
                    "size_bytes": t_run.artifact.size_bytes if t_run.artifact else 0,
                    "sha256": t_run.artifact.sha256 if t_run.artifact else None,
                    "pruned_archives": t_pruned,
                    "duration_seconds": round(
                        (t_run.finished_at - t_run.started_at).total_seconds()
                        if t_run.finished_at and t_run.started_at else 0.0, 2
                    ),
                })
                logger.info(
                    "[Tenant:%s] Backup complete: %s (%s bytes)",
                    t_id_str[:8],
                    t_run.artifact.path.name if t_run.artifact else None,
                    t_run.artifact.size_bytes if t_run.artifact else 0,
                )
            except Exception as exc:
                err_msg = f"Tenant {t_id_str} backup failed: {exc}"
                logger.error(err_msg, exc_info=True)
                results["errors"].append({"scope": f"tenant:{t_id_str}", "error": str(exc)})
                results["status"] = "PARTIAL_FAILURE"

    total_duration = time.monotonic() - start_time
    results["duration_seconds"] = round(total_duration, 2)
    results["completed_at"] = datetime.now(timezone.utc).isoformat()

    if results["errors"] and not results["platform_backup"] and not results["tenant_backups"]:
        results["status"] = "FAILED"

    logger.info(
        "Scheduled backup run completed in %.2fs with status: %s (Errors: %d)",
        total_duration,
        results["status"],
        len(results["errors"]),
    )
    return results


# ==============================================================================
# Asyncio Background Worker Daemon
# ==============================================================================

class BackupWorkerDaemon:
    """
    Autonomous asynchronous worker daemon designed to run within FastAPI's lifespan
    or as an independent process supervisor.
    """

    def __init__(self) -> None:
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._last_run_date: Optional[str] = None

    @property
    def is_running(self) -> bool:
        return self._running

    def start(self) -> None:
        """Starts the background worker task."""
        if not BACKUP_SCHEDULE_ENABLED:
            logger.info("Backup worker daemon is disabled via OXENGL_BACKUP_SCHEDULE_ENABLED.")
            return

        if self._running:
            logger.warning("Backup worker daemon is already running.")
            return

        self._running = True
        self._task = asyncio.create_task(self._daemon_loop())
        logger.info("Backup worker daemon initialized and started.")

    def stop(self) -> None:
        """Signals the daemon to shut down cleanly."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("Backup worker daemon shutdown requested.")

    async def _daemon_loop(self) -> None:
        """Continuous evaluation loop checking cron windows every 60 seconds."""
        logger.info(
            "Backup worker daemon loop running. Daily schedule: %02d:00 UTC, Weekly: Sun %02d:00 UTC",
            BACKUP_DAILY_HOUR,
            BACKUP_WEEKLY_HOUR,
        )

        while self._running:
            try:
                now_utc = datetime.now(timezone.utc)
                current_date = now_utc.strftime("%Y-%m-%d")

                # Check if current hour matches daily backup window and has not run today
                is_daily_window = now_utc.hour == BACKUP_DAILY_HOUR and self._last_run_date != current_date
                is_weekly_window = (
                    now_utc.weekday() == BACKUP_WEEKLY_DAY
                    and now_utc.hour == BACKUP_WEEKLY_HOUR
                    and self._last_run_date != current_date
                )

                if is_weekly_window:
                    logger.info("Weekly backup trigger condition met at %s UTC", now_utc.isoformat())
                    self._last_run_date = current_date
                    await asyncio.to_thread(execute_scheduled_backups, backup_kind="full")
                elif is_daily_window:
                    logger.info("Daily backup trigger condition met at %s UTC", now_utc.isoformat())
                    self._last_run_date = current_date
                    await asyncio.to_thread(execute_scheduled_backups, backup_kind="full")

                # Sleep 60 seconds between evaluations
                await asyncio.sleep(60)

            except asyncio.CancelledError:
                logger.info("Backup daemon loop received cancellation.")
                break
            except Exception as e:
                logger.error("Unexpected error in backup daemon loop: %s", e, exc_info=True)
                await asyncio.sleep(60)


# Global daemon instance
backup_worker_daemon = BackupWorkerDaemon()


# ==============================================================================
# CLI Entry Point
# ==============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="OxenGL Backup Worker & Scheduler")
    parser.add_argument("--now", action="store_true", help="Execute backup run immediately and exit")
    parser.add_argument("--scope", type=str, default=None, help="Comma-separated scopes (platform,tenants)")
    parser.add_argument("--kind", type=str, default="full", choices=["full", "incremental"], help="Backup kind")
    parser.add_argument("--daemon", action="store_true", help="Run as long-running asyncio daemon supervisor")

    args = parser.parse_args()

    if args.now:
        scopes = [s.strip() for s in args.scope.split(",")] if args.scope else None
        res = execute_scheduled_backups(scopes=scopes, backup_kind=args.kind)
        sys.exit(0 if res["status"] in {"SUCCESS", "PARTIAL_FAILURE"} else 1)

    if args.daemon:
        logger.info("Starting standalone backup worker daemon process...")
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        backup_worker_daemon.start()
        try:
            loop.run_forever()
        except (KeyboardInterrupt, SystemExit):
            logger.info("Terminating backup daemon process...")
            backup_worker_daemon.stop()
            loop.run_until_complete(asyncio.sleep(1))
        finally:
            loop.close()


if __name__ == "__main__":
    main()
