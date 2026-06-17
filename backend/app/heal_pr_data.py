import asyncio
from sqlalchemy import select, update
from app.core.database import engine
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem
from app.models.budget import BudgetMaster

async def main():
    async with engine.connect() as conn:
        # Fetch all purchase requests
        res_prs = await conn.execute(
            select(
                PurchaseRequest.id, 
                PurchaseRequest.icr_number, 
                PurchaseRequest.amount, 
                PurchaseRequest.current_status
            )
        )
        prs = res_prs.all()
        print("--- PRE-HEALING INSPECTION ---")
        
        for p in prs:
            # Get associated items
            res_items = await conn.execute(
                select(
                    PurchaseRequestItem.id,
                    PurchaseRequestItem.estimated_total,
                    PurchaseRequestItem.charges,
                    PurchaseRequestItem.budget_file_id
                ).where(PurchaseRequestItem.purchase_request_id == p.id)
            )
            items = res_items.all()
            
            correct_pr_amount = 0.0
            for item in items:
                charges = item.charges if item.charges is not None else 0.0
                item_total_with_gst = item.estimated_total * (1.0 + charges / 100.0)
                correct_pr_amount += item_total_with_gst
                
                # Difference to adjust in the budget master
                diff = item_total_with_gst - item.estimated_total
                if diff > 0 and item.budget_file_id:
                    # Check status to decide if we adjust committed_amount or utilized_amount
                    if p.current_status == "po_issued":
                        await conn.execute(
                            update(BudgetMaster)
                            .where(BudgetMaster.id == item.budget_file_id)
                            .values(utilized_amount=BudgetMaster.utilized_amount + diff)
                        )
                        print(f"  Adjusted Budget File #{item.budget_file_id} utilized_amount by +{diff}")
                    elif p.current_status not in ["cancelled", "rejected", "completed"]:
                        await conn.execute(
                            update(BudgetMaster)
                            .where(BudgetMaster.id == item.budget_file_id)
                            .values(committed_amount=BudgetMaster.committed_amount + diff)
                        )
                        print(f"  Adjusted Budget File #{item.budget_file_id} committed_amount by +{diff}")

            # Update the PR amount
            if correct_pr_amount != p.amount:
                await conn.execute(
                    update(PurchaseRequest)
                    .where(PurchaseRequest.id == p.id)
                    .values(amount=correct_pr_amount)
                )
                print(f"Updated PR #{p.id} ({p.icr_number}) amount: {p.amount} -> {correct_pr_amount}")
        
        # Commit the transaction
        await conn.commit()
        print("--- HEALING COMPLETED ---")

if __name__ == "__main__":
    asyncio.run(main())
