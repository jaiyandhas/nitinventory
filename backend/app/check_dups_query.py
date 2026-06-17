import asyncio
from sqlalchemy import select
from app.models.budget import PurchaseCategory, ProcurementManager, SourceOfFund
from app.routers.administrative_approval import _get_aa_workflow_steps
from app.core.database import AsyncSessionLocal

async def main():
    db = AsyncSessionLocal()
    try:
        # Load all categories and procs
        cats_res = await db.execute(select(PurchaseCategory))
        cats = cats_res.scalars().all()
        
        mops_res = await db.execute(select(ProcurementManager))
        mops = mops_res.scalars().all()
        
        sofs_res = await db.execute(select(SourceOfFund))
        sofs = sofs_res.scalars().all()
        sof_ids = [None] + [s.id for s in sofs]
        
        print("Scanning all combinations for duplicate steps...")
        duplicates_found = 0
        for cat in cats:
            for mop in mops:
                for sof_id in sof_ids:
                    # Let's call _get_aa_workflow_steps for this combination
                    # We can use the category's min_amount as the total_cost
                    cost = cat.min_amount
                    steps = await _get_aa_workflow_steps(db, cost, mop.name, sof_id)
                    
                    # Check if there are any duplicate step_orders or user_groups in steps
                    seen_groups = set()
                    dups = []
                    for s in steps:
                        g = s.user_group.lower().strip()
                        if g in seen_groups:
                            dups.append(s.user_group)
                        seen_groups.add(g)
                        
                    if dups:
                        print(f"DUPLICATE FOUND! Cat: {cat.title} | MOP: {mop.name} | SOF: {sof_id}")
                        print(f"  Steps: {[s.user_group for s in steps]}")
                        duplicates_found += 1
                        
        print(f"Scan complete. Found {duplicates_found} combinations with duplicates.")
        
    finally:
        await db.close()

asyncio.run(main())
