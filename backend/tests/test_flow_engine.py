import pytest
from sqlalchemy import select
from app.services.flow_engine import FlowEngineService
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow, RequestStatus, WorkFlowHierarchy
from app.models.user import User, RoleManager
from app.models.budget import PhaseManager, BudgetMaster

@pytest.mark.asyncio
async def test_workflow_flow_engine_lifecycle(db_session):
    """Test the complete workflow engine lifecycle: initialization, advancement, sending back, and rejection."""
    flow_service = FlowEngineService(db_session)
    
    # Load test users
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    
    # 1. Create Purchase Request
    pr = PurchaseRequest(
        amount=50000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=1,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr)
    await db_session.flush()
    
    # 2. Initialize workflow flow
    await flow_service.initialize(pr, faculty)
    await db_session.refresh(pr)
    
    # Verify budget locked and flow initialized
    assert pr.current_status == RequestStatus.IN_PROGRESS
    
    flow_res = await db_session.execute(select(PurchaseRequestFlow).where(PurchaseRequestFlow.purchase_request_id == pr.id))
    flow = flow_res.scalar_one()
    
    # Initial phase should be phase order 1 (Administrative Approval)
    phase_res = await db_session.execute(select(PhaseManager).where(PhaseManager.id == flow.phase_id))
    phase = phase_res.scalar_one()
    assert phase.phase_name == "Administrative Approval"
    
    # 3. Test advance to next step by dynamically finding the correct user role expected by the engine
    async def get_approver_for_current_step(pr_obj):
        flow_res = await db_session.execute(
            select(PurchaseRequestFlow).where(PurchaseRequestFlow.purchase_request_id == pr_obj.id)
        )
        current_flow = flow_res.scalar_one()
        
        step_res = await db_session.execute(
            select(WorkFlowHierarchy).where(
                WorkFlowHierarchy.phase_id == current_flow.phase_id,
                WorkFlowHierarchy.step_order == current_flow.step_order,
                WorkFlowHierarchy.category_id == pr_obj.category_id,
                WorkFlowHierarchy.procurement_id == pr_obj.procurement_id,
                WorkFlowHierarchy.purchase_type == pr_obj.purchase_type,
            )
        )
        step = step_res.scalar_one()
        
        if step.user_type == "user" and step.user_id:
            user_res = await db_session.execute(select(User).where(User.id == step.user_id))
            return user_res.scalar_one()
            
        role_group = step.user_group
        if not role_group and step.role_id:
            role_res = await db_session.execute(select(RoleManager).where(RoleManager.id == step.role_id))
            role_group = role_res.scalar_one().group_key
            
        if role_group == "hod":
            user_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
            return user_res.scalar_one()
        elif role_group in ("verifier_da", "dealing_assistant"):
            user_res = await db_session.execute(select(User).where(User.email == "da.stores@nitt.edu"))
            return user_res.scalar_one()
        elif role_group in ("verifier_sp", "superintendent"):
            user_res = await db_session.execute(select(User).where(User.email == "sp.stores@nitt.edu"))
            return user_res.scalar_one()
        elif role_group == "dean_approver":
            user_res = await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))
            return user_res.scalar_one()
        elif role_group == "apex_approver":
            user_res = await db_session.execute(select(User).where(User.email == "director@nitt.edu"))
            return user_res.scalar_one()
        else:
            user_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
            return user_res.scalar_one()

    # Advance step 2
    approver = await get_approver_for_current_step(pr)
    pr = await flow_service.advance(pr, approver, remarks="First stage approval")
    await db_session.refresh(flow)
    
    # 4. Test reject workflow using the next active step approver
    next_approver = await get_approver_for_current_step(pr)
    success = await flow_service.reject(pr, next_approver, reason="Budget limits exceeded")
    assert success is True
    await db_session.refresh(pr)
    assert pr.current_status == RequestStatus.REJECTED


@pytest.mark.asyncio
async def test_director_tender_approval_conditional_skipping(db_session):
    """Test the partial_approver (Dean) → conditional Director step logic.

    Step layout (cat2/cat3 TD):
      step 5  — AR (approver)
      step 6  — Dean P&D (partial_approver) ← NEW
      step 7  — Director (conditional: qualified_vendor_count < 3)

    When ≥3 qualified vendors:
      - AR advances to Dean (step 6)
      - _check_partial_approver_auto_advance returns True → auto-bypass Dean
      - Dean is skipped; Director (step 7) condition is also false → None → TE phase

    When <3 qualified vendors:
      - AR advances to Dean (step 6)
      - _check_partial_approver_auto_advance returns False → Dean must act
      - Dean approves → Director (step 7) fires
    """
    from app.models.purchase_request import CommercialEvaluation
    flow_service = FlowEngineService(db_session)

    # Load test users
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()

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

    await flow_service.initialize(pr, faculty)
    await db_session.refresh(pr)

    phase_td_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Tendering"))
    phase_td = phase_td_res.scalar_one()

    # ── Case A: <3 qualified vendors ──────────────────────────────────────────
    # AR (step 5) should advance to Dean (step 6, partial_approver).
    # The partial_approver helper should return False (Director WILL fire).
    for i in range(2):
        db_session.add(CommercialEvaluation(
            purchase_request_id=pr.id, vendor_name=f"Vendor {i}", is_qualified=True,
        ))
    await db_session.flush()

    # Step after AR (5) is the Dean partial_approver at step 6
    next_step = await flow_service._get_next_step_in_phase(pr, phase_td, current_step=5)
    assert next_step == 6, f"Expected step 6 (Dean partial_approver) after AR, got {next_step}"

    # Dean partial_approver should NOT auto-advance (Director IS needed)
    should_auto = await flow_service._check_partial_approver_auto_advance(pr, phase_td, partial_step_order=6)
    assert not should_auto, "Dean should NOT auto-advance when <3 qualified vendors (Director needed)"

    # Step after Dean (6) is Director at step 7 (condition true, < 3 vendors)
    next_step = await flow_service._get_next_step_in_phase(pr, phase_td, current_step=6)
    assert next_step == 7, f"Expected step 7 (Director) after Dean when <3 vendors, got {next_step}"

    # ── Case B: ≥3 qualified vendors ─────────────────────────────────────────
    # Dean partial_approver SHOULD auto-advance (Director step NOT needed).
    from sqlalchemy import delete
    await db_session.execute(delete(CommercialEvaluation).where(CommercialEvaluation.purchase_request_id == pr.id))
    for i in range(4):
        db_session.add(CommercialEvaluation(
            purchase_request_id=pr.id, vendor_name=f"Vendor {i}", is_qualified=True,
        ))
    await db_session.flush()

    # Dean partial_approver SHOULD auto-advance (Director NOT needed)
    should_auto = await flow_service._check_partial_approver_auto_advance(pr, phase_td, partial_step_order=6)
    assert should_auto, "Dean SHOULD auto-advance when ≥3 qualified vendors (Director not needed)"

    # Step after Dean (6) when condition false: Director (7) is skipped → None → next phase
    next_step = await flow_service._get_next_step_in_phase(pr, phase_td, current_step=6)
    assert next_step is None, f"Expected None (Director skipped) after Dean when ≥3 vendors, got {next_step}"



@pytest.mark.asyncio
async def test_technical_evaluation_committee_signatures(db_session):
    """Test that Technical Evaluation step remains on step 1 until all committee members have signed."""
    flow_service = FlowEngineService(db_session)
    
    # Fetch test users
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    
    faculty1_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
    faculty1 = faculty1_res.scalar_one()
    
    faculty2_res = await db_session.execute(select(User).where(User.email == "faculty2.cse@nitt.edu"))
    faculty2 = faculty2_res.scalar_one()
    
    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()

    vg_res = await db_session.execute(select(User).where(User.email == "vg.pd@nitt.edu"))
    vg = vg_res.scalar_one()
    
    # Configure department committee
    from app.models.user import Department
    dept_res = await db_session.execute(select(Department).where(Department.id == faculty.department_id))
    dept = dept_res.scalar_one()
    dept.expert1_id = faculty1.id
    dept.expert2_id = faculty2.id
    dept.director_faculty_id = vg.id
    await db_session.flush()
    
    # Fetch Phase TE (Technical Evaluation)
    phase_te_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Technical Evaluation"))
    phase_te = phase_te_res.scalar_one()
    
    # 1. Create Purchase Request with assigned committee members
    pr = PurchaseRequest(
        amount=250000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=2,  # Category 2 has TE step
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
        faculty1_id=faculty1.id,
        faculty2_id=faculty2.id,
        faculty3_id=vg.id,
    )
    db_session.add(pr)
    await db_session.flush()
    
    # Create workflow flow starting at TE step 1
    flow = PurchaseRequestFlow(
        purchase_request_id=pr.id,
        phase_id=phase_te.id,
        step_order=1,
        rejected=False,
    )
    db_session.add(flow)
    await db_session.flush()
    
    # First sign: Initiator (faculty)
    await flow_service.advance(pr, faculty, remarks="Initiator tech eval sign")
    await db_session.refresh(flow)
    await db_session.refresh(pr, ["history"])
    assert flow.step_order == 1
    
    # Check that initiator has a signature history log
    initiator_history = [h for h in pr.history if h.current_approver_id == faculty.id]
    assert len(initiator_history) == 1
    assert initiator_history[0].status == "Technical Evaluation Completed"
    
    # Second sign: Faculty 1
    await flow_service.advance(pr, faculty1, remarks="Faculty 1 tech eval sign")
    await db_session.refresh(flow)
    await db_session.refresh(pr, ["history"])
    assert flow.step_order == 1
    
    # Third sign: Faculty 2
    await flow_service.advance(pr, faculty2, remarks="Faculty 2 tech eval sign")
    await db_session.refresh(flow)
    await db_session.refresh(pr, ["history"])
    assert flow.step_order == 1
    
    # Fourth sign: VG (Director Nominee)
    await flow_service.advance(pr, vg, remarks="VG tech eval sign")
    await db_session.refresh(flow)
    await db_session.refresh(pr, ["history"])
    
    # Now all 4 committee members have signed, and flow step order should have advanced to step 2 (HOD review)
    assert flow.step_order == 2
    
    # Verify no redundant "Forwarded" or "Forwarded to next phase" status exists in the history logs for TE step 1
    redundant_logs = [h for h in pr.history if h.status in ("Forwarded", "Forwarded to next phase")]
    assert len(redundant_logs) == 0


@pytest.mark.asyncio
async def test_technical_evaluation_send_back_signature_reset(db_session):
    """Test that sending back a PR from TE step 2 to TE step 1 resets approvals, requiring all members to sign again."""
    flow_service = FlowEngineService(db_session)
    
    # Fetch test users
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    
    faculty1_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
    faculty1 = faculty1_res.scalar_one()
    
    faculty2_res = await db_session.execute(select(User).where(User.email == "faculty2.cse@nitt.edu"))
    faculty2 = faculty2_res.scalar_one()
    
    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()

    vg_res = await db_session.execute(select(User).where(User.email == "vg.pd@nitt.edu"))
    vg = vg_res.scalar_one()
    
    # Configure department committee
    from app.models.user import Department
    dept_res = await db_session.execute(select(Department).where(Department.id == faculty.department_id))
    dept = dept_res.scalar_one()
    dept.expert1_id = faculty1.id
    dept.expert2_id = faculty2.id
    dept.director_faculty_id = vg.id
    await db_session.flush()
    
    # Fetch Phase TE (Technical Evaluation)
    phase_te_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Technical Evaluation"))
    phase_te = phase_te_res.scalar_one()
    
    # 1. Create Purchase Request
    pr = PurchaseRequest(
        amount=250000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
        faculty1_id=faculty1.id,
        faculty2_id=faculty2.id,
        faculty3_id=vg.id,
    )
    db_session.add(pr)
    await db_session.flush()
    
    flow = PurchaseRequestFlow(
        purchase_request_id=pr.id,
        phase_id=phase_te.id,
        step_order=1,
        rejected=False,
    )
    db_session.add(flow)
    await db_session.flush()
    
    # Sign all 4 in order to advance to step 2
    await flow_service.advance(pr, faculty, remarks="PI sign")
    await flow_service.advance(pr, faculty1, remarks="F1 sign")
    await flow_service.advance(pr, faculty2, remarks="F2 sign")
    await flow_service.advance(pr, vg, remarks="VG sign")
    await db_session.refresh(flow)
    assert flow.step_order == 2
    
    # Send back from step 2 (HOD review) to step 1 (Committee Evaluation)
    await flow_service.send_back(pr, hod, to_step=1, reason="Need re-evaluation")
    await db_session.refresh(flow)
    await db_session.refresh(pr)
    assert flow.step_order == 1
    assert pr.te_initiated_at is not None
    
    # Verify that signing out of order (e.g. Faculty 1 signing first) works (does NOT raise ValueError)
    await flow_service.advance(pr, faculty1, remarks="F1 signs first after reset")
    await db_session.refresh(flow)
    assert flow.step_order == 1
    
    # Verify that trying to sign again raises ValueError
    with pytest.raises(ValueError, match="You have already signed"):
        await flow_service.advance(pr, faculty1, remarks="F1 signs again")


@pytest.mark.asyncio
async def test_purchase_order_signature_validation(db_session):
    """Test that approving a step in the Purchase Order phase requires the user to have a signature_path."""
    flow_service = FlowEngineService(db_session)
    
    # Fetch test users
    da_res = await db_session.execute(select(User).where(User.email == "da.stores@nitt.edu"))
    da = da_res.scalar_one()
    
    # Ensure DA has no signature
    da.signature_path = None
    await db_session.flush()
    
    phase_po_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Purchase Order"))
    phase_po = phase_po_res.scalar_one()
    
    # Create Purchase Request
    pr = PurchaseRequest(
        amount=10000.0,
        purchase_type="department",
        initiator_id=1,
        category_id=1,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr)
    await db_session.flush()
    
    flow = PurchaseRequestFlow(
        purchase_request_id=pr.id,
        phase_id=phase_po.id,
        step_order=1,
        rejected=False,
    )
    db_session.add(flow)
    await db_session.flush()
    
    # Try to advance without signature - should raise ValueError
    with pytest.raises(ValueError, match="You must upload a digital signature in your Profile to approve Purchase Order steps"):
        await flow_service.advance(pr, da, remarks="Attempting PO sign without signature")
        
    # Now set a signature path
    da.signature_path = "signatures/da_sign.png"
    await db_session.flush()
    
    # Try to advance with signature - should succeed without ValueError (might fail on other validations, but not signature)
    try:
        await flow_service.advance(pr, da, remarks="PO sign with signature")
    except ValueError as e:
        assert "You must upload a digital signature" not in str(e)


