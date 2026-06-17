import asyncio
from sqlalchemy import select, and_
from datetime import datetime
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow, PurchaseRequestHistory
from app.models.user import User, Department, RoleManager
from app.models.budget import PhaseManager

async def heal():
    async with AsyncSessionLocal() as db:
        # Load Phase TE
        phase_res = await db.execute(select(PhaseManager).where(PhaseManager.phase_name == "Technical Evaluation"))
        phase_te = phase_res.scalar_one_or_none()
        if not phase_te:
            print("Technical Evaluation phase not found")
            return

        # Find all PRs with active flow at TE step 1
        prs_res = await db.execute(
            select(PurchaseRequest)
            .join(PurchaseRequestFlow, PurchaseRequest.id == PurchaseRequestFlow.purchase_request_id)
            .where(
                and_(
                    PurchaseRequestFlow.phase_id == phase_te.id,
                    PurchaseRequestFlow.step_order == 1
                )
            )
        )
        prs = prs_res.scalars().all()
        print(f"Found {len(prs)} PRs in Technical Evaluation Step 1.")

        for pr in prs:
            await db.refresh(pr, ["initiator", "flow", "history"])
            await db.refresh(pr.initiator, ["department"])
            dept = pr.initiator.department
            
            expert1_id = pr.faculty1_id or (dept.expert1_id if dept else None)
            expert2_id = pr.faculty2_id or (dept.expert2_id if dept else None)
            director_faculty_id = pr.faculty3_id or (dept.director_faculty_id if dept else None)

            required_ids = {pr.initiator_id, expert1_id, expert2_id, director_faculty_id}
            required_ids.discard(None) # Remove None if any remains
            
            since = pr.te_initiated_at or pr.created_at or datetime.min
            approved_ids = {
                h.current_approver_id for h in pr.history 
                if h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
                and (h.acted_at is None or h.acted_at >= since)
            }
            
            print(f"PR #{pr.id}:")
            print(f"  Required: {required_ids}")
            print(f"  Approved: {approved_ids}")
            
            if required_ids.issubset(approved_ids) and len(required_ids) > 0:
                print(f"  --> All signed! Advancing PR #{pr.id} to step 2 (HOD review)")
                pr.flow.step_order = 2
                
                # Check if we should log a history entry
                # Let's add a history log saying advanced
                # We can find the HOD to log who it's pending with
                db.add(pr.flow)
            else:
                print("  --> Not all members have signed yet.")

        await db.commit()

if __name__ == "__main__":
    asyncio.run(heal())
