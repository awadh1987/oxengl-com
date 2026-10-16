import uuid
import pytest
from fastapi import status
from sqlalchemy import text
from passlib.context import CryptContext

from backend.database import PlatformSessionLocal as SessionLocal
from backend.app.services.notification_service import VerificationService, NotificationService

pwd_context = CryptContext(
    schemes=["argon2", "pbkdf2_sha256"],
    deprecated="auto",
    argon2__memory_cost=65536,
    argon2__time_cost=3,
    argon2__parallelism=4,
)


@pytest.mark.asyncio
async def test_phase6_cross_portal_password_sync_and_verify_otp_endpoint(async_client, monkeypatch):
    """
    Phase 6 (Point 7):
    Verifies that resetting a password via 6-digit OTP:
    1. Can be pre-verified via /api/v1/auth/verify-otp (non-destructively).
    2. Synchronizes the updated Argon2id password hash across both the
       Central Control Plane (master_users, tenant_users, public.users)
       and the Tenant Workspace (res_users), clearing must_change_password
       and failed_login_attempts so login never fails due to out-of-sync credentials.
    """
    uid = uuid.uuid4().hex[:8]
    test_email = f"phase6-sync-{uid}@oxengl.test"
    test_phone = f"+9665{uuid.uuid4().int % 100000000:08d}"
    old_hash = pwd_context.hash("OldDesyncedPassword123!")
    new_password = "NewUnifiedPortalPassword2026!"

    # Avoid real external SMTP network timeout in unit test
    async def _noop_send_otp(*args, **kwargs):
        return None

    monkeypatch.setattr(NotificationService, "send_password_reset_otp", _noop_send_otp)

    db = SessionLocal()
    company_id = None
    tenant_id = None
    try:
        comp_row = db.execute(text("SELECT id FROM public.res_companies LIMIT 1")).first()
        if comp_row:
            company_id = comp_row[0]

        mt_row = db.execute(text("SELECT id FROM public.master_tenants LIMIT 1")).first()
        if mt_row:
            tenant_id = mt_row[0]

        # 1. Seed user in Control Plane: master_users
        db.execute(
            text("""
                INSERT INTO public.master_users (id, email, mobile_number, full_name, password_hash, role, is_active, failed_login_attempts, created_at, updated_at)
                VALUES (gen_random_uuid(), :e, :p, 'Phase6 Sync User', :h, 'admin', TRUE, 3, NOW(), NOW())
                ON CONFLICT (email) DO UPDATE SET password_hash = :h, failed_login_attempts = 3
            """),
            {"e": test_email, "p": test_phone, "h": old_hash},
        )
        db.commit()

        # 2. Seed user in Control Plane: tenant_users (if tenant_id exists)
        if tenant_id:
            try:
                db.execute(
                    text("""
                        INSERT INTO public.tenant_users (id, tenant_id, email, mobile_number, full_name, password_hash, role, is_active, failed_login_attempts, created_at, updated_at)
                        VALUES (gen_random_uuid(), :tid, :e, :p, 'Phase6 Sync User', :h, 'tenant_admin', TRUE, 2, NOW(), NOW())
                    """),
                    {"tid": tenant_id, "e": test_email, "p": test_phone, "h": old_hash},
                )
                db.commit()
            except Exception:
                db.rollback()

        # 3. Seed user in Tenant Workspace: res_users (with RLS context set to company_id)
        if company_id:
            try:
                db.execute(
                    text(
                        "SELECT set_config('app.current_tenant_id', :cid, true), "
                        "set_config('app.current_company_id', :cid, true)"
                    ),
                    {"cid": str(company_id)},
                )
                db.execute(
                    text("""
                        INSERT INTO public.res_users (id, company_id, name, email, phone, password_hash, role, is_active, must_change_password)
                        VALUES (gen_random_uuid(), :cid, 'Phase6 Sync User', :e, :p, :h, 'admin', TRUE, TRUE)
                    """),
                    {"cid": company_id, "e": test_email, "p": test_phone, "h": old_hash},
                )
                db.commit()
            except Exception:
                db.rollback()
    finally:
        db.close()

    captured = {}
    original_gen = VerificationService.generate_and_store_otp.__func__

    async def capture_otp(cls, identifier, *args, **kwargs):
        code = await original_gen(cls, identifier, *args, **kwargs)
        captured[identifier.strip().lower()] = code
        return code

    monkeypatch.setattr(VerificationService, "generate_and_store_otp", classmethod(capture_otp))

    try:
        # Step A: Request password reset OTP
        forgot_res = await async_client.post(
            "/api/v1/auth/forgot-password",
            headers={"X-Tenant-Domain": "myon-contract.cloud"},
            json={"identifier": test_email, "workspace_slug": "master", "otp_only": True},
        )
        assert forgot_res.status_code == status.HTTP_200_OK
        otp_code = captured.get(f"reset:{test_email}")
        assert otp_code and len(otp_code) == 6 and otp_code.isdigit()

        # Step B: Pre-verify OTP via /api/v1/auth/verify-otp (non-destructive)
        verify_res = await async_client.post(
            "/api/v1/auth/verify-otp",
            json={
                "identifier": test_email,
                "otp_code": otp_code,
                "consume": False,
            },
        )
        assert verify_res.status_code == status.HTTP_200_OK
        verify_json = verify_res.json()
        assert verify_json["status"] == "OTP_VERIFIED"
        assert verify_json["valid"] is True

        # Step C: Confirm password reset using the same OTP
        reset_res = await async_client.post(
            "/api/v1/auth/reset-password",
            headers={"X-Tenant-Domain": "myon-contract.cloud"},
            json={
                "identifier": test_email,
                "otp_code": otp_code,
                "new_password": new_password,
            },
        )
        assert reset_res.status_code == status.HTTP_200_OK
        reset_json = reset_res.json()
        assert reset_json["status"] == "SUCCESS"
        assert reset_json["records_updated"] >= 1
        assert "synchronized_layers" in reset_json

        # Step D: Verify credentials are synchronized across both Control Plane & Tenant Workspace
        db = SessionLocal()
        try:
            master_row = db.execute(
                text("SELECT password_hash, failed_login_attempts FROM public.master_users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": test_email},
            ).mappings().first()
            assert master_row is not None
            assert pwd_context.verify(new_password, master_row["password_hash"])
            assert master_row["failed_login_attempts"] == 0

            tenant_user_row = db.execute(
                text("SELECT password_hash, failed_login_attempts FROM public.tenant_users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": test_email},
            ).mappings().first()
            if tenant_user_row:
                assert pwd_context.verify(new_password, tenant_user_row["password_hash"])
                assert tenant_user_row["failed_login_attempts"] == 0

            if company_id:
                db.execute(
                    text(
                        "SELECT set_config('app.current_tenant_id', :cid, true), "
                        "set_config('app.current_company_id', :cid, true)"
                    ),
                    {"cid": str(company_id)},
                )
            res_user_row = db.execute(
                text("SELECT password_hash, must_change_password FROM public.res_users WHERE LOWER(email) = :e LIMIT 1"),
                {"e": test_email},
            ).mappings().first()
            if res_user_row:
                assert pwd_context.verify(new_password, res_user_row["password_hash"])
                assert res_user_row["must_change_password"] is False
        finally:
            db.close()

    finally:
        db = SessionLocal()
        try:
            if company_id:
                db.execute(
                    text(
                        "SELECT set_config('app.current_tenant_id', :cid, true), "
                        "set_config('app.current_company_id', :cid, true)"
                    ),
                    {"cid": str(company_id)},
                )
            db.execute(text("DELETE FROM public.res_users WHERE LOWER(email) = :e"), {"e": test_email})
            db.execute(text("DELETE FROM public.tenant_users WHERE LOWER(email) = :e"), {"e": test_email})
            db.execute(text("DELETE FROM public.master_users WHERE LOWER(email) = :e"), {"e": test_email})
            db.execute(text("DELETE FROM public.password_resets WHERE LOWER(email) = :e"), {"e": test_email})
            db.commit()
        finally:
            db.close()


@pytest.mark.asyncio
async def test_phase6_verification_service_in_memory_fallback_and_rate_limit(monkeypatch):
    """
    Phase 6 (Point 7):
    Verifies that when Redis is unavailable/offline, VerificationService seamlessly
    falls back to its in-memory TTL store, enforces the 5-attempt brute-force lockout,
    and supports non-destructive peek/verify.
    """
    from backend.app.services import notification_service

    class BrokenRedis:
        async def setex(self, *args, **kwargs):
            raise ConnectionError("Redis offline in fallback test")

        async def get(self, *args, **kwargs):
            raise ConnectionError("Redis offline in fallback test")

        async def incr(self, *args, **kwargs):
            raise ConnectionError("Redis offline in fallback test")

        async def expire(self, *args, **kwargs):
            raise ConnectionError("Redis offline in fallback test")

        async def delete(self, *args, **kwargs):
            raise ConnectionError("Redis offline in fallback test")

    monkeypatch.setattr(notification_service, "redis_client", BrokenRedis())

    test_key = f"reset:fallback-{uuid.uuid4().hex[:6]}@oxengl.test"
    code = await VerificationService.generate_and_store_otp(test_key)
    assert len(code) == 6 and code.isdigit()

    # Non-destructive check succeeds and leaves OTP intact
    assert await VerificationService.verify_otp(test_key, code, consume=False) is True
    # Subsequent destructive check also succeeds
    assert await VerificationService.verify_otp(test_key, code, consume=True) is True
    # Replay after consume fails
    assert await VerificationService.verify_otp(test_key, code, consume=True) is False

    # Brute-force lockout after 5 wrong attempts
    lockout_key = f"reset:lockout-{uuid.uuid4().hex[:6]}@oxengl.test"
    real_code = await VerificationService.generate_and_store_otp(lockout_key)
    wrong_code = "000000" if real_code != "000000" else "999999"
    for _ in range(5):
        assert await VerificationService.verify_otp(lockout_key, wrong_code) is False

    # Even the real code must be rejected on attempt 6 due to rate-limit purge
    assert await VerificationService.verify_otp(lockout_key, real_code) is False
