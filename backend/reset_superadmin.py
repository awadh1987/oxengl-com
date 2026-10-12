"""
OxenGL Super Admin Password Reset & Account Recovery Script.
Forces credential update for superadmin@oxengl.com in master_users table
using app.core.security get_password_hash and the appropriate platform DB session.
"""

import os
import sys
from pathlib import Path

# Ensure application search paths are available regardless of invocation directory
current_dir = Path(__file__).resolve().parent
for candidate in [str(current_dir), str(current_dir / "backend"), "/app", "/app/backend"]:
    if candidate not in sys.path and Path(candidate).exists():
        sys.path.insert(0, candidate)

from sqlalchemy import func, select
from app.core.security import get_password_hash, verify_password
from app.models import MasterUser, ResUser

# PostgreSQL enforces RLS on master_users: current_user = 'oxengl_platform'
# PlatformSessionLocal connects as oxengl_platform, bypassing tenant RLS.
try:
    from app.database import PlatformSessionLocal, SessionLocal
except ImportError:
    from backend.database import PlatformSessionLocal, SessionLocal


def reset_superadmin(email: str = "superadmin@oxengl.com", new_password: str = "Admin123!"):
    session_factory = PlatformSessionLocal if PlatformSessionLocal is not None else SessionLocal
    print(f"[*] Initializing database session...")

    # Generate memory-hard Argon2id hash using application's security context
    print(f"[*] Hashing password for '{email}' using app.core.security.get_password_hash...")
    pw_hash = get_password_hash(new_password)
    assert verify_password(new_password, pw_hash), "Password verification self-test failed!"
    print(f"[*] Hash generated: {pw_hash[:32]}...")

    with session_factory() as session:
        # 1. Update or create MasterUser (Control Plane)
        user = session.scalar(
            select(MasterUser).where(func.lower(MasterUser.email) == email.lower())
        )

        if user:
            print(f"[*] Found existing master_users record: ID={user.id}")
            user.password_hash = pw_hash
            user.failed_login_attempts = 0
            user.locked_until = None
            user.is_active = True
            user.is_superuser = True
            user.role = "super_admin"
        else:
            print(f"[*] master_users record for '{email}' not found. Creating new...")
            user = MasterUser(
                email=email.lower(),
                full_name="Super Administrator",
                password_hash=pw_hash,
                role="super_admin",
                is_active=True,
                is_superuser=True,
                failed_login_attempts=0,
                locked_until=None,
            )
            session.add(user)

        # 2. Also keep ResUser in sync to maintain consistency across both auth tiers
        try:
            res_user = session.scalar(
                select(ResUser).where(func.lower(ResUser.email) == email.lower())
            )
            if res_user:
                print(f"[*] Synchronizing res_users record: ID={res_user.id}")
                res_user.password_hash = pw_hash
                res_user.is_active = True
                res_user.is_superuser = True
        except Exception as e:
            print(f"[!] Note: Could not update res_users (non-fatal): {e}")

        session.commit()
        session.refresh(user)

        # Verification assertion
        assert verify_password(new_password, user.password_hash), "Post-commit verification failed!"
        print("\n" + "=" * 65)
        print("✓ SUCCESS: Super Admin account credentials updated successfully!")
        print(f"  - Table:                 master_users")
        print(f"  - Email:                 {user.email}")
        print(f"  - Role:                  {user.role}")
        print(f"  - Is Active:             {user.is_active}")
        print(f"  - Failed Login Attempts: {user.failed_login_attempts}")
        print(f"  - Locked Until:          {user.locked_until}")
        print(f"  - Password Hash Prefix:  {user.password_hash[:35]}...")
        print("=" * 65 + "\n")


if __name__ == "__main__":
    reset_superadmin()
