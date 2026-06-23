from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc, update
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import Optional

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, RoleManager, Department
from app.models.budget import BudgetMaster, FinancialYear
from app.models.administrative_approval import AdministrativeApproval, AdministrativeApprovalHistory

router = APIRouter(prefix="/api/administrative-approvals", tags=["administrative-approvals"])


async def send_notification(db: AsyncSession, user_id: int, title: str, message: str, link: Optional[str] = None):
    from app.models.notification import Notification
    notif = Notification(user_id=user_id, title=title, message=message, link=link)
    db.add(notif)
    await db.flush()


async def get_users_by_group(db: AsyncSession, group_key: str, dept_id: Optional[int] = None) -> list:
    from app.models.user import User as UserModel, RoleManager
    query = select(UserModel).join(RoleManager, UserModel.role_id == RoleManager.id)
    if group_key.lower() == "hod" and dept_id:
        query = query.where(and_(UserModel.department_id == dept_id, RoleManager.group_key == "hod"))
    else:
        query = query.where(or_(
            RoleManager.group_key.ilike(group_key),
            RoleManager.value.ilike(group_key),
            RoleManager.name.ilike(group_key)
        ))
    res = await db.execute(query)
    return list(res.scalars().all())


async def notify_group(db: AsyncSession, group_key: str, dept_id: Optional[int], title: str, message: str, link: Optional[str] = None):
    users = await get_users_by_group(db, group_key, dept_id)
    for u in users:
        await send_notification(db, u.id, title, message, link)


async def resolve_next_step(db: AsyncSession, aa: AdministrativeApproval, steps: list, current_idx: int) -> Optional[dict]:
    for idx in range(current_idx + 1, len(steps)):
        step = steps[idx]
        if step.skip_condition:
            from app.services.evaluator import safe_eval
            context = {"aa": aa}
            try:
                should_skip = safe_eval(step.skip_condition, context)
            except Exception:
                should_skip = False
            if should_skip:
                continue
        return {"step": step, "idx": idx}
    return None


async def resolve_aa_pending_step(db: AsyncSession, aa: AdministrativeApproval, steps: list, aa_history: list) -> Optional[dict]:
    # Trace history to find approved indices
    sorted_history = sorted(aa_history, key=lambda x: x.acted_at)
    approved_indices = set()
    for i, h in enumerate(sorted_history):
        status = h.status
        role = h.approver_role.lower()
        if status == "Submitted":
            approved_indices = set()
        elif status == "Approved":
            found_idx = -1
            for idx, step in enumerate(steps):
                if idx not in approved_indices and step.user_group.lower() == role:
                    found_idx = idx
                    break
            if found_idx != -1:
                approved_indices.add(found_idx)
        elif status in ("Returned", "Returned to PI", "Send Back"):
            target_role = None
            for prev_h in reversed(sorted_history[:i]):
                if prev_h.status in ("Approved", "Submitted") and prev_h.approver_role.lower() != role:
                    target_role = prev_h.approver_role.lower()
                    break
            if target_role and target_role != "pi":
                target_idx = -1
                for idx in sorted(approved_indices, reverse=True):
                    if steps[idx].user_group.lower() == target_role:
                        target_idx = idx
                        break
                if target_idx != -1:
                    approved_indices = {idx for idx in approved_indices if idx < target_idx}
                else:
                    approved_indices = set()
            else:
                approved_indices = set()

    # Find first unapproved, non-skipped step
    from app.services.evaluator import safe_eval
    for idx, step in enumerate(steps):
        if idx in approved_indices:
            continue
        if step.skip_condition:
            context = {"aa": aa}
            try:
                should_skip = safe_eval(step.skip_condition, context)
            except Exception:
                should_skip = False
            if should_skip:
                continue
        return {"step": step, "idx": idx}
    return None


async def realign_aa_routing(db: AsyncSession, aa: AdministrativeApproval) -> None:
    # Skip finalized stages, nominee steps or if returned to PI
    if not aa.status or aa.status in ("Administrative Approval Granted", "Rejected") or aa.status == "Returned to PI":
        return
    if aa.pending_with and aa.pending_with.lower().startswith("nominee"):
        return
        
    # Lazy relationship loading checks
    await db.refresh(aa, ["budget_file", "pi"])
    if aa.budget_file:
        await db.refresh(aa.budget_file, ["financial_year"])
    if aa.pi:
        await db.refresh(aa.pi, ["department"])

    source_of_fund_id = None
    if aa.budget_file and aa.budget_file.source_of_fund:
        from app.models.budget import SourceOfFund
        sof_res = await db.execute(
            select(SourceOfFund.id).where(SourceOfFund.name == aa.budget_file.source_of_fund)
        )
        source_of_fund_id = sof_res.scalar_one_or_none()
        
    steps = await _get_aa_workflow_steps(db, aa.total_cost, aa.mode_of_procurement, source_of_fund_id)
    if not steps:
        return

    # Fetch approval history from DB to avoid cached states
    from app.models.administrative_approval import AdministrativeApprovalHistory
    history_res = await db.execute(
        select(AdministrativeApprovalHistory)
        .where(AdministrativeApprovalHistory.approval_id == aa.id)
    )
    aa_history = history_res.scalars().all()

    # Resolve expected next step
    next_step_data = await resolve_aa_pending_step(db, aa, steps, aa_history)
    expected_pending_with = None
    expected_status = None
    if next_step_data:
        expected_pending_with = next_step_data["step"].user_group
        # Keep "Returned to {role}" status if it matches the expected pending role
        if aa.status and aa.status.startswith("Returned to ") and aa.status.replace("Returned to ", "").lower() == expected_pending_with.lower():
            expected_status = aa.status
        else:
            expected_status = f"Pending with {expected_pending_with}"
    else:
        expected_pending_with = None
        expected_status = "Administrative Approval Granted"

    # If it is out of sync, heal it!
    if aa.pending_with != expected_pending_with or aa.status != expected_status:
        aa.pending_with = expected_pending_with
        aa.status = expected_status
        if expected_status == "Administrative Approval Granted":
            aa.approved_at = datetime.now()
            # Generate AA number
            dept_code = aa.pi.department.short_code if aa.pi and aa.pi.department else "GEN"
            fy_label = aa.budget_file.financial_year.label if aa.budget_file and aa.budget_file.financial_year else "GEN"
            aa.aa_number = f"AA/{fy_label}/{dept_code}/{aa.id:03d}"
            # Add to committed amount
            if aa.budget_file:
                aa.budget_file.committed_amount += aa.total_cost
        await db.commit()



async def _get_aa_workflow_steps(db: AsyncSession, total_cost: float, mode_of_procurement: str, source_of_fund_id: Optional[int] = None) -> list:
    from app.models.administrative_approval import AdministrativeApprovalWorkflow
    from app.models.budget import PurchaseCategory, ProcurementManager
    from sqlalchemy import select, and_
    from sqlalchemy.orm import selectinload
    
    mop_res = await db.execute(select(ProcurementManager))
    mops = mop_res.scalars().all()
    matching_mop = None
    
    # Translate frontend mode_of_procurement to standard names
    mop_lower = mode_of_procurement.lower() if mode_of_procurement else ""
    if "gfr 154" in mop_lower:
        mop_lower = "direct purchase"
    elif "gfr 155" in mop_lower or "committee purchase" in mop_lower:
        mop_lower = "direct purchase"
    elif "pac" in mop_lower or "nomination" in mop_lower:
        mop_lower = "proprietary purchase"
    elif "limited tender" in mop_lower:
        mop_lower = "limited tender"
    elif "global tender" in mop_lower:
        mop_lower = "cppp"
        
    for m in mops:
        if m.name.lower() in mop_lower or mop_lower in m.name.lower():
            matching_mop = m
            break
            
    proc_id = matching_mop.id if matching_mop else (mops[0].id if mops else None)
    
    cat = None
    if proc_id:
        cat_stmt = select(PurchaseCategory).where(
            and_(
                PurchaseCategory.procurement_id == proc_id,
                PurchaseCategory.min_amount <= total_cost,
                PurchaseCategory.max_amount >= total_cost,
                PurchaseCategory.is_active == True,
            )
        )
        cat_res = await db.execute(cat_stmt)
        cat = cat_res.scalars().first()
        
    from sqlalchemy import or_

    filters = [AdministrativeApprovalWorkflow.is_enabled == True]
    
    # Category filter
    if cat is not None:
        filters.append(or_(
            AdministrativeApprovalWorkflow.category_id == cat.id,
            AdministrativeApprovalWorkflow.category_id == None
        ))
    else:
        filters.append(AdministrativeApprovalWorkflow.category_id == None)
        
    # Procurement filter
    if proc_id is not None:
        filters.append(or_(
            AdministrativeApprovalWorkflow.procurement_id == proc_id,
            AdministrativeApprovalWorkflow.procurement_id == None
        ))
    else:
        filters.append(AdministrativeApprovalWorkflow.procurement_id == None)
        
    # Source of fund filter
    if source_of_fund_id is not None:
        filters.append(or_(
            AdministrativeApprovalWorkflow.source_of_fund_id == source_of_fund_id,
            AdministrativeApprovalWorkflow.source_of_fund_id == None
        ))
    else:
        filters.append(AdministrativeApprovalWorkflow.source_of_fund_id == None)
        
    # Purchase type filter
    filters.append(or_(
        AdministrativeApprovalWorkflow.purchase_type == "research",
        AdministrativeApprovalWorkflow.purchase_type == None
    ))
    
    steps_res = await db.execute(
        select(AdministrativeApprovalWorkflow)
        .options(selectinload(AdministrativeApprovalWorkflow.role))
        .where(and_(*filters))
    )
    candidate_steps = steps_res.scalars().all()
    
    # Specificity Scoring & Merging
    steps_by_key = {}
    for step in candidate_steps:
        key = (step.source_of_fund_id, step.procurement_id, step.category_id, step.purchase_type)
        if key not in steps_by_key:
            steps_by_key[key] = []
        steps_by_key[key].append(step)

    # Check if a key is a refinement of another key (key_a is strictly more specific than key_b)
    def is_refinement(key_a, key_b):
        has_strictly_more_specific = False
        for val_a, val_b in zip(key_a, key_b):
            if val_b is not None:
                if val_a != val_b:
                    return False
            else:
                if val_a is not None:
                    has_strictly_more_specific = True
        return has_strictly_more_specific

    # Discard keys that are overridden by a more specific refinement key
    keys_to_discard = set()
    all_keys = list(steps_by_key.keys())
    for key_a in all_keys:
        for key_b in all_keys:
            if key_a != key_b and is_refinement(key_a, key_b):
                keys_to_discard.add(key_b)

    active_keys = [k for k in all_keys if k not in keys_to_discard]

    # Specificity Scoring & Merging among active keys
    best_steps = {}
    for key in active_keys:
        score = 0
        if source_of_fund_id is not None and key[0] == source_of_fund_id:
            score += 1000
        if cat is not None and key[2] == cat.id:
            score += 100
        if proc_id is not None and key[1] == proc_id:
            score += 10
        if key[3] == "research":
            score += 1

        for step in steps_by_key[key]:
            order = step.step_order
            if order not in best_steps or score > best_steps[order][1]:
                best_steps[order] = (step, score)

    steps = [best_steps[order][0] for order in sorted(best_steps.keys())]

    return steps


@router.post("")
async def create_aa(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Retrieve user role
    await db.refresh(user, ["role"])
    group_key = user.role.group_key if user.role else None
    
    # Precondition 3: PI shall have access only to the budget allocations assigned to their project/source of fund.
    if group_key not in ("faculty", "hod"):
        raise HTTPException(status_code=403, detail="Only PI/Faculty can create Administrative Approval requests.")
        
    budget_file_id = body.get("budget_file_id")
    item_description = body.get("item_description")
    gst_rate = body.get("gst_rate")
    mode_of_procurement = body.get("mode_of_procurement")
    justification = body.get("justification")
    quantity = body.get("quantity", 1)
    
    # Compliance fields
    item_category = body.get("item_category")
    stock_availability = body.get("stock_availability")
    present_stock = body.get("present_stock")
    prev_file_no = body.get("prev_file_no")
    justification_procurement = body.get("justification_procurement")
    generic_specification_declaration = body.get("generic_specification_declaration", False)
    
    # Validation Rules
    if not budget_file_id:
        raise HTTPException(status_code=400, detail="Budget File is required.")
    try:
        quantity = int(quantity)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Quantity must be a valid integer.")
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
    if not item_description or not item_description.strip():
        raise HTTPException(status_code=400, detail="Item Description is mandatory.")
    if gst_rate is None:
        raise HTTPException(status_code=400, detail="GST (%) is mandatory.")
    try:
        gst_rate = float(gst_rate)
    except ValueError:
        raise HTTPException(status_code=400, detail="GST must be a valid number.")
    if gst_rate < 0:
        raise HTTPException(status_code=400, detail="GST must be greater than or equal to zero.")
    if not mode_of_procurement or not mode_of_procurement.strip():
        raise HTTPException(status_code=400, detail="Mode of Procurement is mandatory.")
    if not justification or not justification.strip():
        raise HTTPException(status_code=400, detail="Justification for Purchase is mandatory.")
        
    # Compliance validation
    if not item_category or item_category.strip() not in ("Assets", "Consumables"):
        raise HTTPException(status_code=400, detail="Item Category (Assets/Consumables) is mandatory.")
    if not stock_availability or stock_availability.strip() not in ("Yes", "No"):
        raise HTTPException(status_code=400, detail="Stock availability (Yes/No) is mandatory.")
    if stock_availability == "Yes":
        if not present_stock or not present_stock.strip():
            raise HTTPException(status_code=400, detail="Present stock is required when stock is available.")
        if not prev_file_no or not prev_file_no.strip():
            raise HTTPException(status_code=400, detail="Reference of previous file number is required when stock is available.")
        if not justification_procurement or not justification_procurement.strip():
            raise HTTPException(status_code=400, detail="Justification for present procurement is required when stock is available.")
    if not generic_specification_declaration:
        raise HTTPException(status_code=400, detail="You must check and confirm the generic specification declaration.")
        
    # Retrieve budget master with lock
    result = await db.execute(
        select(BudgetMaster)
        .options(
            selectinload(BudgetMaster.financial_year),
            selectinload(BudgetMaster.department)
        )
        .where(BudgetMaster.id == budget_file_id)
        .with_for_update()
    )
    budget_file = result.scalar_one_or_none()
    if not budget_file:
        raise HTTPException(status_code=404, detail="Budget allocation not found.")
        
    # Precondition 3 check: PI shall have access only to the budget allocations assigned to their project/source of fund.
    if group_key == "faculty" and budget_file.allocated_initiator_id != user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this budget allocation.")
        
    # Precondition 1 check: Budget Allocation must be completed by Dean Budget.
    if budget_file.file_no.upper().startswith("TEMP"):
        raise HTTPException(status_code=400, detail="Budget allocation is temporary and must be finalized by Dean Budget.")
        
    # Precondition 2 check: HOD Nominee selection must be completed (with department fallback).
    expert1 = budget_file.expert1_id or (budget_file.department.expert1_id if budget_file.department else None)
    expert2 = budget_file.expert2_id or (budget_file.department.expert2_id if budget_file.department else None)
    has_nominees = budget_file.nominee_ids and len(budget_file.nominee_ids) > 0
    if not expert1 and not expert2 and not has_nominees:
        raise HTTPException(
            status_code=400,
            detail="HOD Nominee selection is not completed for this budget. Please contact HOD to configure nominees."
        )
        
    # System Calculations
    total_cost = body.get("total_cost")
    gst_amount = body.get("gst_amount")
    if total_cost is not None and gst_amount is not None:
        try:
            total_cost = float(total_cost)
            gst_amount = float(gst_amount)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid total_cost or gst_amount.")
    else:
        base_cost = quantity * budget_file.unit_cost
        gst_amount = base_cost * (gst_rate / 100.0)
        total_cost = base_cost + gst_amount
    
    # Validation Rule 2: Total Cost shall not exceed the Available Budget Balance.
    if total_cost > budget_file.available_balance:
        raise HTTPException(
            status_code=422,
            detail=f"Total Cost ₹{total_cost:,.2f} exceeds Available Budget Balance ₹{budget_file.available_balance:,.2f}."
        )
        
    # Query workflow steps to set initial status and pending_with
    source_of_fund_id = None
    if budget_file.source_of_fund:
        from app.models.budget import SourceOfFund
        sof_res = await db.execute(
            select(SourceOfFund.id).where(SourceOfFund.name == budget_file.source_of_fund)
        )
        source_of_fund_id = sof_res.scalar_one_or_none()
        
    steps = await _get_aa_workflow_steps(db, total_cost, mode_of_procurement, source_of_fund_id)
    if not steps:
        raise HTTPException(status_code=422, detail="No Administrative Approval workflow configured. Please configure one in Admin Settings → Workflows.")

    # Create the AdministrativeApproval request
    aa = AdministrativeApproval(
        budget_file_id=budget_file.id,
        pi_id=user.id,
        quantity=quantity,
        item_description=item_description,
        gst_rate=gst_rate,
        mode_of_procurement=mode_of_procurement,
        justification=justification,
        gst_amount=gst_amount,
        total_cost=total_cost,
        status="Submitted",
        pending_with=None,
        item_category=item_category,
        stock_availability=stock_availability,
        present_stock=present_stock,
        prev_file_no=prev_file_no,
        justification_procurement=justification_procurement,
        generic_specification_declaration=generic_specification_declaration
    )
    db.add(aa)
    await db.flush()

    # Pre-populate nominees from budget allocation
    nominee_ids = budget_file.nominee_ids or []
    if not nominee_ids:
        # Fallback to expert1_id, expert2_id for compatibility
        if budget_file.expert1_id:
            nominee_ids.append(budget_file.expert1_id)
        if budget_file.expert2_id:
            nominee_ids.append(budget_file.expert2_id)
    
    from app.models.administrative_approval import AdministrativeApprovalNominee
    for order, nid in enumerate(nominee_ids, start=1):
        nom = AdministrativeApprovalNominee(
            approval_id=aa.id,
            nominee_id=nid,
            step_order=order,
            status="Notified"
        )
        db.add(nom)

    # Determine first step based on skip condition
    next_step_data = await resolve_next_step(db, aa, steps, -1)
    if next_step_data:
        first_step = next_step_data["step"]
        first_role = first_step.user_group
        aa.status = f"Submitted to {first_role}"
        aa.pending_with = first_step.user_group
    else:
        # If all steps are skipped (rare, but theoretically possible), auto-grant
        aa.status = "Administrative Approval Granted"
        aa.pending_with = None
        aa.approved_at = datetime.now()
        # Generate AA number
        dept_code = aa.pi.department.short_code if aa.pi.department else "GEN"
        fy_label = budget_file.financial_year.label
        aa.aa_number = f"AA/{fy_label}/{dept_code}/{aa.id:03d}"
        budget_file.committed_amount += aa.total_cost

    # Add history trail
    hist = AdministrativeApprovalHistory(
        approval_id=aa.id,
        approver_role="PI",
        approver_id=user.id,
        status="Submitted",
        remarks="Submitted for Administrative Approval"
    )
    db.add(hist)
    
    # Notify first approver group if request is active
    if aa.pending_with:
        await notify_group(
            db, 
            aa.pending_with, 
            user.department_id, 
            "New Administrative Approval Request", 
            f"A new Administrative Approval request REQ-{aa.id} has been submitted by {user.name} and is pending your action.",
            f"/administrative-approvals/{aa.id}"
        )
        
    await db.commit()
    
    return {"message": "Administrative Approval request created successfully.", "id": aa.id}


@router.get("")
async def list_aas(
    status: Optional[str] = None,
    source_of_fund: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = "created_at",
    sort_order: Optional[str] = "desc",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.refresh(user, ["role"])
    group_key = user.role.group_key if user.role else None
    
    # Always join User and BudgetMaster to avoid duplicate joins on scoping/search
    query = (
        select(AdministrativeApproval)
        .join(User, AdministrativeApproval.pi_id == User.id)
        .join(BudgetMaster, AdministrativeApproval.budget_file_id == BudgetMaster.id)
        .options(
            selectinload(AdministrativeApproval.pi).selectinload(User.department),
            selectinload(AdministrativeApproval.budget_file).selectinload(BudgetMaster.financial_year),
            selectinload(AdministrativeApproval.nominees)
        )
    )
    
    # Scope requests based on role
    if group_key == "faculty":
        from sqlalchemy import exists
        from app.models.administrative_approval import AdministrativeApprovalNominee
        nom_exists = exists().where(
            and_(
                AdministrativeApprovalNominee.approval_id == AdministrativeApproval.id,
                AdministrativeApprovalNominee.nominee_id == user.id
            )
        )
        query = query.where(
            or_(
                AdministrativeApproval.pi_id == user.id,
                nom_exists
            )
        )
    elif group_key == "hod":
        from sqlalchemy import exists
        from app.models.administrative_approval import AdministrativeApprovalNominee
        nom_exists = exists().where(
            and_(
                AdministrativeApprovalNominee.approval_id == AdministrativeApproval.id,
                AdministrativeApprovalNominee.nominee_id == user.id
            )
        )
        query = query.where(
            or_(
                User.department_id == user.department_id,
                nom_exists
            )
        )
    # ADPD and Director see all
    
    # Filter
    if status:
        query = query.where(AdministrativeApproval.status == status)
    if source_of_fund:
        query = query.where(BudgetMaster.source_of_fund == source_of_fund)
        
    # Search
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                User.name.ilike(search_pattern),
                BudgetMaster.item_name.ilike(search_pattern),
                BudgetMaster.source_of_fund.ilike(search_pattern),
                AdministrativeApproval.status.ilike(search_pattern),
                AdministrativeApproval.mode_of_procurement.ilike(search_pattern),
            )
        )
        
    # Sort
    if sort_by == "total_cost":
        if sort_order == "asc":
            query = query.order_by(AdministrativeApproval.total_cost.asc())
        else:
            query = query.order_by(AdministrativeApproval.total_cost.desc())
    elif sort_by == "pi_name":
        if sort_order == "asc":
            query = query.order_by(User.name.asc())
        else:
            query = query.order_by(User.name.desc())
    else:
        # Default: created_at
        if sort_order == "asc":
            query = query.order_by(AdministrativeApproval.created_at.asc())
        else:
            query = query.order_by(AdministrativeApproval.created_at.desc())
            
    result = await db.execute(query)
    aas = result.scalars().all()
    
    for aa in aas:
        await realign_aa_routing(db, aa)
    
    serialized = []
    for aa in aas:
      serialized.append({
          'id': aa.id,
          'aa_number': aa.aa_number or '-',
          'pi_name': aa.pi.name,
          'pi_department_id': aa.pi.department_id,
          'department': aa.pi.department.name if aa.pi.department else '-',
          'source_of_fund': aa.budget_file.source_of_fund,
          'project_code': aa.budget_file.project_code or '-',
          'item_name': aa.budget_file.item_name,
          'total_cost': aa.total_cost,
          'status': aa.status,
          'pending_with': aa.pending_with or '-',
          'submitted_date': (
              aa.created_at.isoformat() + 'Z' if aa.created_at else None
          ),
          'file_no': aa.budget_file.file_no if aa.budget_file else '',
          'pi_department_name': aa.pi.department.name if aa.pi.department else '-',
          'budget_file_id': aa.budget_file_id,
          'mode_of_procurement': aa.mode_of_procurement,
          'item_description': aa.item_description,
          'justification': aa.justification,
          'gst_rate': aa.gst_rate,
          'quantity': aa.quantity,
          'attachment_path': aa.attachment_path,
          'attachment_url': f"/static/uploads/{aa.attachment_path}" if aa.attachment_path else None,
          'item_category': aa.item_category or '-',
          'stock_availability': aa.stock_availability or '-',
          'present_stock': aa.present_stock or '-',
          'prev_file_no': aa.prev_file_no or '-',
          'justification_procurement': aa.justification_procurement or '-',
          'basis_of_estimation_path': aa.basis_of_estimation_path,
          'basis_of_estimation_url': f"/static/uploads/{aa.basis_of_estimation_path}" if aa.basis_of_estimation_path else None,
          'gem_non_availability_path': aa.gem_non_availability_path,
          'gem_non_availability_url': f"/static/uploads/{aa.gem_non_availability_path}" if aa.gem_non_availability_path else None,
          'authority_approval_path': aa.authority_approval_path,
          'authority_approval_url': f"/static/uploads/{aa.authority_approval_path}" if aa.authority_approval_path else None,
          'pac_dept_cert_path': aa.pac_dept_cert_path,
          'pac_dept_cert_url': f"/static/uploads/{aa.pac_dept_cert_path}" if aa.pac_dept_cert_path else None,
          'pac_vendor_cert_path': aa.pac_vendor_cert_path,
          'pac_vendor_cert_url': f"/static/uploads/{aa.pac_vendor_cert_path}" if aa.pac_vendor_cert_path else None,
          'generic_specification_declaration': aa.generic_specification_declaration,
          'nominees': [{
              'id': nom.id,
              'nominee_id': nom.nominee_id,
              'step_order': nom.step_order,
              'status': nom.status
          } for nom in aa.nominees] if aa.nominees else [],
      })
        
    return serialized


@router.get("/{aa_id}")
async def get_aa_detail(
    aa_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.administrative_approval import AdministrativeApprovalNominee
    # 1. Fetch simple reference and heal routing dynamically
    result = await db.execute(select(AdministrativeApproval).where(AdministrativeApproval.id == aa_id))
    aa = result.scalar_one_or_none()
    if not aa:
        raise HTTPException(status_code=404, detail="Administrative Approval request not found.")
        
    await realign_aa_routing(db, aa)
    
    # 2. Re-fetch with all relationships loaded for response serialization
    result = await db.execute(
        select(AdministrativeApproval)
        .options(
            selectinload(AdministrativeApproval.pi).selectinload(User.department),
            selectinload(AdministrativeApproval.budget_file).selectinload(BudgetMaster.financial_year),
            selectinload(AdministrativeApproval.history).selectinload(AdministrativeApprovalHistory.approver).selectinload(User.department),
            selectinload(AdministrativeApproval.nominees).selectinload(AdministrativeApprovalNominee.nominee).selectinload(User.department),
        )
        .where(AdministrativeApproval.id == aa_id)
    )
    aa = result.scalar_one_or_none()
        
    await db.refresh(user, ["role"])
    group_key = user.role.group_key if user.role else None
    
    # Allow active nominees to view the detail page
    is_active_nominee = False
    for nom in aa.nominees:
        if nom.nominee_id == user.id:
            is_active_nominee = True
            break

    if group_key == "faculty" and aa.pi_id != user.id and not is_active_nominee:
        raise HTTPException(status_code=403, detail="Access denied.")
    elif group_key == "hod" and aa.pi.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied.")
        
    history_trail = []
    for h in sorted(aa.history, key=lambda x: x.acted_at):
        history_trail.append({
            "id": h.id,
            "approver_role": h.approver_role,
            "approver_name": h.approver.name,
            "status": h.status,
            "remarks": h.remarks or "-",
            "acted_at": h.acted_at.isoformat() + "Z" if h.acted_at else None,
            "signature_url": f"/static/uploads/{h.approver.signature_path}" if (h.approver and h.approver.signature_path and h.status == "Approved") else None,
            "approver_dept": h.approver.department.short_code if (h.approver and h.approver.department) else "-",
            "designation": h.approver.designation or "-",
        })
        
    nominees_trail = []
    for nom in sorted(aa.nominees, key=lambda x: x.step_order):
        nominees_trail.append({
            "id": nom.id,
            "nominee_id": nom.nominee_id,
            "nominee_name": nom.nominee.name if nom.nominee else "Unknown",
            "nominee_email": nom.nominee.email if nom.nominee else "-",
            "step_order": nom.step_order,
            "status": nom.status,
            "remarks": nom.remarks or "-",
            "acted_at": nom.acted_at.isoformat() + "Z" if nom.acted_at else None,
            "signature_url": f"/static/uploads/{nom.nominee.signature_path}" if (nom.nominee and nom.nominee.signature_path and nom.status == "Approved") else None,
            "nominee_dept": nom.nominee.department.short_code if (nom.nominee and nom.nominee.department) else "-",
        })

    return {
        "id": aa.id,
        "aa_number": aa.aa_number or "-",
        "status": aa.status,
        "pending_with": aa.pending_with or "-",
        "created_at": aa.created_at.isoformat() + "Z" if aa.created_at else None,
        "attachment_path": aa.attachment_path,
        "attachment_url": f"/static/uploads/{aa.attachment_path}" if aa.attachment_path else None,
        "pi_signature_url": f"/static/uploads/{aa.pi.signature_path}" if aa.pi.signature_path else None,
        "pi_dept": aa.pi.department.short_code if aa.pi.department else "-",
        "pi_designation": aa.pi.designation or "-",
        
        # Compliance properties
        "item_category": aa.item_category or "-",
        "stock_availability": aa.stock_availability or "-",
        "present_stock": aa.present_stock or "-",
        "prev_file_no": aa.prev_file_no or "-",
        "justification_procurement": aa.justification_procurement or "-",
        "basis_of_estimation_path": aa.basis_of_estimation_path,
        "basis_of_estimation_url": f"/static/uploads/{aa.basis_of_estimation_path}" if aa.basis_of_estimation_path else None,
        "gem_non_availability_path": aa.gem_non_availability_path,
        "gem_non_availability_url": f"/static/uploads/{aa.gem_non_availability_path}" if aa.gem_non_availability_path else None,
        "authority_approval_path": aa.authority_approval_path,
        "authority_approval_url": f"/static/uploads/{aa.authority_approval_path}" if aa.authority_approval_path else None,
        "pac_dept_cert_path": aa.pac_dept_cert_path,
        "pac_dept_cert_url": f"/static/uploads/{aa.pac_dept_cert_path}" if aa.pac_dept_cert_path else None,
        "pac_vendor_cert_path": aa.pac_vendor_cert_path,
        "pac_vendor_cert_url": f"/static/uploads/{aa.pac_vendor_cert_path}" if aa.pac_vendor_cert_path else None,
        "generic_specification_declaration": aa.generic_specification_declaration,
        
        # Section 1: Budget Information
        "budget_info": {
            "pi_name": aa.pi.name,
            "department": aa.pi.department.name if aa.pi.department else "-",
            "department_id": aa.pi.department_id,
            "source_of_fund": aa.budget_file.source_of_fund,
            "project_code": aa.budget_file.project_code or "-",
            "financial_year": aa.budget_file.financial_year.label,
            "allocated_budget": aa.budget_file.total_allocation,
            "available_budget_balance": aa.budget_file.available_balance,
            "file_no": aa.budget_file.file_no if aa.budget_file else "-",
            "attachment_path": aa.budget_file.attachment_path,
            "attachment_url": f"/static/uploads/{aa.budget_file.attachment_path}" if aa.budget_file.attachment_path else None,
        },
        
        # Section 2: Item Information
        "item_info": {
            "item_name": aa.budget_file.item_name,
            "item_description": aa.item_description,
            "quantity": aa.quantity,
            "unit_cost": aa.budget_file.unit_cost,
            "gst_rate": aa.gst_rate,
            "gst_amount": aa.gst_amount,
            "total_cost": aa.total_cost,
        },
        
        # Section 3: Procurement Information
        "procurement_info": {
            "mode_of_procurement": aa.mode_of_procurement,
            "justification": aa.justification,
        },
        
        # Section 4: Approval History
        "history": history_trail,
        "nominees": nominees_trail,
    }


@router.post("/{aa_id}/action")
async def action_aa(
    aa_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.refresh(user, ["role"])
    group_key = user.role.group_key if user.role else None
    role_value = user.role.value if user.role else None
    
    action = body.get("action")  # "Approve", "Send Back", "Reject"
    remarks = body.get("remarks")
    
    if not action or action not in ("Approve", "Send Back", "Reject"):
        raise HTTPException(status_code=400, detail="Invalid action. Must be Approve, Send Back, or Reject.")
    if not remarks or not remarks.strip():
        raise HTTPException(status_code=400, detail="Remarks are mandatory.")
        
    # 1. Fetch simple reference and heal routing dynamically
    result = await db.execute(
        select(AdministrativeApproval)
        .where(AdministrativeApproval.id == aa_id)
        .with_for_update()
    )
    aa = result.scalar_one_or_none()
    if not aa:
        raise HTTPException(status_code=404, detail="Administrative Approval request not found.")
        
    await realign_aa_routing(db, aa)
    
    # 2. Re-fetch with all relationships loaded for action processing
    result = await db.execute(
        select(AdministrativeApproval)
        .options(
            selectinload(AdministrativeApproval.pi).selectinload(User.department),
            selectinload(AdministrativeApproval.budget_file).selectinload(BudgetMaster.financial_year),
            selectinload(AdministrativeApproval.history)
        )
        .where(AdministrativeApproval.id == aa_id)
        .with_for_update()
    )
    aa = result.scalar_one_or_none()
        
    if aa.status in ("Administrative Approval Granted", "Rejected"):
        raise HTTPException(status_code=400, detail="This request has already been finalized and locked.")
        
    history_res = await db.execute(
        select(AdministrativeApprovalHistory)
        .where(AdministrativeApprovalHistory.approval_id == aa.id)
    )
    aa_history = history_res.scalars().all()
        
    # Validate authorization based on status and pending_with using database configured steps
    source_of_fund_id = None
    if aa.budget_file and aa.budget_file.source_of_fund:
        from app.models.budget import SourceOfFund
        sof_res = await db.execute(
            select(SourceOfFund.id).where(SourceOfFund.name == aa.budget_file.source_of_fund)
        )
        source_of_fund_id = sof_res.scalar_one_or_none()
        
    steps = await _get_aa_workflow_steps(db, aa.total_cost, aa.mode_of_procurement, source_of_fund_id)
    if not steps:
        raise HTTPException(status_code=422, detail="No Administrative Approval workflow configured. Please configure one in Admin Settings → Workflows.")

    current_idx = -1

    next_step_data = await resolve_aa_pending_step(db, aa, steps, aa_history)
    resolved_idx = next_step_data["idx"] if next_step_data else -1
    
    if resolved_idx != -1 and aa.pending_with and steps[resolved_idx].user_group.lower() == aa.pending_with.lower():
        current_idx = resolved_idx
    else:
        # Fallback to string matching
        if aa.pending_with:
            for idx, s in enumerate(steps):
                if s.user_group.lower() == aa.pending_with.lower():
                    current_idx = idx
                    break

    is_pi_resub = (aa.status == "Returned to PI" and aa.pending_with and aa.pending_with.upper() == "PI")

    if is_pi_resub:
        if aa.pi_id != user.id:
            raise HTTPException(status_code=403, detail="Only the initiator PI can resubmit this request.")
            
        if action != "Approve":
            raise HTTPException(status_code=400, detail="Only 'Approve' action is allowed for PI resubmission.")
            
        if "quantity" in body:
            try:
                aa.quantity = int(body["quantity"])
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="Quantity must be an integer.")
            if aa.quantity <= 0:
                raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
        if "item_description" in body:
            aa.item_description = body["item_description"]
        if "gst_rate" in body:
            aa.gst_rate = float(body["gst_rate"])
        if "mode_of_procurement" in body:
            aa.mode_of_procurement = body["mode_of_procurement"]
        if "justification" in body:
            aa.justification = body["justification"]
            
        total_cost_in = body.get("total_cost")
        gst_amount_in = body.get("gst_amount")
        if total_cost_in is not None and gst_amount_in is not None:
            try:
                aa.total_cost = float(total_cost_in)
                aa.gst_amount = float(gst_amount_in)
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="Invalid total_cost or gst_amount.")
        else:
            aa.total_cost = aa.quantity * aa.budget_file.unit_cost
            aa.gst_amount = aa.total_cost * (aa.gst_rate / 100.0)
            aa.total_cost = aa.total_cost + aa.gst_amount
        
        if aa.total_cost > aa.budget_file.available_balance:
            raise HTTPException(
                status_code=422,
                detail=f"Total Cost ₹{aa.total_cost:,.2f} exceeds Available Budget Balance ₹{aa.budget_file.available_balance:,.2f}."
            )
            
        # Determine next active step starting from -1 using resolve_aa_pending_step with simulated history
        simulated_history = list(aa_history)
        new_hist_entry = AdministrativeApprovalHistory(
            approval_id=aa.id,
            approver_role="PI",
            approver_id=user.id,
            status="Submitted",
            remarks=body.get("remarks"),
            acted_at=datetime.now()
        )
        simulated_history.append(new_hist_entry)
        next_step_data = await resolve_aa_pending_step(db, aa, steps, simulated_history)
        if next_step_data:
            first_step = next_step_data["step"]
            first_role = first_step.user_group
            aa.status = f"Submitted to {first_role}"
            aa.pending_with = first_step.user_group
            
            # Notify group
            await notify_group(
                db,
                first_role,
                user.department_id,
                "Administrative Approval Request Resubmitted",
                f"Administrative Approval request REQ-{aa.id} has been resubmitted by {user.name} and is pending your action.",
                f"/administrative-approvals/{aa.id}"
            )
        else:
            aa.status = "Administrative Approval Granted"
            aa.pending_with = None
            aa.approved_at = datetime.now()
            # Generate AA number
            dept_code = aa.pi.department.short_code if aa.pi.department else "GEN"
            fy_label = aa.budget_file.financial_year.label
            aa.aa_number = f"AA/{fy_label}/{dept_code}/{aa.id:03d}"
            aa.budget_file.committed_amount += aa.total_cost
            
            # Notify PI
            await send_notification(
                db,
                aa.pi_id,
                "Administrative Approval Granted",
                f"Administrative Approval has been GRANTED for request {aa.aa_number}.",
                f"/administrative-approvals/{aa.id}"
            )

        hist_status = "Submitted"
        approver_role = "PI"
        
    elif aa.pending_with and aa.pending_with.startswith("Nominee"):
        from app.models.administrative_approval import AdministrativeApprovalNominee
        
        # Load nominees ordered by step
        nom_res = await db.execute(
            select(AdministrativeApprovalNominee)
            .options(selectinload(AdministrativeApprovalNominee.nominee))
            .where(AdministrativeApprovalNominee.approval_id == aa.id)
            .order_by(AdministrativeApprovalNominee.step_order)
        )
        nominees = nom_res.scalars().all()
        
        # Find active nominee
        active_nominee = None
        for nom in nominees:
            if nom.status == "Pending":
                active_nominee = nom
                break
                
        if not active_nominee:
            raise HTTPException(status_code=400, detail="No pending nominee step found.")
            
        # Verify user is the active nominee
        if user.id != active_nominee.nominee_id:
            raise HTTPException(status_code=403, detail="Only the currently active nominee can act on this request.")
            
        approver_role = f"Nominee {active_nominee.step_order}"
        
        if action == "Approve":
            active_nominee.status = "Approved"
            active_nominee.acted_at = datetime.now()
            active_nominee.remarks = remarks
            
            # Check next nominee
            next_nom = None
            for nom in nominees:
                if nom.step_order == active_nominee.step_order + 1:
                    next_nom = nom
                    break
                    
            if next_nom:
                aa.status = f"Pending with Nominee {next_nom.step_order}"
                aa.pending_with = f"Nominee {next_nom.step_order}"
                hist_status = "Approved"
                
                # Notify next nominee
                await send_notification(
                    db,
                    next_nom.nominee_id,
                    "Administrative Approval - Nominee Evaluation",
                    f"Administrative Approval request REQ-{aa.id} has been forwarded to you for nominee evaluation.",
                    f"/administrative-approvals/{aa.id}"
                )
            else:
                # All nominees approved. Resolve next standard step
                next_step_data = await resolve_aa_pending_step(db, aa, steps, aa_history)
                if next_step_data:
                    next_step = next_step_data["step"]
                    next_role = next_step.user_group
                    aa.status = f"Pending with {next_role}"
                    aa.pending_with = next_role
                    hist_status = "Approved"
                    
                    # Notify group
                    await notify_group(
                        db,
                        next_role,
                        aa.pi.department_id,
                        "Administrative Approval Request Awaiting Action",
                        f"Administrative Approval request REQ-{aa.id} has passed nominee evaluation and is pending your action.",
                        f"/administrative-approvals/{aa.id}"
                    )
                else:
                    aa.status = "Administrative Approval Granted"
                    aa.pending_with = None
                    aa.approved_at = datetime.now()
                    
                    # Generate unique AA number
                    dept_code = aa.pi.department.short_code if aa.pi.department else "GEN"
                    fy_label = aa.budget_file.financial_year.label
                    aa.aa_number = f"AA/{fy_label}/{dept_code}/{aa.id:03d}"
                    hist_status = "Approved"
                    
                    aa.budget_file.committed_amount += aa.total_cost
                    
                    # Notify PI
                    await send_notification(
                        db,
                        aa.pi_id,
                        "Administrative Approval Granted",
                        f"Administrative Approval has been GRANTED for request {aa.aa_number}.",
                        f"/administrative-approvals/{aa.id}"
                    )
                    
        elif action == "Send Back":
            # Search history in reverse for the last Approved/Submitted action from a different role
            prev_role = None
            sorted_history = sorted(aa_history, key=lambda x: x.acted_at, reverse=True)
            for h in sorted_history:
                if h.status in ("Approved", "Submitted") and h.approver_role != approver_role:
                    prev_role = h.approver_role
                    break
            
            if prev_role:
                if prev_role == "PI":
                    aa.status = "Returned to PI"
                    aa.pending_with = "PI"
                    hist_status = "Returned"
                    await send_notification(
                        db,
                        aa.pi_id,
                        "Administrative Approval Request Returned",
                        f"Your Administrative Approval request REQ-{aa.id} has been returned by {user.name} for correction: {remarks}",
                        f"/administrative-approvals/{aa.id}"
                    )
                elif prev_role.startswith("Nominee"):
                    try:
                        nom_order = int(prev_role.split()[-1])
                    except Exception:
                        nom_order = 1
                    aa.status = f"Pending with Nominee {nom_order}"
                    aa.pending_with = f"Nominee {nom_order}"
                    hist_status = "Returned"
                    
                    await db.execute(
                        update(AdministrativeApprovalNominee)
                        .where(and_(AdministrativeApprovalNominee.approval_id == aa.id, AdministrativeApprovalNominee.step_order >= nom_order))
                        .values(status="Pending", acted_at=None, remarks=None)
                    )
                    
                    nom_res = await db.execute(
                        select(AdministrativeApprovalNominee).where(and_(AdministrativeApprovalNominee.approval_id == aa.id, AdministrativeApprovalNominee.step_order == nom_order))
                    )
                    nom_obj = nom_res.scalar_one_or_none()
                    if nom_obj:
                        await send_notification(
                            db,
                            nom_obj.nominee_id,
                            "Administrative Approval Request Returned",
                            f"Administrative Approval request REQ-{aa.id} has been returned to you by {user.name}: {remarks}",
                            f"/administrative-approvals/{aa.id}"
                        )
                else:
                    aa.status = f"Returned to {prev_role}"
                    aa.pending_with = prev_role
                    hist_status = "Returned"
                    await notify_group(
                        db,
                        prev_role,
                        aa.pi.department_id,
                        "Administrative Approval Request Returned",
                        f"Administrative Approval request REQ-{aa.id} has been returned by {user.name} and is pending your correction/review: {remarks}",
                        f"/administrative-approvals/{aa.id}"
                    )
            else:
                aa.status = "Returned to PI"
                aa.pending_with = "PI"
                hist_status = "Returned"
                await send_notification(
                    db,
                    aa.pi_id,
                    "Administrative Approval Request Returned",
                    f"Your Administrative Approval request REQ-{aa.id} has been returned by {user.name} for correction: {remarks}",
                    f"/administrative-approvals/{aa.id}"
                )
                    
        elif action == "Reject":
            active_nominee.status = "Rejected"
            active_nominee.acted_at = datetime.now()
            active_nominee.remarks = remarks
            
            aa.status = "Rejected"
            aa.pending_with = None
            hist_status = "Rejected"
            
            await send_notification(
                db,
                aa.pi_id,
                "Administrative Approval Request Rejected",
                f"Your Administrative Approval request REQ-{aa.id} has been rejected by {user.name}: {remarks}",
                f"/administrative-approvals/{aa.id}"
            )

    elif current_idx != -1:
        current_step = steps[current_idx]
        req_group = current_step.user_group.lower()
        
        # Check authorization
        def is_user_in_group(u: User, target_group: str) -> bool:
            if not u.role:
                return False
            tg = target_group.lower().strip()
            u_group = (u.role.group_key or "").lower().strip()
            u_value = (u.role.value or "").lower().strip()
            u_name = (u.role.name or "").lower().strip()
            
            def normalize(s):
                return "".join(c for c in s if c.isalnum())
                
            tg_norm = normalize(tg)
            u_group_norm = normalize(u_group)
            u_value_norm = normalize(u_value)
            u_name_norm = normalize(u_name)
            
            if tg == u_group or tg == u_value or tg == u_name:
                return True
            if tg_norm == u_group_norm or tg_norm == u_value_norm or tg_norm == u_name_norm:
                return True
                
            if "dean" in tg_norm:
                if "associate" in tg_norm or "adpd" in tg_norm:
                    return "associate" in u_name_norm or "adpd" in u_value_norm or "adpd" in u_name_norm
                else:
                    if "associate" in u_name_norm or "adpd" in u_value_norm:
                        return False
                    return "dean" in u_group_norm or "dean" in u_value_norm or "dean" in u_name_norm
            if "director" in tg_norm or "apex" in tg_norm:
                return "director" in u_group_norm or "director" in u_value_norm or "director" in u_name_norm or "apex" in u_group_norm or "apex" in u_value_norm or "apex" in u_name_norm
            if "hod" in tg_norm:
                return "hod" in u_group_norm or "hod" in u_value_norm or "hod" in u_name_norm
            if tg_norm == "ia" or "auditor" in tg_norm:
                return "auditor" in u_group_norm or "auditor" in u_value_norm or "auditor" in u_name_norm or "ia" in u_group_norm or "ia" in u_value_norm or "ia" in u_name_norm
                
            return False

        if "hod" in req_group:
            if not is_user_in_group(user, req_group) or aa.pi.department_id != user.department_id:
                raise HTTPException(status_code=403, detail="Only the HOD of the department can act on this request.")
        else:
            if not is_user_in_group(user, req_group):
                raise HTTPException(status_code=403, detail=f"Only users with role/group {req_group.upper()} can act on this request.")
                
        approver_role = current_step.user_group
        
        if action == "Approve":
            if "hod" in req_group:
                # Optional: HOD can override the budget-propagated nominee_ids
                nominee_ids = body.get("nominee_ids", [])
                if nominee_ids:
                    from app.models.user import User as UserModel
                    from app.models.administrative_approval import AdministrativeApprovalNominee
                    from sqlalchemy import delete
                    
                    nom_users_res = await db.execute(
                        select(UserModel).where(UserModel.id.in_(nominee_ids))
                    )
                    nom_users = {u.id: u for u in nom_users_res.scalars().all()}
                    
                    for nid in nominee_ids:
                        if nid not in nom_users:
                            raise HTTPException(status_code=400, detail=f"Invalid nominee user ID: {nid}")
                    
                    # Clear existing nominees
                    await db.execute(
                        delete(AdministrativeApprovalNominee).where(AdministrativeApprovalNominee.approval_id == aa.id)
                    )
                    
                    # Insert nominees
                    for order, nid in enumerate(nominee_ids, start=1):
                        nom = AdministrativeApprovalNominee(
                            approval_id=aa.id,
                            nominee_id=nid,
                            step_order=order,
                            status="Notified"
                        )
                        db.add(nom)
                
                # Retrieve configured nominees
                from app.models.administrative_approval import AdministrativeApprovalNominee
                nom_res = await db.execute(
                    select(AdministrativeApprovalNominee).where(AdministrativeApprovalNominee.approval_id == aa.id).order_by(AdministrativeApprovalNominee.step_order)
                )
                existing_noms = nom_res.scalars().all()
                
                # Update status of existing nominees to Notified if they are not already
                for nom in existing_noms:
                    if nom.status != "Notified":
                        nom.status = "Notified"
                
                # Notify all nominees
                for nom in existing_noms:
                    await send_notification(
                        db,
                        nom.nominee_id,
                        "Administrative Approval - Committee Nomination",
                        f"You have been nominated by the HOD for Administrative Approval request REQ-{aa.id}.",
                        f"/administrative-approvals/{aa.id}"
                    )
                
                # Resolve next standard step using resolve_aa_pending_step with simulated history
                simulated_history = list(aa_history)
                new_hist_entry = AdministrativeApprovalHistory(
                    approval_id=aa.id,
                    approver_role=approver_role,
                    approver_id=user.id,
                    status="Approved",
                    remarks=remarks,
                    acted_at=datetime.now()
                )
                simulated_history.append(new_hist_entry)
                next_step_data = await resolve_aa_pending_step(db, aa, steps, simulated_history)
                if next_step_data:
                    next_step = next_step_data["step"]
                    next_role = next_step.user_group
                    aa.status = f"Pending with {next_role}"
                    aa.pending_with = next_role
                    hist_status = "Approved"
                    
                    # Notify next role group
                    await notify_group(
                        db,
                        next_role,
                        aa.pi.department_id,
                        "Administrative Approval Request Awaiting Action",
                        f"Administrative Approval request REQ-{aa.id} is pending your action.",
                        f"/administrative-approvals/{aa.id}"
                    )
                else:
                    aa.status = "Administrative Approval Granted"
                    aa.pending_with = None
                    aa.approved_at = datetime.now()
                    
                    # Generate unique Administrative Approval Number
                    dept_code = aa.pi.department.short_code if aa.pi.department else "GEN"
                    fy_label = aa.budget_file.financial_year.label
                    aa.aa_number = f"AA/{fy_label}/{dept_code}/{aa.id:03d}"
                    hist_status = "Approved"
                    
                    # Commit the budget allocation committed amount
                    aa.budget_file.committed_amount += aa.total_cost
                    
                    # Notify PI
                    await send_notification(
                        db,
                        aa.pi_id,
                        "Administrative Approval Granted",
                        f"Administrative Approval has been GRANTED for request {aa.aa_number}.",
                        f"/administrative-approvals/{aa.id}"
                    )
            else:
                # Resolve next standard step using resolve_aa_pending_step with simulated history
                simulated_history = list(aa_history)
                new_hist_entry = AdministrativeApprovalHistory(
                    approval_id=aa.id,
                    approver_role=approver_role,
                    approver_id=user.id,
                    status="Approved",
                    remarks=remarks,
                    acted_at=datetime.now()
                )
                simulated_history.append(new_hist_entry)
                next_step_data = await resolve_aa_pending_step(db, aa, steps, simulated_history)
                if next_step_data:
                    next_step = next_step_data["step"]
                    next_role = next_step.user_group
                    aa.status = f"Pending with {next_role}"
                    aa.pending_with = next_role
                    hist_status = "Approved"
                    
                    # Notify next role group
                    await notify_group(
                        db,
                        next_role,
                        aa.pi.department_id,
                        "Administrative Approval Request Awaiting Action",
                        f"Administrative Approval request REQ-{aa.id} is pending your action.",
                        f"/administrative-approvals/{aa.id}"
                    )
                else:
                    aa.status = "Administrative Approval Granted"
                    aa.pending_with = None
                    aa.approved_at = datetime.now()
                    
                    # Generate unique Administrative Approval Number
                    dept_code = aa.pi.department.short_code if aa.pi.department else "GEN"
                    fy_label = aa.budget_file.financial_year.label
                    aa.aa_number = f"AA/{fy_label}/{dept_code}/{aa.id:03d}"
                    hist_status = "Approved"
                    
                    # Commit the budget allocation committed amount
                    aa.budget_file.committed_amount += aa.total_cost
                    
                    # Notify PI
                    await send_notification(
                        db,
                        aa.pi_id,
                        "Administrative Approval Granted",
                        f"Administrative Approval has been GRANTED for request {aa.aa_number}.",
                        f"/administrative-approvals/{aa.id}"
                    )
                
        elif action == "Send Back":
            # Search history in reverse for the last Approved/Submitted action from a different role
            prev_role = None
            sorted_history = sorted(aa_history, key=lambda x: x.acted_at, reverse=True)
            for h in sorted_history:
                if h.status in ("Approved", "Submitted") and h.approver_role != approver_role:
                    prev_role = h.approver_role
                    break
            
            if prev_role:
                if prev_role == "PI":
                    aa.status = "Returned to PI"
                    aa.pending_with = "PI"
                    hist_status = "Returned"
                    await send_notification(
                        db,
                        aa.pi_id,
                        "Administrative Approval Request Returned",
                        f"Your Administrative Approval request REQ-{aa.id} has been returned by {user.name} for correction: {remarks}",
                        f"/administrative-approvals/{aa.id}"
                    )
                elif prev_role.startswith("Nominee"):
                    try:
                        nom_order = int(prev_role.split()[-1])
                    except Exception:
                        nom_order = 1
                    aa.status = f"Pending with Nominee {nom_order}"
                    aa.pending_with = f"Nominee {nom_order}"
                    hist_status = "Returned"
                    
                    # Reset nominee statuses
                    from app.models.administrative_approval import AdministrativeApprovalNominee
                    await db.execute(
                        update(AdministrativeApprovalNominee)
                        .where(and_(AdministrativeApprovalNominee.approval_id == aa.id, AdministrativeApprovalNominee.step_order >= nom_order))
                        .values(status="Pending", acted_at=None, remarks=None)
                    )
                    
                    nom_res = await db.execute(
                        select(AdministrativeApprovalNominee).where(and_(AdministrativeApprovalNominee.approval_id == aa.id, AdministrativeApprovalNominee.step_order == nom_order))
                    )
                    nom_obj = nom_res.scalar_one_or_none()
                    if nom_obj:
                        await send_notification(
                            db,
                            nom_obj.nominee_id,
                            "Administrative Approval Request Returned",
                            f"Administrative Approval request REQ-{aa.id} has been returned to you by {user.name}: {remarks}",
                            f"/administrative-approvals/{aa.id}"
                        )
                else:
                    aa.status = f"Returned to {prev_role}"
                    aa.pending_with = prev_role
                    hist_status = "Returned"
                    await notify_group(
                        db,
                        prev_role,
                        aa.pi.department_id,
                        "Administrative Approval Request Returned",
                        f"Administrative Approval request REQ-{aa.id} has been returned by {user.name} and is pending your correction/review: {remarks}",
                        f"/administrative-approvals/{aa.id}"
                    )
            else:
                aa.status = "Returned to PI"
                aa.pending_with = "PI"
                hist_status = "Returned"
                await send_notification(
                    db,
                    aa.pi_id,
                    "Administrative Approval Request Returned",
                    f"Your Administrative Approval request REQ-{aa.id} has been returned by {user.name} for correction: {remarks}",
                    f"/administrative-approvals/{aa.id}"
                )
                
        elif action == "Reject":
            aa.status = "Rejected"
            aa.pending_with = None
            hist_status = "Rejected"
            
            await send_notification(
                db,
                aa.pi_id,
                "Administrative Approval Request Rejected",
                f"Your Administrative Approval request REQ-{aa.id} has been rejected by {user.name}: {remarks}",
                f"/administrative-approvals/{aa.id}"
            )
            
    else:
        raise HTTPException(status_code=400, detail="Action not permitted at this stage.")
        
    hist = AdministrativeApprovalHistory(
        approval_id=aa.id,
        approver_role=approver_role,
        approver_id=user.id,
        status=hist_status,
        remarks=remarks
    )
    db.add(hist)
    
    await db.commit()
    return {"message": f"Request {hist_status.lower()} successfully.", "status": aa.status, "aa_number": aa.aa_number}


@router.post("/{aa_id}/attachment")
async def upload_aa_attachment(
    aa_id: int,
    file: UploadFile = File(...),
    doc_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AdministrativeApproval)
        .where(AdministrativeApproval.id == aa_id)
        .with_for_update()
    )
    aa = result.scalar_one_or_none()
    if not aa:
        raise HTTPException(status_code=404, detail="Administrative Approval request not found.")
        
    await db.refresh(user, ["role"])
    group_key = user.role.group_key if user.role else None
    
    if group_key == "faculty" and aa.pi_id != user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to upload files for this request.")
        
    import os, uuid as _uuid
    from app.core.config import settings as _settings

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".pdf", ".png", ".jpg", ".jpeg"}:
        raise HTTPException(status_code=400, detail="Attachment must be PDF, PNG, JPG, or JPEG.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Attachment size must be under 10 MB.")

    header = content[:4]
    if ext == ".pdf" and not header.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file.")
    elif ext == ".png" and not header.startswith(b"\x89PNG"):
        raise HTTPException(status_code=400, detail="Invalid PNG file.")
    elif ext in (".jpg", ".jpeg") and not header.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail="Invalid JPEG file.")

    rel_folder = os.path.join("aa_attachments")
    abs_folder = os.path.join(_settings.STORAGE_PATH, rel_folder)
    os.makedirs(abs_folder, exist_ok=True)
    filename = f"{_uuid.uuid4().hex}{ext}"
    rel_path = os.path.join(rel_folder, filename)
    abs_path = os.path.join(_settings.STORAGE_PATH, rel_path)
    
    with open(abs_path, "wb") as fh:
        fh.write(content)
        
    if doc_type == "basis_of_estimation":
        aa.basis_of_estimation_path = rel_path
    elif doc_type == "gem_non_availability":
        aa.gem_non_availability_path = rel_path
    elif doc_type == "authority_approval":
        aa.authority_approval_path = rel_path
    elif doc_type == "pac_dept_cert":
        aa.pac_dept_cert_path = rel_path
    elif doc_type == "pac_vendor_cert":
        aa.pac_vendor_cert_path = rel_path
    else:
        aa.attachment_path = rel_path

    db.add(aa)
    await db.commit()
    
    return {
        "message": "Attachment uploaded successfully.",
        "attachment_path": rel_path,
        "attachment_url": f"/static/uploads/{rel_path}"
    }


@router.get("/{aa_id}/print")
async def print_aa(
    aa_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    import io
    from app.services.pdf_service import PDFService

    result = await db.execute(
        select(AdministrativeApproval)
        .options(
            selectinload(AdministrativeApproval.pi),
            selectinload(AdministrativeApproval.nominees)
        )
        .where(AdministrativeApproval.id == aa_id)
    )
    aa = result.scalar_one_or_none()
    if not aa:
        raise HTTPException(status_code=404, detail="Administrative Approval not found")

    # Access check: HOD or initiator PI or configured reviewer roles or nominee
    await db.refresh(user, ["role"])
    group_key = user.role.group_key if user.role else None
    
    is_initiator = aa.pi_id == user.id
    is_hod = group_key == "hod" and user.department_id == aa.pi.department_id
    is_reviewer = group_key in ("dean_approver", "apex_approver", "admin")
    is_nominee = any(nom.nominee_id == user.id for nom in aa.nominees)
    
    if not (is_initiator or is_hod or is_reviewer or is_nominee):
        # Fallback to checking history to see if the user was an actor
        actor_res = await db.execute(
            select(AdministrativeApprovalHistory)
            .where(
                and_(
                    AdministrativeApprovalHistory.approval_id == aa_id,
                    AdministrativeApprovalHistory.approver_id == user.id
                )
            )
        )
        if not actor_res.scalars().first():
            raise HTTPException(status_code=403, detail="You do not have permission to view or print this request.")

    pdf_service = PDFService(db)
    pdf_bytes, filename, is_fallback, html_content = await pdf_service.generate_aa_pdf(aa_id)

    if is_fallback:
        return HTMLResponse(
            content=html_content,
            status_code=200
        )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
