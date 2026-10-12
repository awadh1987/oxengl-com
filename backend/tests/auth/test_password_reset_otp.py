import uuid
import pytest
from fastapi import status
from sqlalchemy import text
from passlib.context import CryptContext

from backend.database import PlatformSessionLocal as SessionLocal
from backend.app.services.notification_service import VerificationService

pwd_context = CryptContext(
    schemes=["argon2", "pbkdf2_sha256"],
    deprecated="auto",
    argon2__memory_cost=65536,
    argon2__time_cost=3,
    argon2__parallelism=4,
)


@pytest.mark.asyncio
async def test_password_reset_otp_request_and_verify_pipeline(async_client, monkeypatch):
    """
    Validates Phase 6B Redis OTP Password Recovery Lifecycle:
    1. /forgot-password generates 6-digit OTP stored in Redis (5-min TTL).
    2. /reset-password accepts email + 6-digit OTP code + new password.
    3. Anti-replay check: Attempting to reuse the same OTP fails with 400 Bad Request.
    """
    uid = uuid.uuid4().hex[:6]
    test_email = f"recovery-otp-{uid}@oxengl.test"
    test_phone = f"+9665{uuid.uuid4().int % 100000000:08d}"
    db = SessionLocal()
    try:
        # Ensure test user exists in master_users or tenant_users
        db.execute(
            text("""
                INSERT INTO public.master_users (id, email, mobile_number, full_name, password_hash, role, is_active, created_at, updated_at)
                VALUES (gen_random_uuid(), :e, :p, 'Test User', :h, 'admin', TRUE, NOW(), NOW())
                ON CONFLICT (email) DO UPDATE SET password_hash = :h
            """),
            {"e": test_email, "p": test_phone, "h": pwd_context.hash("InitialPassword123!")},
        )
        db.commit()
    finally:
        db.close()

    # The API never returns the OTP (Addendum D); capture it where it is generated for delivery.
    captured = {}
    original = VerificationService.generate_and_store_otp.__func__

    async def capture(cls, identifier, *args, **kwargs):
        value = await original(cls, identifier, *args, **kwargs)
        captured[identifier.strip().lower()] = value
        return value

    monkeypatch.setattr(VerificationService, "generate_and_store_otp", classmethod(capture))

    # 1. Dispatch OTP request
    req_payload = {
        "email": test_email,
        "workspace_slug": "master",
    }
    init_res = await async_client.post("/api/v1/auth/forgot-password", json=req_payload)
    assert init_res.status_code == status.HTTP_200_OK
    init_data = init_res.json()
    assert init_data.get("status") == "OTP_DISPATCHED"
    assert "otp_code" not in init_data and "token" not in init_data
    otp_code = captured.get(f"reset:{test_email}")
    assert otp_code is not None
    assert len(otp_code) == 6
    assert otp_code.isdigit()

    # 2. Rejection of invalid OTP
    bad_verify_res = await async_client.post(
        "/api/v1/auth/reset-password",
        json={
            "email": test_email,
            "otp_code": "000000" if otp_code != "000000" else "999999",
            "new_password": "NewSecurePassword2026!",
        },
    )
    assert bad_verify_res.status_code == status.HTTP_400_BAD_REQUEST

    # 3. Successful password reset with valid OTP
    valid_verify_res = await async_client.post(
        "/api/v1/auth/reset-password",
        json={
            "email": test_email,
            "otp_code": otp_code,
            "new_password": "NewSecurePassword2026!",
        },
    )
    assert valid_verify_res.status_code == status.HTTP_200_OK
    verify_data = valid_verify_res.json()
    assert verify_data.get("status") == "SUCCESS"
    assert verify_data.get("email") == test_email

    # 4. Anti-replay verification: OTP must be single-use only and purged from Redis
    replay_res = await async_client.post(
        "/api/v1/auth/reset-password",
        json={
            "email": test_email,
            "otp_code": otp_code,
            "new_password": "AnotherNewPassword2026!",
        },
    )
    assert replay_res.status_code == status.HTTP_400_BAD_REQUEST

    # 5. Clean up test record
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM public.master_users WHERE email = :e"), {"e": test_email})
        db.commit()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_password_reset_legacy_token_fallback(async_client):
    """
    Ensures backward compatibility with 32-byte cryptographic tokens.
    """
    uid = uuid.uuid4().hex[:6]
    test_email = f"recovery-token-{uid}@oxengl.test"
    test_phone = f"+9665{uuid.uuid4().int % 100000000:08d}"
    db = SessionLocal()
    try:
        db.execute(
            text("""
                INSERT INTO public.master_users (id, email, mobile_number, full_name, password_hash, role, is_active, created_at, updated_at)
                VALUES (gen_random_uuid(), :e, :p, 'Test User', :h, 'admin', TRUE, NOW(), NOW())
                ON CONFLICT (email) DO UPDATE SET password_hash = :h
            """),
            {"e": test_email, "p": test_phone, "h": pwd_context.hash("InitialPassword123!")},
        )
        db.commit()
    finally:
        db.close()

    # The API no longer returns tokens; seed a legacy token row directly.
    token = uuid.uuid4().hex + uuid.uuid4().hex
    db = SessionLocal()
    try:
        db.execute(
            text("""
                INSERT INTO public.password_resets (email, workspace_slug, token, expires_at)
                VALUES (:e, 'master', :t, NOW() + INTERVAL '15 minutes')
            """),
            {"e": test_email, "t": token},
        )
        db.commit()
    finally:
        db.close()

    # Reset using token field
    verify_res = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "FallbackTokenPass2026!"},
    )
    assert verify_res.status_code == status.HTTP_200_OK

    # Replay of token should fail
    replay_res = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "FallbackTokenPass2026!"},
    )
    assert replay_res.status_code == status.HTTP_400_BAD_REQUEST

    # Clean up
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM public.master_users WHERE email = :e"), {"e": test_email})
        db.commit()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_self_service_password_reset_custom_domain_resolution_and_background_tenant_context(async_client, monkeypatch):
    """
    Validates Scenario 2:
    Public reset on custom tenant domain (myon-contract.cloud) resolves to tenant_id f7b38b2f-5426-4625-a110-e38261fdf6e1,
    generates 6-digit OTP in Redis, and passes explicit tenant context to background dispatch.
    """
    from backend.app.services.notification_service import NotificationService, redis_client
    from backend.app.services.communication_service import resolve_setting
    import json

    captured_dispatch = {}

    async def mock_send_otp(channels, *, email, phone, otp, company_name, tenant_id=None, audit_context=None):
        captured_dispatch["email"] = email
        captured_dispatch["otp"] = otp
        captured_dispatch["company_name"] = company_name
        captured_dispatch["tenant_id"] = tenant_id

    monkeypatch.setattr(NotificationService, "send_password_reset_otp", mock_send_otp)

    target_email = "admin@oxengl.com"
    myon_tenant_uuid = uuid.UUID("f7b38b2f-5426-4625-a110-e38261fdf6e1")

    # Send forgot-password request with Host header set to custom domain
    res = await async_client.post(
        "/api/v1/auth/forgot-password",
        headers={"Host": "myon-contract.cloud"},
        json={
            "identifier": target_email,
            "workspace_slug": "master",  # UI default fallback
            "channel": "email",
        },
    )
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["status"] == "OTP_DISPATCHED"

    # Verify captured background task payload
    assert captured_dispatch.get("email") == target_email
    assert captured_dispatch.get("tenant_id") == myon_tenant_uuid
    assert "Myon" in str(captured_dispatch.get("company_name"))
    otp_code = captured_dispatch.get("otp")
    assert otp_code is not None and len(otp_code) == 6 and otp_code.isdigit()

    # Verify Redis OTP storage
    redis_val = await redis_client.get(f"otp:reset:{target_email}")
    assert redis_val is not None
    stored_str = redis_val.decode("utf-8") if isinstance(redis_val, bytes) else str(redis_val)
    assert stored_str == otp_code

    # Verify tenant SMTP setting exists and can be resolved
    db = SessionLocal()
    try:
        smtp_setting = resolve_setting(db, captured_dispatch["tenant_id"], "email")
        assert smtp_setting is not None
        assert smtp_setting.provider == "smtp"
        assert smtp_setting.config.get("host") == "mail.myon.com.sa"
        assert smtp_setting.config.get("username") == "dev@myon-contract.cloud"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_admin_initiated_force_reset_tenant_scoped_dispatch(monkeypatch):
    """
    Validates Scenario 1:
    Admin initiated reset for user awadh.a.1987@gmail.com within tenant wac-ye (4c9dbe63-d09f-4a90-a380-d9f3a05bca5f)
    preserves tenant_id into background task payload and retrieves wac-ye SMTP settings.
    """
    from fastapi import BackgroundTasks
    from backend.app.api.v1.users import _dispatch_existing_reset_flow
    from backend.app.services.notification_service import NotificationService
    from backend.app.services.communication_service import resolve_setting

    captured_dispatch = {}

    async def mock_send_otp(channels, *, email, phone, otp, company_name, tenant_id=None, audit_context=None):
        captured_dispatch["email"] = email
        captured_dispatch["otp"] = otp
        captured_dispatch["company_name"] = company_name
        captured_dispatch["tenant_id"] = tenant_id

    monkeypatch.setattr(NotificationService, "send_password_reset_otp", mock_send_otp)

    wac_tenant_uuid = uuid.UUID("4c9dbe63-d09f-4a90-a380-d9f3a05bca5f")
    target_email = "awadh.a.1987@gmail.com"

    db = SessionLocal()
    bg_tasks = BackgroundTasks()
    try:
        success = await _dispatch_existing_reset_flow(db, bg_tasks, target_email, wac_tenant_uuid)
        assert success is True

        # Execute background task
        assert len(bg_tasks.tasks) == 1
        task = bg_tasks.tasks[0]
        await task()

        assert captured_dispatch.get("email") == target_email
        assert captured_dispatch.get("tenant_id") == wac_tenant_uuid
        assert "Alwehda" in str(captured_dispatch.get("company_name"))
        assert len(captured_dispatch.get("otp")) == 6

        # Verify tenant SMTP setting exists and can be resolved
        smtp_setting = resolve_setting(db, captured_dispatch["tenant_id"], "email")
        assert smtp_setting is not None
        assert smtp_setting.provider == "smtp"
        assert smtp_setting.config.get("host") == "mail.wac-ye.com"
        assert smtp_setting.config.get("username") == "admin@wac-ye.com"
    finally:
        db.close()

