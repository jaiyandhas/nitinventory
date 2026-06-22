import asyncio
from app.core.database import AsyncSessionLocal
from app.models.budget import PurchaseCategory

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(PurchaseCategory))
        for c in res.scalars():
            print(f"ID={c.id} | Title={c.title} | ProcID={c.procurement_id}")

if __name__ == "__main__":
    from sqlalchemy import select
    asyncio.run(main())
