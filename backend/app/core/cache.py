"""
OxenGL Multi-Layer Enterprise Cache-Aside Framework.
Provides:
- Strict multi-tenant namespace formatting:
    oxengl:{environment}:{tenant_id}:{domain}:{resource}:{identifier}:{version}
- Cache Stampede mitigation via jitter strategy (±10% to ±20%)
- Standard expiration profiles: VERY_SHORT_TTL, SHORT_TTL, MEDIUM_TTL, LONG_TTL
- Idempotency routing cache to safeguard transactional posting channels
- Transaction-aware outbox cache invalidation hooks
"""

from __future__ import annotations

import json
import logging
import os
import random
from typing import Any, Dict, Optional, Union

import redis
from fastapi import HTTPException, status

logger = logging.getLogger("oxengl.cache")

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
ENVIRONMENT = os.getenv("ENVIRONMENT", "production")

# Baseline System Expiration Profiles (in seconds)
VERY_SHORT_TTL = 5     # (5-30s range + jitter) -> Operational statuses, tracking indices, inventory counters
SHORT_TTL      = 60    # (1-5m range + jitter)  -> Active user permissions matrix, dashboard aggregations
MEDIUM_TTL     = 900   # (15-60m range + jitter)-> Chart of Accounts layouts, static warehouse topologies
LONG_TTL       = 86400 # (1-24h range + jitter) -> Multi-currency metadata, country catalogs, static constants

IDEMPOTENCY_TTL = 86400      # 24 hours retention for completed idempotent responses
IDEMPOTENCY_LOCK_TTL = 30    # 30 seconds lock while processing in-flight request


def calculate_jittered_ttl(
    base_ttl: int,
    min_variance: float = -0.10,
    max_variance: float = 0.20,
) -> int:
    """
    Applies random variance factor (±10% to ±20%) to base TTL to prevent
    synchronized cache stampedes (the Thundering Herd problem).
    """
    jitter_factor = 1.0 + random.uniform(min_variance, max_variance)
    return max(1, int(base_ttl * jitter_factor))


def build_cache_key(
    tenant_id: Union[str, Any],
    domain: str,
    resource: str,
    identifier: Union[str, int],
    version: str = "v1",
    environment: Optional[str] = None,
) -> str:
    """
    Formats the strict multi-tenant isolated namespace key:
    oxengl:{environment}:{tenant_id}:{domain}:{resource}:{identifier}:{version}
    """
    env = environment or ENVIRONMENT
    tid = str(tenant_id).replace(":", "_")
    dom = domain.strip().lower()
    res = resource.strip().lower()
    ident = str(identifier).replace(":", "_")
    ver = version.strip().lower()

    return f"oxengl:{env}:{tid}:{dom}:{res}:{ident}:{ver}"


class EnterpriseCache:
    """
    Enterprise Cache-Aside abstraction layer over Redis.
    Provides graceful fail-open resilience when Redis is unreachable.
    """

    def __init__(self, redis_url: str = REDIS_URL):
        try:
            self._redis = redis.Redis.from_url(redis_url, decode_responses=True)
        except Exception as exc:
            logger.warning("Redis initialization error: %s; running in degraded bypass mode", exc)
            self._redis = None

    @property
    def client(self) -> Optional[redis.Redis]:
        return self._redis

    def get(self, key: str) -> Optional[Any]:
        """Fetch and deserialize JSON payload from cache."""
        if not self._redis:
            return None
        try:
            data = self._redis.get(key)
            if data is not None:
                return json.loads(data)
            return None
        except Exception as exc:
            logger.error("Redis get failed for key '%s': %s", key, exc)
            return None

    def set(
        self,
        key: str,
        value: Any,
        base_ttl: int = SHORT_TTL,
        with_jitter: bool = True,
    ) -> bool:
        """Serialize and set cache value with dynamic jitter TTL."""
        if not self._redis:
            return False
        try:
            ttl = calculate_jittered_ttl(base_ttl) if with_jitter else base_ttl
            serialized = json.dumps(value, default=str)
            self._redis.setex(key, ttl, serialized)
            return True
        except Exception as exc:
            logger.error("Redis set failed for key '%s': %s", key, exc)
            return False

    def delete(self, key: str) -> bool:
        """Remove a single cache key."""
        if not self._redis:
            return False
        try:
            return bool(self._redis.delete(key))
        except Exception as exc:
            logger.error("Redis delete failed for key '%s': %s", key, exc)
            return False

    def invalidate_resource(
        self,
        tenant_id: Union[str, Any],
        domain: str,
        resource: str,
        environment: Optional[str] = None,
    ) -> int:
        """
        Invalidates all cached versions/identifiers for a specific resource under a tenant domain.
        Pattern: oxengl:{env}:{tenant_id}:{domain}:{resource}:*
        """
        if not self._redis:
            return 0
        env = environment or ENVIRONMENT
        tid = str(tenant_id).replace(":", "_")
        pattern = f"oxengl:{env}:{tid}:{domain.lower()}:{resource.lower()}:*"
        try:
            keys = self._redis.keys(pattern)
            if keys:
                return self._redis.delete(*keys)
            return 0
        except Exception as exc:
            logger.error("Redis pattern invalidation failed for '%s': %s", pattern, exc)
            return 0


# ==============================================================================
# Idempotency Routing Cache (Payment, Stock, Journal Safeguards)
# ==============================================================================

class IdempotencyManager:
    """
    Protects financial postings, inventory balance adjustments, and payments
    from duplicate replay attacks or double-click re-submissions.
    """

    def __init__(self, cache: EnterpriseCache):
        self.cache = cache

    def _idempotency_key(self, key: str, tenant_id: str) -> str:
        return f"oxengl:{ENVIRONMENT}:{tenant_id}:idempotency:{key}"

    def check_or_acquire(
        self,
        idempotency_key: str,
        tenant_id: str,
        lock_ttl: int = IDEMPOTENCY_LOCK_TTL,
    ) -> Optional[Dict[str, Any]]:
        """
        Validates the incoming Idempotency-Key.
        Returns:
            - Cached response dictionary if already successfully processed.
            - Raises 409 Conflict if request is currently executing in-flight.
            - Returns None and acquires distributed lock if this is a new valid request.
        """
        if not self.cache.client:
            return None

        redis_key = self._idempotency_key(idempotency_key, tenant_id)
        try:
            cached_data = self.cache.client.get(redis_key)
            if cached_data:
                parsed = json.loads(cached_data)
                if parsed.get("state") == "PROCESSING":
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="A request with this Idempotency-Key is currently being processed.",
                    )
                # Return completed result
                return parsed.get("response")

            # Acquire distributed lock using atomic SET NX
            lock_payload = json.dumps({"state": "PROCESSING"})
            acquired = self.cache.client.set(redis_key, lock_payload, ex=lock_ttl, nx=True)
            if not acquired:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A request with this Idempotency-Key is currently being processed.",
                )
            return None
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Idempotency check error: %s; failing open to avoid blocking", exc)
            return None

    def store_result(
        self,
        idempotency_key: str,
        tenant_id: str,
        response_data: Any,
        status_code: int = 200,
        ttl: int = IDEMPOTENCY_TTL,
    ) -> None:
        """Persist finalized transactional response to guarantee identical replay returns."""
        if not self.cache.client:
            return

        redis_key = self._idempotency_key(idempotency_key, tenant_id)
        try:
            payload = json.dumps({
                "state": "COMPLETED",
                "status_code": status_code,
                "response": response_data,
            }, default=str)
            self.cache.client.setex(redis_key, ttl, payload)
        except Exception as exc:
            logger.error("Failed to store idempotency result: %s", exc)

    def release_lock(self, idempotency_key: str, tenant_id: str) -> None:
        """Release in-flight lock upon request abort or transactional rollback."""
        if not self.cache.client:
            return
        redis_key = self._idempotency_key(idempotency_key, tenant_id)
        try:
            current = self.cache.client.get(redis_key)
            if current and '"PROCESSING"' in current:
                self.cache.client.delete(redis_key)
        except Exception as exc:
            logger.error("Failed to release idempotency lock: %s", exc)


# Singleton instances
enterprise_cache = EnterpriseCache()
idempotency_manager = IdempotencyManager(enterprise_cache)
