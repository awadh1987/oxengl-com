"""
Test suite validating authentication and credential verification for platform super-admin account (admin@oxengl.me).
"""
import pytest
from fastapi import status
from sqlalchemy import text
from backend.database import engine
from backend.two_tier_auth import verify_password, hash_password, verify_two_tier_jwt


@pytest.mark.asyncio
async def test_superadmin_oxengl_me_login_success(async_client):
    """Verifies that admin@oxengl.me can authenticate with OxenGL@2026Secure! and obtain a valid master token."""
    response = await async_client.post(
        "/api/auth/master/login",
        json={"identity": "admin@oxengl.me", "password": "OxenGL@2026Secure!"},
    )
    assert response.status_code == status.HTTP_200_OK, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["tier"] == "master"
    assert data["role"] == "super_admin"
    assert data["user"]["email"] == "admin@oxengl.me"

    # Verify that the issued token decodes and carries valid claims
    claims = verify_two_tier_jwt(data["access_token"], expected_tier="master")
    assert claims["identity"] == "admin@oxengl.me"
    assert claims["role"] == "super_admin"
    assert claims["tier"] == "master"


@pytest.mark.asyncio
async def test_superadmin_oxengl_me_mobile_login_success(async_client):
    """Verifies that admin@oxengl.me can also authenticate via their registered E.164 mobile number."""
    response = await async_client.post(
        "/api/auth/master/login",
        json={"identity": "+966500000000", "password": "OxenGL@2026Secure!"},
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "admin@oxengl.me"


@pytest.mark.asyncio
async def test_superadmin_oxengl_me_invalid_password_rejected(async_client):
    """Verifies that invalid credentials return HTTP 401 Unauthorized."""
    response = await async_client.post(
        "/api/auth/master/login",
        json={"identity": "admin@oxengl.me", "password": "IncorrectPassword2026!"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Invalid credentials" in response.json().get("detail", "")

    # Reset failed attempts after test so DB state remains pristine
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE master_users SET failed_login_attempts = 0, locked_until = NULL WHERE email = 'admin@oxengl.me'")
        )


def test_superadmin_db_state_and_flags():
    """Directly inspects the database to ensure active, superuser flags and cleared locks."""
    with engine.connect() as conn:
        master_row = conn.execute(
            text("""
                SELECT email, role, is_active, is_superuser, failed_login_attempts, locked_until, password_hash
                FROM master_users
                WHERE LOWER(email) = 'admin@oxengl.me'
            """)
        ).mappings().first()

        assert master_row is not None, "admin@oxengl.me not found in master_users table!"
        assert master_row["is_active"] is True
        assert master_row["is_superuser"] is True
        assert master_row["role"] == "super_admin"
        assert master_row["failed_login_attempts"] == 0
        assert master_row["locked_until"] is None
        assert master_row["password_hash"].startswith("$argon2id$")
        assert verify_password("OxenGL@2026Secure!", master_row["password_hash"]) is True

        res_row = conn.execute(
            text("""
                SELECT email, role, is_active, is_superuser, password_hash
                FROM res_users
                WHERE LOWER(email) = 'admin@oxengl.me'
            """)
        ).mappings().first()

        assert res_row is not None, "admin@oxengl.me not found in res_users table!"
        assert res_row["is_active"] is True
        assert res_row["is_superuser"] is True
        assert res_row["role"] in ("Super_Admin", "super_admin", "SUPER_ADMIN")
        assert verify_password("OxenGL@2026Secure!", res_row["password_hash"]) is True
