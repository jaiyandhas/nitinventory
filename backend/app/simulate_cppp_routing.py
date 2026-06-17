import asyncio
from sqlalchemy import select, and_
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.budget import BudgetMaster, SourceOfFund
from app.models.administrative_approval import AdministrativeApproval, AdministrativeApprovalHistory
from app.routers.administrative_approval import create_aa, action_aa, _get_aa_workflow_steps

async def main():
    db = AsyncSessionLocal()
    try:
        # Find a faculty, HOD, and ADPD user
        faculty_res = await db.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
        faculty = faculty_res.scalar_one()
        await db.refresh(faculty, ["department", "role"])

        hod_res = await db.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
        hod = hod_res.scalar_one()
        await db.refresh(hod, ["department", "role"])

        adpd_res = await db.execute(select(User).where(User.email == "vg.pd@nitt.edu"))
        adpd = adpd_res.scalar_one()
        await db.refresh(adpd, ["department", "role"])

        # Find or create a budget file with CAPEX (OH-35)
        # First check source of fund
        sof_res = await db.execute(select(SourceOfFund).where(SourceOfFund.name == "CAPEX (OH-35)"))
        sof = sof_res.scalar_one()
        
        # Check if there is a budget file
        budget_res = await db.execute(
            select(BudgetMaster).where(
                and_(
                    BudgetMaster.department_id == faculty.department_id,
                    BudgetMaster.allocated_initiator_id == faculty.id,
                    BudgetMaster.source_of_fund == "CAPEX (OH-35)"
                )
            )
        )
        budget = budget_res.scalars().first()
        if not budget:
            # Let's create one
            from app.models.budget import FinancialYear
            fy_res = await db.execute(select(FinancialYear).where(FinancialYear.is_active == True))
            fy = fy_res.scalars().first()
            budget = BudgetMaster(
                department_id=faculty.department_id,
                allocated_initiator_id=faculty.id,
                source_of_fund="CAPEX (OH-35)",
                item_name="Simulated CAPEX Budget",
                total_allocation=150000.0,
                committed_amount=0.0,
                utilized_amount=0.0,
                financial_year_id=fy.id if fy else 1,
                expert1_id=faculty.id,
                expert2_id=faculty.id,
                quantity=10,
                unit_cost=10000.0,
                category="Assets",
                course_code="NONE",
                file_no="TEST-FILE-123",
                is_active=True
            )
            db.add(budget)
            await db.commit()
            await db.refresh(budget)
            print(f"Created simulated budget {budget.id}")
        else:
            print(f"Using existing budget {budget.id}")
            # Ensure balance
            budget.total_allocation = 150000.0
            budget.committed_amount = 0.0
            budget.utilized_amount = 0.0
            budget.expert1_id = faculty.id
            budget.expert2_id = faculty.id
            db.add(budget)
            await db.commit()

        # Step 1: Create AA request
        body = {
            "budget_file_id": budget.id,
            "item_description": "CPPP Under 1 Lakh Test Item",
            "gst_rate": 18.0,
            "mode_of_procurement": "CPPP",
            "justification": "Test routing under 1,00,000",
            "item_category": "Assets",
            "stock_availability": "No",
            "present_stock": "0",
            "prev_file_no": "None",
            "justification_procurement": "Required",
            "generic_specification_declaration": True,
            "quantity": 5, # 5 * 10000 = 50000 + GST = 59000
            "total_cost": 59000.0,
            "gst_amount": 9000.0
        }

        # Submit as faculty
        create_res = await create_aa(body, db, faculty)
        aa_id = create_res["id"]
        print(f"Created AA ID {aa_id}")

        # Fetch AA and print workflow steps
        aa_res = await db.execute(select(AdministrativeApproval).where(AdministrativeApproval.id == aa_id))
        aa = aa_res.scalar_one()
        await db.refresh(aa, ["budget_file"])
        
        steps = await _get_aa_workflow_steps(db, aa.total_cost, aa.mode_of_procurement, sof.id)
        print("Steps for this AA request:")
        for idx, s in enumerate(steps):
            print(f"  [{idx}] Step Order: {s.step_order} | Group: {s.user_group} | ID: {s.id}")

        print(f"Initial status: {aa.status} | Pending with: {aa.pending_with}")

        # Step 2: HOD Approves
        print("\n--- HOD approves ---")
        hod_body = {
            "action": "Approve",
            "remarks": "approved by HOD in simulation"
        }
        hod_res = await action_aa(aa_id, hod_body, db, hod)
        print("After HOD approval:")
        print(f"  Status: {hod_res['status']}")

        # Refresh and print pending
        await db.refresh(aa)
        print(f"  Pending with: {aa.pending_with}")

        # Step 3: ADPD Approves
        print("\n--- ADPD approves ---")
        adpd_body = {
            "action": "Approve",
            "remarks": "approved by ADPD in simulation"
        }
        adpd_res = await action_aa(aa_id, adpd_body, db, adpd)
        print("After ADPD approval:")
        print(f"  Status: {adpd_res['status']}")

        # Refresh and print pending
        await db.refresh(aa)
        print(f"  Pending with: {aa.pending_with}")

    finally:
        await db.close()

asyncio.run(main())
