import asyncio
from sqlalchemy import select
from app.core.database import engine
from app.models.user import User, Department
from app.models.purchase_request import PurchaseRequest

async def main():
    async with engine.connect() as conn:
        # Check users
        res_users = await conn.execute(select(User.id, User.name, User.email, User.role_id, User.department_id).where(User.id <= 15))
        users = res_users.all()
        print("--- USERS ---")
        for u in users:
            print(f"ID: {u.id}, Name: {u.name}, Email: {u.email}, RoleID: {u.role_id}, DeptID: {u.department_id}")

        # Check departments
        res_depts = await conn.execute(select(Department.id, Department.name, Department.short_code))
        depts = res_depts.all()
        print("\n--- DEPARTMENTS ---")
        for d in depts:
            print(f"ID: {d.id}, Name: {d.name}, ShortCode: {d.short_code}")

        # Check details of all PRs
        res_pr = await conn.execute(
            select(
                PurchaseRequest.id, 
                PurchaseRequest.icr_number, 
                PurchaseRequest.amount, 
                PurchaseRequest.form_data,
                PurchaseRequest.administrative_approval_id
            ).where(PurchaseRequest.id >= 1)
        )
        prs = res_pr.all()
        print("\n--- PR INSPECTION ---")
        for p in prs:
            print(f"PR ID: {p.id}, ICR: {p.icr_number}, Amount: {p.amount}, AA ID: {p.administrative_approval_id}, Form Data: {p.form_data}")
            
            if p.administrative_approval_id:
                from app.models.administrative_approval import AdministrativeApproval
                res_aa = await conn.execute(
                    select(
                        AdministrativeApproval.id,
                        AdministrativeApproval.total_cost,
                        AdministrativeApproval.item_description
                    ).where(AdministrativeApproval.id == p.administrative_approval_id)
                )
                aa = res_aa.first()
                if aa:
                    print(f"    AA ID: {aa.id}, Item Description: {aa.item_description}, Total Cost: {aa.total_cost}")

            # Get associated items
            from app.models.purchase_request import PurchaseRequestItem
            res_items = await conn.execute(
                select(
                    PurchaseRequestItem.id,
                    PurchaseRequestItem.item_description,
                    PurchaseRequestItem.quantity,
                    PurchaseRequestItem.estimated_total,
                    PurchaseRequestItem.budget_file_id
                ).where(PurchaseRequestItem.purchase_request_id == p.id)
            )
            items = res_items.all()
            for item in items:
                print(f"  Item ID: {item.id}, Description: {item.item_description}, Qty: {item.quantity}, Est Total: {item.estimated_total}")
                # Get the associated budget file
                from app.models.budget import BudgetMaster
                res_bm = await conn.execute(
                    select(
                        BudgetMaster.id,
                        BudgetMaster.item_name,
                        BudgetMaster.unit_cost,
                        BudgetMaster.quantity,
                        BudgetMaster.total_allocation
                    ).where(BudgetMaster.id == item.budget_file_id)
                )
                bm = res_bm.first()
                if bm:
                    print(f"    Budget File ID: {bm.id}, Item Name: {bm.item_name}, Unit Cost: {bm.unit_cost}, Qty: {bm.quantity}, Total Allocation: {bm.total_allocation}")

if __name__ == "__main__":
    asyncio.run(main())
