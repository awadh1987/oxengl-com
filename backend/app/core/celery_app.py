"""
OxenGL Enterprise Celery Application Instance.
Configures background execution queues over Redis for decoupled asynchronous processing.
"""

import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

celery_app = Celery(
    "oxengl_enterprise",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "backend.app.core.tasks",
        "backend.app.core.notifications",
        "backend.app.tasks.fx_sync",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,
    worker_concurrency=4,
    worker_prefetch_multiplier=1,
)

from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "sync-hourly-fx-rates": {
        "task": "tasks.sync_exchange_rates",
        "schedule": crontab(minute=0),  # Synchronize every hour
    },
    "daily-platform-and-tenant-backups": {
        "task": "tasks.execute_scheduled_backups",
        "schedule": crontab(hour=2, minute=0),
        "kwargs": {"backup_kind": "full"},
    },
    "weekly-sunday-full-backups": {
        "task": "tasks.execute_scheduled_backups",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),
        "kwargs": {"backup_kind": "full"},
    },
}
