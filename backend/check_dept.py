import asyncio
from app.core.database import AsyncSessionLocal
from app.models.user import Department
from sqlalchemy import select

async def f():
    async with AsyncSessionLocal() as s:
        depts = (await s.execute(select(Department))).scalars().all()
        for d in depts:
            print(f"ID: {d.id}, Name: {d.name}, Expert1: {d.expert1_id}, Expert2: {d.expert2_id}")

if __name__ == "__main__":
    asyncio.run(f())
