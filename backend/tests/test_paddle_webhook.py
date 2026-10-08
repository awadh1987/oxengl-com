"""Tests for Paddle SaaS subscription webhook ingestion route."""

import hashlib
import hmac
import json
import os
import time
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.database import SessionLocal
from backend.models import MasterTenant

TEST_SECRET = "pdl_test_secret_key_987654321"


@pytest.fixture(autouse=True)
def set_paddle_secret(monkeypatch):
    monkeypatch.setenv("PADDLE_WEBHOOK_SECRET", TEST_SECRET)


def build_paddle_signature(raw_body: bytes, secret: str = TEST_SECRET) -> str:
    ts = str(int(time.time()))
    signed_payload = f"{ts}:{raw_body.decode('utf-8')}"
    h1 = hmac.new(secret.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"ts={ts};h1={h1}"


def test_paddle_webhook_rejects_missing_or_invalid_signature():
    client = TestClient(app)
    # Missing signature
    resp = client.post("/api/platform/webhooks/paddle", content=b"{}")
    assert resp.status_code == 401

    # Invalid signature
    resp = client.post(
        "/api/platform/webhooks/paddle",
        content=b"{}",
        headers={"Paddle-Signature": "ts=123;h1=invalid_hash", "Content-Type": "application/json"},
    )
    assert resp.status_code == 401


def test_paddle_webhook_handles_subscription_lifecycle():
    client = TestClient(app)
    db = SessionLocal()
    tenant = db.query(MasterTenant).first()
    assert tenant is not None

    tenant.paddle_customer_id = "ctm_pyt_001"
    tenant.paddle_subscription_id = "sub_pyt_001"
    tenant.subscription_status = "trialing"
    db.commit()

    try:
        # Test subscription.updated
        payload = {
            "event_type": "subscription.updated",
            "data": {
                "id": "sub_pyt_001",
                "customer_id": "ctm_pyt_001",
                "status": "active",
                "subscription_plan": "scale_annual",
                "next_billed_at": "2027-12-31T23:59:59Z",
            },
        }
        raw_body = json.dumps(payload).encode("utf-8")
        sig = build_paddle_signature(raw_body)
        resp = client.post(
            "/api/platform/webhooks/paddle",
            content=raw_body,
            headers={"Paddle-Signature": sig, "Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "processed"

        db.refresh(tenant)
        assert tenant.subscription_status == "active"
        assert tenant.subscription_plan == "scale_annual"
        assert tenant.license_expiry_date is not None

        # Test subscription.past_due
        payload_past_due = {
            "event_type": "subscription.past_due",
            "data": {
                "id": "sub_pyt_001",
                "customer_id": "ctm_pyt_001",
            },
        }
        raw_body_pd = json.dumps(payload_past_due).encode("utf-8")
        sig_pd = build_paddle_signature(raw_body_pd)
        resp_pd = client.post(
            "/api/platform/webhooks/paddle",
            content=raw_body_pd,
            headers={"Paddle-Signature": sig_pd, "Content-Type": "application/json"},
        )
        assert resp_pd.status_code == 200
        assert resp_pd.json()["status"] == "processed"

        db.refresh(tenant)
        assert tenant.subscription_status == "past_due"

    finally:
        tenant.paddle_customer_id = None
        tenant.paddle_subscription_id = None
        tenant.subscription_status = "trialing"
        tenant.subscription_plan = "trial"
        tenant.license_expiry_date = None
        db.commit()
        db.close()
