import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.purchase_request import WorkFlowHierarchy

async def check():
    async with async_session_maker() as session:
        result = await session.execute(select(WorkFlowHierarchy))
        rows = result.scalars().all()
        print(f"Total rows in WorkFlowHierarchy: {len(rows)}")
        for r in rows:
            if r.category_id == 2 and r.procurement_id == 1 and r.phase_id == 1:
                print(f"Cat 2, Proc 1, Phase 1 -> Step: {r.step_order}, Role: {r.user_group}, Type: {r.purchase_type}")

asyncio.run(check())
