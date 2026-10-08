"""
OxenGL Currency & Exchange Rate Service.
Fetches live and historical FX rates via httpx with Redis cache-aside and anti-stampede jitter.
"""

import os
import random
import logging
from typing import Optional, Dict
import httpx
from redis.asyncio import Redis

logger = logging.getLogger("oxengl.currency")

FRANKFURTER_URL = os.getenv("FX_API_URL", "https://api.frankfurter.dev/v1/latest")
FRANKFURTER_FALLBACK_URL = "https://api.frankfurter.app/latest"
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
ENVIRONMENT = os.getenv("ENVIRONMENT", "production")

# Static fallback parity table for mission-critical offline resilience
FALLBACK_RATES: Dict[str, float] = {
    "USD_SAR": 3.750000,
    "SAR_USD": 0.266667,
    "USD_EUR": 0.920000,
    "EUR_USD": 1.086957,
    "EUR_SAR": 4.076000,
    "SAR_EUR": 0.245339,
    "USD_AED": 3.672500,
    "AED_USD": 0.272294,
    "SAR_AED": 0.979333,
    "AED_SAR": 1.021103,
}


class CurrencyService:
    """Enterprise multi-currency conversion manager with Redis caching and jitter."""

    def __init__(self, redis_client: Optional[Redis] = None):
        self._redis = redis_client

    async def get_redis(self) -> Redis:
        if self._redis is None:
            self._redis = Redis.from_url(REDIS_URL, decode_responses=True)
        return self._redis

    @staticmethod
    def get_cache_key(tenant_id: str, from_currency: str, to_currency: str) -> str:
        """Constructs standardized multi-tenant cache key."""
        return f"oxengl:{ENVIRONMENT}:{tenant_id}:procurement:fx_rates:{from_currency.lower()}_{to_currency.lower()}"

    @staticmethod
    def calculate_jittered_ttl(base_ttl: int = 3600, jitter_seconds: int = 60) -> int:
        """Adds randomized variance to avoid coordinated cache stampedes."""
        return base_ttl + random.randint(0, jitter_seconds)

    async def get_exchange_rate(
        self,
        from_currency: str,
        to_currency: str,
        tenant_id: str = "tenant_001",
    ) -> float:
        """
        Retrieves exchange rate from cache or external provider, falling back to static parities.
        """
        from_cur = from_currency.upper().strip()
        to_cur = to_currency.upper().strip()

        if from_cur == to_cur:
            return 1.0

        cache_key = self.get_cache_key(tenant_id, from_cur, to_cur)

        # 1. Try Redis cache
        try:
            r = await self.get_redis()
            cached_val = await r.get(cache_key)
            if cached_val:
                return float(cached_val)
        except Exception as e:
            logger.warning(f"Redis cache lookup failed for {cache_key}: {e}")

        # 2. Query External API (api.frankfurter.dev)
        rate: Optional[float] = None
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(
                    FRANKFURTER_URL,
                    params={"base": from_cur, "symbols": to_cur},
                )
                if res.status_code == 200:
                    data = res.json()
                    rate = float(data["rates"][to_cur])
                else:
                    # Try fallback URL
                    fallback_res = await client.get(
                        FRANKFURTER_FALLBACK_URL,
                        params={"base": from_cur, "symbols": to_cur},
                    )
                    if fallback_res.status_code == 200:
                        fallback_data = fallback_res.json()
                        rate = float(fallback_data["rates"][to_cur])
        except Exception as e:
            logger.info(f"External FX query failed: {e}. Falling back to internal parity matrix.")

        # 3. Use static fallback matrix if API lookup fails
        if rate is None:
            pair_key = f"{from_cur}_{to_cur}"
            reverse_pair = f"{to_cur}_{from_cur}"
            if pair_key in FALLBACK_RATES:
                rate = FALLBACK_RATES[pair_key]
            elif reverse_pair in FALLBACK_RATES:
                rate = 1.0 / FALLBACK_RATES[reverse_pair]
            else:
                rate = 1.0

        # 4. Save to Redis with jittered expiration
        try:
            r = await self.get_redis()
            ttl = self.calculate_jittered_ttl(base_ttl=3600, jitter_seconds=60)
            await r.set(cache_key, str(rate), ex=ttl)
        except Exception as e:
            logger.warning(f"Failed to cache exchange rate in Redis: {e}")

        return rate

    async def convert_amount(
        self,
        amount: float,
        from_currency: str,
        to_currency: str,
        tenant_id: str = "tenant_001",
    ) -> float:
        """Converts an amount from one currency to another."""
        rate = await self.get_exchange_rate(from_currency, to_currency, tenant_id)
        return round(amount * rate, 4)
