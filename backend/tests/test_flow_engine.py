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
