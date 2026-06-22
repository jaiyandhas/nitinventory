import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(PurchaseRequest).order_by(PurchaseRequest.id.desc()))
        for pr in res.scalars():
            print(f"ID={pr.id} | ICR={pr.icr_number} | Status={pr.current_status} | Category={pr.category_id}")

if __name__ == "__main__":
    asyncio.run(main())
