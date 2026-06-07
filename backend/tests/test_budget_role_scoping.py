import pytest
from sqlalchemy import select
from app.models.user import User
from app.models.budget import BudgetMaster, FinancialYear
from app.routers.budget import get_budget_files, budget_overview
from app.routers.admin import list_budget


@pytest.mark.asyncio
async def test_budget_role_scoping(db_session):
    db_session.commit = db_session.flush

    # 1. Fetch users: HOD, Faculty
    hod = (await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))).scalar_one()
    faculty = (await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))).scalar_one()

    # Fetch active financial year
    fy = (await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True).limit(1))).scalar_one()

    # Create 2 new distinct budgets in the department
    new_budget1 = BudgetMaster(
        department_id=hod.department_id,
        financial_year_id=fy.id,
        expenditure_category="CAPEX",
        item_name="Isolated Scoping Test Budget 1",
        category="equipment",
        course_code="N/A",
        unit_cost=50000.0,
        quantity=2,
        total_allocation=100000.0,
        file_no="TEST-FILE-SCOPING-1",
        is_revision=False,
        allocated_initiator_id=None
    )
    new_budget2 = BudgetMaster(
        department_id=hod.department_id,
        financial_year_id=fy.id,
        expenditure_category="CAPEX",
        item_name="Isolated Scoping Test Budget 2",
        category="equipment",
        course_code="N/A",
        unit_cost=30000.0,
        quantity=1,
        total_allocation=30000.0,
        file_no="TEST-FILE-SCOPING-2",
        is_revision=False,
        allocated_initiator_id=None
    )
    db_session.add(new_budget1)
    db_session.add(new_budget2)
    await db_session.flush()

    try:
        # 2. Test HOD can view both new budget files of their department
        hod_files = await get_budget_files(db_session, user=hod)
        hod_file_ids = {b["id"] for b in hod_files}
        assert new_budget1.id in hod_file_ids
        assert new_budget2.id in hod_file_ids

        # 3. Test Faculty (with nothing allocated yet) sees neither
        fac_files_initial = await get_budget_files(db_session, user=faculty)
        fac_file_ids_initial = {b["id"] for b in fac_files_initial}
        assert new_budget1.id not in fac_file_ids_initial
        assert new_budget2.id not in fac_file_ids_initial

        # 4. Allocate new_budget1 to Faculty and verify Faculty can see it (but not new_budget2)
        new_budget1.allocated_initiator_id = faculty.id
        await db_session.flush()

        fac_files_allocated = await get_budget_files(db_session, user=faculty)
        fac_file_ids_allocated = {b["id"] for b in fac_files_allocated}
        assert new_budget1.id in fac_file_ids_allocated
        assert new_budget2.id not in fac_file_ids_allocated

        # Verify list_budget scoped for faculty
        admin_list_fac = await list_budget(db=db_session, user=faculty, limit=50)
        admin_list_fac_ids = {b["id"] for b in admin_list_fac["items"]}
        assert new_budget1.id in admin_list_fac_ids
        assert new_budget2.id not in admin_list_fac_ids

    finally:
        # Clean up
        await db_session.delete(new_budget1)
        await db_session.delete(new_budget2)
        await db_session.flush()
