import asyncio
from sqlalchemy import select
from app.models.administrative_approval import AdministrativeApproval
from app.models.user import User, RoleManager
from app.core.database import AsyncSessionLocal
from app.routers.administrative_approval import action_aa

async def main():
    db = AsyncSessionLocal()
    try:
        # Get AA ID 2
        res = await db.execute(select(AdministrativeApproval).where(AdministrativeApproval.id == 2))
        aa = res.scalar_one_or_none()
        if not aa:
            print("AA ID 2 not found.")
            return
            
        await db.refresh(aa, ["pi"])
        pi = aa.pi
        print(f"AA 2: PI Name: {pi.name} | Dept ID: {pi.department_id}")
        
        # Find HOD for this department
        res_hod = await db.execute(
            select(User)
            .where(User.department_id == pi.department_id)
        )
        users = res_hod.scalars().all()
        hod_user = None
        for u in users:
            await db.refresh(u, ["role"])
            if u.role and (u.role.group_key == "hod" or u.role.value == "hod"):
                hod_user = u
                print(f"HOD User: Name: {u.name} | ID: {u.id} | Email: {u.email} | Role: {u.role.value}")
                
        if not hod_user:
            print("No HOD user found for department.")
            return
            
        # Try to approve AA ID 2 using action_aa as the HOD user
        print("\nAttempting HOD approval on AA 2 via action_aa endpoint...")
        try:
            body = {"action": "Approve", "remarks": "Approved by HOD via script"}
            response = await action_aa(
                aa_id=2,
                body=body,
                db=db,
                user=hod_user
            )
            print("Approval successful! Response:", response)
        except Exception as e:
            import traceback
            print("Approval failed with exception:")
            traceback.print_exc()
            
    finally:
        await db.close()

asyncio.run(main())
