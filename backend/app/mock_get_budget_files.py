import asyncio
from sqlalchemy import select
from app.core.database import AsyncSession, engine
from app.models.user import User
from app.routers.budget import get_budget_files

async def main():
    async with AsyncSession(bind=engine) as db:
        # We need a user to fetch the files as (e.g. A. Kumar ID 907)
        user = await db.get(User, 907)
        files = await get_budget_files(db, user)
        print("=== BUDGET FILES API RESPONSE ===")
        for f in files:
            print(f"ID: {f['id']}, File No: {f['file_no']}, Item: {f['item_name']}")
            print(f"  expert1_id: {f.get('expert1_id')}, expert2_id: {f.get('expert2_id')}")

if __name__ == "__main__":
    asyncio.run(main())
