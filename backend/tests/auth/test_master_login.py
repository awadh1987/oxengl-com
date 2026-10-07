import pytest
from fastapi import status
from backend.two_tier_auth import verify_password, hash_password


@pytest.mark.asyncio
async def test_master_login_non_designated_email_rejected(async_client):
    """Only superadmin@oxengl.com may use the master plane."""
    response = await async_client.post(
        "/api/auth/master/login",
        json={"identity": "admin@oxengl.com", "password": "OxenGL@2026Secure!"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_master_login_non_designated_phone_rejected(async_client):
    response = await async_client.post(
        "/api/auth/master/login",
        json={"identity": "+966500000002", "password": "OxenGL@2026Secure!"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_master_login_invalid_password(async_client):
    """Verifies that invalid credentials return HTTP 401 Unauthorized instead of throwing an error."""
    response = await async_client.post(
        "/api/auth/master/login",
        json={"identity": "admin@oxengl.com", "password": "InvalidPassword2026!"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Invalid credentials" in response.json().get("detail", "")


def test_password_verification_algorithms():
    """Verifies multi-algorithm password verification (bcrypt, argon2, pbkdf2)."""
    password = "TestPassword@2026!"

    # 1. Argon2id
    argon2_hash = hash_password(password)
    assert verify_password(password, argon2_hash) is True
    assert verify_password("WrongPassword", argon2_hash) is False

    # 2. Native Bcrypt ($2a$ and $2b$)
    import bcrypt
    bcrypt_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")
    assert verify_password(password, bcrypt_hash) is True
    assert verify_password("WrongPassword", bcrypt_hash) is False

    # 3. None / Empty hash safety
    assert verify_password(password, None) is False
    assert verify_password(password, "") is False


def test_declarative_base_class_registry_uniqueness():
    """Verifies that DeclarativeBase registry has no duplicate class name collisions."""
    from backend.database import Base
    from sqlalchemy.orm import configure_mappers
    configure_mappers()
    # Ensure Vehicle resolves to a single unique mapped class
    vehicle_cls = Base.registry._class_registry.get("Vehicle")
    assert vehicle_cls is not None
    assert not hasattr(vehicle_cls, "attempt_get"), "Vehicle has multiple conflicting classes in registry"
