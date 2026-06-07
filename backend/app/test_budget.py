import asyncio
from sqlalchemy import select
from app.models.budget import BudgetMaster
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine)
    async with Session() as db:
        res = await db.execute(select(BudgetMaster))
        for b in res.scalars():
            print(f"ID: {b.id} | FileNo: {b.file_no} | Item: {b.item_name} | UnitCost: {b.unit_cost} | TotalCost: {b.total_cost}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
