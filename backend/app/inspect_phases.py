import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.budget import PhaseManager

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(PhaseManager))
        for p in res.scalars():
            print(f"ID={p.id} | Name={p.phase_name}")

if __name__ == "__main__":
    asyncio.run(main())
