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

    budget_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget = budget_res.scalar_one()
    budget.expert1_id = faculty1.id
    budget.expert2_id = faculty2.id
    budget.director_faculty_id = faculty2.id
    await db_session.flush()

    pr = PurchaseRequest(
        amount=250000.0,
        purchase_type="department",
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
    assert d == faculty2.id

    updated = await sync_tech_committee_to_pr(db_session, pr)
    assert updated is True
    assert pr.faculty1_id == faculty1.id
    assert pr.faculty2_id == faculty2.id
    assert pr.faculty3_id == faculty2.id
