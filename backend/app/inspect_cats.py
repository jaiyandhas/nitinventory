import asyncio
from sqlalchemy import select, text
from app.core.database import engine

async def main():
    async with engine.connect() as conn:
        print("--- CATEGORIES ---")
        res = await conn.execute(text("SELECT * FROM purchase_categories"))
        print("Keys:", res.keys())
        for row in res:
            print(dict(zip(res.keys(), row)))

        print("\n--- PROCUREMENT MANAGERS ---")
        res = await conn.execute(text("SELECT * FROM procurement_managers"))
        print("Keys:", res.keys())
        for row in res:
            print(dict(zip(res.keys(), row)))

if __name__ == "__main__":
    asyncio.run(main())
