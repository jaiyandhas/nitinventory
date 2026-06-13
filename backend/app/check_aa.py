import asyncio
from sqlalchemy import select
from app.core.database import AsyncSession, engine
from app.models.administrative_approval import AdministrativeApproval
from app.models.budget import BudgetMaster

async def main():
    async with AsyncSession(bind=engine) as db:
        res = await db.execute(
            select(AdministrativeApproval)
            .join(BudgetMaster, AdministrativeApproval.budget_file_id == BudgetMaster.id)
        )
        aas = res.scalars().all()
        print("=== ADMINISTRATIVE APPROVALS ===")
        for aa in aas:
            print(f"AA ID: {aa.id}, Budget File ID: {aa.budget_file_id}, Status: {aa.status}, Qty: {aa.quantity}")
            print(f"  Item: {aa.budget_file.item_name if aa.budget_file else 'None'}")
            print(f"  File No: {aa.budget_file.file_no if aa.budget_file else 'None'}")

if __name__ == "__main__":
    asyncio.run(main())
