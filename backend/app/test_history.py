import asyncio
from sqlalchemy import select
from app.models.purchase_request import PurchaseRequest, PurchaseRequestHistory
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine)
    async with Session() as db:
        res = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == 15))
        pr = res.scalar_one_or_none()
        if pr:
            print(f"PR ID: {pr.id} | te_initiated_at: {pr.te_initiated_at}")
            hist_res = await db.execute(select(PurchaseRequestHistory).where(PurchaseRequestHistory.purchase_request_id == pr.id).order_by(PurchaseRequestHistory.id))
            for h in hist_res.scalars():
                print(f"  Hist ID: {h.id} | ActorID: {h.current_approver_id} | Status: {h.status} | ActedAt: {h.acted_at}")
        else:
            print("PR 15 not found")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
