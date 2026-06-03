import pytest
import os
import shutil
from sqlalchemy import select, and_, or_
from fastapi import HTTPException
from app.models.user import User, Department, RoleManager
from app.models.budget import BudgetMaster, FinancialYear, PhaseManager
from app.models.purchase_request import PurchaseRequest, PurchaseRequestHistory, PurchaseRequestFlow, PurchaseRequestItem
from app.services.flow_engine import FlowEngineService
from app.core.deps import require_roles
from app.core.config import settings

@pytest.mark.asyncio
async def test_strict_signing_and_nominee_locking(db_session):
    db_session.commit = db_session.flush

    # 1. Fetch test users
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()

    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()

    dean_res = await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))
    dean = dean_res.scalar_one()

    director_res = await db_session.execute(select(User).where(User.email == "director@nitt.edu"))
    director = director_res.scalar_one()

    # Ensure faculty/hod has a signature path mock
    faculty.signature_path = "signatures/faculty_cse.png"
    hod.signature_path = "signatures/hod_cse.png"
    db_session.add(faculty)
    db_session.add(hod)
    await db_session.flush()

    # Create dummy mock signature file
    src_dir = os.path.join(settings.STORAGE_PATH, "signatures")
    os.makedirs(src_dir, exist_ok=True)
    mock_sig_path = os.path.join(src_dir, "faculty_cse.png")
    with open(mock_sig_path, "w") as f:
        f.write("mock_signature_data")

    mock_hod_sig_path = os.path.join(src_dir, "hod_cse.png")
    with open(mock_hod_sig_path, "w") as f:
        f.write("mock_hod_signature_data")

    # 2. Get CSE budget
    b_res = await db_session.execute(select(BudgetMaster).where(BudgetMaster.department_id == hod.department_id))
    budget = b_res.scalars().first()
    assert budget is not None

    # Create PR
    pr = PurchaseRequest(
        amount=120000.0,
        purchase_type="department",
        initiator_id=faculty.id,
        category_id=1,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr)
    await db_session.flush()

    pr_item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        budget_file_id=budget.id,
        item_description="Test strict signing item",
        estimated_total=120000.0,
        quantity=1,
        requirement_type="Research",
        availability="No",
        tech_specs_text="—",
        site_readiness=True,
        installation_required=False,
    )
    db_session.add(pr_item)
    await db_session.flush()

    # Initialize workflow flow - this automatically does step 1 (Faculty submission)
    flow_service = FlowEngineService(db_session)
    await flow_service.initialize(pr, faculty)
    await db_session.refresh(pr)

    # 3. Nominate experts while in Administrative Approval phase (should propagate)
    from app.routers.budget import assign_budget_committee
    await assign_budget_committee(
        budget_id=budget.id,
        body={"expert1_id": faculty.id, "expert2_id": hod.id},
        db=db_session,
        user=hod
    )
    await db_session.refresh(pr)
    assert pr.faculty1_id == faculty.id
    assert pr.faculty2_id == hod.id

    # 4. Verify initiator's signature was automatically snapshotted on initialization
    hist_res = await db_session.execute(
        select(PurchaseRequestHistory)
        .where(PurchaseRequestHistory.purchase_request_id == pr.id)
        .order_by(PurchaseRequestHistory.id.desc())
    )
    last_history = hist_res.scalars().first()
    assert last_history is not None
    assert last_history.frozen_actor_name == faculty.name
    assert last_history.frozen_designation == faculty.designation
    assert last_history.frozen_signature_path is not None
    assert "signatures/snapshots/" in last_history.frozen_signature_path

    # Check copy file exists on disk
    frozen_full_path = os.path.join(settings.STORAGE_PATH, last_history.frozen_signature_path)
    assert os.path.exists(frozen_full_path)
    with open(frozen_full_path, "r") as f:
        assert f.read() == "mock_signature_data"

    # 5. Change user profile signature path
    faculty.signature_path = "signatures/new_faculty_cse.png"
    faculty.name = "Modified Faculty Name"
    db_session.add(faculty)
    await db_session.flush()

    # Assert history log retains the original frozen snapshot path and name
    await db_session.refresh(last_history)
    assert last_history.frozen_actor_name == "Dr. A. Kumar"
    assert "new_faculty_cse" not in last_history.frozen_signature_path

    # 6. Advance flow past Administrative Approval phase
    # Current expected: HOD CSE (Step 2)
    # Let's advance it
    pr = await flow_service.advance(pr, hod, remarks="Approved by HOD")
    await db_session.refresh(pr)
    
    # Assert HOD signature is frozen
    hist_res2 = await db_session.execute(
        select(PurchaseRequestHistory)
        .where(
            and_(
                PurchaseRequestHistory.purchase_request_id == pr.id,
                PurchaseRequestHistory.current_approver_id == hod.id
            )
        )
    )
    hod_history = hist_res2.scalars().first()
    assert hod_history is not None
    assert hod_history.frozen_actor_name == hod.name
    assert hod_history.frozen_signature_path is not None

    # Verify that now budget nominee configuration updates DO NOT propagate to the PR
    # Since the PR has advanced past Administrative Approval
    await assign_budget_committee(
        budget_id=budget.id,
        body={"expert1_id": hod.id, "expert2_id": faculty.id}, # flipped experts
        db=db_session,
        user=hod
    )
    # Assert that PR's nominee faculty1_id and faculty2_id are NOT changed/synced
    await db_session.refresh(pr)
    assert pr.faculty1_id == faculty.id
    assert pr.faculty2_id == hod.id

    # Cleanup mock files
    try:
        shutil.rmtree(os.path.join(settings.STORAGE_PATH, "signatures", "snapshots"))
        os.remove(mock_sig_path)
        os.remove(mock_hod_sig_path)
    except Exception:
        pass


@pytest.mark.asyncio
async def test_budget_creator_role_restrictions(db_session):
    db_session.commit = db_session.flush

    # Fetch users
    dean_res = await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))
    dean = dean_res.scalar_one()

    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()

    # Refresh roles to avoid lazy-loading Greenlet exceptions during mock check
    await db_session.refresh(dean, ["role"])
    await db_session.refresh(hod, ["role"])

    # The require_roles checker
    dean_checker = require_roles("dean_approver")

    # 1. Dean P&D passes successfully
    res_dean = await dean_checker(user=dean)
    assert res_dean.id == dean.id

    # 2. HOD raises 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        await dean_checker(user=hod)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Insufficient permissions"
