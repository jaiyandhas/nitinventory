import asyncio
from sqlalchemy import select
from app.models.administrative_approval import AdministrativeApprovalWorkflow
from app.models.budget import PurchaseCategory, ProcurementManager, SourceOfFund
from app.core.database import AsyncSessionLocal

async def main():
    db = AsyncSessionLocal()
    try:
        print('--- Inspecting Administrative Approval Workflows in DB ---')
        res = await db.execute(select(AdministrativeApprovalWorkflow).order_by(
            AdministrativeApprovalWorkflow.source_of_fund_id.nullsfirst(),
            AdministrativeApprovalWorkflow.procurement_id,
            AdministrativeApprovalWorkflow.category_id,
            AdministrativeApprovalWorkflow.step_order
        ))
        steps = res.scalars().all()
        
        # Resolve related info
        categories_res = await db.execute(select(PurchaseCategory))
        categories = {c.id: c for c in categories_res.scalars()}
        
        mops_res = await db.execute(select(ProcurementManager))
        mops = {m.id: m for m in mops_res.scalars()}
        
        sofs_res = await db.execute(select(SourceOfFund))
        sofs = {s.id: s for s in sofs_res.scalars()}
        
        for s in steps:
            cat_name = categories[s.category_id].title if s.category_id in categories else "Any Category"
            mop_name = mops[s.procurement_id].name if s.procurement_id in mops else "Any MOP"
            sof_name = sofs[s.source_of_fund_id].name if s.source_of_fund_id in sofs else "Any SOF (Default)"
            
            print(f"ID: {s.id} | SOF: {sof_name} | MOP: {mop_name} | Cat: {cat_name} | Order: {s.step_order} | Group: {s.user_group} | Enabled: {s.is_enabled}")
            
    finally:
        await db.close()

asyncio.run(main())
