"""OxenGL Core Infrastructure Package."""
try:
    from .cache import (
        EnterpriseCache,
        IdempotencyManager,
        build_cache_key,
        calculate_jittered_ttl,
        enterprise_cache,
        idempotency_manager,
        VERY_SHORT_TTL,
        SHORT_TTL,
        MEDIUM_TTL,
        LONG_TTL,
    )
except ImportError:
    pass

try:
    from .celery_app import celery_app
except ImportError:
    pass

try:
    from .middleware import CorrelationIdMiddleware, get_correlation_id, dispatch_async_audit
except ImportError:
    pass

try:
    from .tasks import emit_audit_log
except ImportError:
    pass

try:
    from .notifications import EnterpriseNotificationBroker
except ImportError:
    pass

from .config import email_settings, EmailSettings

__all__ = [
    "EnterpriseCache",
    "IdempotencyManager",
    "build_cache_key",
    "calculate_jittered_ttl",
    "enterprise_cache",
    "idempotency_manager",
    "VERY_SHORT_TTL",
    "SHORT_TTL",
    "MEDIUM_TTL",
    "LONG_TTL",
    "celery_app",
    "CorrelationIdMiddleware",
    "get_correlation_id",
    "dispatch_async_audit",
    "emit_audit_log",
    "EnterpriseNotificationBroker",
    "email_settings",
    "EmailSettings",
]
