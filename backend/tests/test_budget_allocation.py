import pytest
import traceback
from fastapi import HTTPException, BackgroundTasks
from sqlalchemy import select
from app.models.budget import BudgetMaster, FinancialYear
from app.models.user import User
from app.routers.budget import get_budget_files, assign_budget_committee
from app.routers.purchase_requests import _persist_pr
from app.schemas.pr_create import PRCreatePayload, PRItemCreate

@pytest.mark.asyncio
async def test_budget_file_allocated_initiator(db_session):
    """Test allocating initiator, filtering allocated budget files, and enforcing PR initiator allocation check."""
    try:
        db_session.commit = db_session.flush
        bg_tasks = BackgroundTasks()

        # 1. Load HOD and Faculty users
        hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
        hod = hod_res.scalar_one()

        faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
        faculty = faculty_res.scalar_one()

        # Load CSE faculty to test cross-initiator/department checks
        faculty1_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
        faculty_cse_other = faculty1_res.scalar_one()

        # Find active financial year
        fy_res = await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True))
        active_fy = fy_res.scalar_one()

        # Find a non-TEMP budget file belonging to CSE in the active financial year
        from sqlalchemy import not_, and_
        bm_res = await db_session.execute(
            select(BudgetMaster).where(
                and_(
                    BudgetMaster.department_id == hod.department_id,
                    BudgetMaster.financial_year_id == active_fy.id,
                    not_(BudgetMaster.file_no.ilike("TEMP%"))
                )
            ).limit(1)
        )
        budget_file = bm_res.scalar_one()

        # Reset allocation first
        budget_file.allocated_initiator_id = None
        await db_session.flush()

        # 2. HOD allocates initiator via assign_budget_committee
        body = {
            "expert1_id": faculty_cse_other.id,
            "expert2_id": hod.id,
            "allocated_initiator_id": faculty.id
        }
        res = await assign_budget_committee(budget_file.id, body, db_session, user=hod)
        assert res["message"] == "Budget technical committee nominated successfully"

        # Reload and assert
        await db_session.refresh(budget_file)
        assert budget_file.allocated_initiator_id == faculty.id

        # 3. get_budget_files filters results based on role
        # If the user is HOD, they can see files in their department
        hod_files = await get_budget_files(db_session, user=hod)
        assert len(hod_files) > 0

        # If the user is the allocated faculty member, they can see this file
        faculty_files = await get_budget_files(db_session, user=faculty)
        assert any(f['id'] == budget_file.id for f in faculty_files)

        # If the user is another faculty member, they should NOT see this file
        faculty_other_files = await get_budget_files(db_session, user=faculty_cse_other)
        assert not any(f['id'] == budget_file.id for f in faculty_other_files)

        # 4. Enforce PR creation initiator check
        # Create payload for PR creation
        payload = PRCreatePayload(
            selected_file_ids=[budget_file.id],
            mop=1,
            purchase_type="department",
            basis_of_estimate="Budgetary Quote",
            emd=2.0,
            performance_security=3.0,
            delivery_location="CSE Department",
            delivery_mode="Courier",
            laboratory_office="CSE Lab 1",
            source_of_fund="OH-35",
            item_category="Assets",
            purpose="Research",
            mii_clause="Not Applicable",
            items=[
                PRItemCreate(
                    budget_file_id=budget_file.id,
                    quantity=1,
                    charges=18.0,
                    requirement_type="Research",
                    warranty=12,
                    delivery_period=8,
                    installation_required=False,
                    site_readiness=True,
                    availability="No",
                    tech_specs_text="Tentative specs"
                )
            ]
        )

        # Creating PR as the allocated faculty should check allocation
        # Let's try as a non-allocated faculty member: it should raise a 403 HTTPException
        try:
            await _persist_pr(payload, user=faculty_cse_other, db=db_session, background_tasks=bg_tasks)
            raise AssertionError("Should have raised 403 HTTPException")
        except HTTPException as e:
            assert e.status_code == 403
            assert "not allocated to you" in e.detail

        # Now let's try as the allocated faculty member. It should pass the initiator check (and fail on something else if missing dependencies, or succeed).
        try:
            await _persist_pr(payload, user=faculty, db=db_session, background_tasks=bg_tasks)
        except HTTPException as e:
            assert e.status_code != 403

    except Exception as e:
        with open("tests/debug_out.txt", "w") as f:
            f.write(f"Exception type: {type(e)}\n")
            f.write(f"Exception details: {str(e)}\n")
            f.write("Traceback:\n")
            f.write(traceback.format_exc())
        raise e
