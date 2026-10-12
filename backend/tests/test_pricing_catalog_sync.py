"""
Test Suite: Unified Pricing & Subscription Plans with Landing Page CMS.
Tests:
1. test_pricing_public_landing_reflects_subscription_plans:
   Public landing endpoint /api/v1/public/landing dynamically extracts active subscription plans.
2. test_pricing_superadmin_plan_update_syncs_landing_page:
   SuperAdmin editing plan name, price, or features instantly reflects on /api/v1/public/landing without container restart.
3. test_pricing_cache_invalidation_on_update:
   Landing cache is purged immediately when a subscription plan is updated.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.main import app
from backend.database import SessionLocal
from backend.app.domains.saas.models import SubscriptionPlan
from backend.app.services.billing_service import seed_default_subscription_plans
from backend.app.api.v1.platform_governance import invalidate_landing_cache
from backend.tests.auth_helpers import platform_superadmin_headers


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    db = SessionLocal()
    seed_default_subscription_plans(db)
    invalidate_landing_cache()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def test_pricing_public_landing_reflects_subscription_plans(client: TestClient, db_session):
    """
    Verifies GET /api/v1/public/landing returns the active subscription plans in sections_map.pricing_matrix.
    """
    resp = client.get("/api/v1/public/landing")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    sections_map = data.get("sections_map", {})
    assert "pricing_matrix" in sections_map or "pricing" in sections_map

    pricing_section = sections_map.get("pricing_matrix") or sections_map.get("pricing")
    content_data = pricing_section.get("content_data", {})
    tiers = content_data.get("tiers", [])

    assert len(tiers) >= 3, f"Expected at least 3 subscription tiers, got {len(tiers)}"

    tier_names = [t.get("name") or t.get("plan_name") for t in tiers]
    # Check that plans exist
    assert any("FREE" in str(t.get("code", "")).upper() or "FREE" in str(name).upper() for t, name in zip(tiers, tier_names))
    assert any("PRO" in str(t.get("code", "")).upper() or "PRO" in str(name).upper() for t, name in zip(tiers, tier_names))


def test_pricing_superadmin_plan_update_syncs_landing_page(client: TestClient, db_session):
    """
    Verifies that PUT /api/v1/superadmin/billing/plans/{plan_id} updates the plan and immediately
    syncs to /api/v1/public/landing.
    """
    plan = db_session.scalar(select(SubscriptionPlan).where(SubscriptionPlan.name == "PROFESSIONAL"))
    assert plan is not None, "PROFESSIONAL plan must exist"

    new_title = f"Pro Logistics Fleet {uuid.uuid4().hex[:6]}"
    new_price = 2499.00
    new_features = [
        "Up to 25 Heavy Fleet Trucks",
        "ZATCA Phase 2 Real-Time Clearance",
        "Automated Weighbridge Scales",
    ]

    payload = {
        "display_name": new_title,
        "monthly_price": str(new_price),
        "annual_price": "24990.00",
        "display_features": new_features,
        "is_featured": True,
    }

    headers, _ = platform_superadmin_headers(db_session)
    put_resp = client.put(f"/api/v1/superadmin/billing/plans/{plan.id}", json=payload, headers=headers)
    assert put_resp.status_code == 200, put_resp.text

    # Now verify GET /api/v1/public/landing reflects the updated title and price immediately
    landing_resp = client.get("/api/v1/public/landing")
    assert landing_resp.status_code == 200
    landing_data = landing_resp.json()

    pm = landing_data.get("sections_map", {}).get("pricing_matrix", {})
    tiers = pm.get("content_data", {}).get("tiers", [])

    matched = next((t for t in tiers if str(t.get("plan_id")) == str(plan.id) or t.get("name") == new_title), None)
    assert matched is not None, f"Updated plan {new_title} not found in landing tiers: {tiers}"
    assert matched.get("name") == new_title
    assert matched.get("monthly_price") == new_price or "2,499" in str(matched.get("price_monthly"))
    assert matched.get("features") == new_features


def test_pricing_cache_invalidation_on_update(client: TestClient, db_session):
    """
    Verifies that cached landing data does not prevent updated pricing from being returned.
    """
    # 1. Warm cache
    client.get("/api/v1/public/landing")

    # 2. Update Enterprise plan
    ent_plan = db_session.scalar(select(SubscriptionPlan).where(SubscriptionPlan.name == "ENTERPRISE"))
    assert ent_plan is not None

    unique_ent_title = f"Sovereign Dedicated {uuid.uuid4().hex[:6]}"
    headers, _ = platform_superadmin_headers(db_session)
    client.put(
        f"/api/v1/superadmin/billing/plans/{ent_plan.id}",
        json={"display_name": unique_ent_title, "monthly_price": "6999.00"},
        headers=headers,
    )

    # 3. Request immediately without waiting 60s cache TTL
    resp = client.get("/api/v1/public/landing")
    assert resp.status_code == 200
    data = resp.json()
    tiers = data.get("sections_map", {}).get("pricing_matrix", {}).get("content_data", {}).get("tiers", [])
    matched = next((t for t in tiers if t.get("name") == unique_ent_title), None)
    assert matched is not None, "Expected updated enterprise title immediately due to cache invalidation"
