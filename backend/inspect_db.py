import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User

async def inspect():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.id == 15))
        u = res.scalar_one_or_none()
        if u:
            print("User 15 details:")
            print(f"  Name: {u.name}")
            print(f"  Email: {u.email}")
            print(f"  Signature Path: {u.signature_path}")
        else:
            print("User 15 not found")

if __name__ == "__main__":
    asyncio.run(inspect())
