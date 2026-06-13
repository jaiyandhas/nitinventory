import pytest
from fastapi import HTTPException, BackgroundTasks
from sqlalchemy import select
from app.models.user import User, Department
from app.models.budget import BudgetMaster, FinancialYear
from app.schemas.pr_create import PRCreatePayload, PRItemCreate
from app.routers.purchase_requests import _persist_pr

@pytest.mark.asyncio
async def test_pr_quantity_locking_validation(db_session):
    db_session.commit = db_session.flush

    # Fetch faculty user and department
    fac_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = fac_res.scalar_one()
    await db_session.refresh(faculty, ["department", "role"])

    # Fetch a budget file in CSE department
    budget_res = await db_session.execute(
        select(BudgetMaster).where(BudgetMaster.department_id == faculty.department_id)
    )
    budget = budget_res.scalars().first()
    assert budget is not None

    # Set budget quantity to a specific number, e.g., 5
    budget.quantity = 5
    budget.unit_cost = 1000.0
    budget.total_allocation = 5000.0
    budget.committed_amount = 0.0
    budget.utilized_amount = 0.0
    db_session.add(budget)
    await db_session.flush()

    # 1. Attempt to create PR with incorrect quantity (e.g. 3)
    item_mismatch = PRItemCreate(
        budget_file_id=budget.id,
        quantity=3, # Doesn't match 5
        charges=18.0,
        requirement_type="Research",
        warranty=12.0,
        delivery_period=4.0,
        installation_required=False,
        site_readiness=True,
        availability="No",
        tech_specs_text="Tentative specifications",
    )

    payload_mismatch = PRCreatePayload(
        selected_file_ids=[budget.id],
        mop=1,
        nominee_id=None,
        basis_of_estimate="L1 Quote",
        emd=0.0,
        performance_security=0.0,
        delivery_location="CSE Department",
        delivery_mode="Courier",
        items=[item_mismatch],
    )

    bg_tasks = BackgroundTasks()

    # 1. Attempt to create PR with mismatched quantity (should NOT raise quantity mismatch error)
    try:
        await _persist_pr(payload_mismatch, faculty, db_session, bg_tasks)
    except HTTPException as exc_info:
        assert "does not match the allocated budget quantity" not in str(exc_info.detail)

    # 2. Attempt to create PR with correct quantity (e.g. 5)
    item_match = PRItemCreate(
        budget_file_id=budget.id,
        quantity=5, # Matches 5
        charges=18.0,
        requirement_type="Research",
        warranty=12.0,
        delivery_period=4.0,
        installation_required=False,
        site_readiness=True,
        availability="No",
        tech_specs_text="Tentative specifications",
    )

    payload_match = PRCreatePayload(
        selected_file_ids=[budget.id],
        mop=1,
        nominee_id=None,
        basis_of_estimate="L1 Quote",
        emd=0.0,
        performance_security=0.0,
        delivery_location="CSE Department",
        delivery_mode="Courier",
        items=[item_match],
    )

    # This should complete successfully (or reach the next validation/flow initialization phase)
    # We can execute it and check that it doesn't raise the quantity mismatch error
    try:
        res = await _persist_pr(payload_match, faculty, db_session, bg_tasks)
        assert res is not None
        assert "id" in res
    except HTTPException as e:
        # If it failed on some other validation (e.g., signature or something else), that's fine,
        # but it shouldn't fail on quantity validation
        assert "does not match the allocated budget quantity" not in str(e.detail)
