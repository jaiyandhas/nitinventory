import pytest
from datetime import datetime, date
from fastapi import HTTPException
from sqlalchemy import select
from app.models.purchase_request import (
    PurchaseRequest, PurchaseRequestItem, PurchaseRequestFlow,
    RequestStatus, BillPassing, CommercialEvaluation, FinancialEvaluation, WorkFlowHierarchy
)
from app.models.inventory import Delivery, DeliveryStatus
from app.models.user import User
from app.models.budget import PhaseManager
from app.routers.purchase_requests import add_tender_details, add_bill_passing
from app.services.flow_engine import FlowEngineService

class MockRequest:
    def __init__(self, json_data=None, headers=None):
        self._json_data = json_data or {}
        self.headers = headers or {}

    async def json(self):
        return self._json_data

    async def form(self):
        return self._json_data


@pytest.mark.asyncio
async def test_lpc_fields_persistency(db_session):
    """Test that LPC committee details are persisted correctly during tendering details registration."""
    db_session.commit = db_session.flush

    # Fetch DA User and Faculty
    da_res = await db_session.execute(select(User).where(User.email == "da.stores@nitt.edu"))
    da_user = da_res.scalar_one()

    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()

    # Create active PR
    pr = PurchaseRequest(
        amount=100000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=2,
        procurement_id=1,
        current_status=RequestStatus.IN_PROGRESS,
    )
    db_session.add(pr)
    await db_session.flush()

    # Add workflow flow (Tendering Phase, step order 2 is DA)
    flow = PurchaseRequestFlow(
        purchase_request_id=pr.id,
        phase_id=2, # Tendering phase
        step_order=2,
    )
    db_session.add(flow)
    await db_session.flush()

    from app.models.purchase_request import PurchaseRequestAssignment
    assignment = PurchaseRequestAssignment(
        purchase_request_id=pr.id,
        assigned_by_id=faculty.id,
        assigned_da_id=da_user.id,
        status="active"
    )
    db_session.add(assignment)
    await db_session.flush()

    payload = {
        "tender_reference_number": "NITT/LPC/2026",
        "date_of_tender": "2026-06-02",
        "lpc_remarks": "Approved by LPC",
        "lpc_committee_members": "Dr. A, Dr. B",
        "lpc_minutes_reference": "MIN-123",
        "vendors": [
            {"name": "Vendor A", "email": "a@vendor.com", "quoted_amount": 10.0, "is_qualified": True, "remarks": "ok"}
        ]
    }

    mock_req = MockRequest(payload)
    await add_tender_details(pr.id, mock_req, db_session, user=da_user)

    # Reload PR and assert LPC fields
    await db_session.refresh(pr)
    assert pr.lpc_remarks == "Approved by LPC"
    assert pr.lpc_committee_members == "Dr. A, Dr. B"
    assert pr.lpc_minutes_reference == "MIN-123"


@pytest.mark.asyncio
async def test_single_bid_director_routing(db_session):
    """Test that single-bid status routes to Director or skips depending on single_bid_justification."""
    flow_service = FlowEngineService(db_session)

    # Fetch Phase FS (Financial Sanction)
    phase_fs_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Financial Sanction"))
    phase_fs = phase_fs_res.scalar_one()

    # Fetch faculty
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()

    # Create active PR
    pr = PurchaseRequest(
        amount=100000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=2,
        procurement_id=1,
        current_status=RequestStatus.IN_PROGRESS,
    )
    db_session.add(pr)
    await db_session.flush()

    # Case A: single_bid_justification is None (or empty) -> skip Director step (7)
    pr.single_bid_justification = None
    await db_session.flush()

    next_step = await flow_service._get_next_step_in_phase(pr, phase_fs, current_step=6)
    assert next_step is None  # Should skip step 7 and return None (end of phase)

    # Case B: single_bid_justification is set -> do not skip Director step (7)
    pr.single_bid_justification = "Only one qualified bidder is present"
    await db_session.flush()

    next_step = await flow_service._get_next_step_in_phase(pr, phase_fs, current_step=6)
    assert next_step == 7  # Should not skip step 7


@pytest.mark.asyncio
async def test_bill_passing_lifecycle(db_session):
    """Test passing of bills, verification of delivery checks, and completion of the PR lifecycle."""
    db_session.commit = db_session.flush

    # Fetch DA User and Faculty
    da_res = await db_session.execute(select(User).where(User.email == "da.stores@nitt.edu"))
    da_user = da_res.scalar_one()

    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()

    # Create active PR with status PO_ISSUED
    pr = PurchaseRequest(
        amount=100000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=2,
        procurement_id=1,
        current_status=RequestStatus.PO_ISSUED,
    )
    db_session.add(pr)
    await db_session.flush()

    from app.models.purchase_request import PurchaseRequestAssignment
    assignment = PurchaseRequestAssignment(
        purchase_request_id=pr.id,
        assigned_by_id=faculty.id,
        assigned_da_id=da_user.id,
        status="active"
    )
    db_session.add(assignment)
    await db_session.flush()

    # 1. Calling without verified delivery should fail
    body = {
        "invoice_number": "INV-1001",
        "invoice_date": "2026-06-02",
        "challan_number": "CH-2002",
        "challan_date": "2026-06-02",
        "bill_amount": 100000.0,
        "gst_amount": 18000.0,
        "payment_terms": "Immediate",
        "remarks": "Bill verified and passed"
    }

    with pytest.raises(HTTPException) as exc_info:
        await add_bill_passing(pr.id, body, db_session, user=da_user)
    assert exc_info.value.status_code == 400
    assert "Delivery must be verified first" in exc_info.value.detail

    # 2. Add verified delivery and try again
    delivery = Delivery(
        po_id=pr.id,
        invoice_number="INV-1001",
        status=DeliveryStatus.VERIFIED,
        department_id=faculty.department_id,
    )
    db_session.add(delivery)
    await db_session.flush()

    # 3. Call as a faculty (should fail with 403)
    with pytest.raises(HTTPException) as exc_info:
        await add_bill_passing(pr.id, body, db_session, user=faculty)
    assert exc_info.value.status_code == 403
    assert "Only Dealing Assistants and Admins" in exc_info.value.detail

    # 4. Successful bill passing by DA user
    res = await add_bill_passing(pr.id, body, db_session, user=da_user)
    assert "Bill passed successfully" in res["message"]

    # Verify PR status updated to COMPLETED
    await db_session.refresh(pr)
    assert pr.current_status == RequestStatus.COMPLETED

    # Verify BillPassing record created
    bp_res = await db_session.execute(select(BillPassing).where(BillPassing.purchase_request_id == pr.id))
    bp = bp_res.scalar_one()
    assert bp.invoice_number == "INV-1001"
    assert bp.bill_amount == 100000.0
    assert bp.passed_by_id == da_user.id
