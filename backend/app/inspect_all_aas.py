import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.administrative_approval import AdministrativeApproval, AdministrativeApprovalHistory

async def main():
    db = AsyncSessionLocal()
    try:
        print('--- All Administrative Approvals ---')
        res = await db.execute(
            select(AdministrativeApproval)
            .order_by(AdministrativeApproval.id.desc())
        )
        aas = res.scalars().all()
        for aa in aas:
            # Refresh relationships
            await db.refresh(aa, ["pi", "budget_file", "history"])
            sof = aa.budget_file.source_of_fund if aa.budget_file else "None"
            print(f"\nID: {aa.id} | AA No: {aa.aa_number} | Status: {aa.status} | Pending: {aa.pending_with} | MOP: {aa.mode_of_procurement} | Cost: {aa.total_cost} | SOF: {sof}")
            print("  History:")
            for h in sorted(aa.history, key=lambda x: x.acted_at):
                print(f"    - Acted At: {h.acted_at} | Approver Role: {h.approver_role} | Status: {h.status} | Remarks: {h.remarks}")
    finally:
        await db.close()

asyncio.run(main())
