import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.budget import BudgetMaster, FinancialYear

async def main():
    async with AsyncSessionLocal() as db:
        fy_res = await db.execute(select(FinancialYear))
        fys = fy_res.scalars().all()
        print("--- Financial Years ---")
        for fy in fys:
            print(f"ID: {fy.id} | Label: {fy.label} | Active: {fy.is_active}")
        
        print("\n--- Budgets ---")
        res = await db.execute(select(BudgetMaster))
        items = res.scalars().all()
        for b in items:
            print(f"ID: {b.id} | FileNo: {b.file_no} | Item: {b.item_name} | Total: {b.total_allocation} | Committed: {b.committed_amount} | Utilized: {b.utilized_amount} | Available: {b.available_balance}")

if __name__ == "__main__":
    asyncio.run(main())
