"""
OxenGL Admin Provisioning Script.
Targets master_users (Control Plane) and synchronizes with res_users using app.core.security.
"""

import sys
from pathlib import Path

current_dir = Path(__file__).resolve().parent
for candidate in [str(current_dir), str(current_dir / "backend"), "/app", "/app/backend"]:
    if candidate not in sys.path and Path(candidate).exists():
        sys.path.insert(0, candidate)

from sqlalchemy import func, select
from app.core.security import get_password_hash, verify_password
from app.models import MasterUser, ResUser

try:
    from app.database import PlatformSessionLocal, SessionLocal
except ImportError:
    from backend.database import PlatformSessionLocal, SessionLocal


def run(email: str = "superadmin@oxengl.com", password: str = "Admin123!"):
    session_factory = PlatformSessionLocal if PlatformSessionLocal is not None else SessionLocal
    hashed_pw = get_password_hash(password)

    with session_factory() as session:
        # 1. master_users update or create
        master_user = session.scalar(
            select(MasterUser).where(func.lower(MasterUser.email) == email.lower())
        )

        if master_user:
            master_user.password_hash = hashed_pw
            master_user.is_active = True
            master_user.is_superuser = True
            master_user.failed_login_attempts = 0
            master_user.locked_until = None
            master_user.role = "super_admin"
            print(f"[master_users] Updated existing user '{email}' successfully.")
        else:
            master_user = MasterUser(
                email=email.lower(),
                full_name="Super Administrator",
                password_hash=hashed_pw,
                role="super_admin",
                is_active=True,
                is_superuser=True,
                failed_login_attempts=0,
                locked_until=None,
            )
            session.add(master_user)
            print(f"[master_users] Created new super admin '{email}' successfully.")

        # 2. res_users synchronization
        try:
            res_user = session.scalar(
                select(ResUser).where(func.lower(ResUser.email) == email.lower())
            )
            if res_user:
                res_user.password_hash = hashed_pw
                res_user.is_active = True
                res_user.is_superuser = True
                print(f"[res_users] Synchronized existing user '{email}' successfully.")
        except Exception as e:
            print(f"[res_users] Note: Synchronization skipped or failed: {e}")

        session.commit()
        print(f"Password set to '{password}' for '{email}'.")


if __name__ == "__main__":
    run()
