import pytest
from sqlalchemy import select

from app.models.budget import BudgetMaster
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem
from app.models.user import User
from app.services.tech_committee import resolve_tech_committee_ids, sync_tech_committee_to_pr


@pytest.mark.asyncio
async def test_resolve_tech_committee_from_budget_file(db_session):
    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    faculty1_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
    faculty1 = faculty1_res.scalar_one()
    faculty2_res = await db_session.execute(select(User).where(User.email == "faculty2.cse@nitt.edu"))
    faculty2 = faculty2_res.scalar_one()
    vg_res = await db_session.execute(select(User).where(User.email == "vg.pd@nitt.edu"))
    vg = vg_res.scalar_one()

    budget_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget = budget_res.scalar_one()
    budget.expert1_id = faculty1.id
    budget.expert2_id = faculty2.id
    budget.director_faculty_id = vg.id
    await db_session.flush()

    pr = PurchaseRequest(
        amount=250000.0,
        purchase_type="research",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=1,
        procurement_id=1,
        current_status="in_progress",
        faculty1_id=None,
        faculty2_id=None,
        faculty3_id=None,
    )
    db_session.add(pr)
    await db_session.flush()
    db_session.add(
        PurchaseRequestItem(
            purchase_request_id=pr.id,
            budget_file_id=budget.id,
            item_description="Test item",
            quantity=1,
            estimated_total=250000.0,
            requirement_type="Research",
            availability="No",
            tech_specs_text="—",
            site_readiness=True,
            installation_required=False,
        )
    )
    await db_session.flush()

    _, e1, e2, d = await resolve_tech_committee_ids(db_session, pr)
    assert e1 == faculty1.id
    assert e2 == faculty2.id
    assert d == vg.id

    updated = await sync_tech_committee_to_pr(db_session, pr)
    assert updated is True
    assert pr.faculty1_id == faculty1.id
    assert pr.faculty2_id == faculty2.id
    assert pr.faculty3_id == vg.id


@pytest.mark.asyncio
async def test_tech_committee_member_ids_includes_director_nominee(db_session):
    from app.services.tech_committee import get_tech_committee_member_ids

    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    faculty1_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
    faculty1 = faculty1_res.scalar_one()
    faculty2_res = await db_session.execute(select(User).where(User.email == "faculty2.cse@nitt.edu"))
    faculty2 = faculty2_res.scalar_one()
    vg_res = await db_session.execute(select(User).where(User.email == "vg.pd@nitt.edu"))
    vg = vg_res.scalar_one()

    budget_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget = budget_res.scalar_one()
    budget.expert1_id = faculty1.id
    budget.expert2_id = faculty2.id
    budget.director_faculty_id = vg.id
    budget.nominee_ids = [faculty1.id, faculty2.id]
    await db_session.flush()

    pr = PurchaseRequest(
        amount=250000.0,
        purchase_type="research",
        initiator_id=faculty.id,
        category_id=2,
        financial_year_id=1,
        procurement_id=1,
        current_status="in_progress",
        faculty1_id=None,
        faculty2_id=None,
        faculty3_id=None,
        committee_nominee_ids=[faculty1.id, faculty2.id]
    )
    db_session.add(pr)
    await db_session.flush()
    db_session.add(
        PurchaseRequestItem(
            purchase_request_id=pr.id,
            budget_file_id=budget.id,
            item_description="Test item",
            quantity=1,
            estimated_total=250000.0,
            requirement_type="Research",
            availability="No",
            tech_specs_text="—",
            site_readiness=True,
            installation_required=False,
        )
    )
    await db_session.flush()

    # Before sync, get_tech_committee_member_ids should include all three (expert1, expert2, director) when size is 3 or None
    member_ids = await get_tech_committee_member_ids(db_session, pr, committee_size=3)
    assert vg.id in member_ids
    assert faculty1.id in member_ids
    assert faculty2.id in member_ids

    # After sync, sync_tech_committee_to_pr should include vg.id in pr.committee_nominee_ids
    await sync_tech_committee_to_pr(db_session, pr)
    assert pr.committee_nominee_ids is not None
    assert vg.id in pr.committee_nominee_ids


@pytest.mark.asyncio
async def test_technical_evaluation_auto_advance_upon_final_nominee_signature(db_session):
    from datetime import datetime
    from app.models.purchase_request import PurchaseRequestFlow, PurchaseRequestHistory
    from app.models.budget import PhaseManager
    from app.services.flow_engine import FlowEngineService

    db_session.commit = db_session.flush
    flow_service = FlowEngineService(db_session)

    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    faculty1_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
    faculty1 = faculty1_res.scalar_one()
    faculty2_res = await db_session.execute(select(User).where(User.email == "faculty2.cse@nitt.edu"))
    faculty2 = faculty2_res.scalar_one()
    vg_res = await db_session.execute(select(User).where(User.email == "vg.pd@nitt.edu"))
    vg = vg_res.scalar_one()

    phase_te_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Technical Evaluation"))
    phase_te = phase_te_res.scalar_one()

    # Configure committee
    from app.models.user import Department
    dept_res = await db_session.execute(select(Department).where(Department.id == faculty.department_id))
    dept = dept_res.scalar_one()
    dept.expert1_id = faculty1.id
    dept.expert2_id = faculty2.id
    dept.director_faculty_id = vg.id
    await db_session.flush()

    budget_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget = budget_res.scalar_one()

    pr = PurchaseRequest(
        amount=250000.0,
        purchase_type="research",
        initiator_id=faculty.id,
        category_id=3,
        financial_year_id=1,
        procurement_id=1,
        current_status="in_progress",
        faculty1_id=faculty1.id,
        faculty2_id=faculty2.id,
        faculty3_id=vg.id,
        te_initiated_at=datetime.utcnow(),
        committee_nominee_ids=[faculty1.id, faculty2.id, vg.id]
    )
    db_session.add(pr)
    await db_session.flush()

    flow = PurchaseRequestFlow(
        purchase_request_id=pr.id,
        phase_id=phase_te.id,
        step_order=2,
        rejected=False,
    )
    db_session.add(flow)
    await db_session.flush()

    # 1. First, PI (Faculty) submits bidder assessment and advances.
    # This logs "Technical Evaluation Completed" in history.
    db_session.add(
        PurchaseRequestHistory(
            purchase_request_id=pr.id,
            current_approver_id=faculty.id,
            status="Technical Evaluation Completed",
            remarks="Bidders registered by PI",
            acted_at=datetime.utcnow(),
        )
    )
    await db_session.flush()

    # 2. Nominees sign one by one.
    # Faculty 1 signs:
    db_session.add(
        PurchaseRequestHistory(
            purchase_request_id=pr.id,
            current_approver_id=faculty1.id,
            status="Technical Evaluation Approved",
            remarks="Faculty 1 signed",
            acted_at=datetime.utcnow(),
        )
    )
    await db_session.flush()

    # Faculty 2 signs:
    db_session.add(
        PurchaseRequestHistory(
            purchase_request_id=pr.id,
            current_approver_id=faculty2.id,
            status="Technical Evaluation Approved",
            remarks="Faculty 2 signed",
            acted_at=datetime.utcnow(),
        )
    )
    await db_session.flush()

    # Now the last nominee (VG, Director Nominee) signs:
    last_nominee_history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=vg.id,
        status="Technical Evaluation Approved",
        remarks="VG signed",
        acted_at=datetime.utcnow(),
    )
    db_session.add(last_nominee_history)
    await db_session.flush()

    # Call advance under the last signer (vg)
    await flow_service.advance(pr, vg, remarks="VG signed", db_flush=False)
    await db_session.refresh(flow)

    # Verify that it automatically advanced to step 3 (HOD review)!
    assert flow.step_order == 3


@pytest.mark.asyncio
async def test_financial_sanction_committee_signatures(db_session):
    from datetime import datetime
    from app.models.purchase_request import PurchaseRequestFlow, PurchaseRequestHistory, WorkFlowHierarchy
    from app.models.budget import PhaseManager
    from app.services.flow_engine import FlowEngineService

    db_session.commit = db_session.flush
    flow_service = FlowEngineService(db_session)

    faculty_res = await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))
    faculty = faculty_res.scalar_one()
    faculty1_res = await db_session.execute(select(User).where(User.email == "faculty1.cse@nitt.edu"))
    faculty1 = faculty1_res.scalar_one()
    faculty2_res = await db_session.execute(select(User).where(User.email == "faculty2.cse@nitt.edu"))
    faculty2 = faculty2_res.scalar_one()
    vg_res = await db_session.execute(select(User).where(User.email == "vg.pd@nitt.edu"))
    vg = vg_res.scalar_one()

    phase_fs_res = await db_session.execute(select(PhaseManager).where(PhaseManager.phase_name == "Financial Sanction"))
    phase_fs = phase_fs_res.scalar_one()

    # Delete conflicting workflow steps
    from sqlalchemy import delete
    await db_session.execute(
        delete(WorkFlowHierarchy).where(
            WorkFlowHierarchy.category_id == 3,
            WorkFlowHierarchy.procurement_id == 1,
            WorkFlowHierarchy.purchase_type == "research",
            WorkFlowHierarchy.phase_id == phase_fs.id
        )
    )
    await db_session.flush()

    wf_step = WorkFlowHierarchy(
        category_id=3,
        phase_id=phase_fs.id,
        procurement_id=1,
        step_order=1,
        user_type="tech_evaluation",
        purchase_type="research",
        is_enabled=True,
        committee_size=3,
    )
    db_session.add(wf_step)

    wf_next = WorkFlowHierarchy(
        category_id=3,
        phase_id=phase_fs.id,
        procurement_id=1,
        step_order=2,
        user_type="approver",
        user_group="dean_approver",
        purchase_type="research",
        is_enabled=True,
    )
    db_session.add(wf_next)
    await db_session.flush()

    pr = PurchaseRequest(
        amount=250000.0,
        purchase_type="research",
        initiator_id=faculty.id,
        category_id=3,
        financial_year_id=1,
        procurement_id=1,
        current_status="in_progress",
        faculty1_id=faculty1.id,
        faculty2_id=faculty2.id,
        faculty3_id=vg.id,
        fs_initiated_at=datetime.utcnow(),
        committee_nominee_ids=[faculty1.id, faculty2.id, vg.id]
    )
    db_session.add(pr)
    await db_session.flush()

    flow = PurchaseRequestFlow(
        purchase_request_id=pr.id,
        phase_id=phase_fs.id,
        step_order=1,
        rejected=False,
    )
    db_session.add(flow)
    await db_session.flush()

    # 1. Nominees sign one by one.
    # Faculty 1 signs (using "Financial Committee Approved" status):
    db_session.add(
        PurchaseRequestHistory(
            purchase_request_id=pr.id,
            current_approver_id=faculty1.id,
            status="Financial Committee Approved",
            remarks="Faculty 1 approved in FS",
            acted_at=datetime.utcnow(),
        )
    )
    await db_session.flush()

    # Faculty 2 signs (using "Financial Committee Approved" status):
    db_session.add(
        PurchaseRequestHistory(
            purchase_request_id=pr.id,
            current_approver_id=faculty2.id,
            status="Financial Committee Approved",
            remarks="Faculty 2 approved in FS",
            acted_at=datetime.utcnow(),
        )
    )
    await db_session.flush()

    # Now the last nominee (VG, Director Nominee) signs:
    # We call flow_service.advance under the last signer.
    # Since it is a financial committee step, default status will be "Financial Committee Approved".
    await flow_service.advance(pr, vg, remarks="VG approved in FS", db_flush=False)
    await db_session.refresh(flow)

    # Verify that it automatically advanced to step 2!
    assert flow.step_order == 2



