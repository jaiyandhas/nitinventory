import asyncio
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow, PurchaseRequestAssignment, PurchaseRequestHistory, PurchaseOrder

async def main():
    async with AsyncSessionLocal() as db:
        # Get the purchase request
        res = await db.execute(select(PurchaseRequest).where(PurchaseRequest.icr_number.like('%22')))
        pr = res.scalars().first()
        if not pr:
            print("PR not found")
            return
        print(f"PR details: ID={pr.id} | ICR={pr.icr_number} | Status={pr.current_status}")
        
        # Get flow
        res = await db.execute(select(PurchaseRequestFlow).where(PurchaseRequestFlow.purchase_request_id == pr.id))
        flow = res.scalars().first()
        if flow:
            print(f"Flow: Phase ID={flow.phase_id} | Step={flow.step_order} | Rejected={flow.rejected}")
        else:
            print("Flow: None")
            
        # Get history
        res = await db.execute(
            select(PurchaseRequestHistory)
            .where(PurchaseRequestHistory.purchase_request_id == pr.id)
            .order_by(PurchaseRequestHistory.acted_at.desc())
        )
        print("\nHistory:")
        for h in res.scalars():
            print(f"  Status={h.status} | Remarks={h.remarks} | Actor={h.current_approver_id} | ActedAt={h.acted_at}")
            
        # Get assignments
        res = await db.execute(select(PurchaseRequestAssignment).where(PurchaseRequestAssignment.purchase_request_id == pr.id))
        print("\nAssignments:")
        for a in res.scalars():
            print(f"  DA ID={a.assigned_da_id} | Status={a.status}")
            
        # Get PO
        res = await db.execute(select(PurchaseOrder).where(PurchaseOrder.purchase_request_id == pr.id))
        po = res.scalars().first()
        if po:
            print(f"PO: ID={po.id} | Number={po.po_number} | Vendor={po.vendor_name} | Amount={po.po_amount}")
        else:
            print("PO: None")

if __name__ == "__main__":
    asyncio.run(main())
