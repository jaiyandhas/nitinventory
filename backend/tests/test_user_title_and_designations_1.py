import pytest
from fastapi import HTTPException
from sqlalchemy import select
from app.models.user import User
from app.models.budget import Settings
from app.routers.admin import add_designation, delete_designation, update_user, create_user
from app.routers.auth import public_designations, register, update_profile

@pytest.mark.asyncio
async def test_user_title_and_designations(db_session):
    """Test title and designations features for users: custom additions, constraints, registration, updates."""
    db_session.commit = db_session.flush

    # 1. Fetch users
    admin = (await db_session.execute(select(User).where(User.email == "admin@nitt.edu"))).scalar_one()
    dean = (await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))).scalar_one()

    # 2. Verify non-admin is rejected from adding designation
    with pytest.raises(HTTPException) as exc_info:
        await add_designation(
            {"value": "New Test Designation"},
            db_session,
            user=dean
        )
    assert exc_info.value.status_code == 403

    # 3. Verify admin can add designation
    res = await add_designation(
        {"value": "New Test Designation"},
        db_session,
        user=admin
    )
    assert "New Test Designation" in res["designations"]

    # 4. Verify duplicate addition is rejected
    with pytest.raises(HTTPException) as exc_info:
        await add_designation(
            {"value": "New Test Designation"},
            db_session,
            user=admin
        )
    assert exc_info.value.status_code == 400
    assert "already exists" in exc_info.value.detail

    # 5. Verify public designations list endpoint works
    public_list = await public_designations(db_session)
    assert "New Test Designation" in public_list

    # 6. Verify non-admin is rejected from deleting designations
    with pytest.raises(HTTPException) as exc_info:
        await delete_designation(
            "New Test Designation",
            db_session,
            user=dean
        )
    assert exc_info.value.status_code == 403

    # 7. Verify deletion fails if designation is assigned to active users
    # Assign the new designation to a user
    dean.designation = "New Test Designation"
    await db_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await delete_designation(
            "New Test Designation",
            db_session,
            user=admin
        )
    assert exc_info.value.status_code == 400
    assert "currently assigned to users" in exc_info.value.detail

    # De-assign
    dean.designation = "Dean P&D"
    await db_session.flush()

    # 8. Verify deletion works if unused
    res_del = await delete_designation(
        "New Test Designation",
        db_session,
        user=admin
    )
    assert "New Test Designation" not in res_del["designations"]

    # 9. Verify title updating via admin update_user
    # Reset dean's title and update it
    dean.title = "Mr."
    await db_session.flush()
    await update_user(dean.id, {"title": "Dr."}, db_session)
    assert dean.title == "Dr."

    # 10. Verify title during user creation
    new_user_res = await create_user(
        {
            "title": "Prof.",
            "name": "Test Faculty Member",
            "email": "testfac@nitt.edu",
            "password": "Password@123",
            "designation": "Associate Professor",
            "role_id": dean.role_id,
            "department_id": dean.department_id,
            "is_approved": True
        },
        db_session
    )
    created_user_id = new_user_res["id"]
    created_user = (await db_session.execute(select(User).where(User.id == created_user_id))).scalar_one()
    assert created_user.title == "Prof."
