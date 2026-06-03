import pytest
from fastapi import HTTPException
from sqlalchemy import select, and_
from app.models.budget import PhaseManager
from app.models.user import User, Department, RoleManager
from app.models.purchase_request import PurchaseRequest, WorkFlowHierarchy, CommercialEvaluation
from app.routers.budget import update_department_committee, director_update_committee
from app.services.flow_engine import FlowEngineService

@pytest.mark.asyncio
async def test_hod_nominate_experts_validation(db_session):
    """Test HOD nominating experts for their department including all validation constraints."""
    db_session.commit = db_session.flush
    # Load users
    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()
    
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    
    faculty1_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
    faculty1 = faculty1_res.scalar_one()

    # Fetch a faculty member from another department (we will use ECE or EEE)
    ece_dept_res = await db_session.execute(select(Department).where(Department.short_code == "ECE"))
    ece_dept = ece_dept_res.scalar_one()

    role_res = await db_session.execute(select(RoleManager).where(RoleManager.value == "faculty"))
    faculty_role = role_res.scalar_one()

    other_dept_user = User(
        name="ECE Faculty",
        email="faculty.ece@nitt.edu",
        hashed_password="password",
        designation="Assistant Professor",
        gender="male",
        role_id=faculty_role.id,
        department_id=ece_dept.id,
        is_active=True,
        is_approved=True,
    )
    db_session.add(other_dept_user)
    await db_session.flush()

    # 1. Non-HOD trying to nominate experts should raise 403 HTTP Exception
    with pytest.raises(HTTPException) as exc_info:
        await update_department_committee({"expert1_id": faculty.id, "expert2_id": faculty1.id}, db_session, user=faculty)
    assert exc_info.value.status_code == 403

    # 2. Expert 1 and Expert 2 must be different
    with pytest.raises(HTTPException) as exc_info:
        await update_department_committee({"expert1_id": faculty.id, "expert2_id": faculty.id}, db_session, user=hod)
    assert exc_info.value.status_code == 400
    assert "different faculty members" in exc_info.value.detail

    # 3. Nominated experts must belong to the HOD's department
    with pytest.raises(HTTPException) as exc_info:
        await update_department_committee({"expert1_id": other_dept_user.id, "expert2_id": faculty1.id}, db_session, user=hod)
    assert exc_info.value.status_code == 400
    assert "Expert 1 must be a faculty member in your department" in exc_info.value.detail

    # 4. Successful nomination
    res = await update_department_committee({"expert1_id": faculty.id, "expert2_id": faculty1.id}, db_session, user=hod)
    assert res["message"] == "Department committee experts updated successfully"
    
    # Reload and assert
    dept_res = await db_session.execute(select(Department).where(Department.id == hod.department_id))
    dept = dept_res.scalar_one()
    assert dept.expert1_id == faculty.id
    assert dept.expert2_id == faculty1.id


@pytest.mark.asyncio
async def test_director_nominate_faculty_validation(db_session):
    """Test Director nominating faculty members for department committees."""
    db_session.commit = db_session.flush
    # Load Director
    director_res = await db_session.execute(select(User).where(User.email == "director@nitt.edu"))
    director = director_res.scalar_one()

    # Load faculty
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()

    # Load CSE Department
    cse_dept_res = await db_session.execute(select(Department).where(Department.short_code == "CSE"))
    cse_dept = cse_dept_res.scalar_one()

    # 1. Non-Director/Admin trying to nominate should raise 403 HTTP Exception
    with pytest.raises(HTTPException) as exc_info:
        await director_update_committee({"department_id": cse_dept.id, "director_faculty_id": faculty.id}, db_session, user=faculty)
    assert exc_info.value.status_code == 403

    # 2. Successful nomination by Director
    res = await director_update_committee({"department_id": cse_dept.id, "director_faculty_id": faculty.id}, db_session, user=director)
    assert res["message"] == "Director nominee updated successfully"

    # Reload and assert
    await db_session.refresh(cse_dept)
    assert cse_dept.director_faculty_id == faculty.id


@pytest.mark.asyncio
async def test_tender_routing_operators_evaluation(db_session):
    """Test that tender routing is correctly evaluated for all dynamic operators comparison."""
    flow_service = FlowEngineService(db_session)
    
    # Load faculty
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()

    # Fetch Phase TD (Tendering)
    phase_td_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Tendering"))
    phase_td = phase_td_res.scalar_one()

    # Create a draft PR
    pr = PurchaseRequest(
        amount=250000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr)
    await db_session.flush()

    # Create dummy commercial evaluations (say 3 vendors)
    for i in range(3):
        ce = CommercialEvaluation(
            purchase_request_id=pr.id,
            vendor_name=f"Vendor {i}",
            is_qualified=True,
        )
        db_session.add(ce)
    await db_session.flush()

    # We will query the workflow step 6 (the Director step in Tendering phase)
    # and update its tender_vendors_threshold and tender_vendors_comparison, then test routing.
    step_res = await db_session.execute(
        select(WorkFlowHierarchy).where(
            and_(
                WorkFlowHierarchy.phase_id == phase_td.id,
                WorkFlowHierarchy.step_order == 6,
                WorkFlowHierarchy.category_id == pr.category_id,
                WorkFlowHierarchy.procurement_id == pr.procurement_id,
                WorkFlowHierarchy.purchase_type == pr.purchase_type,
            )
        )
    )
    step = step_res.scalar_one()
    step.tender_vendors_threshold = 3
    step.condition_field = None

    # Operator 1: "<" (Run if count < 3. Here count=3, so 3 < 3 is False, meaning skip -> returns None)
    step.tender_vendors_comparison = "<"
    await db_session.flush()
    next_step = await flow_service._get_next_step_in_phase(pr, phase_td, current_step=5)
    assert next_step is None

    # Operator 2: "<=" (Run if count <= 3. Here count=3, so 3 <= 3 is True, meaning run -> returns step order 6)
    step.tender_vendors_comparison = "<="
    await db_session.flush()
    next_step = await flow_service._get_next_step_in_phase(pr, phase_td, current_step=5)
    assert next_step == 6

    # Operator 3: ">" (Run if count > 3. Here count=3, so 3 > 3 is False, meaning skip -> returns None)
    step.tender_vendors_comparison = ">"
    await db_session.flush()
    next_step = await flow_service._get_next_step_in_phase(pr, phase_td, current_step=5)
    assert next_step is None

    # Operator 4: ">=" (Run if count >= 3. Here count=3, so 3 >= 3 is True, meaning run -> returns 6)
    step.tender_vendors_comparison = ">="
    await db_session.flush()
    next_step = await flow_service._get_next_step_in_phase(pr, phase_td, current_step=5)
    assert next_step == 6

    # Operator 5: "==" (Run if count == 3. Here count=3, so 3 == 3 is True, meaning run -> returns 6)
    step.tender_vendors_comparison = "=="
    await db_session.flush()
    next_step = await flow_service._get_next_step_in_phase(pr, phase_td, current_step=5)
    assert next_step == 6

    # Operator 6: "!=" (Run if count != 3. Here count=3, so 3 != 3 is False, meaning skip -> returns None)
    step.tender_vendors_comparison = "!="
    await db_session.flush()
    next_step = await flow_service._get_next_step_in_phase(pr, phase_td, current_step=5)
    assert next_step is None


@pytest.mark.asyncio
async def test_dynamic_routing_skip_condition(db_session):
    """Test that skip conditions evaluate properly at runtime in flow engine."""
    db_session.commit = db_session.flush
    flow_service = FlowEngineService(db_session)
    
    # Load faculty
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()

    # Fetch Phase TD (Tendering)
    phase_td_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Tendering"))
    phase_td = phase_td_res.scalar_one()

    # 1. Create a PR with low amount (50,000)
    pr_low = PurchaseRequest(
        amount=50000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr_low)
    await db_session.flush()

    # Query step 6 in tendering phase
    step_res = await db_session.execute(
        select(WorkFlowHierarchy).where(
            and_(
                WorkFlowHierarchy.phase_id == phase_td.id,
                WorkFlowHierarchy.step_order == 6,
                WorkFlowHierarchy.category_id == pr_low.category_id,
                WorkFlowHierarchy.procurement_id == pr_low.procurement_id,
                WorkFlowHierarchy.purchase_type == pr_low.purchase_type,
            )
        )
    )
    step = step_res.scalar_one()
    
    # Set skip condition
    step.skip_condition = "pr.amount < 100000"
    await db_session.flush()

    # Delete any steps after step 6 in this phase/category/procurement for this test,
    # so that when step 6 is skipped, it correctly returns None.
    from sqlalchemy import delete
    await db_session.execute(
        delete(WorkFlowHierarchy).where(
            and_(
                WorkFlowHierarchy.phase_id == phase_td.id,
                WorkFlowHierarchy.step_order > 6,
                WorkFlowHierarchy.category_id == pr_low.category_id,
                WorkFlowHierarchy.procurement_id == pr_low.procurement_id,
                WorkFlowHierarchy.purchase_type == pr_low.purchase_type,
            )
        )
    )
    await db_session.flush()

    # For amount=50,000 (which is < 100,000), it evaluates to True (should skip -> returns None)
    next_step = await flow_service._get_next_step_in_phase(pr_low, phase_td, current_step=5)
    assert next_step is None

    # 2. Create a PR with high amount (150,000)
    pr_high = PurchaseRequest(
        amount=150000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr_high)
    await db_session.flush()

    # For amount=150,000, skip_condition evaluates to False (should NOT skip -> returns 6)
    next_step = await flow_service._get_next_step_in_phase(pr_high, phase_td, current_step=5)
    assert next_step == 6
