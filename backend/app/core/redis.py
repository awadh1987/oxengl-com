"""OxenGL Asynchronous Redis Client for Telemetry Streaming and Cache."""
import os
import redis.asyncio as aioredis

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

# Async Redis client instance for pub/sub and high-throughput telemetry streams
redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
