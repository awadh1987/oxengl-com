"""
OxenGL SaaS Billing & Stripe Webhook Integration.
Handles subscription lifecycles, tier upgrades, and automated seat tracking.
"""

import json
import inspect
from datetime import datetime, timezone
from typing import Optional, Any
from fastapi import APIRouter, Request, Header, HTTPException, status, Depends
from sqlalchemy.orm import Session
from sqlalchemy import update, select

from backend.database import get_db

try:
    from backend.app.domains.saas.models import TenantSubscription, SubscriptionPlan
except ImportError:
    from app.domains.saas.models import TenantSubscription, SubscriptionPlan

router = APIRouter(tags=["SaaS & Subscriptions"])
STRIPE_WEBHOOK_SECRET = "whsec_CHANGE_ME_IN_PRODUCTION"


@router.post("/webhooks/stripe", status_code=status.HTTP_200_OK)
async def process_stripe_webhook_events(
    request: Request,
    stripe_signature: Optional[str] = Header(None),
    db: Any = Depends(get_db),
):
    """Asynchronously intercepts cryptographic webhooks from Stripe to adjust subscription lifecycle status."""
    payload = await request.body()
    # In production, call stripe.Webhook.construct_event(payload, stripe_signature, STRIPE_WEBHOOK_SECRET)
    try:
        event = json.loads(payload) if payload else {}
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    event_type = event.get("type")
    data_object = event.get("data", {}).get("object", {})

    if event_type in ["customer.subscription.updated", "customer.subscription.deleted"]:
        customer_id = data_object.get("customer")
        stripe_status = data_object.get("status")  # 'active', 'past_due', 'canceled'
        period_end_raw = data_object.get("current_period_end", 0)
        period_end = datetime.fromtimestamp(period_end_raw, tz=timezone.utc)

        stmt = (
            update(TenantSubscription)
            .where(TenantSubscription.stripe_customer_id == customer_id)
            .values(status=stripe_status, current_period_end=period_end)
        )
        res = db.execute(stmt)
        if inspect.isawaitable(res):
            await res
        commit_res = db.commit()
        if inspect.isawaitable(commit_res):
            await commit_res

    return {"status": "event_processed"}
