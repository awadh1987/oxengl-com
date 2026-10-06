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
async def test_password_reset_otp_request_and_verify_pipeline(async_client):
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

    # 1. Dispatch OTP request
    req_payload = {
        "email": test_email,
        "workspace_slug": "master",
    }
    init_res = await async_client.post("/api/v1/auth/forgot-password", json=req_payload)
    assert init_res.status_code == status.HTTP_200_OK
    init_data = init_res.json()
    assert init_data.get("status") == "OTP_DISPATCHED"
    assert init_data.get("otp_dispatched") is True
    assert init_data.get("email") == test_email
    otp_code = init_data.get("otp_code")
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

    # Request recovery
    init_res = await async_client.post(
        "/api/v1/auth/forgot-password",
        json={"email": test_email, "workspace_slug": "master"},
    )
    assert init_res.status_code == status.HTTP_200_OK
    token = init_res.json().get("token")
    assert token is not None

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
