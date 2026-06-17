import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.user import User, Department
from app.models.purchase_request import PurchaseRequest
from app.routers.purchase_requests import list_prs


@pytest.mark.asyncio
async def test_pr_nominee_scoping_behavior(db_session):
    db_session.commit = db_session.flush

    # 1. Fetch department, nominee user, and initiator user with role options loaded
    nominee = (await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "faculty1.cse@nitt.edu")
    )).scalar_one()
    initiator = (await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "faculty.cse@nitt.edu")
    )).scalar_one()
    
    dept = (await db_session.execute(select(Department).where(Department.id == nominee.department_id))).scalar_one()
    
    # Configure department director nominee, and ensure they are not expert1/expert2
    dept.director_faculty_id = nominee.id
    dept.expert1_id = None
    dept.expert2_id = None
    await db_session.flush()

    # 2. Create a purchase request where faculty3_id is None
    pr = PurchaseRequest(
        amount=150000.0,
        purchase_type="department",
        initiator_id=initiator.id,
        category_id=1,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
        faculty1_id=None,
        faculty2_id=None,
        faculty3_id=None,  # Not assigned yet
    )
    db_session.add(pr)
    await db_session.flush()

    try:
        # 3. List PRs as the nominee. Since faculty3_id is None and nominee is the director nominee of the dept,
        # but they are NOT explicitly assigned, this PR should NOT appear on their list!
        res_initial = await list_prs(db=db_session, user=nominee, skip=0, limit=50)
        initial_ids = {item["id"] for item in res_initial["items"]}
        assert pr.id not in initial_ids

        # 4. Explicitly assign the nominee to the PR (faculty3_id = nominee.id)
        pr.faculty3_id = nominee.id
        await db_session.flush()

        # 5. List PRs as the nominee again. Now that they are explicitly assigned, it SHOULD appear!
        res_assigned = await list_prs(db=db_session, user=nominee, skip=0, limit=50)
        assigned_ids = {item["id"] for item in res_assigned["items"]}
        assert pr.id in assigned_ids

    finally:
        # Clean up
        await db_session.delete(pr)
        await db_session.flush()
