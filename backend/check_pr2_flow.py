import asyncio
from sqlalchemy import select, and_
from app.core.database import AsyncSessionLocal, engine
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow, WorkFlowHierarchy

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == 2))
        pr = res.scalar_one_or_none()
        if not pr:
            print("PR 2 not found")
            return
            
        print("PR 2 attributes:")
        print(f"  category_id: {pr.category_id}")
        print(f"  procurement_id: {pr.procurement_id}")
        print(f"  purchase_type: {pr.purchase_type}")
        
        flow_res = await db.execute(select(PurchaseRequestFlow).where(PurchaseRequestFlow.purchase_request_id == 2))
        flow = flow_res.scalar_one_or_none()
        if not flow:
            print("Flow for PR 2 not found")
            return
            
        print(f"  phase_id: {flow.phase_id}")
        print(f"  step_order: {flow.step_order}")
        
        step_res = await db.execute(
            select(WorkFlowHierarchy).where(
                and_(
                    WorkFlowHierarchy.category_id == pr.category_id,
                    WorkFlowHierarchy.procurement_id == pr.procurement_id,
                    WorkFlowHierarchy.purchase_type == pr.purchase_type,
                    WorkFlowHierarchy.phase_id == flow.phase_id,
                    WorkFlowHierarchy.step_order == flow.step_order,
                    WorkFlowHierarchy.is_enabled == True,
                )
            )
        )
        step = step_res.scalar_one_or_none()
        if not step:
            print("WorkFlowHierarchy step not found in DB!")
            # Let's search for similar steps to see what matches
            all_steps_res = await db.execute(
                select(WorkFlowHierarchy).where(
                    and_(
                        WorkFlowHierarchy.phase_id == flow.phase_id,
                        WorkFlowHierarchy.step_order == flow.step_order
                    )
                )
            )
            print("Other steps in this phase & step order:")
            for s in all_steps_res.scalars().all():
                print(f"  cat: {s.category_id} | proc: {s.procurement_id} | type: {s.purchase_type} | group: {s.user_group}")
        else:
            print("WorkFlowHierarchy step found!")
            print(f"  user_group: {step.user_group}")
            print(f"  user_type: {step.user_type}")
            print(f"  role_id: {step.role_id}")

    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
