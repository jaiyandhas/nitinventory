import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import select, text
from app.routers.administrative_approval import _get_aa_workflow_steps, resolve_next_step
from app.models.administrative_approval import AdministrativeApproval
from app.core.database import AsyncSessionLocal

async def main():
    db = AsyncSessionLocal()
    try:
        print('--- Inspecting AA Workflows ---')
        # Load AAs
        result = await db.execute(
            select(AdministrativeApproval)
            .order_by(AdministrativeApproval.id.desc())
        )
        aas = result.scalars().all()
        for aa in aas:
            # Load budget_file explicitly
            await db.refresh(aa, ["budget_file"])
            
            source_of_fund_id = None
            if aa.budget_file and aa.budget_file.source_of_fund:
                from app.models.budget import SourceOfFund
                sof_res = await db.execute(
                    select(SourceOfFund.id).where(SourceOfFund.name == aa.budget_file.source_of_fund)
                )
                source_of_fund_id = sof_res.scalar_one_or_none()
                
            steps = await _get_aa_workflow_steps(db, aa.total_cost, aa.mode_of_procurement, source_of_fund_id)
            print(f"\nAA ID: {aa.id} | Status: {aa.status} | Pending With: {aa.pending_with} | Cost: {aa.total_cost} | MOP: {aa.mode_of_procurement} | SOF ID: {source_of_fund_id}")
            print("Resolved Steps:")
            for idx, s in enumerate(steps):
                print(f"  [{idx}] Step Order: {s.step_order} | Group: {s.user_group} | Skip: {s.skip_condition}")
                
            # Compute current_idx
            current_idx = -1
            if aa.pending_with:
                for idx, s in enumerate(steps):
                    if s.user_group.lower() == aa.pending_with.lower():
                        current_idx = idx
                        break
            
            print(f"Current Index: {current_idx}")
            if current_idx != -1:
                next_step_data = await resolve_next_step(db, aa, steps, current_idx)
                if next_step_data:
                    next_step = next_step_data["step"]
                    print(f"-> Next Step: {next_step.user_group} at idx {next_step_data['idx']}")
                else:
                    print("-> Next Step: None (Auto-grant)")
            else:
                print("-> Current Index is -1 (not found in steps or pending_with is None)")
                
    finally:
        await db.close()

asyncio.run(main())
