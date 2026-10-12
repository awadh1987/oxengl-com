import uuid

import pytest

from backend.database import PlatformSessionLocal
from backend.models import ResCompany, ResUser
from backend.two_tier_auth import hash_password, issue_two_tier_jwt


def create_tenant_user_token(tenant_id: uuid.UUID, role: str = "Admin"):
    """Seed an active user inside an existing tenant and return (user_id, bearer headers)."""
    user_id = uuid.uuid4()
    email = f"ai_{user_id.hex[:8]}@example.com"
    db = PlatformSessionLocal()
    try:
        db.add(
            ResUser(
                id=user_id,
                company_id=tenant_id,
                email=email,
                full_name="AI Test User",
                role=role,
                password_hash=hash_password("Pass123!"),
                is_active=True,
            )
        )
        db.commit()
    finally:
        db.close()
    token = issue_two_tier_jwt(
        tier="tenant", user_id=user_id, identity=email, role=role, tenant_id=tenant_id
    )
    return user_id, {"Authorization": f"Bearer {token}"}


def delete_user(user_id: uuid.UUID) -> None:
    db = PlatformSessionLocal()
    try:
        db.query(ResUser).filter(ResUser.id == user_id).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture
def authed_tenant():
    """An active tenant company with an authenticated admin; yields (tenant_id, headers)."""
    tenant_id = uuid.uuid4()
    db = PlatformSessionLocal()
    try:
        db.add(
            ResCompany(
                id=tenant_id,
                name=f"AI Test Co {tenant_id.hex[:6]}",
                slug=f"ai-co-{tenant_id.hex[:6]}",
                currency="SAR",
                fiscal_calendar="gregorian",
                fiscal_year_start_month=1,
                tax_regime="KSA_VAT",
            )
        )
        db.commit()
    finally:
        db.close()
    user_id, headers = create_tenant_user_token(tenant_id)
    yield tenant_id, headers
    delete_user(user_id)
    db = PlatformSessionLocal()
    try:
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
    finally:
        db.close()
