import pytest
from sqlalchemy import select
from app.services.flow_engine import FlowEngineService
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow, RequestStatus, WorkFlowHierarchy, PurchaseRequestAssignment
from app.models.user import User, RoleManager
from app.models.budget import PhaseManager, BudgetMaster

@pytest.mark.asyncio
async def test_multiple_superintendents_tendering_flow(db_session):
    db_session.commit = db_session.flush

    # 1. Fetch Superintendent role and user A
    sp_role_res = await db_session.execute(select(RoleManager).where(RoleManager.value == "superintendent"))
    sp_role = sp_role_res.scalar_one()

    sp_a_res = await db_session.execute(select(User).where(User.email == "sp.stores@nitt.edu"))
    sp_a = sp_a_res.scalar_one()

    # 2. Create Superintendent B
    sp_b = User(
        name="Mr. B Superintendent",
        email="sp.b@nitt.edu",
        hashed_password="password",
        designation="Superintendent S&P B",
        gender="male",
        role_id=sp_role.id,
        is_active=True,
        is_approved=True,
    )
    db_session.add(sp_b)
    await db_session.flush()

    # 3. Create a Dealing Assistant for assignments
    da_res = await db_session.execute(select(User).where(User.email == "da.stores@nitt.edu"))
    da = da_res.scalar_one()

    # 4. Create a PR at Tendering Step 1
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()

    pr = PurchaseRequest(
        amount=150000.0,
        purchase_type="research",
        initiator_id=faculty.id,
        category_id=2,  # Category 2 has tendering phase
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr)
    await db_session.flush()

    phase_td_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Tendering"))
    phase_td = phase_td_res.scalar_one()

    flow_service = FlowEngineService(db_session)
    
    # Initialize the flow (starts at Administrative Approval)
    await flow_service.initialize(pr, faculty)
    await db_session.refresh(pr)

    # Mock advance through Administrative Approval phase
    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()
    
    # Nominations needed for HOD approval
    pr.faculty1_id = faculty.id
    pr.faculty2_id = hod.id
    db_session.add(pr)
    await db_session.flush()

    pr = await flow_service.advance(pr, hod, remarks="HOD approves")

    dean_res = await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))
    dean = dean_res.scalar_one()
    pr = await flow_service.advance(pr, dean, remarks="Dean approves")

    # Now we should be at Tendering Phase Step 1
    await db_session.refresh(pr, ["flow"])
    assert pr.flow.phase_id == phase_td.id
    assert pr.flow.step_order == 1

    # Verify both Superintendents are allowed to perform action at Step 1
    try:
        await flow_service._validate_role(pr, sp_a, pr.flow)
    except ValueError as e:
        pytest.fail(f"Superintendent A should be authorized at Tendering step 1: {e}")

    try:
        await flow_service._validate_role(pr, sp_b, pr.flow)
    except ValueError as e:
        pytest.fail(f"Superintendent B should be authorized at Tendering step 1: {e}")

    # Verify SP exclusivity list filtering
    from app.routers.purchase_requests import list_prs
    
    # 1. Before assignment, both should see it
    res_a_before = await list_prs(db=db_session, user=sp_a, skip=0, limit=50)
    res_b_before = await list_prs(db=db_session, user=sp_b, skip=0, limit=50)
    assert pr.id in {item["id"] for item in res_a_before["items"]}
    assert pr.id in {item["id"] for item in res_b_before["items"]}

    # 5. Superintendent A assigns DA (claims the PR)
    assignment = PurchaseRequestAssignment(
        purchase_request_id=pr.id,
        assigned_by_id=sp_a.id,
        assigned_da_id=da.id,
        status="pending"
    )
    db_session.add(assignment)
    await db_session.flush()

    # 2. After assignment (claimed by A), SP A should see it, but SP B should NOT see it
    res_a_after = await list_prs(db=db_session, user=sp_a, skip=0, limit=50)
    res_b_after = await list_prs(db=db_session, user=sp_b, skip=0, limit=50)
    assert pr.id in {item["id"] for item in res_a_after["items"]}
    assert pr.id not in {item["id"] for item in res_b_after["items"]}

    pr = await flow_service.advance(pr, sp_a, remarks=f"Assigned to {da.name}")
    await db_session.refresh(pr, ["flow"])
    assert pr.flow.step_order == 2

    # DA registers tender details and advances to step 3
    da.signature_path = "signatures/da.png"
    db_session.add(da)
    await db_session.flush()
    pr = await flow_service.advance(pr, da, remarks="Tender details registered")
    await db_session.refresh(pr, ["flow"])
    assert pr.flow.step_order == 3

    # Now we are at step 3, which expects role "superintendent"
    # Verify Superintendent A (who assigned the DA) is authorized
    try:
        await flow_service._validate_role(pr, sp_a, pr.flow)
    except ValueError as e:
        pytest.fail(f"Superintendent A should be authorized to verify at step 3: {e}")

    # Verify Superintendent B (who did not assign the DA) is DENIED access
    with pytest.raises(ValueError, match="Only the Superintendent who assigned the Dealing Assistant"):
        await flow_service._validate_role(pr, sp_b, pr.flow)

    # 6. Test Send-Back behavior
    await flow_service.send_back(pr, sp_a, to_step=1, reason="Need re-assignment")
    await db_session.refresh(pr, ["flow"])
    assert pr.flow.step_order == 1

    # Verify B is allowed again at step 1
    try:
        await flow_service._validate_role(pr, sp_b, pr.flow)
    except ValueError as e:
        pytest.fail(f"Superintendent B should be authorized to act at Tendering step 1 after send-back: {e}")
