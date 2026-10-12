"""
Platform SaaS Billing Webhook Handler for Paddle (Merchant of Record).
Processes subscription lifecycle events: created, activated, updated, past_due, canceled.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

try:
    from backend.database import get_db
    from backend.models import MasterTenant
except ImportError:
    from database import get_db
    from models import MasterTenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/platform/webhooks", tags=["Platform Billing"])
PADDLE_WEBHOOK_SECRET = os.getenv("PADDLE_WEBHOOK_SECRET", "")


def verify_paddle_signature(raw_body: bytes, paddle_signature: Optional[str]) -> bool:
    """
    Validates Paddle webhook signature according to Paddle v2 HMAC-SHA256 signature specification.
    Format: ts=<timestamp>;h1=<signature>
    Signed payload: <ts>:<raw_body>
    """
    secret = os.getenv("PADDLE_WEBHOOK_SECRET", PADDLE_WEBHOOK_SECRET)
    if not secret or not paddle_signature:
        return False
    try:
        parts = dict(item.split("=", 1) for item in paddle_signature.split(";"))
        ts = parts.get("ts")
        h1 = parts.get("h1")
        if not ts or not h1:
            return False
        signed_payload = f"{ts}:{raw_body.decode('utf-8')}"
        expected = hmac.new(
            secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, h1)
    except Exception as exc:
        logger.error(f"Error validating Paddle signature: {exc}")
        return False


@router.post("/paddle", status_code=status.HTTP_200_OK)
async def handle_paddle_webhook(
    request: Request,
    paddle_signature: Optional[str] = Header(None, alias="Paddle-Signature"),
    db: Session = Depends(get_db),
):
    """
    Ingest and process Paddle subscription webhook events for OxenGL platform billing.
    Advances tenant license expiry, activates subscriptions, and tracks subscription plans.
    """
    raw_body = await request.body()
    if not verify_paddle_signature(raw_body, paddle_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature",
        )

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    event_type = payload.get("event_type")
    data = payload.get("data", {})
    customer_id = data.get("customer_id")
    subscription_id = data.get("id")

    # Locate MasterTenant by customer_id or subscription_id
    filter_clauses = []
    if customer_id:
        filter_clauses.append(MasterTenant.paddle_customer_id == customer_id)
    if subscription_id:
        filter_clauses.append(MasterTenant.paddle_subscription_id == subscription_id)

    tenant = None
    if filter_clauses:
        tenant = db.query(MasterTenant).filter(or_(*filter_clauses)).first()

    # Fallback to custom_data if tenant not found by paddle IDs yet
    if not tenant:
        custom_data = data.get("custom_data", {})
        tenant_id = custom_data.get("tenant_id")
        tenant_slug = custom_data.get("tenant_slug")
        if tenant_id:
            try:
                import uuid
                tenant = db.query(MasterTenant).filter(MasterTenant.id == uuid.UUID(str(tenant_id))).first()
            except Exception:
                pass
        if not tenant and tenant_slug:
            tenant = db.query(MasterTenant).filter(MasterTenant.slug == tenant_slug).first()

    if not tenant:
        logger.warning(
            "Paddle webhook ignored: Tenant not found for customer_id=%s, subscription_id=%s",
            customer_id,
            subscription_id,
        )
        return {"status": "ignored", "reason": "Tenant not found"}

    # Bind IDs to tenant record if not yet set
    if customer_id and not tenant.paddle_customer_id:
        tenant.paddle_customer_id = customer_id
    if subscription_id and not tenant.paddle_subscription_id:
        tenant.paddle_subscription_id = subscription_id

    # Handle subscription renewal and activation events
    if event_type in ["subscription.created", "subscription.activated", "subscription.updated"]:
        tenant.subscription_status = data.get("status", "active")
        if tenant.subscription_status not in ["active", "trialing", "past_due", "canceled"]:
            tenant.subscription_status = "active"

        tenant.paddle_subscription_id = subscription_id

        # Extract and log subscription plan
        items = data.get("items", [])
        plan_from_items = None
        if items and isinstance(items, list) and len(items) > 0:
            first_item = items[0]
            price = first_item.get("price", {}) if isinstance(first_item, dict) else {}
            plan_from_items = price.get("description") or price.get("name") or price.get("id")

        plan = data.get("subscription_plan") or data.get("plan_id") or plan_from_items
        if plan:
            tenant.subscription_plan = str(plan)

        logger.info(
            "Paddle subscription event %s for tenant %s: subscription_plan=%s, status=%s",
            event_type,
            tenant.slug,
            tenant.subscription_plan,
            tenant.subscription_status,
        )

        # Advance license_expiry_date
        next_billed_at = data.get("next_billed_at")
        if next_billed_at:
            try:
                dt = datetime.fromisoformat(str(next_billed_at).replace("Z", "+00:00"))
                if dt.tzinfo is not None:
                    dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
                tenant.license_expiry_date = dt
            except Exception:
                tenant.license_expiry_date = datetime.utcnow() + timedelta(days=365)
        else:
            tenant.license_expiry_date = datetime.utcnow() + timedelta(days=365)

        db.commit()

    elif event_type in ["subscription.past_due", "subscription.canceled"]:
        status_part = event_type.split(".")[1]
        tenant.subscription_status = status_part
        logger.info(
            "Paddle subscription event %s for tenant %s: subscription_status=%s",
            event_type,
            tenant.slug,
            tenant.subscription_status,
        )
        db.commit()

    return {"status": "processed", "event": event_type}
