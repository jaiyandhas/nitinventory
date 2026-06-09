import pytest
from fastapi import HTTPException
from sqlalchemy import select
from app.models.user import User, Department
from app.models.budget import BudgetMaster, FinancialYear
from app.routers.admin import (
    get_budget_categories,
    add_budget_category,
    delete_budget_category,
    create_budget
)

@pytest.mark.asyncio
async def test_budget_category_deletion_flow(db_session):
    """Test full cycle of adding categories via Dean, deleting via Admin, and safety/permission checks."""
    db_session.commit = db_session.flush

    # 1. Fetch users
    adm_res = await db_session.execute(select(User).where(User.email == "admin@nitt.edu"))
    admin = adm_res.scalar_one()

    dean_res = await db_session.execute(select(User).where(User.email == "dean.pd@nitt.edu"))
    dean = dean_res.scalar_one()

    dept_res = await db_session.execute(select(Department).where(Department.short_code == "CSE"))
    dept = dept_res.scalar_one()
    
    fy_res = await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True))
    fy = fy_res.scalar_one()

    # 2. Dean tries to add custom expenditure category -> Should fail (403 Forbidden)
    with pytest.raises(HTTPException) as exc_info:
        await add_budget_category(
            {"type": "source_of_fund", "value": "DEAN_SPECIAL_EXP"},
            db_session,
            current_user=dean
        )
    assert exc_info.value.status_code == 403

    # 2b. Admin adds custom expenditure category
    cats_post = await add_budget_category(
        {"type": "source_of_fund", "value": "DEAN_SPECIAL_EXP"},
        db_session,
        current_user=admin
    )
    assert "DEAN_SPECIAL_EXP" in cats_post["source_of_fund_categories"]
    assert "DEAN_SPECIAL_EXP" in cats_post["added_by_dean"]["source_of_fund"]

    # 3. Non-admin (Dean) tries to delete it -> Should fail (403 Forbidden)
    with pytest.raises(HTTPException) as exc_info:
        await delete_budget_category(
            type="source_of_fund",
            value="DEAN_SPECIAL_EXP",
            db=db_session,
            current_user=dean
        )
    assert exc_info.value.status_code == 403
    assert "Only admins" in exc_info.value.detail

    # 4. Admin tries to delete a category that does not exist -> Should fail (400 Bad Request)
    with pytest.raises(HTTPException) as exc_info:
        await delete_budget_category(
            type="source_of_fund",
            value="NON_EXISTENT_EXP_XYZ",
            db=db_session,
            current_user=admin
        )
    assert exc_info.value.status_code == 400
    assert "does not exist" in exc_info.value.detail

    # 5. Create a budget file using this new category
    await create_budget({
        "department_id": dept.id,
        "financial_year_id": fy.id,
        "source_of_fund": "DEAN_SPECIAL_EXP",
        "item_name": "Dean Test Item",
        "category": "computer",
        "unit_cost": 10000.0,
        "quantity": 2,
        "file_no": f"NITT/F.No.0001/DEANSPEC/{fy.label.upper()}/{dept.short_code.upper()}"
    }, db_session, _=dean)

    # 6. Admin tries to delete the category while in use -> Should fail (400 Bad Request)
    with pytest.raises(HTTPException) as exc_info:
        await delete_budget_category(
            type="source_of_fund",
            value="DEAN_SPECIAL_EXP",
            db=db_session,
            current_user=admin
        )
    assert exc_info.value.status_code == 400
    assert "is in use" in exc_info.value.detail

    # 7. Delete the budget master entries to release the category usage
    # (Just delete from db_session directly for clean test isolation)
    await db_session.execute(
        BudgetMaster.__table__.delete().where(BudgetMaster.source_of_fund == "DEAN_SPECIAL_EXP")
    )
    await db_session.flush()

    # 8. Admin deletes the category -> Should succeed
    final_cats = await delete_budget_category(
        type="source_of_fund",
        value="DEAN_SPECIAL_EXP",
        db=db_session,
        current_user=admin
    )
    assert "DEAN_SPECIAL_EXP" not in final_cats["source_of_fund_categories"]
    assert "DEAN_SPECIAL_EXP" not in final_cats["added_by_dean"]["source_of_fund"]
