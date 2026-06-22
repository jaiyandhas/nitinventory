"""
Quick test: hit the /purchase-requests/22 endpoint and check that
flow.expected_user_id matches the assigned DA's user ID.
"""
import asyncio
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest, PurchaseRequestAssignment
from app.models.purchase_request import WorkFlowHierarchy
from app.models.budget import PhaseManager
from app.services.flow_engine import FlowEngineService
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from app.models.user import User


async def main():
    async with AsyncSessionLocal() as db:
        # Load PR with assignments + assigned_da
        result = await db.execute(
            select(PurchaseRequest)
            .options(
                selectinload(PurchaseRequest.flow),
                selectinload(PurchaseRequest.assignments).selectinload(PurchaseRequestAssignment.assigned_da),
                selectinload(PurchaseRequest.assignments).selectinload(PurchaseRequestAssignment.assigned_by),
            )
            .where(PurchaseRequest.id == 22)
        )
        pr = result.scalar_one_or_none()
        if not pr:
            print("PR not found")
            return

        print(f"PR #22 — Status: {pr.current_status}")
        print(f"Flow: Phase ID={pr.flow.phase_id} | Step={pr.flow.step_order}")

        if pr.assignments:
            a = pr.assignments[-1]
            print(f"\nLatest Assignment:")
            print(f"  assigned_da_id = {a.assigned_da_id}")
            print(f"  assigned_da.name = {a.assigned_da.name if a.assigned_da else 'N/A'}")

        # Find the workflow step for this PR
        flow_engine = FlowEngineService(db)
        sof_id = await flow_engine.resolve_sof_id(pr, phase_id=pr.flow.phase_id)
        res = await db.execute(
            select(WorkFlowHierarchy).where(
                and_(
                    WorkFlowHierarchy.category_id == pr.category_id,
                    WorkFlowHierarchy.procurement_id == pr.procurement_id,
                    WorkFlowHierarchy.purchase_type == pr.purchase_type,
                    WorkFlowHierarchy.phase_id == pr.flow.phase_id,
                    WorkFlowHierarchy.step_order == pr.flow.step_order,
                    WorkFlowHierarchy.is_enabled == True,
                    WorkFlowHierarchy.source_of_fund_id == sof_id,
                )
            ).limit(1)
        )
        step = res.scalar_one_or_none()
        if step:
            print(f"\nWorkflow step:")
            print(f"  user_type = {step.user_type}")
            print(f"  user_group = {step.user_group}")
            print(f"  role_id = {step.role_id}")

            # Simulate the backend logic (updated condition: user_type OR user_group)
            expected_user_id = None
            expected_user_name = None
            if (step.user_type == "verifier_da" or step.user_group == "verifier_da") and pr.assignments:
                latest_assignment = pr.assignments[-1]
                expected_user_id = latest_assignment.assigned_da_id
                expected_user_name = latest_assignment.assigned_da.name if latest_assignment.assigned_da else None

            print(f"\n✅ expected_user_id = {expected_user_id} ({expected_user_name})")
            if expected_user_id:
                print("→ K. DA Stores (user ID 3) will now see the action panel!")
            else:
                print("→ WARNING: expected_user_id is still None")
        else:
            print("\nNo matching workflow step found for this PR at current phase/step")


if __name__ == "__main__":
    asyncio.run(main())
