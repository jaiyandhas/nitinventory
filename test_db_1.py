import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://iris:irispass@localhost:5432/iris_db')
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT id, name FROM core.procurement_methods"))
        print('Methods:', res.fetchall())
        res = await conn.execute(text("SELECT id, item_name, total_cost FROM core.budget_master LIMIT 5"))
        print('Budgets:', res.fetchall())

asyncio.run(main())
