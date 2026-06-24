import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow, PurchaseRequestHistory
from app.models.user import User

async def main():
    async with AsyncSessionLocal() as db:
        stmt = (
            select(PurchaseRequest)
            .options(
                selectinload(PurchaseRequest.flow),
                selectinload(PurchaseRequest.history),
                selectinload(PurchaseRequest.initiator),
                selectinload(PurchaseRequest.faculty1),
                selectinload(PurchaseRequest.faculty2),
                selectinload(PurchaseRequest.faculty3),
            )
        )
        res = await db.execute(stmt)
        prs = res.scalars().all()
        print(f"Found {len(prs)} Purchase Requests:")
        for pr in prs:
            print(f"\nPR #{pr.id} - Status: {pr.current_status} - Step: {pr.flow.step_order if pr.flow else 'No Flow'} - Phase ID: {pr.flow.phase_id if pr.flow else 'No Flow'}")
            print(f"  Initiator: {pr.initiator.email if pr.initiator else 'None'}")
            print(f"  Faculty1 (Expert1): {pr.faculty1.email if pr.faculty1 else 'None'}")
            print(f"  Faculty2 (Expert2): {pr.faculty2.email if pr.faculty2 else 'None'}")
            print(f"  Faculty3 (Dir Nominee): {pr.faculty3.email if pr.faculty3 else 'None'}")
            if pr.flow:
                # get phase name
                from app.models.budget import PhaseManager
                p_res = await db.execute(select(PhaseManager).where(PhaseManager.id == pr.flow.phase_id))
                phase = p_res.scalar_one_or_none()
                print(f"  Current Phase: {phase.phase_name if phase else 'Unknown'}")
            print("  History:")
            for h in pr.history:
                approver_res = await db.execute(select(User).where(User.id == h.current_approver_id))
                approver = approver_res.scalar_one_or_none()
                print(f"    - [{h.acted_at}] {approver.email if approver else 'Unknown'} -> {h.status} (Remarks: {h.remarks})")

if __name__ == "__main__":
    asyncio.run(main())
