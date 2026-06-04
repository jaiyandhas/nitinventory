import pytest
from datetime import date
from fastapi import HTTPException
from sqlalchemy import select
from app.models.budget import BudgetMaster, FinancialYear
from app.models.purchase_request import PurchaseRequest, RequestStatus
from app.models.user import User
from app.routers.admin import create_budget, update_budget, financial_year_rollover
from app.routers.budget import assign_budget_committee, assign_budget_director_committee
from app.routers.purchase_requests import refer_pr

class MockRequest:
    def __init__(self, json_data=None):
        self._json_data = json_data or {}

    async def json(self):
        return self._json_data

    async def form(self):
        return self._json_data

@pytest.mark.asyncio
async def test_closed_fy_budget_safeguards(db_session):
    """Test that budget actions fail if the target/current FY is closed."""
    # Find the closed FY (seeded as 2025-26 with is_closed=True)
    fy_res = await db_session.execute(select(FinancialYear).where(FinancialYear.is_closed == True))
    closed_fy = fy_res.scalar_one()

    # Load test users
    dean_res = await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))
    dean_user = dean_res.scalar_one()

    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()

    director_res = await db_session.execute(select(User).where(User.email == "director@nitt.edu"))
    director_user = director_res.scalar_one()

    # Attempt to create budget in closed FY
    body = {
        "file_no": "BUD/CSE/CLOSED/01",
        "department_id": 1,
        "item_name": "Closed FY Item",
        "total_allocation": 100000.0,
        "financial_year_id": closed_fy.id
    }
    with pytest.raises(HTTPException) as exc_info:
        await create_budget(body, db=db_session, _=dean_user)
    assert exc_info.value.status_code == 400
    assert "closed" in exc_info.value.detail.lower()

    # Attempt to nominate experts on a budget file in a closed FY
    # We will create a budget first but we must temporarily set is_closed=False to bypass creation safeguard,
    # or just create a budget linked to the closed FY directly via SQLAlchemy and then test update/nomination safeguards.
    budget = BudgetMaster(
        file_no="BUD/CSE/CLOSED/02",
        department_id=1,
        item_name="Test Budget",
        expenditure_category="capital",
        category="equipment",
        course_code="CS101",
        unit_cost=150000.0,
        quantity=1,
        total_allocation=150000.0,
        financial_year_id=closed_fy.id
    )
    db_session.add(budget)
    await db_session.flush()

    # Attempt update_budget
    with pytest.raises(HTTPException) as exc_info:
        await update_budget(budget.id, {"item_name": "Modified name"}, db=db_session, _=dean_user)
    assert exc_info.value.status_code == 400
    assert "closed" in exc_info.value.detail.lower()

    # Attempt assign_budget_committee
    with pytest.raises(HTTPException) as exc_info:
        await assign_budget_committee(budget.id, {"expert1_id": 1, "expert2_id": 2}, db=db_session, user=hod)
    assert exc_info.value.status_code == 400
    assert "closed" in exc_info.value.detail.lower()

    # Attempt assign_budget_director_committee
    with pytest.raises(HTTPException) as exc_info:
        await assign_budget_director_committee(budget.id, {"director_faculty_id": 1}, db=db_session, user=director_user)
    assert exc_info.value.status_code == 400
    assert "closed" in exc_info.value.detail.lower()

@pytest.mark.asyncio
async def test_closed_fy_pr_safeguards(db_session):
    """Test that purchase request mutating actions fail if the PR is in a closed FY."""
    # Find the closed FY
    fy_res = await db_session.execute(select(FinancialYear).where(FinancialYear.is_closed == True))
    closed_fy = fy_res.scalar_one()

    # Find a user to act as initiator and referrer
    user_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    fac = user_res.scalar_one()

    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()

    # Create a dummy PR in closed FY
    pr = PurchaseRequest(
        amount=50000.0,
        purchase_type="department",
        initiator_id=fac.id,
        category_id=1,
        financial_year_id=closed_fy.id,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr)
    await db_session.flush()

    # Initialize workflow step
    from app.services.flow_engine import FlowEngineService
    flow_service = FlowEngineService(db_session)
    await flow_service.initialize(pr, fac)
    await db_session.refresh(pr)

    # Attempt mutating action (e.g. refer PR) on closed PR
    mock_req = MockRequest({"referred_to_id": fac.id, "query": "Checking specs"})
    with pytest.raises(HTTPException) as exc_info:
        await refer_pr(pr_id=pr.id, request=mock_req, db=db_session, user=hod)
    assert exc_info.value.status_code == 400
    assert "closed" in exc_info.value.detail.lower()

@pytest.mark.asyncio
async def test_financial_year_rollover_execution(db_session):
    """Test full year-end rollover execution: closes old FY, activates new FY, clones active PRs, and creates audit history."""
    db_session.commit = db_session.flush

    # 1. Fetch active FY
    active_fy_res = await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True))
    old_active_fy = active_fy_res.scalar_one()

    # Fetch CSE Faculty
    fac_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = fac_res.scalar_one()

    # Fetch CSE Department
    from app.models.user import Department
    dept_res = await db_session.execute(select(Department).where(Department.id == faculty.department_id))
    dept = dept_res.scalar_one()

    # Create budget in active FY
    budget = BudgetMaster(
        file_no="BUD/CSE/2026-27/01",
        department_id=dept.id,
        item_name="Lab Workstations",
        expenditure_category="capital",
        category="equipment",
        course_code="CS101",
        unit_cost=500000.0,
        quantity=1,
        total_allocation=500000.0,
        financial_year_id=old_active_fy.id
    )
    db_session.add(budget)
    await db_session.flush()

    # Create active in-progress PR
    pr = PurchaseRequest(
        amount=150000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=1,
        financial_year_id=old_active_fy.id,
        procurement_id=1,
        current_status="in_progress",
    )
    db_session.add(pr)
    await db_session.flush()

    # Associate PR item with the budget
    from app.models.purchase_request import PurchaseRequestItem
    item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Precision Workstations",
        quantity=3,
        estimated_total=150000.0,
        budget_file_id=budget.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    db_session.add(item)
    
    # Initialize workflow flow
    from app.services.flow_engine import FlowEngineService
    flow_service = FlowEngineService(db_session)
    await flow_service.initialize(pr, faculty)
    await db_session.refresh(pr)

    # Verify old budget master state before rollover
    await db_session.refresh(budget)
    assert budget.locked_amount == 150000.0

    # 2. Run rollover
    res = await financial_year_rollover(db=db_session, _=None)
    assert "rollover completed successfully" in res["message"].lower()

    # 3. Assert old FY is closed and new FY is active
    await db_session.refresh(old_active_fy)
    assert old_active_fy.is_active is False
    assert old_active_fy.is_closed is True

    new_fy_res = await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True))
    new_active_fy = new_fy_res.scalar_one()
    assert new_active_fy.label == "2027-28"
    assert new_active_fy.is_closed is False

    # 4. Assert old PR is marked rolled_over
    await db_session.refresh(pr)
    assert pr.current_status == "rolled_over"

    # Assert old budget master locked amount is released
    await db_session.refresh(budget)
    assert budget.locked_amount == 0.0

    # 5. Assert cloned PR exists in the new FY
    cloned_pr_res = await db_session.execute(
        select(PurchaseRequest).where(
            PurchaseRequest.parent_pr_id == pr.id,
            PurchaseRequest.financial_year_id == new_active_fy.id
        )
    )
    cloned_pr = cloned_pr_res.scalar_one()
    assert cloned_pr.amount == 150000.0
    assert cloned_pr.current_status == "in_progress"
    assert "PR/CSE/2027-28/R-" in cloned_pr.icr_number

    # Assert new budget master created/updated and locked amount set
    new_budget_res = await db_session.execute(
        select(BudgetMaster).where(
            BudgetMaster.department_id == dept.id,
            BudgetMaster.financial_year_id == new_active_fy.id,
            BudgetMaster.file_no == "BUD/CSE/2027-28/01"
        )
    )
    new_budget = new_budget_res.scalar_one()
    assert new_budget.locked_amount == 150000.0
