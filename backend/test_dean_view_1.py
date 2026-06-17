import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.routers.admin import list_budget

async def main():
    async with AsyncSessionLocal() as db:
        # Get Dean user
        res = await db.execute(select(User).where(User.email == "dean.budget@nitt.edu"))
        dean = res.scalar_one()
        await db.refresh(dean, ["role"])
        
        # Call list_budget
        response = await list_budget(
            skip=0,
            limit=50,
            db=db,
            user=dean
        )
        print("Response items count:", len(response["items"]))
        for item in response["items"]:
            print(f"ID: {item['id']} | FileNo: {item['file_no']} | Item: {item['item_name']}")

if __name__ == "__main__":
    asyncio.run(main())
