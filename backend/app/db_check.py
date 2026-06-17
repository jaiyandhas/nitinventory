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

        # Check workflow flow for PR ID 10
        from app.models.purchase_request import PurchaseRequestFlow, WorkFlowHierarchy
        from app.models.budget import PhaseManager
        
        # Get active PR 10
        res_pr = await conn.execute(
            select(
                PurchaseRequest.id, 
                PurchaseRequest.icr_number, 
                PurchaseRequest.amount, 
                PurchaseRequest.category_id,
                PurchaseRequest.procurement_id,
                PurchaseRequest.purchase_type
            ).where(PurchaseRequest.id == 10)
        )
        pr = res_pr.first()
        if pr:
            print(f"\n--- PR 10 WORKFLOW FLOW DETAILS ---")
            print(f"PR ID: {pr.id}, ICR: {pr.icr_number}, Category ID: {pr.category_id}, Procurement ID: {pr.procurement_id}, Purchase Type: {pr.purchase_type}")
            
            res_flow = await conn.execute(
                select(
                    PurchaseRequestFlow.phase_id,
                    PurchaseRequestFlow.step_order,
                    PurchaseRequestFlow.rejected
                ).where(PurchaseRequestFlow.purchase_request_id == pr.id)
            )
            flow = res_flow.first()
            if flow:
                res_phase = await conn.execute(select(PhaseManager.phase_name).where(PhaseManager.id == flow.phase_id))
                phase_name = res_phase.scalar()
                print(f"Current Flow - Phase: {phase_name} (ID: {flow.phase_id}), Step Order: {flow.step_order}, Rejected: {flow.rejected}")

                # Query the workflow hierarchies
                res_wf = await conn.execute(
                    select(
                        WorkFlowHierarchy.id,
                        WorkFlowHierarchy.step_order,
                        WorkFlowHierarchy.user_group,
                        WorkFlowHierarchy.role_id,
                        WorkFlowHierarchy.user_id,
                        WorkFlowHierarchy.phase_id,
                        WorkFlowHierarchy.source_of_fund_id,
                        WorkFlowHierarchy.is_enabled
                    ).where(
                        WorkFlowHierarchy.category_id == pr.category_id,
                        WorkFlowHierarchy.procurement_id == pr.procurement_id,
                        WorkFlowHierarchy.purchase_type == pr.purchase_type
                    ).order_by(WorkFlowHierarchy.phase_id, WorkFlowHierarchy.step_order)
                )
                wf_steps = res_wf.all()
                print("All Workflow Hierarchy Steps in DB:")
                for w in wf_steps:
                    res_p = await conn.execute(select(PhaseManager.phase_name).where(PhaseManager.id == w.phase_id))
                    p_name = res_p.scalar()
                    print(f"  ID: {w.id}, Phase: {p_name} (ID: {w.phase_id}), Step: {w.step_order}, Group: {w.user_group}, User ID: {w.user_id}, Role ID: {w.role_id}, SOF ID: {w.source_of_fund_id}, Enabled: {w.is_enabled}")

if __name__ == "__main__":
    asyncio.run(main())
