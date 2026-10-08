"""Shared platform-scoped data and provider fixtures for authentication tests."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from backend import models
from backend.database import PlatformSessionLocal
from backend.app.services import communication_service


@pytest.fixture(autouse=True)
def auth_notification_provider(monkeypatch, request):
    """Seed disposable platform providers for auth tests without contacting live services."""
    if PlatformSessionLocal is None:
        raise RuntimeError("Auth tests require the privileged platform database connection.")

    onboarding_test = request.node.nodeid.endswith("test_e2e_register_init_and_verify_pipeline")
    provider_specs = [
        (
            "email", "sendgrid", "test-notifications@example.invalid",
            {"region": "global"}, {"api_key": "auth-test-sendgrid-key"},
        ),
    ]
    if onboarding_test:
        provider_specs.append(
            (
                "sms", "twilio", "OXENGL",
                {"account_sid": "AC0123456789abcdef0123456789abcdef", "region": "us1"},
                {"auth_token": "auth-test-twilio-token"},
            )
        )
    setting_ids: list[uuid.UUID] = []
    with PlatformSessionLocal() as db:
        for channel, provider, sender, config, credentials in provider_specs:
            existing = db.scalar(
                select(models.CommunicationSetting.id).where(
                    models.CommunicationSetting.tenant_id.is_(None),
                    models.CommunicationSetting.channel == channel,
                    models.CommunicationSetting.is_active.is_(True),
                )
            )
            if existing is not None:
                continue
            setting = communication_service.create_setting(
                db,
                tenant_id=None,
                actor_id=None,
                channel=channel,
                provider=provider,
                sender_identity=sender,
                config=config,
                credentials=credentials,
                is_active=True,
            )
            setting_ids.append(setting.id)
        db.commit()

    async def accept_test_message(_setting, _destination, _body):
        return None

    monkeypatch.setattr(communication_service, "deliver", accept_test_message)
    yield

    if setting_ids:
        with PlatformSessionLocal() as db:
            for setting_id in setting_ids:
                setting = db.get(models.CommunicationSetting, setting_id)
                if setting is not None:
                    db.delete(setting)
            db.commit()
