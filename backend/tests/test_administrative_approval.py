import pytest
from fastapi import HTTPException
from sqlalchemy import select, and_
from datetime import datetime

from app.models.user import User, Department, RoleManager
from app.models.budget import BudgetMaster, FinancialYear
from app.models.administrative_approval import AdministrativeApproval, AdministrativeApprovalHistory
from app.routers.administrative_approval import create_aa, list_aas, get_aa_detail, action_aa, upload_aa_attachment


@pytest.mark.asyncio
async def test_administrative_approval_workflow(db_session):
    # Commit mocks
    db_session.commit = db_session.flush

    # 1. Fetch Users
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    await db_session.refresh(faculty, ["department", "role"])

    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()
    await db_session.refresh(hod, ["department", "role"])

    adpd_res = await db_session.execute(select(User).where(User.email == "vg.pd@nitt.edu"))
    adpd = adpd_res.scalar_one()
    await db_session.refresh(adpd, ["department", "role"])

    dean_res = await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))
    dean = dean_res.scalar_one()
    await db_session.refresh(dean, ["department", "role"])

    ia_res = await db_session.execute(select(User).where(User.email == "ia@nitt.edu"))
    ia_user = ia_res.scalar_one()
    await db_session.refresh(ia_user, ["department", "role"])

    dir_role_res = await db_session.execute(select(RoleManager).where(RoleManager.value == "director"))
    dir_role = dir_role_res.scalar_one()
    
    dir_user_res = await db_session.execute(select(User).where(User.role_id == dir_role.id))
    director = dir_user_res.scalars().first()
    if not director:
        director = User(
            name="J. Director",
            email="director@nitt.edu",
            hashed_password="password",
            designation="Director",
            gender="male",
            role_id=dir_role.id,
            is_active=True,
            is_approved=True,
        )
        db_session.add(director)
        await db_session.flush()
    else:
        await db_session.refresh(director, ["role"])

    # 2. Get a budget file
    budget_res = await db_session.execute(
        select(BudgetMaster).where(
            and_(
                BudgetMaster.department_id == faculty.department_id,
                BudgetMaster.allocated_initiator_id == faculty.id
            )
        )
    )
    budget = budget_res.scalars().first()
    assert budget is not None

    # Setup HOD nominees and balance
    budget.expert1_id = faculty.id
    budget.expert2_id = faculty.id
    budget.quantity = 1
    budget.unit_cost = 40000.0
    budget.total_allocation = 50000.0
    budget.committed_amount = 0.0
    budget.utilized_amount = 0.0
    db_session.add(budget)
    await db_session.flush()

    # 3. Create AA request (PI Submission)
    body = {
        "budget_file_id": budget.id,
        "item_description": "Test smart projector for CSE lab",
        "gst_rate": 18.0,
        "mode_of_procurement": "GeM",
        "justification": "Required for presenting research seminars",
        "item_category": "Assets",
        "stock_availability": "No",
        "present_stock": "0",
        "prev_file_no": "None",
        "justification_procurement": "Required",
        "generic_specification_declaration": True
    }

    create_res = await create_aa(body, db_session, faculty)
    assert create_res["message"] == "Administrative Approval request created successfully."
    aa_id = create_res["id"]

    # Verify state in DB
    aa_res = await db_session.execute(select(AdministrativeApproval).where(AdministrativeApproval.id == aa_id))
    aa = aa_res.scalar_one()
    assert aa.status == "Submitted to HOD"
    assert aa.pending_with == "HOD"
    assert aa.total_cost == 47200.0
    assert abs(aa.gst_amount - (40000.0 * 18.0 / 100.0)) < 0.01

    # 4. HOD reviews and approves
    hod_action_body = {
        "action": "Approve",
        "remarks": "Recommended for purchase."
    }
    action_res = await action_aa(aa_id, hod_action_body, db_session, hod)
    assert action_res["status"] == "Pending with ADPD"

    # 5. ADPD reviews and approves -> goes to Dean
    adpd_action_body = {
        "action": "Approve",
        "remarks": "Budget verified, recommended."
    }
    action_res = await action_aa(aa_id, adpd_action_body, db_session, adpd)
    assert action_res["status"] == "Pending with Dean"

    # 5a. Dean reviews and approves -> goes to IA
    dean_action_body = {
        "action": "Approve",
        "remarks": "Recommended by Dean."
    }
    action_res = await action_aa(aa_id, dean_action_body, db_session, dean)
    assert action_res["status"] == "Pending with IA"

    # 5b. IA reviews and approves -> goes to Director
    ia_action_body = {
        "action": "Approve",
        "remarks": "Audited and verified."
    }
    action_res = await action_aa(aa_id, ia_action_body, db_session, ia_user)
    assert action_res["status"] == "Pending with Director"

    # 6. Director approves
    dir_action_body = {
        "action": "Approve",
        "remarks": "Approved. Proceed with procurement."
    }
    action_res = await action_aa(aa_id, dir_action_body, db_session, director)
    assert action_res["status"] == "Administrative Approval Granted"
    assert action_res["aa_number"] is not None

    # Check committed budget balance
    await db_session.refresh(budget)
    assert budget.committed_amount == 47200.0


@pytest.mark.asyncio
async def test_pr_creation_with_administrative_approval(db_session):
    from sqlalchemy.orm import selectinload
    # Setup mocks
    db_session.commit = db_session.flush

    # 1. Fetch Users
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    await db_session.refresh(faculty, ["department", "role"])

    # 2. Get a budget file
    budget_res = await db_session.execute(
        select(BudgetMaster).where(
            and_(
                BudgetMaster.department_id == faculty.department_id,
                BudgetMaster.allocated_initiator_id == faculty.id
            )
        )
    )
    budget = budget_res.scalars().first()
    assert budget is not None

    # Setup HOD nominees and balance
    budget.expert1_id = faculty.id
    budget.expert2_id = faculty.id
    budget.quantity = 1
    budget.unit_cost = 40000.0
    budget.total_allocation = 50000.0
    budget.committed_amount = 47200.0  # Simulated: AA total cost is already committed
    budget.utilized_amount = 0.0
    db_session.add(budget)
    await db_session.flush()

    # 3. Create and grant Administrative Approval
    aa = AdministrativeApproval(
        budget_file_id=budget.id,
        pi_id=faculty.id,
        quantity=1,
        item_description="Test smart projector for CSE lab",
        gst_rate=18.0,
        mode_of_procurement="GeM",
        justification="Required for presenting research seminars",
        gst_amount=7200.0,
        total_cost=47200.0,
        status="Administrative Approval Granted",
        pending_with=None
    )
    db_session.add(aa)
    await db_session.flush()

    # 4. Create PR with this AA reference
    from app.schemas.pr_create import PRCreatePayload, PRItemCreate
    from app.routers.purchase_requests import _persist_pr
    from fastapi import BackgroundTasks
    
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
        tech_specs_text="Tentative specifications",
    )
    
    # We must provide gem_link as it's GeM mop=1
    payload = PRCreatePayload(
        selected_file_ids=[budget.id],
        mop=1,
        nominee_id=None,
        basis_of_estimate="L1 Quote",
        emd=0.0,
        performance_security=0.0,
        delivery_location="CSE Department",
        delivery_mode="Courier",
        items=[item],
        administrative_approval_id=aa.id,
        form_data={"specs": {}, "gem_link": "http://gem.gov.in"} # gem link is required in validation
    )
    
    bg_tasks = BackgroundTasks()
    res = await _persist_pr(payload, faculty, db_session, bg_tasks)
    assert res is not None
    assert "id" in res

    # Verify that the AA's committed amount of 47200.0 was released,
    # and replaced by the PR's locked estimated total of 40000.0
    await db_session.refresh(budget)
    assert budget.committed_amount == 40000.0
    
    # Check that PR has advanced beyond the Administrative Approval phase
    from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow
    from app.models.budget import PhaseManager
    
    pr_res = await db_session.execute(
        select(PurchaseRequest)
        .options(selectinload(PurchaseRequest.flow).selectinload(PurchaseRequestFlow.phase))
        .where(PurchaseRequest.id == res["id"])
    )
    pr_obj = pr_res.scalar_one()
    
    assert pr_obj.administrative_approval_id == aa.id
    assert pr_obj.flow is not None
    
    # Check that the current phase is NOT "Administrative Approval"
    assert pr_obj.flow.phase.phase_name != "Administrative Approval"


@pytest.mark.asyncio
async def test_administrative_approval_file_upload(db_session, tmp_path, monkeypatch):
    # Setup mocks
    db_session.commit = db_session.flush
    
    from app.core.config import settings
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    
    # 1. Fetch Users
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    await db_session.refresh(faculty, ["role"])
    
    # 2. Get a budget file
    budget_res = await db_session.execute(
        select(BudgetMaster).where(BudgetMaster.allocated_initiator_id == faculty.id)
    )
    budget = budget_res.scalars().first()
    assert budget is not None
    
    aa = AdministrativeApproval(
        budget_file_id=budget.id,
        pi_id=faculty.id,
        quantity=1,
        item_description="Test Item",
        gst_rate=18.0,
        mode_of_procurement="GeM",
        justification="Required",
        gst_amount=180.0,
        total_cost=1180.0,
        status="Submitted to HOD",
        pending_with="HOD"
    )
    db_session.add(aa)
    await db_session.flush()
    
    # 3. Test Invalid Extension
    from fastapi import UploadFile, HTTPException
    import io
    
    f_invalid_ext = UploadFile(filename="test.txt", file=io.BytesIO(b"some text"))
    with pytest.raises(HTTPException) as exc_info:
        await upload_aa_attachment(aa_id=aa.id, file=f_invalid_ext, db=db_session, user=faculty)
    assert exc_info.value.status_code == 400
    assert "Attachment must be PDF, PNG, JPG, or JPEG" in exc_info.value.detail
    
    # 4. Test Invalid Magic Bytes
    f_invalid_pdf = UploadFile(filename="test.pdf", file=io.BytesIO(b"some text"))
    with pytest.raises(HTTPException) as exc_info:
        await upload_aa_attachment(aa_id=aa.id, file=f_invalid_pdf, db=db_session, user=faculty)
    assert exc_info.value.status_code == 400
    assert "Invalid PDF file" in exc_info.value.detail
    
    # 5. Test Valid PDF
    pdf_content = b"%PDF-1.4 test content"
    f_valid = UploadFile(filename="test.pdf", file=io.BytesIO(pdf_content))
    res = await upload_aa_attachment(aa_id=aa.id, file=f_valid, db=db_session, user=faculty)
    assert res["message"] == "Attachment uploaded successfully."
    assert res["attachment_path"].endswith(".pdf")
    
    # Verify DB update
    await db_session.refresh(aa)
    assert aa.attachment_path == res["attachment_path"]


@pytest.mark.asyncio
async def test_administrative_approval_admin_endpoints(db_session):
    # Mock admin auth dependency
    admin_mock = None
    db_session.commit = db_session.flush

    from app.routers.admin import (
        list_aa_workflows,
        create_aa_workflow,
        update_aa_workflow,
        delete_aa_workflow,
        toggle_aa_workflow,
        reorder_aa_workflows,
        reset_aa_workflows,
    )

    # 1. Reset workflows to default
    await reset_aa_workflows({"category_id": 1, "procurement_id": 1, "purchase_type": "department"}, db_session, admin_mock)
    
    # 2. List workflows
    steps = await list_aa_workflows(db_session, admin_mock)
    my_steps = [s for s in steps if s["category_id"] == 1 and s["procurement_id"] == 1 and s["purchase_type"] == "department"]
    assert len(my_steps) == 3
    assert my_steps[0]["user_group"] == "HOD"
    assert my_steps[1]["user_group"] == "ADPD"
    assert my_steps[2]["user_group"] == "Director"

    # 3. Create a workflow step
    new_step_res = await create_aa_workflow(
        {"user_group": "Dean", "step_order": 4, "category_id": 1, "procurement_id": 1, "purchase_type": "department"},
        db_session,
        admin_mock
    )
    assert new_step_res["message"] == "Workflow step created"
    new_step_id = new_step_res["id"]

    # List and check count
    steps = await list_aa_workflows(db_session, admin_mock)
    my_steps = [s for s in steps if s["category_id"] == 1 and s["procurement_id"] == 1 and s["purchase_type"] == "department"]
    assert len(my_steps) == 4
    assert my_steps[3]["user_group"] == "Dean"

    # 4. Update a workflow step
    update_res = await update_aa_workflow(
        new_step_id,
        {"user_group": "Dean P&D"},
        db_session,
        admin_mock
    )
    assert update_res["message"] == "Workflow step updated"

    # 5. Toggle a workflow step
    toggle_res = await toggle_aa_workflow(
        new_step_id,
        db_session,
        admin_mock
    )
    assert toggle_res["message"] == "Toggled"
    assert toggle_res["is_enabled"] is False

    # 6. Reorder workflows
    all_steps = await list_aa_workflows(db_session, admin_mock)
    my_steps = [s for s in all_steps if s["category_id"] == 1 and s["procurement_id"] == 1 and s["purchase_type"] == "department"]
    step_ids = [s["id"] for s in my_steps]
    reversed_ids = list(reversed(step_ids))
    
    reorder_res = await reorder_aa_workflows(
        {"step_ids": reversed_ids},
        db_session,
        admin_mock
    )
    assert reorder_res["message"] == "Reordered successfully"

    # 7. Delete a workflow step
    delete_res = await delete_aa_workflow(
        new_step_id,
        db_session,
        admin_mock
    )
    assert delete_res["message"] == "Workflow step deleted"

    # List and verify remaining
    steps = await list_aa_workflows(db_session, admin_mock)
    my_steps = [s for s in steps if s["category_id"] == 1 and s["procurement_id"] == 1 and s["purchase_type"] == "department"]
    assert len(my_steps) == 3


@pytest.mark.asyncio
async def test_duplicate_steps_and_nomineeless_routing(db_session):
    db_session.commit = db_session.flush

    # 1. Fetch Users
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    await db_session.refresh(faculty, ["department", "role"])

    hod_res = await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
    hod = hod_res.scalar_one()
    await db_session.refresh(hod, ["department", "role"])

    adpd_res = await db_session.execute(select(User).where(User.email == "vg.pd@nitt.edu"))
    adpd = adpd_res.scalar_one()
    await db_session.refresh(adpd, ["department", "role"])

    dean_res = await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))
    dean = dean_res.scalar_one()
    await db_session.refresh(dean, ["department", "role"])

    dir_role_res = await db_session.execute(select(RoleManager).where(RoleManager.value == "director"))
    dir_role = dir_role_res.scalar_one()
    director_res = await db_session.execute(select(User).where(User.role_id == dir_role.id))
    director = director_res.scalars().first()
    if not director:
        director = User(
            name="J. Director",
            email="director@nitt.edu",
            hashed_password="password",
            designation="Director",
            gender="male",
            role_id=dir_role.id,
            is_active=True,
            is_approved=True,
        )
        db_session.add(director)
        await db_session.flush()
    else:
        await db_session.refresh(director, ["role"])

    # 2. Setup Category and Procurement Mode
    from app.models.budget import PurchaseCategory, ProcurementManager
    proc = ProcurementManager(name="Super Unique Procurement")
    db_session.add(proc)
    await db_session.flush()

    cat = PurchaseCategory(
        title="Special Category",
        min_amount=1000.0,
        max_amount=10000.0,
        procurement_id=proc.id
    )
    db_session.add(cat)
    await db_session.flush()

    # 3. Add steps with duplicate groups: HOD -> ADPD -> Dean -> Dean -> Director
    from app.models.administrative_approval import AdministrativeApprovalWorkflow
    steps_data = [
        ("HOD", 1),
        ("ADPD", 2),
        ("Dean", 3),
        ("Dean", 4),
        ("Director", 5)
    ]
    for grp, order in steps_data:
        db_session.add(AdministrativeApprovalWorkflow(
            category_id=cat.id,
            procurement_id=proc.id,
            purchase_type="department",
            step_order=order,
            user_group=grp,
            is_enabled=True
        ))
    await db_session.flush()

    # 4. Get financial year and create nominee-less budget
    fy_res = await db_session.execute(select(FinancialYear).limit(1))
    fy = fy_res.scalar_one()

    budget = BudgetMaster(
        department_id=faculty.department_id,
        financial_year_id=fy.id,
        source_of_fund="OPEX",
        item_name="Smart Board Boardless",
        category="equipment",
        course_code="CSE-TEST-1",
        unit_cost=3000.0,
        quantity=1,
        total_allocation=5000.0,
        file_no="NITT/F.No.9999/OPEX/2026-27/CSE",
        is_revision=False,
        committed_amount=0.0,
        utilized_amount=0.0,
        allocated_initiator_id=faculty.id,
        expert1_id=None,
        expert2_id=None,
        nominee_ids=None
    )
    db_session.add(budget)
    await db_session.flush()

    # 5. Create AA request (PI Submission)
    body = {
        "budget_file_id": budget.id,
        "item_description": "Test Smart Board for Super Unique Procurement",
        "gst_rate": 18.0,
        "mode_of_procurement": "Super Unique Procurement",
        "justification": "Required for lab upgrades",
        "item_category": "Assets",
        "stock_availability": "No",
        "present_stock": "0",
        "prev_file_no": "None",
        "justification_procurement": "Required",
        "generic_specification_declaration": True
    }

    create_res = await create_aa(body, db_session, faculty)
    assert create_res["message"] == "Administrative Approval request created successfully."
    aa_id = create_res["id"]

    # 6. Action 1: HOD Approves
    action_res = await action_aa(
        aa_id=aa_id,
        body={"action": "Approve", "remarks": "HOD approval, no nominees"},
        db=db_session,
        user=hod
    )
    assert action_res["status"] == "Pending with ADPD"

    # 7. Action 2: ADPD Approves -> Pending with Dean (idx 2)
    action_res = await action_aa(
        aa_id=aa_id,
        body={"action": "Approve", "remarks": "ADPD approves"},
        db=db_session,
        user=adpd
    )
    assert action_res["status"] == "Pending with Dean"

    # Verify that the DB record's pending_with is indeed Dean
    aa_res = await db_session.execute(select(AdministrativeApproval).where(AdministrativeApproval.id == aa_id))
    aa = aa_res.scalar_one()
    assert aa.pending_with == "Dean"

    # 8. Action 3: First Dean Approves -> Pending with Dean (idx 3)
    action_res = await action_aa(
        aa_id=aa_id,
        body={"action": "Approve", "remarks": "First Dean approves"},
        db=db_session,
        user=dean
    )
    assert action_res["status"] == "Pending with Dean"

    # 9. Action 4: Second Dean Approves -> Pending with Director
    # Since our state-machine history-tracing keeps track, it must advance to Director
    action_res = await action_aa(
        aa_id=aa_id,
        body={"action": "Approve", "remarks": "Second Dean approves"},
        db=db_session,
        user=dean
    )
    assert action_res["status"] == "Pending with Director"

    # 10. Action 5: Director Approves -> Granted
    action_res = await action_aa(
        aa_id=aa_id,
        body={"action": "Approve", "remarks": "Director final approval"},
        db=db_session,
        user=director
    )
    assert action_res["status"] == "Administrative Approval Granted"
