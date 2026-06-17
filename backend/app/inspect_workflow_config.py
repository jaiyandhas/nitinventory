import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.budget import SourceOfFund
from app.models.administrative_approval import AdministrativeApprovalWorkflow
from app.models.budget import PurchaseCategory, ProcurementManager

async def main():
    db = AsyncSessionLocal()
    try:
        print('--- Source of Funds ---')
        res = await db.execute(select(SourceOfFund))
        sof_list = res.scalars().all()
        for sof in sof_list:
            print(f"ID: {sof.id} | Name: {sof.name} | Description: {sof.description}")
            
        print('\n--- Procurement Managers ---')
        res = await db.execute(select(ProcurementManager))
        mops = res.scalars().all()
        for m in mops:
            print(f"ID: {m.id} | Name: {m.name}")

        print('\n--- Purchase Categories ---')
        res = await db.execute(select(PurchaseCategory))
        cats = res.scalars().all()
        for c in cats:
            print(f"ID: {c.id} | Proc ID: {c.procurement_id} | Title: {c.title} | Min: {c.min_amount} | Max: {c.max_amount} | Active: {c.is_active}")

        print('\n--- Administrative Approval Workflows ---')
        res = await db.execute(
            select(AdministrativeApprovalWorkflow)
            .order_by(
                AdministrativeApprovalWorkflow.source_of_fund_id,
                AdministrativeApprovalWorkflow.procurement_id,
                AdministrativeApprovalWorkflow.category_id,
                AdministrativeApprovalWorkflow.step_order
            )
        )
        wfs = res.scalars().all()
        for wf in wfs:
            print(f"ID: {wf.id} | SOF ID: {wf.source_of_fund_id} | Proc ID: {wf.procurement_id} | Cat ID: {wf.category_id} | Purchase Type: {wf.purchase_type} | Order: {wf.step_order} | Group: {wf.user_group} | Enabled: {wf.is_enabled}")
            
    finally:
        await db.close()

asyncio.run(main())
