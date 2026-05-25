from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, RoleManager
from app.models.budget import BudgetMaster, FinancialYear, ProcurementManager

router = APIRouter(prefix="/api/budget", tags=["budget"])


@router.get("/financial-years")
async def get_financial_years(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(FinancialYear).order_by(FinancialYear.start_date.desc()))
    return [{"id": fy.id, "label": fy.label, "is_active": fy.is_active} for fy in result.scalars()]


@router.get("/procurement-methods")
async def get_procurement_methods(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(ProcurementManager))
    return [{"id": p.id, "name": p.name, "description": p.description} for p in result.scalars()]


@router.get("/files")
async def get_budget_files(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Budget files selectable for PR creation. Scoped to user's department."""
    now = datetime.utcnow().date()
    fy_result = await db.execute(
        select(FinancialYear).where(
            and_(FinancialYear.start_date <= now, FinancialYear.end_date >= now)
        )
    )
    fy = fy_result.scalar_one_or_none()
    if not fy:
        return []

    query = select(BudgetMaster).where(
        and_(BudgetMaster.financial_year_id == fy.id, BudgetMaster.department_id == user.department_id)
    )
    result = await db.execute(query)
    entries = result.scalars().all()
    return [
        {
            "id": b.id, "item_name": b.item_name, "category": b.category,
            "file_no": b.file_no, "total_cost": b.total_cost,
            "available_amount": b.available_amount,
            "unit_cost": b.unit_cost, "quantity": b.quantity,
        }
        for b in entries
    ]


@router.get("/department-faculty")
async def department_faculty(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Faculty in the same department (for PR nominee selection)."""
    if not user.department_id:
        return []
    result = await db.execute(
        select(User)
        .join(RoleManager, User.role_id == RoleManager.id)
        .where(
            and_(User.department_id == user.department_id, RoleManager.group_key == "faculty", User.id != user.id)
        )
        .order_by(User.name)
    )
    return [{"id": u.id, "name": u.name, "email": u.email} for u in result.scalars().all()]


@router.get("/overview")
async def budget_overview(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Department budget overview: total, locked, deducted, available."""
    now = datetime.utcnow().date()
    fy_result = await db.execute(
        select(FinancialYear).where(
            and_(FinancialYear.start_date <= now, FinancialYear.end_date >= now)
        )
    )
    fy = fy_result.scalar_one_or_none()
    if not fy:
        return {"total": 0, "locked": 0, "deducted": 0, "available": 0}

    dept_id = user.department_id
    query = select(BudgetMaster).where(BudgetMaster.financial_year_id == fy.id)
    if dept_id:
        query = query.where(BudgetMaster.department_id == dept_id)
        
    result = await db.execute(query)
    entries = result.scalars().all()
    total = sum(b.total_cost for b in entries)
    locked = sum(b.locked_amount for b in entries)
    deducted = sum(b.deducted_amount for b in entries)
    return {"total": total, "locked": locked, "deducted": deducted, "available": total - locked - deducted}
