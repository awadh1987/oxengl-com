"""Shared helpers that give integration tests a registered actor and a valid session bearer token."""
import uuid

from backend.app.main import create_session_token
from backend.models import MasterTenant, ResCompany, ResUser

_ADMIN_ROLES = ("Admin", "Owner")


def tenant_admin_headers(db, company_id, *, role: str = "Admin") -> dict:
    """Bearer headers for an active Admin/Owner of ``company_id``.

    Reuses an existing admin (so seat counts are not inflated); otherwise seeds one.
    The caller's own tenant hints are included so scope checks see a matching tenant.
    """
    company_id = uuid.UUID(str(company_id))
    if db.get(ResCompany, company_id) is None:
        master = db.get(MasterTenant, company_id)
        if master is not None:
            db.add(ResCompany(id=company_id, name=master.name, slug=master.slug, is_active=True))
            db.commit()
    user = (
        db.query(ResUser)
        .filter(ResUser.company_id == company_id, ResUser.is_active.is_(True), ResUser.role.in_(_ADMIN_ROLES))
        .first()
    )
    if user is None:
        user = ResUser(
            id=uuid.uuid4(),
            firebase_uid=f"native-{uuid.uuid4().hex}",
            email=f"actor-{uuid.uuid4().hex[:8]}@tests.oxengl.invalid",
            full_name="Test Actor",
            password_hash="x",
            company_id=company_id,
            role=role,
            is_active=True,
        )
        db.add(user)
        db.commit()
    company = db.get(ResCompany, company_id)
    token = create_session_token(
        subject=user.email,
        company_id=company_id,
        role=user.role,
        tenant_slug=getattr(company, "slug", None),
    )
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": str(company_id),
        "X-Company-ID": str(company_id),
    }


def platform_superadmin_headers(db) -> tuple[dict, ResUser]:
    """Bearer headers for a seeded platform super admin using a master-tier token."""
    from backend.two_tier_auth import issue_two_tier_jwt

    user = ResUser(
        id=uuid.uuid4(),
        firebase_uid=f"native-{uuid.uuid4().hex}",
        email=f"superadmin-{uuid.uuid4().hex[:8]}@tests.oxengl.invalid",
        full_name="Test Platform Admin",
        password_hash="x",
        company_id=None,
        role="Admin",
        is_active=True,
        is_superuser=True,
    )
    db.add(user)
    db.commit()
    token = issue_two_tier_jwt(tier="master", user_id=user.id, identity=user.email, role="Super_Admin")
    return {"Authorization": f"Bearer {token}"}, user
