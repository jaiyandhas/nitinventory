import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    db = AsyncSessionLocal()
    try:
        print("--- Cleaning up duplicate workflow steps ---")
        
        # 1. Clean up administrative_approval_workflows
        # We find duplicates by grouping by category_id, procurement_id, purchase_type, step_order, user_group, source_of_fund_id
        # and keeping the row with the lowest id.
        aa_dup_stmt = """
            DELETE FROM administrative_approval_workflows a
            USING administrative_approval_workflows b
            WHERE a.id > b.id
              AND COALESCE(a.category_id, -1) = COALESCE(b.category_id, -1)
              AND COALESCE(a.procurement_id, -1) = COALESCE(b.procurement_id, -1)
              AND COALESCE(a.purchase_type, '') = COALESCE(b.purchase_type, '')
              AND a.step_order = b.step_order
              AND COALESCE(a.user_group, '') = COALESCE(b.user_group, '')
              AND COALESCE(a.source_of_fund_id, -1) = COALESCE(b.source_of_fund_id, -1);
        """
        res_aa = await db.execute(text(aa_dup_stmt))
        print(f"Deleted {res_aa.rowcount} duplicate rows from administrative_approval_workflows.")
        
        # 2. Clean up workflow_hierarchies
        # Let's inspect its columns first.
        # We'll use a similar query if it has similar structure.
        # Columns in workflow_hierarchies: category_id, procurement_id, purchase_type, step_order, user_group
        pr_dup_stmt = """
            DELETE FROM workflow_hierarchies a
            USING workflow_hierarchies b
            WHERE a.id > b.id
              AND COALESCE(a.category_id, -1) = COALESCE(b.category_id, -1)
              AND COALESCE(a.procurement_id, -1) = COALESCE(b.procurement_id, -1)
              AND COALESCE(a.purchase_type, '') = COALESCE(b.purchase_type, '')
              AND a.step_order = b.step_order
              AND COALESCE(a.user_group, '') = COALESCE(b.user_group, '')
              AND COALESCE(a.role_id, -1) = COALESCE(b.role_id, -1);
        """
        res_pr = await db.execute(text(pr_dup_stmt))
        print(f"Deleted {res_pr.rowcount} duplicate rows from workflow_hierarchies.")
        
        await db.commit()
        print("Cleanup transaction committed successfully!")
        
    except Exception as e:
        print("Error during cleanup:", e)
        await db.rollback()
    finally:
        await db.close()

asyncio.run(main())
