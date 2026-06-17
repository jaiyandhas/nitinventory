import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.administrative_approval import AdministrativeApprovalWorkflow

async def main():
    db = AsyncSessionLocal()
    try:
        print('--- Administrative Approval Workflows with Source of Fund ID is NOT NULL ---')
        res = await db.execute(
            select(AdministrativeApprovalWorkflow)
            .where(AdministrativeApprovalWorkflow.source_of_fund_id != None)
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
