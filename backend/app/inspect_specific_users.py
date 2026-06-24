import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
from app.models.user import User

async def main():
    async with AsyncSessionLocal() as db:
        for email in ["vg.pd@nitt.edu", "kalai@nitt.edu", "director@nitt.edu"]:
            res = await db.execute(select(User).options(selectinload(User.role)).where(User.email == email))
            u = res.scalar_one_or_none()
            if u:
                print(f"User Name: {u.name} - Email: {u.email} - Role: {u.role.name if u.role else 'None'} (Value: {u.role.value if u.role else 'None'}, Group: {u.role.group_key if u.role else 'None'})")
            else:
                print(f"User not found for email: {email}")

if __name__ == "__main__":
    asyncio.run(main())
