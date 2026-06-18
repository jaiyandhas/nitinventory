import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
import os

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+asyncpg://iris_user:iris_pass@db:5432/iris_db')

async def fix_indent_workflow():
    engine = create_async_engine(DATABASE_URL)
    async with AsyncSession(engine) as db:
        async with db.begin():

            print("=== STEP 1: Delete wrong steps (> step 2) ===")

            # Delete all steps > 2 for default (SOF=NULL) workflows, except Direct Purchase (cat13)
            del1 = await db.execute(text(
                "DELETE FROM workflow_hierarchies "
                "WHERE phase_id = 1 AND step_order > 2 "
                "AND source_of_fund_id IS NULL AND category_id != 13"
            ))
            print(f"Deleted {del1.rowcount} default-SOF steps > 2")

            # Delete SOF-specific steps > 2, preserving active-PR steps:
            # cat8/proc3/dept/SOF=22 steps 13,14 (PR#10 is at step 13)
            # cat5/proc2/dept/SOF=22 steps 13,14 (safety for potential PR#1)
            del2 = await db.execute(text(
                "DELETE FROM workflow_hierarchies "
                "WHERE phase_id = 1 AND step_order > 2 "
                "AND source_of_fund_id IS NOT NULL AND category_id != 13 "
                "AND NOT (category_id = 8 AND procurement_id = 3 "
                "         AND purchase_type = 'department' AND source_of_fund_id = 22 "
                "         AND step_order IN (13, 14)) "
                "AND NOT (category_id = 5 AND procurement_id = 2 "
                "         AND purchase_type = 'department' AND source_of_fund_id = 22 "
                "         AND step_order IN (13, 14))"
            ))
            print(f"Deleted {del2.rowcount} SOF-specific steps > 2 (non-preserved)")

            print("\n=== STEP 2: Insert Director (step 3) for all non-direct combos ===")
            # Use a CTE to avoid parameter type ambiguity
            ins1 = await db.execute(text("""
                WITH combos AS (
                    SELECT DISTINCT category_id, procurement_id, purchase_type, source_of_fund_id
                    FROM workflow_hierarchies
                    WHERE phase_id = 1 AND step_order = 1 AND category_id != 13
                )
                INSERT INTO workflow_hierarchies
                    (phase_id, category_id, procurement_id, purchase_type, source_of_fund_id,
                     step_order, user_group, user_type, role_id, is_enabled)
                SELECT
                    1, c.category_id, c.procurement_id, c.purchase_type, c.source_of_fund_id,
                    3, 'apex_approver', 'approver', 12, true
                FROM combos c
                WHERE NOT EXISTS (
                    SELECT 1 FROM workflow_hierarchies w2
                    WHERE w2.phase_id = 1
                    AND w2.category_id = c.category_id
                    AND w2.procurement_id = c.procurement_id
                    AND w2.purchase_type = c.purchase_type
                    AND (w2.source_of_fund_id = c.source_of_fund_id
                         OR (w2.source_of_fund_id IS NULL AND c.source_of_fund_id IS NULL))
                    AND w2.step_order = 3
                )
            """))
            print(f"Inserted {ins1.rowcount} Director (step 3) rows")

            print("\n=== STEP 3: Insert tech_eval (step 4) for combos without tech_eval ===")
            ins2 = await db.execute(text("""
                WITH combos AS (
                    SELECT DISTINCT category_id, procurement_id, purchase_type, source_of_fund_id
                    FROM workflow_hierarchies
                    WHERE phase_id = 1 AND step_order = 1 AND category_id != 13
                )
                INSERT INTO workflow_hierarchies
                    (phase_id, category_id, procurement_id, purchase_type, source_of_fund_id,
                     step_order, user_group, user_type, role_id, is_enabled)
                SELECT
                    1, c.category_id, c.procurement_id, c.purchase_type, c.source_of_fund_id,
                    4, NULL, 'tech_evaluation', NULL, true
                FROM combos c
                WHERE NOT EXISTS (
                    SELECT 1 FROM workflow_hierarchies w2
                    WHERE w2.phase_id = 1
                    AND w2.category_id = c.category_id
                    AND w2.procurement_id = c.procurement_id
                    AND w2.purchase_type = c.purchase_type
                    AND (w2.source_of_fund_id = c.source_of_fund_id
                         OR (w2.source_of_fund_id IS NULL AND c.source_of_fund_id IS NULL))
                    AND w2.user_type = 'tech_evaluation'
                )
            """))
            print(f"Inserted {ins2.rowcount} tech_eval (step 4) rows")

            print("\n=== STEP 4: Final state verification ===")
            result = await db.execute(text(
                "SELECT wh.category_id, wh.procurement_id, wh.purchase_type, wh.source_of_fund_id, "
                "       wh.step_order, wh.user_group, wh.user_type, wh.role_id "
                "FROM workflow_hierarchies wh "
                "WHERE wh.phase_id = 1 "
                "ORDER BY wh.category_id, wh.procurement_id, wh.purchase_type, "
                "         wh.source_of_fund_id NULLS FIRST, wh.step_order"
            ))

            rows = result.fetchall()
            current = None
            for r in rows:
                d = dict(r._mapping)
                key = (d['category_id'], d['procurement_id'], d['purchase_type'], d['source_of_fund_id'])
                if key != current:
                    current = key
                    sof = f"SOF={d['source_of_fund_id']}" if d['source_of_fund_id'] else "default"
                    print(f"\n  cat{d['category_id']}/proc{d['procurement_id']}/{d['purchase_type']}/{sof}:")
                print(f"    step{d['step_order']}: {d['user_group']}/{d['user_type']} role={d['role_id']}")

        print("\n=== COMMITTED successfully ===")

asyncio.run(fix_indent_workflow())
