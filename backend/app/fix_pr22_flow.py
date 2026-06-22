"""
One-shot script to fix the stuck flow for PR #22.
Runs realign_pr_flow and commits the corrected phase/step to the database.
"""
import asyncio
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest
from app.services.flow_engine import FlowEngineService


async def main():
    async with AsyncSessionLocal() as db:
        pr = await db.get(PurchaseRequest, 22)
        await db.refresh(pr, ["flow"])
        print(f"Before fix: Phase ID={pr.flow.phase_id} | Step={pr.flow.step_order}")

        flow_engine = FlowEngineService(db)
        await flow_engine.realign_pr_flow(pr)

        await db.commit()
        await db.refresh(pr.flow)
        print(f"After  fix: Phase ID={pr.flow.phase_id} | Step={pr.flow.step_order}")
        print("Done — PR #22 flow is now committed to the database.")


if __name__ == "__main__":
    asyncio.run(main())
