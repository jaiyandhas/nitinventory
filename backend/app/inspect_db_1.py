import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal, engine
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow, WorkFlowHierarchy

async def inspect():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(PurchaseRequest).order_by(PurchaseRequest.id.desc()).limit(1))
        pr = res.scalar_one_or_none()
        if not pr:
            print("No PR found")
            return
        await db.refresh(pr, ["initiator", "faculty1", "faculty2", "faculty3"])
        
        hod_email = "hod.cse@nitt.edu"
        init_email = pr.initiator.email if pr.initiator else "faculty.cse@nitt.edu"
        f1_email = pr.faculty1.email if pr.faculty1 else init_email
        f2_email = pr.faculty2.email if pr.faculty2 else "faculty2.cse@nitt.edu"
        f3_email = pr.faculty3.email if pr.faculty3 else "faculty1.cse@nitt.edu"
        
        print("Emails:")
        print(f"  hod_email: {hod_email}")
        print(f"  init_email: {init_email}")
        print(f"  f1_email: {f1_email}")
        print(f"  f2_email: {f2_email}")
        print(f"  f3_email: {f3_email}")
        
        seen_te = set()
        unique_signers = []
        for em in [hod_email, init_email, f1_email, f2_email, f3_email]:
            if em not in seen_te:
                unique_signers.append(em)
                seen_te.add(em)
        print(f"  unique_signers: {unique_signers}")

if __name__ == "__main__":
    asyncio.run(inspect())
