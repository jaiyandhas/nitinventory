import asyncio
from app.core.database import AsyncSessionLocal, engine
from app.routers.purchase_requests import get_pr
from app.models.user import User
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        # Fetch HOD user
        user_res = await db.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
        hod = user_res.scalar_one()
        
        pr_data = await get_pr(2, db, hod)
        print("API Response for PR 2:")
        print(f"  status: {pr_data.get('current_status')}")
        print(f"  flow: {pr_data.get('flow')}")
        print(f"  referrals: {pr_data.get('referrals')}")
        
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
