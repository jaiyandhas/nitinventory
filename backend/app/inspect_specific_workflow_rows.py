import asyncio
from sqlalchemy import select
from app.models.administrative_approval import AdministrativeApprovalWorkflow
from app.models.budget import PurchaseCategory, ProcurementManager
from app.core.database import AsyncSessionLocal

async def main():
    db = AsyncSessionLocal()
    try:
        # Find CPPP category
        cat_res = await db.execute(select(PurchaseCategory).where(PurchaseCategory.title.like("%CPPP%1,00,001%10,00,000%")))
        cat = cat_res.scalars().first()
        if not cat:
            print("Category not found")
            return
            
        print(f"Category: {cat.title} | ID: {cat.id}")
        
        # Select all steps
        res = await db.execute(
            select(AdministrativeApprovalWorkflow)
            .where(
                AdministrativeApprovalWorkflow.category_id == cat.id,
                AdministrativeApprovalWorkflow.purchase_type == "department"
            )
            .order_by(AdministrativeApprovalWorkflow.step_order)
        )
        steps = res.scalars().all()
        for s in steps:
            print(f"ID: {s.id} | Step: {s.step_order} | Group: {s.user_group} | Procurement ID: {s.procurement_id} | SOF: {s.source_of_fund_id}")
            
    finally:
        await db.close()

asyncio.run(main())
