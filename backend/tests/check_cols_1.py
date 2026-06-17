import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://nitinventory:nitinventory_secret@db:5432/nitinventory')
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT id, icr_number, current_status FROM purchase_requests"))
        rows = res.fetchall()
        print('Total Purchase Requests:', len(rows))
        for r in rows:
            print(f'ID: {r[0]} | ICR: {r[1]} | Status: {r[2]}')

if __name__ == '__main__':
    asyncio.run(main())
