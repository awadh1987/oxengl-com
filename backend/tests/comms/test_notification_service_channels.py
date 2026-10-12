import pytest

from backend.app.services.notification_service import NotificationService, VerificationService


def test_select_channels():
    s = NotificationService.select_channels
    assert s("auto", True) == ["email", "sms"]
    assert s(None, False) == ["email"]
    assert s("email", True) == ["email"]
    assert s("sms", True) == ["sms"]
    assert s("sms", False) == ["email"]


@pytest.mark.asyncio
async def test_sms_failure_does_not_block_email(monkeypatch):
    sent = []

    async def ok_email(email, otp, company, tenant_id=None):
        sent.append("email")

    async def bad_sms(phone, otp, tenant_id=None):
        raise RuntimeError("gateway down")

    monkeypatch.setattr(VerificationService, "dispatch_email_otp", staticmethod(ok_email))
    monkeypatch.setattr(VerificationService, "dispatch_sms_otp", staticmethod(bad_sms))
    await NotificationService.send_password_reset_otp(
        ["sms", "email"], email="a@b.co", phone="+966500000000", otp="123456", company_name="X"
    )
    assert sent == ["email"]
