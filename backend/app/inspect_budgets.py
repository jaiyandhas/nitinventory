import asyncio
from sqlalchemy import select
from app.models.budget import BudgetMaster
from app.core.database import AsyncSessionLocal

async def main():
    db = AsyncSessionLocal()
    try:
        print('--- Budget Master Records ---')
        res = await db.execute(select(BudgetMaster).order_by(BudgetMaster.id.desc()).limit(20))
        budgets = res.scalars().all()
        for b in budgets:
            print(f"ID: {b.id} | Item: {b.item_name} | Nominees: {b.nominee_ids} | Expert1: {b.expert1_id} | Expert2: {b.expert2_id}")
    finally:
        await db.close()

asyncio.run(main())
