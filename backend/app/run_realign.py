import asyncio
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow
from app.services.flow_engine import FlowEngineService

async def main():
    async with AsyncSessionLocal() as db:
        pr = await db.get(PurchaseRequest, 22)
        await db.refresh(pr, ["flow"])
        print(f"Before realign: Phase ID={pr.flow.phase_id} | Step={pr.flow.step_order}")
        
        flow_engine = FlowEngineService(db)
        await flow_engine.realign_pr_flow(pr)
        
        print(f"After realign: Phase ID={pr.flow.phase_id} | Step={pr.flow.step_order}")

if __name__ == "__main__":
    asyncio.run(main())
