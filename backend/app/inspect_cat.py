import asyncio
from app.core.database import AsyncSessionLocal
from app.models.budget import PurchaseCategory

async def main():
    async with AsyncSessionLocal() as db:
        c = await db.get(PurchaseCategory, 11)
        print(f"Category 11: Title={c.title} | ProcID={c.procurement_id}")

if __name__ == "__main__":
    asyncio.run(main())
