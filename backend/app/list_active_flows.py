import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(PurchaseRequestFlow)
            .join(PurchaseRequest, PurchaseRequestFlow.purchase_request_id == PurchaseRequest.id)
        )
        print("Active Flows in DB:")
        for flow in res.scalars():
            pr = await db.get(PurchaseRequest, flow.purchase_request_id)
            print(f"PR ID={pr.id} | ICR={pr.icr_number} | Status={pr.current_status} | Flow Phase ID={flow.phase_id} | Step={flow.step_order}")

if __name__ == "__main__":
    asyncio.run(main())
