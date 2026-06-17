import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import FinancialEvaluation

async def heal():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(FinancialEvaluation))
        evals = res.scalars().all()
        updated = 0
        for ev in evals:
            # If quoted amount is small (e.g. <= 1000), it was entered in Lakhs
            if ev.quoted_amount <= 1000.0:
                print(f"Healing FinancialEvaluation id={ev.id} ({ev.vendor_name}): quoted_amount={ev.quoted_amount} -> {ev.quoted_amount * 100000.0}")
                ev.quoted_amount = ev.quoted_amount * 100000.0
                if ev.unit_price is not None and ev.unit_price <= 1000.0:
                    ev.unit_price = ev.unit_price * 100000.0
                db.add(ev)
                updated += 1
        if updated > 0:
            await db.commit()
            print(f"Healed {updated} records.")
        else:
            print("No records needed healing.")

if __name__ == "__main__":
    asyncio.run(heal())
