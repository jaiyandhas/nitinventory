import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://nitinventory:nitinventory_secret@db:5432/nitinventory')
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'pr_referrals'"))
        print('pr_referrals columns:', [r[0] for r in res.fetchall()])

if __name__ == '__main__':
    asyncio.run(main())
