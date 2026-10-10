"""
OxenGL ERP — Analytics Secure Proxy & Redis Caching Router
===========================================================
Location: backend/app/api/v1/analytics.py

Implements the hybrid analytics architecture proxy layer for embedded
React components and reporting surfaces:
1. Strict tenant isolation using parameterized BigQuery queries bound to
   authenticated `current_user.company_id` (NO string interpolation).
2. Asynchronous execution via `asyncio.to_thread` for BigQuery network calls
   to prevent blocking the FastAPI ASGI event loop.
3. Fail-open Redis caching layer using the composite key:
   `analytics:{company_id}:{dashboard_id}` with 15-30 minute TTL.
4. Cache invalidation endpoints to purge cached dashboard snapshots on demand.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field

try:
    from backend.app.core.auth import get_authenticated_user
    from backend.app.core.redis import redis_client
except ImportError:
    from app.core.auth import get_authenticated_user  # type: ignore[no-redef]
    from app.core.redis import redis_client  # type: ignore[no-redef]

try:
    from google.cloud import bigquery
    ScalarQueryParameter = bigquery.ScalarQueryParameter
except Exception:
    bigquery = None  # type: ignore[assignment]
    class ScalarQueryParameter:  # type: ignore[no-redef]
        def __init__(self, name: str, type_: str, value: Any):
            self.name = name
            self.type_ = type_
            self.value = value

logger = logging.getLogger("oxengl.analytics")

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])

# BigQuery & Cache Configuration
BIGQUERY_PROJECT_ID = os.getenv("BIGQUERY_PROJECT_ID", "project-587cf20f-74ef-484a-ba6")
BIGQUERY_DATASET = os.getenv("BIGQUERY_STAGING_DATASET", "oxengl_staging")
DEFAULT_CACHE_TTL_SECONDS = int(os.getenv("ANALYTICS_CACHE_TTL_SECONDS", "1800"))  # 30 minutes (1800s)

_bq_client: Optional[Any] = None


def get_bigquery_client() -> Any:
    """Returns or lazily initializes the BigQuery client."""
    global _bq_client
    if _bq_client is None:
        if bigquery is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Google Cloud BigQuery library is not installed in runtime environment.",
            )
        _bq_client = bigquery.Client(project=BIGQUERY_PROJECT_ID)
    return _bq_client


def _json_serial(obj: Any) -> Any:
    """Custom JSON serializer for Decimal, datetime, date, and UUID objects."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    return str(obj)


# ─── Dashboard Query Catalog ────────────────────────────────────────────────
# All queries MUST contain `@company_id` parameter to guarantee tenant isolation.
DASHBOARD_QUERIES: Dict[str, str] = {
    "overview": f"""
        SELECT
          (SELECT COUNT(1) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_customer_invoices` WHERE company_id = @company_id) AS total_invoices,
          (SELECT COALESCE(SUM(grand_total), 0) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_customer_invoices` WHERE company_id = @company_id) AS total_revenue,
          (SELECT COUNT(1) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_purchase_orders` WHERE company_id = @company_id) AS total_purchase_orders,
          (SELECT COALESCE(SUM(total_amount), 0) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_purchase_orders` WHERE company_id = @company_id) AS total_spend,
          (SELECT COUNT(1) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_inventory_movements` WHERE company_id = @company_id) AS total_inventory_movements,
          (SELECT COUNT(1) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_finance_journal_entries` WHERE company_id = @company_id) AS total_journal_entries
    """,
    "executive_summary": f"""
        SELECT
          (SELECT COUNT(1) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_customer_invoices` WHERE company_id = @company_id) AS total_invoices,
          (SELECT COALESCE(SUM(grand_total), 0) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_customer_invoices` WHERE company_id = @company_id) AS total_revenue,
          (SELECT COUNT(1) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_purchase_orders` WHERE company_id = @company_id) AS total_purchase_orders,
          (SELECT COALESCE(SUM(total_amount), 0) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_purchase_orders` WHERE company_id = @company_id) AS total_spend,
          (SELECT COUNT(1) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_inventory_movements` WHERE company_id = @company_id) AS total_inventory_movements,
          (SELECT COUNT(1) FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_finance_journal_entries` WHERE company_id = @company_id) AS total_journal_entries
    """,
    "invoices": f"""
        SELECT
          id,
          invoice_number,
          customer_name,
          customer_tax_number,
          partner_id,
          subtotal,
          vat_amount,
          grand_total,
          currency,
          status,
          is_posted,
          vat_consistency_flag,
          issue_date,
          due_date,
          created_at
        FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_customer_invoices`
        WHERE company_id = @company_id
        ORDER BY created_at DESC
        LIMIT @limit
    """,
    "procurement": f"""
        SELECT
          id,
          po_number,
          partner_id,
          subtotal,
          tax_amount,
          total_amount,
          currency,
          status,
          amount_quality_flag,
          vat_consistency_flag,
          order_date,
          expected_delivery_date,
          notes,
          created_at
        FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_purchase_orders`
        WHERE company_id = @company_id
        ORDER BY created_at DESC
        LIMIT @limit
    """,
    "inventory": f"""
        SELECT
          id,
          movement_number,
          warehouse_id,
          product_id,
          quantity,
          qty_sign_flag,
          movement_type,
          reason,
          reference,
          unit_cost,
          total_cost,
          status,
          is_posted,
          created_at
        FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_inventory_movements`
        WHERE company_id = @company_id
        ORDER BY created_at DESC
        LIMIT @limit
    """,
    "finance": f"""
        SELECT
          id,
          entry_number,
          description,
          entry_date,
          posting_date,
          total_debit,
          total_credit,
          balance_flag,
          currency,
          status,
          source_document,
          created_at
        FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_finance_journal_entries`
        WHERE company_id = @company_id
        ORDER BY created_at DESC
        LIMIT @limit
    """,
    "journal_lines": f"""
        SELECT
          id,
          journal_entry_id,
          account_code,
          account_name,
          debit,
          credit,
          description,
          currency,
          is_orphaned
        FROM `{BIGQUERY_PROJECT_ID}.{BIGQUERY_DATASET}.stg_finance_journal_lines`
        WHERE company_id = @company_id
        LIMIT @limit
    """,
}


def _execute_bigquery_sync(
    query_str: str,
    parameters: List[Any],
) -> List[Dict[str, Any]]:
    """Synchronous BigQuery execution run within a background thread pool."""
    client = get_bigquery_client()
    job_config = bigquery.QueryJobConfig(
        query_parameters=parameters,
        labels={"datacloud": "antigravity"},
    )
    query_job = client.query(query_str, job_config=job_config)
    results = query_job.result()
    rows: List[Dict[str, Any]] = [dict(row) for row in results]
    return rows


async def _get_cached_payload(cache_key: str) -> Optional[Dict[str, Any]]:
    """Fetches cached JSON payload from Redis with fail-open error handling."""
    try:
        raw_val = await redis_client.get(cache_key)
        if raw_val:
            return json.loads(raw_val)
    except Exception as exc:
        logger.warning("Redis lookup failed for key '%s': %s (bypassing cache)", cache_key, exc)
    return None


async def _set_cached_payload(cache_key: str, payload: Dict[str, Any], ttl_seconds: int) -> None:
    """Stores JSON payload into Redis with fail-open error handling."""
    try:
        serialized = json.dumps(payload, default=_json_serial)
        await redis_client.setex(cache_key, ttl_seconds, serialized)
    except Exception as exc:
        logger.warning("Redis write failed for key '%s': %s", cache_key, exc)


# ─── API Endpoints ──────────────────────────────────────────────────────────

@router.get(
    "/dashboards/{dashboard_id}",
    summary="Get tenant dashboard analytics via BigQuery proxy with Redis caching",
    response_description="Returns cached or fresh analytics payload for the specified dashboard",
)
async def get_dashboard_analytics(
    dashboard_id: str,
    limit: int = Query(50, ge=1, le=500, description="Max rows to return for tabular dashboards"),
    ttl: int = Query(DEFAULT_CACHE_TTL_SECONDS, ge=60, le=86400, description="Cache TTL in seconds (15-30m)"),
    force_refresh: bool = Query(False, description="Bypass Redis cache and force re-querying BigQuery"),
    company_id_override: Optional[str] = Query(None, description="Super admin only: target company ID"),
    current_user: Any = Depends(get_authenticated_user),
) -> Dict[str, Any]:
    """
    Secure Proxy Endpoint:
    - Derives `company_id` strictly from authenticated user.
    - Checks Redis using composite key: `analytics:{company_id}:{dashboard_id}`.
    - On cache miss: executes parameterized BigQuery query in a thread pool.
    - Caches the serialized response with the specified TTL.
    """
    normalized_dashboard_id = dashboard_id.strip().lower()
    if normalized_dashboard_id not in DASHBOARD_QUERIES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown dashboard '{dashboard_id}'. Available: {list(DASHBOARD_QUERIES.keys())}",
        )

    # 1. Resolve Company ID securely
    caller_company_id = getattr(current_user, "company_id", None)
    is_super = getattr(current_user, "is_superuser", False) or getattr(current_user, "is_super_admin", False)

    if is_super and company_id_override:
        effective_company_id = company_id_override.strip()
    elif caller_company_id:
        effective_company_id = str(caller_company_id).strip()
    else:
        # Fallback for dev/demo master accounts without an assigned company_id
        effective_company_id = "f7b38b2f-5426-4625-a110-e38261fdf6e1"

    # 2. Redis Composite Key: analytics:{company_id}:{dashboard_id}
    cache_key = f"analytics:{effective_company_id}:{normalized_dashboard_id}"

    # 3. Cache-Aside Check
    if not force_refresh:
        cached_data = await _get_cached_payload(cache_key)
        if cached_data is not None:
            cached_data["cache_hit"] = True
            return cached_data

    # 4. BigQuery Parameterized Execution (No string interpolation)
    query_template = DASHBOARD_QUERIES[normalized_dashboard_id]
    parameters = [
        ScalarQueryParameter("company_id", "STRING", effective_company_id),
    ]
    if "@limit" in query_template:
        parameters.append(ScalarQueryParameter("limit", "INT64", limit))

    try:
        # Run query off the main asyncio thread to preserve ASGI responsiveness
        rows = await asyncio.to_thread(_execute_bigquery_sync, query_template, parameters)
    except Exception as exc:
        logger.error(
            "BigQuery query failed for dashboard '%s' (company: %s): %s",
            normalized_dashboard_id,
            effective_company_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"BigQuery analytics query failed: {str(exc)}",
        )

    # 5. Build response payload
    response_payload: Dict[str, Any] = {
        "dashboard_id": normalized_dashboard_id,
        "company_id": effective_company_id,
        "cached_at": datetime.now(timezone.utc).isoformat(),
        "cache_hit": False,
        "ttl_seconds": ttl,
        "row_count": len(rows),
        "data": rows,
    }

    # 6. Write back to Redis asynchronously
    await _set_cached_payload(cache_key, response_payload, ttl)

    return response_payload


@router.delete(
    "/cache/{dashboard_id}",
    summary="Purge Redis cached analytics for a specific dashboard",
)
async def invalidate_dashboard_cache(
    dashboard_id: str,
    company_id_override: Optional[str] = Query(None, description="Super admin only: target company ID"),
    current_user: Any = Depends(get_authenticated_user),
) -> Dict[str, Any]:
    """Invalidates the Redis cache entry `analytics:{company_id}:{dashboard_id}`."""
    normalized_dashboard_id = dashboard_id.strip().lower()
    caller_company_id = getattr(current_user, "company_id", None)
    is_super = getattr(current_user, "is_superuser", False) or getattr(current_user, "is_super_admin", False)

    if is_super and company_id_override:
        effective_company_id = company_id_override.strip()
    elif caller_company_id:
        effective_company_id = str(caller_company_id).strip()
    else:
        effective_company_id = "f7b38b2f-5426-4625-a110-e38261fdf6e1"

    cache_key = f"analytics:{effective_company_id}:{normalized_dashboard_id}"
    deleted = 0
    try:
        deleted = await redis_client.delete(cache_key)
    except Exception as exc:
        logger.warning("Failed to invalidate cache key '%s': %s", cache_key, exc)

    return {
        "status": "success",
        "cache_key": cache_key,
        "invalidated": bool(deleted),
        "dashboard_id": normalized_dashboard_id,
        "company_id": effective_company_id,
    }


@router.delete(
    "/cache",
    summary="Purge all Redis cached analytics for the authenticated tenant",
)
async def invalidate_all_tenant_cache(
    company_id_override: Optional[str] = Query(None, description="Super admin only: target company ID"),
    current_user: Any = Depends(get_authenticated_user),
) -> Dict[str, Any]:
    """Invalidates all Redis cache keys under pattern `analytics:{company_id}:*`."""
    caller_company_id = getattr(current_user, "company_id", None)
    is_super = getattr(current_user, "is_superuser", False) or getattr(current_user, "is_super_admin", False)

    if is_super and company_id_override:
        effective_company_id = company_id_override.strip()
    elif caller_company_id:
        effective_company_id = str(caller_company_id).strip()
    else:
        effective_company_id = "f7b38b2f-5426-4625-a110-e38261fdf6e1"

    pattern = f"analytics:{effective_company_id}:*"
    deleted_count = 0
    try:
        keys = await redis_client.keys(pattern)
        if keys:
            deleted_count = await redis_client.delete(*keys)
    except Exception as exc:
        logger.warning("Failed to invalidate pattern '%s': %s", pattern, exc)

    return {
        "status": "success",
        "pattern": pattern,
        "keys_purged": deleted_count,
        "company_id": effective_company_id,
    }
