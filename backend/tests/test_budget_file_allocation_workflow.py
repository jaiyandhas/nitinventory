"""
Integration tests for the budget-file-allocation-linked procurement workflow.

Workflow under test:
1. HOD creates a budget file with a TEMP/ file number.
2. Faculty creates a PR linked to that budget file.
3. PR advances through the Administrative Approval phase.
4. On AA completion the PR is paused at `budget_file_allocation` status.
5. Manual advance / reject / send_back are blocked while paused.
6. Auto-resumption: when the budget file's file_no is changed from TEMP → permanent
   via update_budget (admin.py), the PR automatically resumes.
7. Direct allocation: Dean/Admin can call /allocate-budget-file endpoint to do the
   same from the PR detail page.
"""
import pytest
from datetime import datetime
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select

from app.models.purchase_request import (
    PurchaseRequest, PurchaseRequestItem, RequestStatus, PurchaseRequestFlow,
)
from app.models.budget import BudgetMaster, FinancialYear
from app.models.user import User
from app.services.flow_engine import FlowEngineService


# ─── helpers ────────────────────────────────────────────────────────────────

async def _get_user(db, email: str) -> User:
    res = await db.execute(select(User).where(User.email == email))
    return res.scalar_one()


async def _make_temp_budget(db, hod: User) -> BudgetMaster:
    """Create a budget file with a TEMP/ file number owned by the HOD's department."""
    fy_res = await db.execute(select(FinancialYear).where(FinancialYear.is_active == True))
    fy = fy_res.scalar_one()

    bm = BudgetMaster(
        department_id=hod.department_id,
        financial_year_id=fy.id,
        source_of_fund="CAPEX",
        item_name="Test Temporary Budget Item",
        category="computer",
        course_code="N/A",
        unit_cost=100000.0,
        quantity=1,
        total_cost=100000.0,
        file_no="TEMP/F.NO.TEST001/CAPEX/2026-27/CSE",
        remarks="Temporary - awaiting Dean allocation",
        is_revision=False,
    )
    db.add(bm)
    await db.flush()
    return bm


async def _find_pr_in_budget_file_allocation(db) -> PurchaseRequest | None:
    """Return the first PR currently paused at budget_file_allocation, if any."""
    res = await db.execute(
        select(PurchaseRequest).where(
            PurchaseRequest.current_status == RequestStatus.BUDGET_FILE_ALLOCATION
        )
    )
    return res.scalars().first()


async def _make_dummy_pr(db, initiator: User, amount: float = 100000.0) -> PurchaseRequest:
    """Create a dummy purchase request in the database."""
    from app.models.budget import ProcurementManager, PurchaseCategory
    
    proc_res = await db.execute(select(ProcurementManager).limit(1))
    proc = proc_res.scalar_one()
    
    cat_res = await db.execute(select(PurchaseCategory).limit(1))
    cat = cat_res.scalar_one()
    
    fy_res = await db.execute(select(FinancialYear).where(FinancialYear.is_active == True))
    fy = fy_res.scalar_one()

    pr = PurchaseRequest(
        amount=amount,
        purchase_type="department",
        initiator_id=initiator.id,
        category_id=cat.id,
        financial_year_id=fy.id,
        procurement_id=proc.id,
        current_status="draft",
    )
    db.add(pr)
    await db.flush()
    
    # Initialize the flow
    flow_service = FlowEngineService(db)
    await flow_service.initialize(pr, initiator)
    await db.refresh(pr)
    
    return pr


# ─── test: HOD department scoping on budget creation ───────────────────────

@pytest.mark.asyncio
async def test_hod_can_only_create_budget_for_own_department(db_session):
    """Verify that create_budget enforces the HOD's department."""
    from app.routers.admin import create_budget

    db_session.commit = db_session.flush  # use flush inside rollback transaction

    hod = await _get_user(db_session, "hod.cse@nitt.edu")
    fy_res = await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True))
    fy = fy_res.scalar_one()

    # Should succeed for own department
    body_ok = {
        "department_id": hod.department_id,
        "financial_year_id": fy.id,
        "source_of_fund": "CAPEX",
        "category": "computer",
        "item_name": "Test HOD Budget",
        "unit_cost": 10000,
        "quantity": 1,
        "file_no": "TEMP/F.NO.HOD001/CAPEX/2026-27/CSE",
    }
    await db_session.refresh(hod, ["role"])
    result = await create_budget(body_ok, db_session, user=hod)
    assert "id" in result

    # Should raise 403 for a different department
    body_bad = dict(body_ok, department_id=99999, file_no="TEMP/F.NO.HOD002/CAPEX/2026-27/XXX")
    with pytest.raises(HTTPException) as exc_info:
        await create_budget(body_bad, db_session, user=hod)
    assert exc_info.value.status_code == 403
    assert "own department" in exc_info.value.detail


# ─── test: HOD cannot update budgets from another department ────────────────

@pytest.mark.asyncio
async def test_hod_cannot_update_other_department_budget(db_session):
    """HOD update_budget should reject changes to another department's file."""
    from app.routers.admin import update_budget

    db_session.commit = db_session.flush

    hod = await _get_user(db_session, "hod.cse@nitt.edu")
    await db_session.refresh(hod, ["role"])

    # Find a budget file NOT belonging to HOD's department
    res = await db_session.execute(
        select(BudgetMaster).where(BudgetMaster.department_id != hod.department_id).limit(1)
    )
    other_bm = res.scalar_one_or_none()
    if not other_bm:
        pytest.skip("No budget file from another department found in seed data")

    with pytest.raises(HTTPException) as exc_info:
        await update_budget(other_bm.id, {"item_name": "Tampered"}, db_session, user=hod)
    assert exc_info.value.status_code == 403


# ─── test: flow_engine blocks actions in budget_file_allocation status ──────

@pytest.mark.asyncio
async def test_flow_engine_blocks_manual_actions_when_paused(db_session):
    """advance/reject/send_back should raise ValueError when PR is paused."""
    db_session.commit = db_session.flush

    hod = await _get_user(db_session, "hod.cse@nitt.edu")
    bg = BackgroundTasks()
    engine = FlowEngineService(db_session, bg)

    # Create a synthetic PR with budget_file_allocation status
    pr = await _make_dummy_pr(db_session, hod)
    pr.current_status = RequestStatus.BUDGET_FILE_ALLOCATION
    await db_session.flush()

    with pytest.raises(ValueError, match="paused"):
        await engine.advance(pr, hod, remarks="test")

    with pytest.raises(ValueError, match="paused"):
        await engine.reject(pr, hod, reason="test")

    with pytest.raises(ValueError, match="paused"):
        await engine.send_back(pr, hod, to_step=1, reason="test")
    await db_session.flush()


# ─── test: auto-resumption via update_budget TEMP→permanent transition ──────

@pytest.mark.asyncio
async def test_auto_resume_on_budget_file_update(db_session):
    """
    When a budget file transitions from TEMP/ to a permanent file number via
    update_budget, any PRs paused at budget_file_allocation that link to it
    (and have no other remaining TEMP files) should automatically resume.
    """
    from app.routers.admin import update_budget

    db_session.commit = db_session.flush

    hod = await _get_user(db_session, "hod.cse@nitt.edu")
    dean_res = await db_session.execute(
        select(User).join(User.role).where(
            User.role.has(group_key="dean_approver")
        ).limit(1)
    )
    dean = dean_res.scalar_one_or_none()
    if not dean:
        pytest.skip("No dean_approver user in seed data")

    await db_session.refresh(dean, ["role"])

    # Create a temp budget file
    temp_bm = await _make_temp_budget(db_session, hod)

    # Create a dummy PR and link its item to our temp budget file
    pr = await _make_dummy_pr(db_session, hod)
    item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Test Item",
        quantity=1,
        estimated_total=100000.0,
        budget_file_id=temp_bm.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    db_session.add(item)
    pr.current_status = RequestStatus.BUDGET_FILE_ALLOCATION
    await db_session.flush()

    # Now update the budget file to a permanent file number
    await update_budget(
        temp_bm.id,
        {"file_no": "NITT/F.NO.TEST001/CAPEX/2026-27/CSE", "remarks": "Dean allocation test"},
        db_session,
        user=dean,
    )

    # The PR should now be IN_PROGRESS
    await db_session.refresh(pr)
    assert pr.current_status == RequestStatus.IN_PROGRESS

    # The budget file's file_no should have been updated
    await db_session.refresh(temp_bm)
    assert not temp_bm.file_no.upper().startswith("TEMP")

    # Timeline/history entry should mention "Budget File Allocated"
    await db_session.refresh(pr, ["history"])
    alloc_entry = next(
        (h for h in pr.history if h.status == "Budget File Allocated"), None
    )
    assert alloc_entry is not None
    assert "NITT/F.No." in alloc_entry.remarks
    assert "CAPEX" in alloc_entry.remarks
    assert "CSE" in alloc_entry.remarks

    await db_session.flush()


# ─── test: direct allocation via /allocate-budget-file endpoint ─────────────

@pytest.mark.asyncio
async def test_direct_allocation_endpoint(db_session):
    """
    The /allocate-budget-file endpoint should:
    - Reject non-dean/non-admin callers with 403.
    - Reject a file number that starts with TEMP.
    - Update the temp budget file, set PR to IN_PROGRESS, and log history.
    """
    from app.routers.purchase_requests import allocate_budget_file

    db_session.commit = db_session.flush
    bg = BackgroundTasks()

    hod = await _get_user(db_session, "hod.cse@nitt.edu")
    await db_session.refresh(hod, ["role"])

    dean_res = await db_session.execute(
        select(User).join(User.role).where(
            User.role.has(group_key="dean_approver")
        ).limit(1)
    )
    dean = dean_res.scalar_one_or_none()
    if not dean:
        pytest.skip("No dean_approver user in seed data")
    await db_session.refresh(dean, ["role"])

    # Create a temp budget file and attach it to a PR
    temp_bm = await _make_temp_budget(db_session, hod)
    pr = await _make_dummy_pr(db_session, hod)
    item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Test Item",
        quantity=1,
        estimated_total=100000.0,
        budget_file_id=temp_bm.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    db_session.add(item)
    pr.current_status = RequestStatus.BUDGET_FILE_ALLOCATION
    await db_session.flush()

    # 1. HOD should be rejected
    with pytest.raises(HTTPException) as exc_info:
        await allocate_budget_file(pr.id, {"file_no": "NITT/TEST/001"}, bg, db_session, user=hod)
    assert exc_info.value.status_code == 403

    # 2. Dean cannot pass a TEMP file number
    with pytest.raises(HTTPException) as exc_info:
        await allocate_budget_file(pr.id, {"file_no": "TEMP/SOMETHING"}, bg, db_session, user=dean)
    assert exc_info.value.status_code == 400
    assert "TEMP" in exc_info.value.detail

    # 3. Correct call succeeds
    result = await allocate_budget_file(
        pr.id,
        {"file_no": "NITT/F.NO.DIRECT001/CAPEX/2026-27/CSE", "remarks": "Direct allocation test"},
        bg,
        db_session,
        user=dean,
    )
    assert "resumed" in result["message"].lower()

    await db_session.refresh(pr)
    assert pr.current_status == RequestStatus.IN_PROGRESS

    await db_session.refresh(temp_bm)
    assert temp_bm.file_no == "NITT/F.NO.DIRECT001/CAPEX/2026-27/CSE"

    # History should include "Budget File Allocated"
    await db_session.refresh(pr, ["history"])
    alloc_entry = next(
        (h for h in pr.history if h.status == "Budget File Allocated"), None
    )
    assert alloc_entry is not None

    await db_session.flush()


# ─── test: endpoint rejects non-paused PR ───────────────────────────────────

@pytest.mark.asyncio
async def test_direct_allocation_rejects_non_paused_pr(db_session):
    """The endpoint must 400-reject PRs that are not in budget_file_allocation status."""
    from app.routers.purchase_requests import allocate_budget_file

    db_session.commit = db_session.flush
    bg = BackgroundTasks()

    dean_res = await db_session.execute(
        select(User).join(User.role).where(
            User.role.has(group_key="dean_approver")
        ).limit(1)
    )
    dean = dean_res.scalar_one_or_none()
    if not dean:
        pytest.skip("No dean_approver user in seed data")
    await db_session.refresh(dean, ["role"])

    hod = await _get_user(db_session, "hod.cse@nitt.edu")
    pr = await _make_dummy_pr(db_session, hod)

    with pytest.raises(HTTPException) as exc_info:
        await allocate_budget_file(
            pr.id,
            {"file_no": "NITT/F.NO.NONPAUSED/CAPEX/2026-27/CSE"},
            bg,
            db_session,
            user=dean,
        )
    assert exc_info.value.status_code == 400
    assert "not paused" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_direct_allocation_endpoint_auto_roll(db_session):
    """The /allocate-budget-file endpoint should auto-allocate (TEMP/ -> NITT/) if file_no is not provided."""
    from app.routers.purchase_requests import allocate_budget_file

    db_session.commit = db_session.flush
    bg = BackgroundTasks()

    hod = await _get_user(db_session, "hod.cse@nitt.edu")
    await db_session.refresh(hod, ["role"])

    dean_res = await db_session.execute(
        select(User).join(User.role).where(
            User.role.has(group_key="dean_approver")
        ).limit(1)
    )
    dean = dean_res.scalar_one_or_none()
    if not dean:
        pytest.skip("No dean_approver user in seed data")
    await db_session.refresh(dean, ["role"])

    # Create a temp budget file and attach it to a PR
    temp_bm = await _make_temp_budget(db_session, hod)
    pr = await _make_dummy_pr(db_session, hod)
    item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Test Item",
        quantity=1,
        estimated_total=100000.0,
        budget_file_id=temp_bm.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    db_session.add(item)
    pr.current_status = RequestStatus.BUDGET_FILE_ALLOCATION
    await db_session.flush()

    # Call with empty file_no -> should auto-allocate TEMP/ to NITT/
    result = await allocate_budget_file(
        pr.id,
        {"remarks": "Auto-roll test remarks"},
        bg,
        db_session,
        user=dean,
    )
    assert "resumed" in result["message"].lower()

    await db_session.refresh(pr)
    assert pr.current_status == RequestStatus.IN_PROGRESS

    await db_session.refresh(temp_bm)
    assert temp_bm.file_no.startswith("NITT/F.No.")
    assert "CAPEX" in temp_bm.file_no
    assert "CSE" in temp_bm.file_no


# ─── tests: HOD permission constraints ──────────────────────────────────────

@pytest.mark.asyncio
async def test_hod_cannot_create_permanent_budget_file(db_session):
    """HODs must be blocked from creating permanent (NITT/) budget files directly."""
    from app.routers.admin import create_budget

    hod = await _get_user(db_session, "hod.cse@nitt.edu")
    await db_session.refresh(hod, ["role"])

    body = {
        "department_id": hod.department_id,
        "financial_year_id": 2, # Active FY
        "source_of_fund": "CAPEX",
        "item_name": "Prohibited Permanent Item",
        "category": "computer",
        "unit_cost": 75000,
        "quantity": 1,
        "file_no": "NITT/CSE/2026-27/CAPEX/001" # permanent prefix is forbidden for HOD
    }

    with pytest.raises(HTTPException) as exc_info:
        await create_budget(body, db_session, user=hod)
    assert exc_info.value.status_code == 403
    assert "only create temporary" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_hod_cannot_edit_permanent_budget_file(db_session):
    """HODs must be blocked from editing already-allocated permanent budget files."""
    from app.routers.admin import update_budget

    hod = await _get_user(db_session, "hod.cse@nitt.edu")
    await db_session.refresh(hod, ["role"])

    # Find or create a permanent budget file
    res = await db_session.execute(
        select(BudgetMaster)
        .where(BudgetMaster.department_id == hod.department_id)
        .where(~BudgetMaster.file_no.like("TEMP/%"))
        .limit(1)
    )
    permanent_bm = res.scalar_one_or_none()
    if not permanent_bm:
        # fallback create
        permanent_bm = BudgetMaster(
            department_id=hod.department_id,
            financial_year_id=2,
            source_of_fund="CAPEX",
            item_name="Permanent Laptop",
            category="computer",
            unit_cost=50000,
            quantity=1,
            file_no="NITT/CSE/2026-27/CAPEX/099",
            is_revision=False
        )
        db_session.add(permanent_bm)
        await db_session.flush()

    body = {
        "item_name": "Attempted Hack Name Update"
    }

    with pytest.raises(HTTPException) as exc_info:
        await update_budget(permanent_bm.id, body, db_session, user=hod)
    assert exc_info.value.status_code == 403
    assert "cannot modify allocated permanent" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_direct_allocation_endpoint_with_selected_budget_file(db_session):
    """Test allocating a paused purchase request to an existing permanent budget file."""
    db_session.commit = db_session.flush

    # 1. Setup a paused PR in BUDGET_FILE_ALLOCATION status
    from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem, RequestStatus
    from app.models.budget import BudgetMaster
    from app.routers.purchase_requests import allocate_budget_file
    from unittest.mock import MagicMock

    # Fetch admin user
    admin = await _get_user(db_session, "dean.pd@nitt.edu")
    await db_session.refresh(admin, ["role"])

    # Create a temporary budget
    temp_bm = BudgetMaster(
        file_no="TEMP/F.No.9999/CAPEX/2026-27/CSE",
        department_id=1,
        item_name="Temporary Item",
        source_of_fund="CAPEX",
        category="computer",
        course_code="CS101",
        unit_cost=80000.0,
        quantity=1,
        total_allocation=80000.0,
        financial_year_id=2,
        committed_amount=80000.0
    )
    db_session.add(temp_bm)

    # Create a permanent budget to allocate to
    perm_bm = BudgetMaster(
        file_no="NITT/F.No.0077/CAPEX/2026-27/CSE",
        department_id=1,
        item_name="Permanent Item",
        source_of_fund="CAPEX",
        category="computer",
        course_code="CS101",
        unit_cost=200000.0,
        quantity=2,
        total_allocation=400000.0,
        financial_year_id=2,
        committed_amount=0.0
    )
    db_session.add(perm_bm)
    await db_session.flush()

    # Create paused PR
    pr = PurchaseRequest(
        amount=80000.0,
        purchase_type="department",
        initiator_id=admin.id,
        category_id=1,
        financial_year_id=2,
        procurement_id=1,
        current_status=RequestStatus.BUDGET_FILE_ALLOCATION,
    )
    db_session.add(pr)
    await db_session.flush()

    # Associate item with temporary budget
    item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="PR Laptop",
        quantity=1,
        estimated_total=80000.0,
        budget_file_id=temp_bm.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True
    )
    db_session.add(item)
    await db_session.flush()

    # Call allocate_budget_file with selected_budget_file_id
    body = {
        "selected_budget_file_id": perm_bm.id,
        "remarks": "Assigned to existing general computer budget"
    }
    background_tasks = MagicMock()
    res = await allocate_budget_file(pr.id, body, background_tasks, db_session, user=admin)
    assert "allocated" in res["message"].lower()

    # Assert locked amounts are updated
    await db_session.refresh(perm_bm)
    assert perm_bm.committed_amount == 80000.0

    # Assert PR status and item budget reference is updated
    await db_session.refresh(pr)
    assert pr.current_status == RequestStatus.IN_PROGRESS
    
    await db_session.refresh(item)
    assert item.budget_file_id == perm_bm.id

    # Verify temp budget is deleted since it is no longer referenced
    deleted_temp_res = await db_session.execute(
        select(BudgetMaster).where(BudgetMaster.id == temp_bm.id)
    )
    assert deleted_temp_res.scalar_one_or_none() is None



