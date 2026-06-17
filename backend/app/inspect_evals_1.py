import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import FinancialEvaluation, PurchaseRequest

async def inspect():
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(FinancialEvaluation)
            .where(FinancialEvaluation.purchase_request_id == 9)
        )
        evals = res.scalars().all()
        for ev in evals:
            print(f"Eval: id={ev.id}, vendor={ev.vendor_name}, quoted_amount={ev.quoted_amount}, ranking={ev.ranking}, unit_price={ev.unit_price}, taxes={ev.taxes}")

if __name__ == "__main__":
    asyncio.run(inspect())
