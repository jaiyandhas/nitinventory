from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime

from app.core.database import get_db
from app.core.deps import get_current_user, require_own_department
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
            "file_no": b.file_no, 
            "total_cost": b.total_allocation,
            "total_allocation": b.total_allocation,
            "available_amount": b.available_balance,
            "available_balance": b.available_balance,
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
        return {
            "total": 0, "locked": 0, "deducted": 0, "available": 0,
            "total_allocation": 0, "committed_amount": 0, "utilized_amount": 0, "available_balance": 0
        }

    dept_id = user.department_id
    query = select(BudgetMaster).where(BudgetMaster.financial_year_id == fy.id)
    if dept_id:
        query = query.where(BudgetMaster.department_id == dept_id)
        
    result = await db.execute(query)
    entries = result.scalars().all()
    total = sum(b.total_allocation for b in entries)
    locked = sum(b.committed_amount for b in entries)
    deducted = sum(b.utilized_amount for b in entries)
    return {
        "total": total, "locked": locked, "deducted": deducted, "available": total - locked - deducted,
        "total_allocation": total, "committed_amount": locked, "utilized_amount": deducted, "available_balance": total - locked - deducted
    }


@router.get("/department-committee")
async def get_department_committee(db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    from app.models.user import Department
    if not user.department_id:
        return {}
    await db.refresh(user, ["department"])
    dept = user.department
    if not dept:
        return {}
    
    expert1 = None
    expert2 = None
    director_faculty = None
    if dept.expert1_id:
        expert1_res = await db.execute(select(User).where(User.id == dept.expert1_id))
        expert1 = expert1_res.scalar_one_or_none()
    if dept.expert2_id:
        expert2_res = await db.execute(select(User).where(User.id == dept.expert2_id))
        expert2 = expert2_res.scalar_one_or_none()
    if dept.director_faculty_id:
        director_faculty_res = await db.execute(select(User).where(User.id == dept.director_faculty_id))
        director_faculty = director_faculty_res.scalar_one_or_none()

    return {
        "department_id": dept.id,
        "department_name": dept.name,
        "expert1_id": dept.expert1_id,
        "expert2_id": dept.expert2_id,
        "director_faculty_id": dept.director_faculty_id,
        "expert1": {"id": expert1.id, "name": expert1.name, "email": expert1.email} if expert1 else None,
        "expert2": {"id": expert2.id, "name": expert2.name, "email": expert2.email} if expert2 else None,
        "director_faculty": {"id": director_faculty.id, "name": director_faculty.name, "email": director_faculty.email} if director_faculty else None,
    }


@router.post("/department-committee")
async def update_department_committee(body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    from fastapi import HTTPException
    await db.refresh(user, ["role"])
    if not user.role or user.role.group_key != "hod":
        raise HTTPException(status_code=403, detail="Only HOD can update department committee experts")
    if not user.department_id:
        raise HTTPException(status_code=400, detail="User has no department assigned")
    
    await db.refresh(user, ["department"])
    dept = user.department
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    expert1_id = body.get("expert1_id")
    expert2_id = body.get("expert2_id")
    
    if expert1_id:
        u1_res = await db.execute(select(User).where(and_(User.id == expert1_id, User.department_id == user.department_id)))
        if not u1_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Expert 1 must be a faculty member in your department")
    if expert2_id:
        u2_res = await db.execute(select(User).where(and_(User.id == expert2_id, User.department_id == user.department_id)))
        if not u2_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Expert 2 must be a faculty member in your department")
            
    if expert1_id and expert2_id and expert1_id == expert2_id:
        raise HTTPException(status_code=400, detail="Expert 1 and Expert 2 must be different faculty members")

    dept.expert1_id = expert1_id
    dept.expert2_id = expert2_id
    await db.commit()
    return {"message": "Department committee experts updated successfully"}


@router.get("/director/committees")
async def director_get_committees(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    from app.models.user import Department
    await db.refresh(user, ["role"])
    if not user.role or (user.role.value != "director" and user.role.group_key != "admin"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.execute(select(Department).order_by(Department.short_code))
    depts = result.scalars().all()
    
    users_res = await db.execute(select(User))
    users_map = {u.id: u for u in users_res.scalars()}
    
    serialized = []
    for d in depts:
        expert1 = users_map.get(d.expert1_id) if d.expert1_id else None
        expert2 = users_map.get(d.expert2_id) if d.expert2_id else None
        director_faculty = users_map.get(d.director_faculty_id) if d.director_faculty_id else None
        
        serialized.append({
            "department_id": d.id,
            "department_name": d.name,
            "department_code": d.short_code,
            "expert1_id": d.expert1_id,
            "expert2_id": d.expert2_id,
            "director_faculty_id": d.director_faculty_id,
            "expert1": {"id": expert1.id, "name": expert1.name, "email": expert1.email} if expert1 else None,
            "expert2": {"id": expert2.id, "name": expert2.name, "email": expert2.email} if expert2 else None,
            "director_faculty": {"id": director_faculty.id, "name": director_faculty.name, "email": director_faculty.email} if director_faculty else None,
        })
    return serialized


@router.post("/director/committees")
async def director_update_committee(body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    from app.models.user import Department
    await db.refresh(user, ["role"])
    if not user.role or (user.role.value != "director" and user.role.group_key != "admin"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    dept_id = body.get("department_id")
    director_faculty_id = body.get("director_faculty_id")
    
    dept_res = await db.execute(select(Department).where(Department.id == dept_id))
    dept = dept_res.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    if director_faculty_id:
        u_res = await db.execute(select(User).where(User.id == director_faculty_id))
        u = u_res.scalar_one_or_none()
        if not u:
            raise HTTPException(status_code=400, detail="Selected user not found")
        
    dept.director_faculty_id = director_faculty_id
    await db.commit()
    return {"message": "Director nominee updated successfully"}


@router.get("/all-faculties")
async def get_all_faculties(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(User)
        .join(RoleManager, User.role_id == RoleManager.id)
        .where(and_(RoleManager.group_key == "faculty", User.is_approved == True))
        .order_by(User.name)
    )
    return [{"id": u.id, "name": u.name, "email": u.email, "department_id": u.department_id} for u in result.scalars().all()]


@router.post("/files/{budget_id}/committee")
async def assign_budget_committee(budget_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    from fastapi import HTTPException
    await db.refresh(user, ["role"])
    if not user.role or user.role.group_key != "hod":
        raise HTTPException(status_code=403, detail="Only HOD can nominate experts")

    result = await db.execute(select(BudgetMaster).where(BudgetMaster.id == budget_id))
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Budget file not found")

    fy_res = await db.execute(select(FinancialYear).where(FinancialYear.id == b.financial_year_id))
    fy = fy_res.scalar_one_or_none()
    if fy and fy.is_closed:
        raise HTTPException(status_code=400, detail="The financial year for this budget is closed. Budgets in closed financial years cannot be modified.")

    if b.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="You can only configure committees for your own department's budget files")

    expert1_id = body.get("expert1_id")
    expert2_id = body.get("expert2_id")

    if expert1_id:
        u1_res = await db.execute(select(User).where(and_(User.id == expert1_id, User.department_id == user.department_id)))
        if not u1_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Expert 1 must be a faculty member in your department")
    if expert2_id:
        u2_res = await db.execute(select(User).where(and_(User.id == expert2_id, User.department_id == user.department_id)))
        if not u2_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Expert 2 must be a faculty member in your department")

    if expert1_id and expert2_id and expert1_id == expert2_id:
        raise HTTPException(status_code=400, detail="Expert 1 and Expert 2 must be different faculty members")

    b.expert1_id = expert1_id
    b.expert2_id = expert2_id

    # Update active PRs associated with this budget file to use the new committee
    # Only update PRs that are in the "Administrative Approval" phase (or haven't started flow yet)
    from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem, PurchaseRequestFlow
    from app.models.budget import PhaseManager
    from sqlalchemy import or_
    active_prs_res = await db.execute(
        select(PurchaseRequest)
        .join(PurchaseRequestItem, PurchaseRequest.id == PurchaseRequestItem.purchase_request_id)
        .join(PurchaseRequestFlow, PurchaseRequest.id == PurchaseRequestFlow.purchase_request_id, isouter=True)
        .join(PhaseManager, PurchaseRequestFlow.phase_id == PhaseManager.id, isouter=True)
        .where(
            and_(
                PurchaseRequestItem.budget_file_id == budget_id,
                PurchaseRequest.current_status.notin_(["completed", "rejected", "cancelled"]),
                or_(
                    PhaseManager.phase_name == "Administrative Approval",
                    PurchaseRequestFlow.id == None
                )
            )
        )
    )
    for pr_item in active_prs_res.scalars().all():
        pr_item.faculty1_id = expert1_id
        pr_item.faculty2_id = expert2_id

    await db.commit()
    return {"message": "Budget technical committee nominated successfully"}


@router.post("/files/{budget_id}/director-committee")
async def assign_budget_director_committee(budget_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    await db.refresh(user, ["role"])
    if not user.role or (user.role.value != "director" and user.role.group_key != "admin"):
        raise HTTPException(status_code=403, detail="Only Director or Admin can nominate Director nominee")

    result = await db.execute(select(BudgetMaster).where(BudgetMaster.id == budget_id))
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Budget file not found")

    fy_res = await db.execute(select(FinancialYear).where(FinancialYear.id == b.financial_year_id))
    fy = fy_res.scalar_one_or_none()
    if fy and fy.is_closed:
        raise HTTPException(status_code=400, detail="The financial year for this budget is closed. Budgets in closed financial years cannot be modified.")

    director_faculty_id = body.get("director_faculty_id")
    if director_faculty_id:
        u_res = await db.execute(select(User).where(User.id == director_faculty_id))
        if not u_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Nominated user not found")

    b.director_faculty_id = director_faculty_id

    # Update active PRs associated with this budget file to use the new director nominee
    # Only update PRs that are in the "Administrative Approval" phase (or haven't started flow yet)
    from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem, PurchaseRequestFlow
    from app.models.budget import PhaseManager
    from sqlalchemy import or_
    active_prs_res = await db.execute(
        select(PurchaseRequest)
        .join(PurchaseRequestItem, PurchaseRequest.id == PurchaseRequestItem.purchase_request_id)
        .join(PurchaseRequestFlow, PurchaseRequest.id == PurchaseRequestFlow.purchase_request_id, isouter=True)
        .join(PhaseManager, PurchaseRequestFlow.phase_id == PhaseManager.id, isouter=True)
        .where(
            and_(
                PurchaseRequestItem.budget_file_id == budget_id,
                PurchaseRequest.current_status.notin_(["completed", "rejected", "cancelled"]),
                or_(
                    PhaseManager.phase_name == "Administrative Approval",
                    PurchaseRequestFlow.id == None
                )
            )
        )
    )
    for pr_item in active_prs_res.scalars().all():
        pr_item.faculty3_id = director_faculty_id

    await db.commit()
    return {"message": "Director nominee assigned successfully to budget file"}


@router.get("/users")
async def get_all_users(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(User).where(User.is_approved == True).order_by(User.name)
    )
    return [{"id": u.id, "name": u.name, "email": u.email, "department_id": u.department_id} for u in result.scalars().all()]

