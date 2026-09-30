import asyncio
from app.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select

async def run():
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == "admin@oxengl.com"))
        if res.scalars().first():
            print("Superadmin already exists: admin@oxengl.com")
        else:
            session.add(User(email="admin@oxengl.com", hashed_password=get_password_hash("admin123"), is_superuser=True, is_active=True, full_name="Super Admin"))
            await session.commit()
            print("Superadmin created successfully: admin@oxengl.com / admin123")

asyncio.run(run())
