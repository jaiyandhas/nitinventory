import asyncio
from sqlalchemy import select
from app.models.user import User
from app.core.database import Base
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine)
    async with Session() as db:
        res = await db.execute(select(User))
        for u in res.scalars():
            print(f"ID: {u.id} | Name: {u.name} | Email: {u.email}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
