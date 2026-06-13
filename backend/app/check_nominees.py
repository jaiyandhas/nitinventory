import asyncio
from sqlalchemy import select
from app.core.database import AsyncSession, engine
from app.models.user import User, Department
from app.models.budget import BudgetMaster

async def main():
    async with AsyncSession(bind=engine) as db:
        # 1. Fetch departments and their nominees
        print("=== DEPARTMENTS & COMMITTEE NOMINEES ===")
        res = await db.execute(select(Department))
        depts = res.scalars().all()
        for d in depts:
            print(f"Dept ID: {d.id}, Code: {d.short_code}, Name: {d.name}")
            print(f"  Expert 1 ID: {d.expert1_id}, Expert 2 ID: {d.expert2_id}")
            # Get user details for experts
            if d.expert1_id:
                u1 = await db.get(User, d.expert1_id)
                print(f"    Expert 1: {u1.name if u1 else 'None'} ({u1.email if u1 else ''})")
            if d.expert2_id:
                u2 = await db.get(User, d.expert2_id)
                print(f"    Expert 2: {u2.name if u2 else 'None'} ({u2.email if u2 else ''})")
        
        # 2. Fetch budget master files and their nominees
        print("\n=== BUDGET MASTER FILES ===")
        res = await db.execute(select(BudgetMaster))
        budgets = res.scalars().all()
        for b in budgets:
            print(f"Budget ID: {b.id}, File No: {b.file_no}, Item: {b.item_name}")
            print(f"  Expert 1 ID: {b.expert1_id}, Expert 2 ID: {b.expert2_id}, Initiator ID: {b.allocated_initiator_id}")
            if b.expert1_id:
                u1 = await db.get(User, b.expert1_id)
                print(f"    Expert 1: {u1.name if u1 else 'None'}")
            if b.expert2_id:
                u2 = await db.get(User, b.expert2_id)
                print(f"    Expert 2: {u2.name if u2 else 'None'}")
            if b.allocated_initiator_id:
                u3 = await db.get(User, b.allocated_initiator_id)
                print(f"    Initiator: {u3.name if u3 else 'None'}")

if __name__ == "__main__":
    asyncio.run(main())
