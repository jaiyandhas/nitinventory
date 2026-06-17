import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import FinancialEvaluation, PurchaseRequest

async def inspect():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(PurchaseRequest).order_by(PurchaseRequest.id.desc()).limit(5))
        prs = res.scalars().all()
        for pr in prs:
            print(f"PR #{pr.id}: status={pr.current_status}, amount={pr.amount}")
            res_evals = await db.execute(
                select(FinancialEvaluation).where(FinancialEvaluation.purchase_request_id == pr.id)
            )
            evals = res_evals.scalars().all()
            for ev in evals:
                print(f"  Eval: id={ev.id}, vendor={ev.vendor_name}, quoted_amount={ev.quoted_amount}, ranking={ev.ranking}, unit_price={ev.unit_price}, taxes={ev.taxes}")

if __name__ == "__main__":
    asyncio.run(inspect())
