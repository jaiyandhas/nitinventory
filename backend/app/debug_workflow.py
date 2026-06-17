import asyncio
from sqlalchemy import select, text
from app.core.database import engine

async def main():
    async with engine.connect() as conn:
        print("\n--- ALL STEPS WITH user_type = 'tech_evaluation' ---")
        res = await conn.execute(text(
            "SELECT id, category_id, phase_id, procurement_id, step_order, user_group, role_id, user_type, source_of_fund_id, purchase_type "
            "FROM workflow_hierarchies "
            "WHERE user_type = 'tech_evaluation' "
            "ORDER BY category_id, procurement_id, phase_id, step_order"
        ))
        for row in res:
            print(dict(zip(res.keys(), row)))

if __name__ == "__main__":
    asyncio.run(main())
