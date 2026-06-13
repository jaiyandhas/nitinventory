import asyncio
from sqlalchemy import select
from app.core.database import AsyncSession, engine
from app.models.user import User

async def main():
    async with AsyncSession(bind=engine) as db:
        res = await db.execute(select(User).where(User.id.in_([907, 1111, 1159])))
        users = res.scalars().all()
        print("=== TARGET USERS ===")
        for u in users:
            print(f"ID: {u.id}, Name: {u.name}, Email: {u.email}, Dept ID: {u.department_id}")
            
        print("\n=== CSE DEPARTMENT USERS (Dept ID: 45) ===")
        res2 = await db.execute(select(User).where(User.department_id == 45))
        cse_users = res2.scalars().all()
        for u in cse_users:
            print(f"ID: {u.id}, Name: {u.name}, Email: {u.email}")

if __name__ == "__main__":
    asyncio.run(main())
