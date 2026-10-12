# File: backend/tests/auth/test_otp_onboarding_pipeline.py
import uuid
import pytest
from fastapi import status
from sqlalchemy import text

from backend.database import PlatformSessionLocal as SessionLocal
from backend.app.domains.planning.models import ResCompany
from backend.app.domains.finance.models import AccountChart
from backend.models import ResUser, AccountAccount, AccountJournal, FiscalYear, StockLocation
from backend.app.services.notification_service import VerificationService
from backend.app.core.redis import redis_client





@pytest.mark.asyncio
async def test_verification_service_otp_lifecycle():
    """
    Unit test for VerificationService OTP generation, validation, and anti-replay mechanics.
    """
    test_email = f"test-otp-{uuid.uuid4().hex[:6]}@oxengl.test"
    
    # 1. Generate & store OTP
    otp = await VerificationService.generate_and_store_otp(test_email, expire_seconds=60)
    assert isinstance(otp, str)
    assert len(otp) == 6
    assert otp.isdigit()

    # 2. Rejection of invalid OTP
    invalid_result = await VerificationService.verify_otp(test_email, "000000" if otp != "000000" else "111111")
    assert invalid_result is False

    # 3. Successful verification
    valid_result = await VerificationService.verify_otp(test_email, otp)
    assert valid_result is True

    # 4. Anti-replay enforcement (OTP deleted immediately after first successful consumption)
    replay_result = await VerificationService.verify_otp(test_email, otp)
    assert replay_result is False


@pytest.mark.asyncio
async def test_verification_service_payload_caching():
    """
    Unit test for temporary registration payload caching and retrieval in Redis.
    """
    test_email = f"payload-{uuid.uuid4().hex[:6]}@oxengl.test"
    sample_payload = {
        "company_name_ar": "شركة اختبار",
        "company_name_en": "Test Corp",
        "domain_slug": "test-corp",
        "admin_email": test_email,
    }

    # Store payload
    await VerificationService.store_registration_payload(test_email, sample_payload, expire_seconds=60)

    # Retrieve payload
    retrieved = await VerificationService.get_registration_payload(test_email)
    assert retrieved is not None
    assert retrieved["company_name_en"] == "Test Corp"
    assert retrieved["admin_email"] == test_email

    # Delete payload
    await VerificationService.delete_registration_payload(test_email)
    assert await VerificationService.get_registration_payload(test_email) is None


@pytest.mark.asyncio
async def test_e2e_register_init_and_verify_pipeline(async_client):
    """
    E2E integration test:
    Phase 6 Step 1 & 2 verification pipeline:
    1. /api/v1/auth/register-init generates OTP and caches registration payload
    2. /api/v1/auth/register-verify consumes OTP and provisions company, isolated schema, and seeded financial defaults.
    """
    random_suffix = uuid.uuid4().hex[:6]
    test_slug = f"phase6-test-{random_suffix}"
    test_email = f"cfo-{random_suffix}@phase6-audit.me"

    init_payload = {
        "company_name_ar": f"شركة المرحلة السادسة {random_suffix}",
        "company_name_en": f"Phase 6 Audit Logistics {random_suffix}",
        "domain_slug": test_slug,
        "admin_email": test_email,
        "phone_number": "+966500000999"
    }

    generated_tenant_id = None
    sanitized_schema = test_slug.replace("-", "_").lower()

    try:
        # --- Step 1: Initiate Registration ---
        init_res = await async_client.post("/api/v1/auth/register-init", json=init_payload)
        assert init_res.status_code == status.HTTP_200_OK, f"Init failed: {init_res.text}"
        init_data = init_res.json()
        assert init_data["status"] == "OTP_DISPATCHED"
        assert init_data["admin_email"] == test_email
        assert init_data["email"] == test_email

        # Rejection of already claimed domain slug (existing tenant in database)
        claimed_payload = {**init_payload, "domain_slug": "myon"}
        claimed_res = await async_client.post("/api/v1/auth/register-init", json=claimed_payload)
        assert claimed_res.status_code == status.HTTP_400_BAD_REQUEST

        # Fetch the generated OTP from Redis for automated verification testing
        stored_otp = await redis_client.get(f"otp:{test_email}")
        if isinstance(stored_otp, bytes):
            stored_otp = stored_otp.decode("utf-8")
        assert stored_otp is not None
        assert len(stored_otp) == 6

        # --- Step 2: Failed Verification with Incorrect OTP ---
        verify_fail = await async_client.post(
            "/api/v1/auth/register-verify",
            json={"admin_email": test_email, "otp_code": "999999" if stored_otp != "999999" else "111111"}
        )
        assert verify_fail.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid or expired verification code" in verify_fail.json().get("detail", "")

        # --- Step 3: Successful Verification with Valid OTP ---
        verify_res = await async_client.post(
            "/api/v1/auth/register-verify",
            json={"admin_email": test_email, "otp_code": stored_otp}
        )
        assert verify_res.status_code == status.HTTP_201_CREATED, f"Verify failed: {verify_res.text}"
        verify_data = verify_res.json()
        assert verify_data["status"] == "PROVISIONED"
        assert verify_data["workspace_slug"] == test_slug

        generated_tenant_id = verify_data["tenant_id"]
        assert generated_tenant_id is not None

        # Anti-replay: second call with same OTP must fail
        replay_res = await async_client.post(
            "/api/v1/auth/register-verify",
            json={"admin_email": test_email, "otp_code": stored_otp}
        )
        assert replay_res.status_code == status.HTTP_400_BAD_REQUEST

        # Post-provisioning duplicate rejection: slug and email are now permanently claimed
        post_claim_res = await async_client.post("/api/v1/auth/register-init", json=init_payload)
        assert post_claim_res.status_code == status.HTTP_400_BAD_REQUEST

        # --- Step 4: Verify Database State & Default Record Seeding ---
        db = SessionLocal()
        try:
            # 1. Company Record
            company = db.query(ResCompany).filter(ResCompany.id == generated_tenant_id).first()
            assert company is not None
            assert company.domain_slug == test_slug

            # 2. 5-Depth Chart of Accounts Hierarchy
            charts = db.query(AccountChart).filter(AccountChart.tenant_id == generated_tenant_id).all()
            assert len(charts) == 5, f"Expected 5 Chart of Account levels, found {len(charts)}"

            level_1 = next(a for a in charts if a.account_code == "10000")
            assert level_1.parent_id is None
            assert level_1.account_type == "ASSET"

            level_2 = next(a for a in charts if a.account_code == "11000")
            assert level_2.parent_id == level_1.id

            level_3 = next(a for a in charts if a.account_code == "11100")
            assert level_3.parent_id == level_2.id

            level_4 = next(a for a in charts if a.account_code == "11110")
            assert level_4.parent_id == level_3.id

            level_5 = next(a for a in charts if a.account_code == "11110-01")
            assert level_5.parent_id == level_4.id

            # 3. Default GL accounts, journals, fiscal year, and warehouse
            gl_accounts = db.query(AccountAccount).filter(AccountAccount.company_id == generated_tenant_id).all()
            assert len(gl_accounts) >= 9

            journals = db.query(AccountJournal).filter(AccountJournal.company_id == generated_tenant_id).all()
            assert len(journals) >= 5

            fiscal_years = db.query(FiscalYear).filter(FiscalYear.company_id == generated_tenant_id).all()
            assert len(fiscal_years) >= 1

            locations = db.query(StockLocation).filter(StockLocation.company_id == generated_tenant_id).all()
            assert len(locations) >= 1

            # 4. Postgres dynamic schema validation
            can_create = db.execute(text("SELECT has_database_privilege(current_user, current_database(), 'CREATE')")).scalar()
            schema_check = db.execute(
                text("SELECT schema_name FROM information_schema.schemata WHERE schema_name = :s"),
                {"s": sanitized_schema}
            ).fetchone()
            assert schema_check is not None or not can_create, f"Dynamic schema {sanitized_schema} was not created"

        finally:
            db.close()

    finally:
        # Cleanup
        if generated_tenant_id:
            db = SessionLocal()
            try:
                db.query(AccountChart).filter(AccountChart.tenant_id == generated_tenant_id).delete()
                db.query(StockLocation).filter(StockLocation.company_id == generated_tenant_id).delete()
                db.query(AccountJournal).filter(AccountJournal.company_id == generated_tenant_id).delete()
                db.query(AccountAccount).filter(AccountAccount.company_id == generated_tenant_id).delete()
                db.query(FiscalYear).filter(FiscalYear.company_id == generated_tenant_id).delete()
                db.query(ResUser).filter(ResUser.company_id == generated_tenant_id).delete()
                db.query(ResCompany).filter(ResCompany.id == generated_tenant_id).delete()
                db.execute(text(f'DROP SCHEMA IF EXISTS "{sanitized_schema}" CASCADE'))
                db.commit()
            except Exception:
                db.rollback()
            finally:
                db.close()
