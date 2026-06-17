import pytest
from fastapi import HTTPException
from sqlalchemy import select
from app.models.user import User
from app.routers.admin import add_budget_category

@pytest.mark.asyncio
async def test_admin_category_restriction(db_session):
    """Test that only admins can add budget categories, and non-admins receive a 403 Forbidden error."""
    db_session.commit = db_session.flush

    # 1. Fetch users with different roles
    admin = (await db_session.execute(select(User).where(User.email == "admin@nitt.edu"))).scalar_one()
    dean = (await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))).scalar_one()
    hod = (await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))).scalar_one()
    director = (await db_session.execute(select(User).where(User.email == "director@nitt.edu"))).scalar_one()

    # 2. Verify Dean is rejected
    with pytest.raises(HTTPException) as exc_info:
        await add_budget_category(
            {"type": "expenditure", "value": "TEST_DEAN_EXP"},
            db_session,
            current_user=dean
        )
    assert exc_info.value.status_code == 403
    assert "Insufficient permissions" in exc_info.value.detail

    # 3. Verify HOD is rejected
    with pytest.raises(HTTPException) as exc_info:
        await add_budget_category(
            {"type": "item", "value": "TEST_HOD_ITEM"},
            db_session,
            current_user=hod
        )
    assert exc_info.value.status_code == 403
    assert "Insufficient permissions" in exc_info.value.detail

    # 4. Verify Director is rejected
    with pytest.raises(HTTPException) as exc_info:
        await add_budget_category(
            {"type": "expenditure", "value": "TEST_DIRECTOR_EXP"},
            db_session,
            current_user=director
        )
    assert exc_info.value.status_code == 403
    assert "Insufficient permissions" in exc_info.value.detail

    # 5. Verify Admin succeeds for expenditure category
    res_exp = await add_budget_category(
        {"type": "expenditure", "value": "TEST_ADMIN_EXP"},
        db_session,
        current_user=admin
    )
    assert "TEST_ADMIN_EXP" in res_exp["expenditure_categories"]

    # 6. Verify Admin succeeds for item category
    res_item = await add_budget_category(
        {"type": "item", "value": "TEST_ADMIN_ITEM"},
        db_session,
        current_user=admin
    )
    assert "TEST_ADMIN_ITEM" in res_item["item_categories"]
