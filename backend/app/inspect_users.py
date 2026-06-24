import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
from app.models.user import User

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).options(selectinload(User.role)))
        users = res.scalars().all()
        for u in sorted(users, key=lambda x: x.id):
            print(f"User ID {u.id}: Name: {u.name} - Email: {u.email} - Role: {u.role.name if u.role else 'None'} (Value: {u.role.value if u.role else 'None'}, Group: {u.role.group_key if u.role else 'None'})")

if __name__ == "__main__":
    asyncio.run(main())
