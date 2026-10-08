"""
Seed / Provision Default Master Admin Account in OxenGL PostgreSQL Database.
Target Table / View: users (res_users)
Details:
  - email: superadmin@oxengl.com
  - password: Admin123!
  - full_name: System Superadmin
  - is_active: True
  - is_superuser: True
  - role: SUPERADMIN
"""
import asyncio
import os
import sys

# Ensure backend root is in import search path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.abspath(os.path.join(current_dir, ".."))
workspace_root = os.path.abspath(os.path.join(backend_dir, ".."))

for path in [workspace_root, backend_dir, "/app", "/app/backend"]:
    if path not in sys.path:
        sys.path.insert(0, path)

from sqlalchemy import select

# Database session resolver
try:
    from app.database import SessionLocal
except ImportError:
    try:
        from backend.database import SessionLocal
    except ImportError:
        from database import SessionLocal

# User ORM model resolver
try:
    from app.models.user import User
except ImportError:
    try:
        from backend.models import User
    except ImportError:
        from models import User

# Password hashing resolver
try:
    from app.core.security import get_password_hash
except ImportError:
    try:
        from backend.two_tier_auth import hash_password as get_password_hash
    except ImportError:
        from two_tier_auth import hash_password as get_password_hash


async def create_default_master_admin():
    email = "superadmin@oxengl.com"
    raw_password = "Admin123!"
    full_name = "System Superadmin"
    is_active = True
    is_superuser = True
    role = "SUPERADMIN"

    hashed_pw = get_password_hash(raw_password)

    async with SessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user:
            print(f"[FOUND] Existing user '{email}' found in database. Updating credentials and attributes...")
            user.full_name = full_name
            user.password_hash = hashed_pw
            user.is_active = is_active
            user.is_superuser = is_superuser
            user.role = role
        else:
            print(f"[CREATING] Inserting new user '{email}' into users table...")
            user = User(
                email=email,
                full_name=full_name,
                password_hash=hashed_pw,
                is_active=is_active,
                is_superuser=is_superuser,
                role=role,
            )
            session.add(user)

        await session.commit()
        await session.refresh(user)

        print("\n" + "=" * 60)
        print("✓ Default Master Admin successfully committed to database!")
        print(f"  - Table / View:  users (res_users)")
        print(f"  - User ID:       {user.id}")
        print(f"  - Email:         {user.email}")
        print(f"  - Full Name:     {user.full_name}")
        print(f"  - Role:          {user.role}")
        print(f"  - Is Active:     {user.is_active}")
        print(f"  - Is Superuser:  {user.is_superuser}")
        print(f"  - Password Hash: {user.password_hash[:32]}...")
        print("=" * 60 + "\n")

    return user


if __name__ == "__main__":
    asyncio.run(create_default_master_admin())
