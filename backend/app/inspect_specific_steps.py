import asyncio
from sqlalchemy import select
from app.routers.administrative_approval import _get_aa_workflow_steps
from app.core.database import AsyncSessionLocal
from app.models.budget import PurchaseCategory, ProcurementManager

async def main():
    db = AsyncSessionLocal()
    try:
        # Let's find a category for Proprietary Purchase: Upto Rs. 1,00,000
        cat_res = await db.execute(select(PurchaseCategory).where(PurchaseCategory.title.like("%Proprietary%Upto%")))
        cat = cat_res.scalars().first()
        if not cat:
            print("Category not found")
            return
            
        print(f"Inspecting Category ID: {cat.id} | Title: {cat.title} | Procurement ID: {cat.procurement_id}")
        
        # Call _get_aa_workflow_steps
        steps = await _get_aa_workflow_steps(db, total_cost=50000.0, mode_of_procurement="Proprietary Purchase", source_of_fund_id=None)
        print(f"Total steps returned: {len(steps)}")
        for idx, s in enumerate(steps):
            print(f"  [{idx}] ID: {s.id} | Step: {s.step_order} | Group: {s.user_group} | Type: {s.purchase_type} | SOF ID: {s.source_of_fund_id} | Cat ID: {s.category_id} | MOP ID: {s.procurement_id}")
            
    finally:
        await db.close()

asyncio.run(main())
