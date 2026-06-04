import pytest
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import select
from app.models.purchase_request import (
    PurchaseRequest, PurchaseRequestItem, PurchaseRequestFlow,
    RequestStatus, POCancellation, TenderCancellation
)
from app.models.budget import BudgetMaster
from app.models.user import User, Department
from app.routers.purchase_requests import cancel_po, cancel_tender, reinitiate_pr
from app.services.budget_service import BudgetService

@pytest.mark.asyncio
async def test_cancel_tender_success(db_session):
    """Test successful cancellation of a tender process and rollback of locked budget."""
    db_session.commit = db_session.flush

    # Fetch CSE Faculty and HOD
    fac_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = fac_res.scalar_one()
    
    # Fetch Budget Master
    bm_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget_master = bm_res.scalar_one()
    initial_locked = budget_master.locked_amount

    # Create active PR
    pr = PurchaseRequest(
        amount=100000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=1,
        financial_year_id=2,
        procurement_id=1,
        current_status=RequestStatus.IN_PROGRESS,
    )
    db_session.add(pr)
    await db_session.flush()

    item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Test Equipment",
        quantity=1,
        estimated_total=100000.0,
        budget_file_id=budget_master.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    db_session.add(item)
    
    flow = PurchaseRequestFlow(
        purchase_request_id=pr.id,
        phase_id=2, # Tendering phase
        step_order=2,
    )
    db_session.add(flow)
    await db_session.flush()

    # Lock budget for PR
    budget_svc = BudgetService(db_session)
    await budget_svc.lock_amount(pr)
    await db_session.refresh(budget_master)
    assert budget_master.locked_amount == initial_locked + 100000.0

    # Cancel the tender
    body = {"reason": "Tender cancelled due to specs update", "reinitiation_method": "gem"}
    res = await cancel_tender(pr.id, body, db_session, user=faculty)
    assert "released successfully" in res["message"]

    # Verify PR status updated to cancelled
    await db_session.refresh(pr)
    assert pr.current_status == RequestStatus.CANCELLED

    # Verify active flow deleted
    flow_check = await db_session.execute(
        select(PurchaseRequestFlow).where(PurchaseRequestFlow.purchase_request_id == pr.id)
    )
    assert flow_check.scalar_one_or_none() is None

    # Verify TenderCancellation log created
    cancel_check = await db_session.execute(
        select(TenderCancellation).where(TenderCancellation.purchase_request_id == pr.id)
    )
    cancellation = cancel_check.scalar_one()
    assert cancellation.reason == "Tender cancelled due to specs update"
    assert cancellation.reinitiation_method == "gem"
    assert cancellation.cancelled_by_id == faculty.id

    # Verify budget locked_amount is rolled back/released
    await db_session.refresh(budget_master)
    assert budget_master.locked_amount == initial_locked


@pytest.mark.asyncio
async def test_cancel_po_success(db_session):
    """Test successful cancellation of a PO and rollback of deducted budget."""
    db_session.commit = db_session.flush

    fac_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = fac_res.scalar_one()
    
    bm_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget_master = bm_res.scalar_one()
    initial_deducted = budget_master.deducted_amount

    # Create PO-issued PR
    pr = PurchaseRequest(
        amount=50000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=1,
        financial_year_id=2,
        procurement_id=1,
        current_status=RequestStatus.PO_ISSUED,
    )
    db_session.add(pr)
    await db_session.flush()

    item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Test Consumables",
        quantity=1,
        estimated_total=50000.0,
        budget_file_id=budget_master.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    db_session.add(item)
    await db_session.flush()

    # Budget locked then deducted
    budget_svc = BudgetService(db_session)
    await budget_svc.lock_amount(pr)
    await budget_svc.deduct_amount(pr)
    await db_session.refresh(budget_master)
    assert budget_master.deducted_amount == initial_deducted + 50000.0

    # Cancel PO
    body = {"reason": "Vendor failed to deliver", "reinitiation_method": "limited", "reallocated_amount": 0.0}
    res = await cancel_po(pr.id, body, db_session, user=faculty)
    assert "refunded successfully" in res["message"]

    # Verify PR status updated to cancelled
    await db_session.refresh(pr)
    assert pr.current_status == RequestStatus.CANCELLED

    # Verify POCancellation log created
    cancel_check = await db_session.execute(
        select(POCancellation).where(POCancellation.purchase_request_id == pr.id)
    )
    cancellation = cancel_check.scalar_one()
    assert cancellation.reason == "Vendor failed to deliver"
    assert cancellation.reinitiation_method == "limited"

    # Verify budget deducted_amount is rolled back
    await db_session.refresh(budget_master)
    assert budget_master.deducted_amount == initial_deducted


@pytest.mark.asyncio
async def test_reinitiate_cancelled_pr(db_session):
    """Test successful re-initiation of a cancelled PR: copies items, metadata, links parent_pr_id and locks budget."""
    db_session.commit = db_session.flush

    fac_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = fac_res.scalar_one()
    
    bm_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget_master = bm_res.scalar_one()
    initial_locked = budget_master.locked_amount

    # Create cancelled PR
    pr = PurchaseRequest(
        amount=120000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=2,
        procurement_id=1,
        current_status=RequestStatus.CANCELLED,
        basis_of_estimate_details="Direct OEM Quotation",
        delivery_mode="speed post",
        delivery_location="CSE Department Store",
        form_data={"invited_vendors": "OEM, VendorA"},
    )
    db_session.add(pr)
    await db_session.flush()

    item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Cloned Item",
        quantity=1,
        estimated_total=120000.0,
        budget_file_id=budget_master.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    db_session.add(item)
    await db_session.flush()

    # Mock background tasks
    class MockBackgroundTasks:
        def add_task(self, func, *args, **kwargs):
            pass
    bg_tasks = MockBackgroundTasks()

    # Re-initiate
    res = await reinitiate_pr(pr.id, bg_tasks, db_session, user=faculty)
    assert "re-initiated successfully" in res["message"]
    new_pr_id = res["id"]

    # Verify new PR fields cloned correctly
    new_pr_res = await db_session.execute(select(PurchaseRequest).where(PurchaseRequest.id == new_pr_id))
    new_pr = new_pr_res.scalar_one()
    
    assert new_pr.parent_pr_id == pr.id
    assert new_pr.current_status == RequestStatus.IN_PROGRESS
    assert new_pr.amount == 120000.0
    assert new_pr.form_data == {"invited_vendors": "OEM, VendorA"}
    assert new_pr.basis_of_estimate_details == "Direct OEM Quotation"
    # Query cloned items from DB to avoid lazy loading
    items_res = await db_session.execute(
        select(PurchaseRequestItem).where(PurchaseRequestItem.purchase_request_id == new_pr_id)
    )
    cloned_items = items_res.scalars().all()
    assert len(cloned_items) == 1
    assert cloned_items[0].item_description == "Cloned Item"
    assert cloned_items[0].estimated_total == 120000.0

    # Verify budget was locked for the new PR
    await db_session.refresh(budget_master)
    assert budget_master.locked_amount == initial_locked + 120000.0


@pytest.mark.asyncio
async def test_cancellation_permissions(db_session):
    """Test permission validation on cancellation: only initiator, HOD, or admin can cancel."""
    db_session.commit = db_session.flush

    # Fetch CSE Faculty (initiator)
    fac_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty_cse = fac_res.scalar_one()

    # Fetch a different department (e.g. ECE) to avoid FK constraint violation
    ece_dept_res = await db_session.execute(select(Department).where(Department.short_code == "ECE"))
    ece_dept = ece_dept_res.scalar_one()

    # Create dummy stranger user
    other_user = User(
        name="ECE Faculty",
        email="stranger@nitt.edu",
        hashed_password="password",
        designation="Assistant Professor",
        gender="male",
        role_id=faculty_cse.role_id,
        department_id=ece_dept.id,  # different department
        is_active=True,
        is_approved=True,
    )
    db_session.add(other_user)
    await db_session.flush()

    # Create PR
    pr = PurchaseRequest(
        amount=10000.0,
        purchase_type="department",
        initiator_id=faculty_cse.id,
        category_id=1,
        financial_year_id=2,
        procurement_id=1,
        current_status=RequestStatus.PO_ISSUED,
    )
    db_session.add(pr)
    await db_session.flush()

    # Attempting to cancel PO as stranger should raise 403 Forbidden
    body = {"reason": "Hacking attempt", "reinitiation_method": "none"}
    with pytest.raises(HTTPException) as exc_info:
        await cancel_po(pr.id, body, db_session, user=other_user)
    assert exc_info.value.status_code == 403
    assert "Access denied" in exc_info.value.detail
