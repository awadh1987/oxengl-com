"""
Unit and Integration Tests for Payment Gateway Strategy Pattern & Tenant Subscribe Endpoint.
File: backend/tests/test_payment_strategy_and_subscription.py
"""

from __future__ import annotations

import secrets
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.api.v1.billing import tenant_billing_router
from backend.app.core import auth as core_auth
from backend.app.core import secret_vault
from backend.app.domains.saas.models import PaymentGatewaySettings, SubscriptionPlan
from backend.app.services.billing.payment_strategy import (
    GatewayConfigurationError,
    GatewayDisabledError,
    MoyasarGateway,
    OfflinePaymentGateway,
    PaymentMethod,
    StripeGateway,
    get_payment_gateway,
)
from backend.database import Base, get_db, get_platform_db
from backend.models import MasterTenant, SaaSInvoice

STRIPE_SK = "sk_test_MockStripeKey1234567890"
STRIPE_PK = "pk_test_MockStripePubKey1234567"
MOYASAR_SK = "sk_test_MockMoyasarKey12345678"
MOYASAR_PK = "pk_test_MockMoyasarPubKey1234"


@pytest.fixture(autouse=True)
def vault_key(monkeypatch):
    monkeypatch.setenv(secret_vault.KEY_ENV, secrets.token_hex(32))
    monkeypatch.delenv(secret_vault.PREVIOUS_KEYS_ENV, raising=False)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("MOYASAR_API_KEY", raising=False)
    secret_vault._multifernet.cache_clear()
    yield
    secret_vault._multifernet.cache_clear()


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    # Temporary strip PostgreSQL specific ::jsonb server_default so SQLite can create the table
    orig_sd = MasterTenant.__table__.c.features_override.server_default
    MasterTenant.__table__.c.features_override.server_default = None

    try:
        for model in (PaymentGatewaySettings, SubscriptionPlan, MasterTenant, SaaSInvoice):
            model.__table__.create(engine)  # type: ignore[attr-defined]
    finally:
        MasterTenant.__table__.c.features_override.server_default = orig_sd

    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    # Seed catalog plan
    db = factory()
    plan = SubscriptionPlan(
        id=uuid.uuid4(),
        name="PROFESSIONAL",
        display_name="Professional Business Plan",
        monthly_price=Decimal("499.00"),
        annual_price=Decimal("4990.00"),
        currency="SAR",
    )
    db.add(plan)

    tenant = MasterTenant(
        id=uuid.uuid4(),
        name="Test Logistics Tenant",
        slug="test-tenant",
        owner_full_name="Tenant Admin",
        owner_email="tenant.admin@oxengl.com",
        owner_mobile="+966500000000",
        status="active",
        subscription_tier="professional",
        max_users=10,
        max_storage_gb=25,
    )
    db.add(tenant)
    db.commit()
    db.close()

    return factory


def _mock_user(company_id=None, email="tenant.admin@oxengl.com"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        email=email,
        role="Admin",
        company_id=company_id,
        is_superuser=False,
        access_control_list="",
        role_ids="",
    )


def _client(session_factory, user=None) -> TestClient:
    app = FastAPI()
    app.include_router(tenant_billing_router, prefix="/api/v1/tenant/billing")
    app.include_router(tenant_billing_router, prefix="/api/v1/billing")

    db = session_factory()
    tenant = db.query(MasterTenant).first()
    db.close()

    current_user = user or _mock_user(company_id=tenant.id if tenant else None)

    def _db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_platform_db] = _db
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[core_auth.get_authenticated_user] = lambda: current_user
    return TestClient(app)


# ------------------------------------------------------------------ Strategy Tests

def test_offline_gateway_returns_instructions_and_creates_invoice(session_factory):
    db = session_factory()
    tenant = db.query(MasterTenant).first()
    plan = db.query(SubscriptionPlan).first()

    # Configure custom bank and wallet instructions
    settings = PaymentGatewaySettings(
        id=1,
        local_bank_instructions=[{
            "bank_name": "Kuraimi Bank",
            "account_name": "OxenGL Settlement",
            "account_number": "12345678",
            "currency": "YER",
            "is_active": True,
        }],
        digital_wallet_instructions=[{
            "provider": "ONE Cash",
            "wallet_number": "+967 777 000 111",
            "account_name": "OxenGL Wallet",
            "qr_code_url": "/static/uploads/wallets/test.png",
            "is_active": True,
        }],
    )
    db.add(settings)
    db.commit()

    gateway = get_payment_gateway("offline", db)
    assert isinstance(gateway, OfflinePaymentGateway)

    result = gateway.create_subscription(
        tenant=tenant,
        plan=plan,
        billing_cycle="monthly",
    )

    assert result["payment_method"] == "offline"
    assert "invoice_id" in result
    assert "invoice_number" in result
    assert len(result["instructions"]["bank_accounts"]) == 1
    assert result["instructions"]["bank_accounts"][0]["bank_name"] == "Kuraimi Bank"
    assert len(result["instructions"]["digital_wallets"]) == 1
    assert result["instructions"]["digital_wallets"][0]["provider"] == "ONE Cash"

    # Verify invoice was persisted
    invoice = db.get(SaaSInvoice, uuid.UUID(result["invoice_id"]))
    assert invoice is not None
    assert invoice.payment_method == "offline_bank_transfer"
    db.close()


def test_stripe_gateway_disabled_raises_error(session_factory):
    db = session_factory()
    with pytest.raises(GatewayDisabledError) as exc_info:
        get_payment_gateway(PaymentMethod.STRIPE, db)
    assert "disabled" in str(exc_info.value).lower()
    db.close()


def test_stripe_gateway_missing_key_raises_configuration_error(session_factory):
    db = session_factory()
    settings = PaymentGatewaySettings(id=1, is_stripe_enabled=True)
    db.add(settings)
    db.commit()

    with pytest.raises(GatewayConfigurationError) as exc_info:
        get_payment_gateway("stripe", db)
    assert "not configured" in str(exc_info.value).lower()
    db.close()


def test_stripe_gateway_decrypts_keys_and_generates_checkout_url(session_factory):
    db = session_factory()
    tenant = db.query(MasterTenant).first()
    plan = db.query(SubscriptionPlan).first()

    settings = PaymentGatewaySettings(
        id=1,
        is_stripe_enabled=True,
        stripe_secret_key_encrypted=secret_vault.encrypt_secret("stripe_secret_key", STRIPE_SK),
        stripe_publishable_key_encrypted=secret_vault.encrypt_secret("stripe_publishable_key", STRIPE_PK),
    )
    db.add(settings)
    db.commit()

    gateway = get_payment_gateway("stripe", db)
    assert isinstance(gateway, StripeGateway)
    assert gateway.secret_key == STRIPE_SK
    assert gateway.publishable_key == STRIPE_PK

    res = gateway.create_subscription(tenant=tenant, plan=plan, billing_cycle="monthly")
    assert res["payment_method"] == "stripe"
    assert "checkout.stripe.com" in res["checkout_url"]
    assert res["session_id"].startswith("cs_test_")
    db.close()


def test_moyasar_gateway_disabled_raises_error(session_factory):
    db = session_factory()
    with pytest.raises(GatewayDisabledError) as exc_info:
        get_payment_gateway(PaymentMethod.MOYASAR, db)
    assert "disabled" in str(exc_info.value).lower()
    db.close()


def test_moyasar_gateway_decrypts_keys_and_generates_session(session_factory):
    db = session_factory()
    tenant = db.query(MasterTenant).first()
    plan = db.query(SubscriptionPlan).first()

    settings = PaymentGatewaySettings(
        id=1,
        is_moyasar_enabled=True,
        moyasar_api_key_encrypted=secret_vault.encrypt_secret("moyasar_api_key", MOYASAR_SK),
        moyasar_publishable_key_encrypted=secret_vault.encrypt_secret("moyasar_publishable_key", MOYASAR_PK),
    )
    db.add(settings)
    db.commit()

    gateway = get_payment_gateway("moyasar", db)
    assert isinstance(gateway, MoyasarGateway)
    assert gateway.api_key == MOYASAR_SK
    assert gateway.publishable_key == MOYASAR_PK

    res = gateway.create_subscription(tenant=tenant, plan=plan, billing_cycle="monthly")
    assert res["payment_method"] == "moyasar"
    assert "api.moyasar.com" in res["checkout_url"]
    assert res["payment_id"].startswith("moy_")
    assert "mada" in res["supported_methods"]
    db.close()


def test_unsupported_gateway_method_raises_value_error(session_factory):
    db = session_factory()
    with pytest.raises(ValueError) as exc_info:
        get_payment_gateway("bitcoin", db)
    assert "unsupported" in str(exc_info.value).lower()
    db.close()


# ------------------------------------------------------------------ API Endpoint Tests

def test_tenant_subscribe_endpoint_offline(session_factory):
    client = _client(session_factory)
    payload = {
        "plan_name": "PROFESSIONAL",
        "payment_method": "offline",
        "billing_cycle": "monthly",
    }
    res = client.post("/api/v1/tenant/billing/subscribe", json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["payment_method"] == "offline"
    assert "invoice_id" in body
    assert "instructions" in body
    assert "bank_accounts" in body["instructions"]


def test_tenant_subscribe_endpoint_stripe(session_factory):
    db = session_factory()
    settings = PaymentGatewaySettings(
        id=1,
        is_stripe_enabled=True,
        stripe_secret_key_encrypted=secret_vault.encrypt_secret("stripe_secret_key", STRIPE_SK),
        stripe_publishable_key_encrypted=secret_vault.encrypt_secret("stripe_publishable_key", STRIPE_PK),
    )
    db.add(settings)
    db.commit()
    db.close()

    client = _client(session_factory)
    payload = {
        "plan_name": "PROFESSIONAL",
        "payment_method": "stripe",
        "billing_cycle": "monthly",
    }
    res = client.post("/api/v1/tenant/billing/subscribe", json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["payment_method"] == "stripe"
    assert "checkout_url" in body


def test_tenant_subscribe_endpoint_disabled_gateway_returns_400(session_factory):
    client = _client(session_factory)
    payload = {
        "plan_name": "PROFESSIONAL",
        "payment_method": "stripe",  # Not enabled in DB
        "billing_cycle": "monthly",
    }
    res = client.post("/api/v1/tenant/billing/subscribe", json=payload)
    assert res.status_code == 400
    assert "disabled" in res.json()["detail"].lower()


def test_tenant_subscribe_endpoint_nonexistent_plan_returns_404(session_factory):
    client = _client(session_factory)
    payload = {
        "plan_name": "NON_EXISTENT_PLAN_XYZ",
        "payment_method": "offline",
    }
    res = client.post("/api/v1/tenant/billing/subscribe", json=payload)
    assert res.status_code == 404
