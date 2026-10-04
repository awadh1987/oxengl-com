"""
OxenGL Decoupled Asynchronous Tasks.
Contains celery background execution workers for audit logging and long-running analytics.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .celery_app import celery_app
from backend.database import SessionLocal
from backend import models

logger = logging.getLogger("oxengl.tasks.audit")


@celery_app.task(name="tasks.emit_audit_log", bind=True, max_retries=3, default_retry_delay=5)
def emit_audit_log(
    self,
    actor_email: str,
    action: str,
    endpoint_accessed: str,
    outcome: str = "SUCCESS",
    correlation_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Decoupled Asynchronous Audit Logging Worker.
    Executes out-of-band in background worker to prevent database contention
    and blocking calls on high-frequency API endpoints.
    """
    db = SessionLocal()
    try:
        log_id = uuid.uuid4()
        detail_str = str(details) if details else ""
        if correlation_id:
            detail_str = f"[Correlation: {correlation_id}] {detail_str}".strip()

        audit_entry = models.PlatformAuditLog(
            id=log_id,
            actor_email=actor_email,
            action=action,
            outcome=outcome,
            endpoint_accessed=endpoint_accessed,
            ip_address=details.get("ip_address", "127.0.0.1") if details else "127.0.0.1",
            user_agent=details.get("user_agent", "") if details else "",
            reason=detail_str[:255] if detail_str else None,
            created_at=datetime.now(timezone.utc),
        )
        db.add(audit_entry)
        db.commit()

        logger.info(
            "Audit event persisted asynchronously [ID: %s] Action: %s, Actor: %s, Correlation: %s",
            log_id,
            action,
            actor_email,
            correlation_id,
        )
        return {"status": "persisted", "id": str(log_id), "correlation_id": correlation_id}
    except Exception as exc:
        db.rollback()
        logger.error("Failed to persist asynchronous audit log: %s", exc, exc_info=True)
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task(name="tasks.execute_scheduled_backups", bind=True, max_retries=2, default_retry_delay=60)
def execute_scheduled_backups_task(self, scopes: Optional[list] = None, backup_kind: str = "full"):
    """
    Celery worker task to execute automated full-scope platform and tenant backups.
    """
    from backend.app.services.backup_worker import execute_scheduled_backups
    try:
        return execute_scheduled_backups(scopes=scopes, backup_kind=backup_kind)
    except Exception as exc:
        logger.error("Celery execute_scheduled_backups task failed: %s", exc)
        raise self.retry(exc=exc)
