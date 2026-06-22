import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest, PurchaseRequestHistory
from app.models.user import User

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == 22))
        pr = res.scalars().first()
        if not pr:
            print("PR not found")
            return
            
        history_res = await db.execute(
            select(PurchaseRequestHistory)
            .where(PurchaseRequestHistory.purchase_request_id == pr.id)
            .order_by(PurchaseRequestHistory.acted_at.asc())
        )
        print("History trace:")
        for h in history_res.scalars():
            actor_res = await db.execute(select(User).where(User.id == h.current_approver_id))
            u = actor_res.scalars().first()
            if u:
                await db.refresh(u, ["role"])
                print(f"ActedAt: {h.acted_at} | Status: {h.status} | Actor: {u.name} (ID: {u.id}) | Role: {u.role.value if u.role else 'None'} | Group: {u.role.group_key if u.role else 'None'}")
            else:
                print(f"ActedAt: {h.acted_at} | Status: {h.status} | Actor ID: {h.current_approver_id}")

if __name__ == "__main__":
    asyncio.run(main())
