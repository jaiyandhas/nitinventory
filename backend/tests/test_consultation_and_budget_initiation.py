import pytest
from fastapi import HTTPException
from sqlalchemy import select, and_
from app.models.user import User, Department
from app.models.budget import BudgetMaster, FinancialYear
from app.models.purchase_request import PurchaseRequest, PRReferral
from app.routers.admin import (
    get_budget_categories,
    add_budget_category,
    get_next_file_number,
    create_budget,
    update_budget,
    get_budget_detail
)
from app.routers.budget import (
    assign_budget_committee,
    assign_budget_director_committee
)
from app.routers.purchase_requests import (
    refer_pr,
    respond_referral,
    get_pr,
    verify_no_active_referral
)

class MockRequest:
    def __init__(self, json_data):
        self._json_data = json_data
        self.headers = {}
    async def json(self):
        return self._json_data
    async def form(self):
        return {}

@pytest.mark.asyncio
async def test_budget_categories_and_auto_roll(db_session):
    """Test standard/custom category updates and auto-rolling file number increments."""
    db_session.commit = db_session.flush

    # Fetch admin user
    adm_res = await db_session.execute(select(User).where(User.email == "admin@nitt.edu"))
    admin = adm_res.scalar_one()

    # Fetch department and financial year
    dept_res = await db_session.execute(select(Department).where(Department.short_code == "CSE"))
    dept = dept_res.scalar_one()
    
    fy_res = await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True))
    fy = fy_res.scalar_one()

    # 1. Fetch categories
    cats = await get_budget_categories(db_session, _=admin)
    assert "expenditure_categories" in cats
    assert "item_categories" in cats
    
    # 2. Add custom category
    updated_cats = await add_budget_category({"type": "expenditure", "value": "SPECIAL_FUNDS"}, db_session, current_user=admin)
    assert "SPECIAL_FUNDS" in updated_cats["expenditure_categories"]

    # 3. Retrieve next file number (should count 0 existing and roll to 1)
    file_res = await get_next_file_number(
        department_id=dept.id,
        expenditure_category="SPECIAL_FUNDS",
        financial_year_id=fy.id,
        db=db_session,
        _=admin
    )
    expected_no = f"nitt/{dept.short_code.lower()}/special_funds/{fy.label.lower()}/1"
    assert file_res["file_no"] == expected_no

    # 4. Create budget with this file number
    create_res = await create_budget({
        "department_id": dept.id,
        "financial_year_id": fy.id,
        "expenditure_category": "SPECIAL_FUNDS",
        "item_name": "Test Lab Desks",
        "category": "furniture",
        "unit_cost": 25000.0,
        "quantity": 10,
        "file_no": expected_no
    }, db_session, _=admin)
    assert create_res["message"] == "Budget created"

    # 5. Get next file number again (should increment to 2)
    next_file_res = await get_next_file_number(
        department_id=dept.id,
        expenditure_category="SPECIAL_FUNDS",
        financial_year_id=fy.id,
        db=db_session,
        _=admin
    )
    expected_next_no = f"nitt/{dept.short_code.lower()}/special_funds/{fy.label.lower()}/2"
    assert next_file_res["file_no"] == expected_next_no


@pytest.mark.asyncio
async def test_budget_level_technical_committee(db_session):
    """Test nominating technical committee experts on a per-budget-file basis."""
    db_session.commit = db_session.flush

    # Fetch users
    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()

    fac1_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    fac1 = fac1_res.scalar_one()

    fac2_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
    fac2 = fac2_res.scalar_one()

    dir_res = await db_session.execute(select(User).where(User.email == "director@nitt.edu"))
    director = dir_res.scalar_one()

    # Get a budget file in HOD's department
    b_res = await db_session.execute(select(BudgetMaster).where(BudgetMaster.department_id == hod.department_id))
    budget = b_res.scalars().first()
    assert budget is not None

    # 1. HOD nominates expert 1 and expert 2
    res = await assign_budget_committee(
        budget_id=budget.id,
        body={"expert1_id": fac1.id, "expert2_id": fac2.id},
        db=db_session,
        user=hod
    )
    assert res["message"] == "Budget technical committee nominated successfully"
    await db_session.refresh(budget)
    assert budget.expert1_id == fac1.id
    assert budget.expert2_id == fac2.id

    # 2. Validation: HOD cannot nominate same experts
    with pytest.raises(HTTPException) as exc_info:
        await assign_budget_committee(
            budget_id=budget.id,
            body={"expert1_id": fac1.id, "expert2_id": fac1.id},
            db=db_session,
            user=hod
        )
    assert exc_info.value.status_code == 400

    # 3. Director/Admin assigns nominee
    res_dir = await assign_budget_director_committee(
        budget_id=budget.id,
        body={"director_faculty_id": fac1.id},
        db=db_session,
        user=director
    )
    assert res_dir["message"] == "Director nominee assigned successfully to budget file"
    await db_session.refresh(budget)
    assert budget.director_faculty_id == fac1.id


@pytest.mark.asyncio
async def test_adhoc_consultation_referral_flow(db_session):
    """Test full cycle of ad-hoc consultation referral: Freeze, response, and unfreeze."""
    db_session.commit = db_session.flush

    # Fetch users
    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()

    fac_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    fac = fac_res.scalar_one()

    # Create dummy PR expecting HOD action
    pr = PurchaseRequest(
        amount=80000.0,
        purchase_type="department",
        initiator_id=fac.id,
        category_id=1,
        financial_year_id=2,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr)
    await db_session.flush()

    # Initialize workflow flow
    from app.services.flow_engine import FlowEngineService
    flow_service = FlowEngineService(db_session)
    await flow_service.initialize(pr, fac)
    await db_session.refresh(pr)

    # 1. HOD refers PR to faculty for opinion
    res_ref = await refer_pr(
        pr_id=pr.id,
        request=MockRequest({"referred_to_id": fac.id, "query": "Is the spec for the GPU server okay?"}),
        db=db_session,
        user=hod
    )
    assert res_ref["message"] == "Purchase request referred for consultation successfully"

    # 2. Assert workflow actions are frozen
    with pytest.raises(HTTPException) as exc_info:
        await verify_no_active_referral(pr.id, db_session)
    assert exc_info.value.status_code == 400
    assert "Awaiting opinion" in exc_info.value.detail

    # 3. Faculty submits response opinion
    req_mock = MockRequest({"response": "Yes, GPU memory is correct."})
    res_resp = await respond_referral(
        pr_id=pr.id,
        request=req_mock,
        db=db_session,
        user=fac
    )
    assert res_resp["message"] == "Consultation response submitted successfully"

    # 4. Assert actions are unfrozen (should not raise exception)
    await verify_no_active_referral(pr.id, db_session)

    # 5. Verify detail API serializes referral history logs
    detail = await get_pr(pr_id=pr.id, db=db_session, user=hod)
    assert "referrals" in detail
    assert len(detail["referrals"]) == 1
    assert detail["referrals"][0]["status"] == "responded"
    assert detail["referrals"][0]["response"] == "Yes, GPU memory is correct."


@pytest.mark.asyncio
async def test_budget_committee_auto_sync_to_active_prs(db_session):
    """Test that updating budget committee experts automatically updates active PRs using that budget."""
    db_session.commit = db_session.flush

    # Fetch users
    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()

    fac1_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    fac1 = fac1_res.scalar_one()

    fac2_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
    fac2 = fac2_res.scalar_one()

    dir_res = await db_session.execute(select(User).where(User.email == "director@nitt.edu"))
    director = dir_res.scalar_one()

    # Get a budget file in HOD's department
    b_res = await db_session.execute(select(BudgetMaster).where(BudgetMaster.department_id == hod.department_id))
    budget = b_res.scalars().first()
    assert budget is not None

    # Create a dummy PR and associate its item with the budget file
    from app.models.purchase_request import PurchaseRequestItem
    pr = PurchaseRequest(
        amount=50000.0,
        purchase_type="department",
        initiator_id=fac1.id,
        category_id=1,
        financial_year_id=2,
        procurement_id=1,
        current_status="in_progress",
    )
    db_session.add(pr)
    await db_session.flush()

    pr_item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        budget_file_id=budget.id,
        item_description="Test synced committee",
        estimated_total=50000.0,
        quantity=1,
        requirement_type="Research",
        availability="No",
        tech_specs_text="—",
        site_readiness=True,
        installation_required=False,
    )
    db_session.add(pr_item)
    await db_session.flush()

    # Initial HOD nomination on the budget file
    await assign_budget_committee(
        budget_id=budget.id,
        body={"expert1_id": fac1.id, "expert2_id": fac2.id},
        db=db_session,
        user=hod
    )
    # Validate that HOD experts synced to the active PR
    await db_session.refresh(pr)
    assert pr.faculty1_id == fac1.id
    assert pr.faculty2_id == fac2.id

    # Director assigns nominee to the budget file
    await assign_budget_director_committee(
        budget_id=budget.id,
        body={"director_faculty_id": fac2.id},
        db=db_session,
        user=director
    )
    # Validate that Director nominee synced to the active PR
    await db_session.refresh(pr)
    assert pr.faculty3_id == fac2.id
