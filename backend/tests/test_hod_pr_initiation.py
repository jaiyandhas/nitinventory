import pytest
from fastapi import HTTPException, BackgroundTasks
from sqlalchemy import select, and_, not_
from app.models.user import User, Department, RoleManager
from app.models.budget import BudgetMaster, FinancialYear, ProcurementManager
from app.models.purchase_request import PurchaseRequest
from app.schemas.pr_create import PRCreatePayload, PRItemCreate
from app.routers.purchase_requests import _persist_pr

@pytest.mark.asyncio
async def test_hod_pr_initiation_and_assignment(db_session):
    db_session.commit = db_session.flush

    # 1. Fetch HOD and Faculty in CSE
    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()
    await db_session.refresh(hod, ["department", "role"])

    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty_cse = faculty_res.scalar_one()
    await db_session.refresh(faculty_cse, ["department", "role"])

    # Create ECE department and ECE faculty user
    ece_dept_res = await db_session.execute(select(Department).where(Department.short_code == "ECE"))
    ece_dept = ece_dept_res.scalar_one()

    role_res = await db_session.execute(select(RoleManager).where(RoleManager.value == "faculty"))
    faculty_role = role_res.scalar_one()

    faculty_ece = User(
        name="ECE Faculty Test",
        email="faculty.ece.test@nitt.edu",
        hashed_password="password",
        designation="Assistant Professor",
        gender="male",
        role_id=faculty_role.id,
        department_id=ece_dept.id,
        is_active=True,
        is_approved=True,
    )
    db_session.add(faculty_ece)
    await db_session.flush()

    # Get a budget file in CSE
    budget_res = await db_session.execute(
        select(BudgetMaster).where(
            and_(
                BudgetMaster.department_id == hod.department_id,
                not_(BudgetMaster.file_no.like("TEMP%"))
            )
        )
    )
    budget = budget_res.scalars().first()
    assert budget is not None

    # Force balance/quantity details
    budget.quantity = 1
    budget.unit_cost = 5000.0
    budget.total_allocation = 100000.0
    budget.committed_amount = 0.0
    budget.utilized_amount = 0.0
    db_session.add(budget)
    await db_session.flush()

    # Fetch a procurement method and temporarily mock its schema to None to bypass validation
    proc_res = await db_session.execute(select(ProcurementManager).where(ProcurementManager.id == 1))
    procurement = proc_res.scalar_one()
    original_schema = procurement.form_schema
    procurement.form_schema = None
    await db_session.flush()

    # Item details
    item = PRItemCreate(
        budget_file_id=budget.id,
        quantity=1,
        charges=18.0,
        requirement_type="Research",
        warranty=12.0,
        delivery_period=4.0,
        installation_required=False,
        site_readiness=True,
        availability="No",
        tech_specs_text="HOD initiated PR specifications",
    )

    bg_tasks = BackgroundTasks()

    try:
        # Test Case 1: HOD creates PR without initiator_id
        payload_no_init = PRCreatePayload(
            selected_file_ids=[budget.id],
            mop=1,
            nominee_id=None,
            basis_of_estimate="Budgetary Quote",
            emd=0.0,
            performance_security=0.0,
            delivery_location="CSE Dept",
            delivery_mode="Courier",
            items=[item],
            initiator_id=None,
        )
        with pytest.raises(HTTPException) as exc_info:
            await _persist_pr(payload_no_init, hod, db_session, bg_tasks)
        assert exc_info.value.status_code == 400
        assert "Purchase Initiator must be assigned by HOD" in exc_info.value.detail

        # Test Case 2: HOD creates PR and assigns ECE Faculty (different department)
        payload_bad_dept = PRCreatePayload(
            selected_file_ids=[budget.id],
            mop=1,
            nominee_id=None,
            basis_of_estimate="Budgetary Quote",
            emd=0.0,
            performance_security=0.0,
            delivery_location="CSE Dept",
            delivery_mode="Courier",
            items=[item],
            initiator_id=faculty_ece.id,
        )
        with pytest.raises(HTTPException) as exc_info:
            await _persist_pr(payload_bad_dept, hod, db_session, bg_tasks)
        assert exc_info.value.status_code == 400
        assert "Invalid Purchase Initiator" in exc_info.value.detail

        # Test Case 3: HOD creates PR and assigns CSE Faculty (success)
        payload_success = PRCreatePayload(
            selected_file_ids=[budget.id],
            mop=1,
            nominee_id=None,
            basis_of_estimate="Budgetary Quote",
            emd=0.0,
            performance_security=0.0,
            delivery_location="CSE Dept",
            delivery_mode="Courier",
            items=[item],
            initiator_id=faculty_cse.id,
        )
        res = await _persist_pr(payload_success, hod, db_session, bg_tasks)
        assert res is not None
        assert "id" in res

        # Retrieve and assert correct initiator is stored
        pr_id = res["id"]
        pr_res = await db_session.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
        pr = pr_res.scalar_one()
        assert pr.initiator_id == faculty_cse.id

    finally:
        # Restore original schema
        procurement.form_schema = original_schema
        await db_session.flush()

        # Clean up test user
        await db_session.delete(faculty_ece)
        await db_session.flush()
