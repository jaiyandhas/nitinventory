import pytest
from fastapi import HTTPException, BackgroundTasks
from sqlalchemy import select
from app.models.user import User
from app.models.budget import BudgetMaster, FinancialYear, ProcurementManager
from app.schemas.pr_create import PRCreatePayload, PRItemCreate
from app.routers.purchase_requests import _persist_pr

@pytest.mark.asyncio
async def test_pr_source_of_fund_validation(db_session):
    db_session.commit = db_session.flush

    # 1. Fetch HOD and Faculty in CSE
    hod = (await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))).scalar_one()
    faculty_cse = (await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))).scalar_one()
    await db_session.refresh(hod, ["department", "role"])
    await db_session.refresh(faculty_cse, ["department", "role"])

    # Fetch active financial year
    fy = (await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True).limit(1))).scalar_one()

    # Create 3 new budget entries (2 CAPEX, 1 REVEX)
    budget_capex1 = BudgetMaster(
        department_id=hod.department_id,
        financial_year_id=fy.id,
        source_of_fund="CAPEX",
        item_name="CAPEX Budget Item 1",
        category="equipment",
        course_code="N/A",
        unit_cost=1000.0,
        quantity=1,
        total_allocation=1000.0,
        file_no="TEST-CAPEX-1",
        is_revision=False,
        allocated_initiator_id=faculty_cse.id
    )
    budget_capex2 = BudgetMaster(
        department_id=hod.department_id,
        financial_year_id=fy.id,
        source_of_fund="CAPEX",
        item_name="CAPEX Budget Item 2",
        category="equipment",
        course_code="N/A",
        unit_cost=2000.0,
        quantity=1,
        total_allocation=2000.0,
        file_no="TEST-CAPEX-2",
        is_revision=False,
        allocated_initiator_id=faculty_cse.id
    )
    budget_revex = BudgetMaster(
        department_id=hod.department_id,
        financial_year_id=fy.id,
        source_of_fund="REVEX",
        item_name="REVEX Budget Item",
        category="equipment",
        course_code="N/A",
        unit_cost=3000.0,
        quantity=1,
        total_allocation=3000.0,
        file_no="TEST-REVEX",
        is_revision=False,
        allocated_initiator_id=faculty_cse.id
    )

    db_session.add(budget_capex1)
    db_session.add(budget_capex2)
    db_session.add(budget_revex)
    await db_session.flush()

    # Fetch a procurement method and temporarily mock its schema to None to bypass schema validations
    procurement = (await db_session.execute(select(ProcurementManager).where(ProcurementManager.id == 1))).scalar_one()
    original_schema = procurement.form_schema
    procurement.form_schema = None
    await db_session.flush()

    # Create items payload for the wizard
    item_capex1 = PRItemCreate(
        budget_file_id=budget_capex1.id,
        quantity=1,
        charges=0.0,
        requirement_type="Research",
        warranty=12.0,
        delivery_period=4.0,
        installation_required=False,
        site_readiness=True,
        availability="No",
        tech_specs_text="Specs for CAPEX 1",
    )
    item_capex2 = PRItemCreate(
        budget_file_id=budget_capex2.id,
        quantity=1,
        charges=0.0,
        requirement_type="Research",
        warranty=12.0,
        delivery_period=4.0,
        installation_required=False,
        site_readiness=True,
        availability="No",
        tech_specs_text="Specs for CAPEX 2",
    )
    item_revex = PRItemCreate(
        budget_file_id=budget_revex.id,
        quantity=1,
        charges=0.0,
        requirement_type="Research",
        warranty=12.0,
        delivery_period=4.0,
        installation_required=False,
        site_readiness=True,
        availability="No",
        tech_specs_text="Specs for REVEX",
    )

    bg_tasks = BackgroundTasks()

    try:
        # Test Case 1: Try creating PR with mixed sources (CAPEX + REVEX) - Should FAIL
        payload_mixed = PRCreatePayload(
            selected_file_ids=[budget_capex1.id, budget_revex.id],
            mop=1,
            nominee_id=None,
            basis_of_estimate="Budgetary Quote",
            emd=0.0,
            performance_security=0.0,
            delivery_location="CSE Dept",
            delivery_mode="Courier",
            items=[item_capex1, item_revex],
            initiator_id=faculty_cse.id,
        )
        with pytest.raises(HTTPException) as exc_info:
            await _persist_pr(payload_mixed, faculty_cse, db_session, bg_tasks)
        assert exc_info.value.status_code == 400
        assert "All selected budget files must have the same source of fund" in exc_info.value.detail

        # Test Case 2: Try creating PR with matching sources (CAPEX + CAPEX) - Should SUCCESS
        payload_matching = PRCreatePayload(
            selected_file_ids=[budget_capex1.id, budget_capex2.id],
            mop=1,
            nominee_id=None,
            basis_of_estimate="Budgetary Quote",
            emd=0.0,
            performance_security=0.0,
            delivery_location="CSE Dept",
            delivery_mode="Courier",
            items=[item_capex1, item_capex2],
            initiator_id=faculty_cse.id,
        )
        res = await _persist_pr(payload_matching, faculty_cse, db_session, bg_tasks)
        assert res is not None
        assert "id" in res

    finally:
        # Restore original schema
        procurement.form_schema = original_schema
        await db_session.flush()
