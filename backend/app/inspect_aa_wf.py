import asyncio
from sqlalchemy import select, text
from app.core.database import engine

async def main():
    async with engine.connect() as conn:
        print("--- ADMINISTRATIVE APPROVAL WORKFLOWS FOR CatID 8, ProcID 3 ---")
        res = await conn.execute(text(
            "SELECT * "
            "FROM administrative_approval_workflows "
            "WHERE category_id = 8 AND procurement_id = 3 "
            "ORDER BY step_order"
        ))
        print("Keys:", res.keys())
        for row in res:
            print(dict(zip(res.keys(), row)))

if __name__ == "__main__":
    asyncio.run(main())
