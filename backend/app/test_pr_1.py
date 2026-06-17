import asyncio
from sqlalchemy import select
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine)
    async with Session() as db:
        res = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == 15))
        pr = res.scalar_one_or_none()
        if pr:
            print(f"PR ID: {pr.id} | ICR: {pr.icr_number} | Amount: {pr.amount} | Cat ID: {pr.category_id} | Status: {pr.current_status}")
            items_res = await db.execute(select(PurchaseRequestItem).where(PurchaseRequestItem.purchase_request_id == pr.id))
            for item in items_res.scalars():
                print(f"  Item ID: {item.id} | Desc: {item.item_description} | Qty: {item.quantity} | EstTotal: {item.estimated_total} | BudgetID: {item.budget_file_id}")
        else:
            print("PR 15 not found")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
