import json
import io
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, UploadFile
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, or_
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime, date

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import User, RoleManager
from app.models.purchase_request import (
    PurchaseRequest, PurchaseRequestItem, PurchaseRequestHistory,
    PurchaseRequestAssignment, TechnicalEvaluation, FinancialEvaluation,
    CommercialEvaluation, Document, WorkFlowHierarchy, RequestStatus, AssignmentStatus,
    VendorMaster, PRReferral
)
from app.models.budget import BudgetMaster, PurchaseCategory, ProcurementManager, PhaseManager, FinancialYear
from app.services.flow_engine import FlowEngineService
from app.services.budget_service import BudgetService
from app.services.document_service import DocumentService
from app.schemas.pr_create import PRCreatePayload, PRItemCreate

from datetime import timedelta, timezone

router = APIRouter(prefix="/api/pr", tags=["purchase-requests"])


def to_local_time(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    return dt.astimezone(ist_tz)


def _combined_service_center_desc(payload: PRCreatePayload) -> Optional[str]:
    """When using a southern-region service centre, store location + justification in one text field."""
    if not payload.is_service_center_south:
        return None
    loc = (payload.service_center_location or "").strip()
    just = (payload.service_center_south_desc or "").strip()
    parts: list[str] = []
    if loc:
        parts.append(f"Service centre location: {loc}")
    if just:
        parts.append(f"Justification: {just}")
    return "\n".join(parts) if parts else None


def _serialize_pr(pr: PurchaseRequest) -> dict:
    return {
        "id": pr.id,
        "icr_number": pr.icr_number,
        "current_status": pr.current_status,
        "amount": pr.amount,
        "purchase_type": pr.purchase_type,
        "created_at": pr.created_at.isoformat() + "Z" if pr.created_at else None,
        "initiator": {"id": pr.initiator.id, "name": pr.initiator.name, "email": pr.initiator.email} if pr.initiator else None,
        "category": {
            "id": pr.purchase_category.id,
            "title": pr.purchase_category.title,
            "requirement_type": pr.purchase_category.requirement_type,
        } if pr.purchase_category else None,
        "procurement": {"id": pr.procurement.id, "name": pr.procurement.name} if pr.procurement else None,
        "form_data": pr.form_data,
        "parent_pr_id": pr.parent_pr_id,
    }


async def _persist_pr(
    payload: PRCreatePayload,
    user: User,
    db: AsyncSession,
    background_tasks: BackgroundTasks,
    uploads: Optional[dict] = None,
) -> dict:
    """Create PR with full procurement-aligned fields and optional document uploads."""
    await db.refresh(user, ["department", "role"])
    if not user.is_approved:
        raise HTTPException(status_code=403, detail="Your profile is not yet approved by the administrator.")
    uploads = uploads or {}
    selected_file_ids = payload.selected_file_ids

    if not payload.items:
        payload = payload.model_copy(
            update={
                "items": [
                    PRItemCreate(
                        budget_file_id=fid,
                        requirement_type="Research",
                        availability="No",
                        tech_specs_text="—",
                        site_readiness=True,
                        installation_required=False,
                    )
                    for fid in selected_file_ids
                ]
            }
        )

    items_by_budget = {it.budget_file_id: it for it in payload.items}
    budget_by_id: dict[int, BudgetMaster] = {}
    total_amount = 0.0
    for fid in selected_file_ids:
        bm_result = await db.execute(select(BudgetMaster).where(BudgetMaster.id == fid))
        bm = bm_result.scalar_one_or_none()
        if not bm:
            raise HTTPException(status_code=404, detail=f"Budget file {fid} not found")
        if bm.department_id != user.department_id:
            raise HTTPException(status_code=403, detail="Budget file belongs to a different department")
        budget_by_id[fid] = bm
        
        item_data = items_by_budget.get(fid)
        if not item_data:
            raise HTTPException(status_code=400, detail=f"Missing item details for budget file {fid}")
            
        item_qty = item_data.quantity if item_data.quantity is not None else 1
        item_est_total = item_qty * bm.unit_cost
        
        if item_est_total > bm.available_amount:
            raise HTTPException(
                status_code=400,
                detail=f"Requested amount ₹{item_est_total:,.2f} (Qty: {item_qty}) for item '{bm.item_name}' exceeds available budget ₹{bm.available_amount:,.2f}."
            )
        total_amount += item_est_total

    from sqlalchemy import case

    item_req_type = None
    if payload.items:
        req_types = {item.requirement_type for item in payload.items if item.requirement_type}
        if req_types:
            item_req_type = list(req_types)[0]

    stmt = select(PurchaseCategory).where(
        and_(
            PurchaseCategory.procurement_id == payload.mop,
            PurchaseCategory.min_amount <= total_amount,
            PurchaseCategory.max_amount >= total_amount,
            PurchaseCategory.is_active == True,
        )
    )

    if item_req_type:
        stmt = stmt.where(
            (PurchaseCategory.requirement_type == item_req_type) | 
            (PurchaseCategory.requirement_type == None) | 
            (PurchaseCategory.requirement_type == "")
        ).order_by(
            case(
                (PurchaseCategory.requirement_type == item_req_type, 0),
                else_=1
            )
        )
    else:
        stmt = stmt.where(
            (PurchaseCategory.requirement_type == None) | 
            (PurchaseCategory.requirement_type == "")
        )

    cat_result = await db.execute(stmt)
    category = cat_result.scalars().first()
    if not category:
        raise HTTPException(
            status_code=400,
            detail="No active purchase category matches this total amount for the selected procurement method"
        )

    now = datetime.utcnow()
    fy_result = await db.execute(
        select(FinancialYear).where(
            and_(FinancialYear.start_date <= now.date(), FinancialYear.end_date >= now.date())
        )
    )
    financial_year = fy_result.scalar_one_or_none()
    if not financial_year:
        raise HTTPException(status_code=400, detail="No active financial year configured")

    proc_result = await db.execute(select(ProcurementManager).where(ProcurementManager.id == payload.mop))
    procurement = proc_result.scalar_one_or_none()
    if not procurement:
        raise HTTPException(status_code=400, detail="Invalid procurement method")

    # Validate dynamic form_data if procurement method has a schema
    if procurement.form_schema:
        from app.services.evaluator import validate_json_schema
        try:
            validate_json_schema(payload.form_data or {}, procurement.form_schema)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if procurement.max_amount is not None and total_amount > procurement.max_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Total amount exceeds the maximum limit for procurement method '{procurement.name}' (Limit: ₹{procurement.max_amount})"
        )

    if payload.nominee_id:
        nominee_result = await db.execute(
            select(User)
            .join(RoleManager, User.role_id == RoleManager.id)
            .where(
                and_(
                    User.id == payload.nominee_id,
                    User.department_id == user.department_id,
                    RoleManager.group_key == "faculty",
                )
            )
        )
        if not nominee_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Invalid nominee faculty")

    pr = PurchaseRequest(
        category_id=category.id,
        financial_year_id=financial_year.id,
        initiator_id=user.id,
        nominee_id=payload.nominee_id,
        procurement_id=procurement.id,
        purchase_type=payload.purchase_type,
        amount=total_amount,
        emd=payload.emd,
        performance_security=payload.performance_security,
        current_status=RequestStatus.PR_SUBMITTED,
        basis_of_estimate_details=payload.basis_of_estimate,
        delivery_mode=payload.delivery_mode,
        delivery_location=payload.delivery_location,
        is_service_center_in_south=payload.is_service_center_south,
        service_center_south_desc=_combined_service_center_desc(payload),
        is_quantity_split=payload.is_quantity_split,
        quantity_split_details=payload.split_quantity_justification,
        is_item_split=payload.is_item_split,
        item_split_justification=payload.split_items_justification,
        exemption=payload.exemption,
        exemption_remarks=payload.exemption_remarks,
        is_training_required=payload.training_required,
        training_type=payload.training_type,
        training_vendor=payload.training_vendor,
        form_data=payload.form_data,
    )
    db.add(pr)
    await db.flush()

    items_by_budget = {it.budget_file_id: it for it in payload.items}
    doc_svc = DocumentService(db)

    for index, fid in enumerate(selected_file_ids):
        bm = budget_by_id[fid]
        item_data = items_by_budget.get(fid)
        if not item_data:
            raise HTTPException(status_code=400, detail=f"Missing item details for budget file {fid}")

        item_qty = item_data.quantity if item_data.quantity is not None else 1
        item_est_total = item_qty * bm.unit_cost

        item = PurchaseRequestItem(
            purchase_request_id=pr.id,
            budget_file_id=bm.id,
            item_description=bm.item_name,
            quantity=item_qty,
            estimated_total=item_est_total,
            charges=item_data.charges,
            requirement_type=item_data.requirement_type,
            availability=item_data.availability,
            availability_remarks=item_data.availability_remarks,
            site_readiness=item_data.site_readiness,
            site_readiness_remarks=item_data.site_readiness_remarks,
            warranty=item_data.warranty,
            delivery_period=item_data.delivery_period,
            present_stock=item_data.present_stock,
            justification_for_procurement=item_data.justification_for_procurement,
            previous_file_no_reference=item_data.previous_file_no_reference,
            installation_required=item_data.installation_required,
            tech_specs_text=item_data.tech_specs_text,
            gem_link=item_data.gem_link,
        )
        db.add(item)

        tech_file = uploads.get(f"tech_specs_file_{index}")
        if tech_file and tech_file.filename:
            await doc_svc.save_upload(pr, f"item_{index}_tech_spec", tech_file, user.id)

        nac_file = uploads.get(f"gem_nac_file_{index}")
        if nac_file and nac_file.filename:
            await doc_svc.save_upload(pr, f"item_{index}_gem_nac", nac_file, user.id)

    quotation = uploads.get("quotation_file")
    if quotation and quotation.filename:
        await doc_svc.save_upload(pr, "quotation_file", quotation, user.id)

    dept_code = user.department.short_code if user.department else "GEN"
    pr.icr_number = f"ICR/S&P/{financial_year.label}/{dept_code}/{pr.id}"

    flow_engine = FlowEngineService(db, background_tasks)
    await flow_engine.initialize(pr, user)
    await db.commit()

    return {"message": "Purchase request created", "id": pr.id, "icr_number": pr.icr_number}


@router.post("/")
async def create_pr(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("faculty", "hod")),
):
    """Create a purchase request (JSON or multipart with `payload` + files)."""
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw = form.get("payload")
        if not raw:
            raise HTTPException(status_code=400, detail="Missing payload field")
        payload = PRCreatePayload.model_validate(json.loads(raw))
        uploads = {
            k: v for k, v in form.items()
            if k != "payload" and isinstance(v, UploadFile)
        }
        return await _persist_pr(payload, user, db, background_tasks, uploads)

    body = await request.json()
    payload = PRCreatePayload.model_validate(body)
    return await _persist_pr(payload, user, db, background_tasks)


@router.get("/")
async def list_prs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List PRs filtered by role scope."""
    query = select(PurchaseRequest).order_by(PurchaseRequest.created_at.desc())
    group = user.role.group_key if user.role else None

    if group == "faculty":
        query = query.where(
            or_(
                PurchaseRequest.initiator_id == user.id,
                PurchaseRequest.faculty1_id == user.id,
                PurchaseRequest.faculty2_id == user.id,
                PurchaseRequest.faculty3_id == user.id,
            )
        )
    elif group == "hod":
        # HOD sees all PRs from their department
        query = query.join(User, PurchaseRequest.initiator_id == User.id).where(
            User.department_id == user.department_id
        )
    # admin, verifiers, apex, dean see all

    result = await db.execute(query)
    prs = result.scalars().all()

    serialized = []
    for pr in prs:
        await db.refresh(pr, ["initiator", "purchase_category", "procurement"])
        serialized.append(_serialize_pr(pr))
    return serialized


@router.get("/faculties")
async def list_department_faculties(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.user import RoleManager
    result = await db.execute(
        select(User)
        .join(RoleManager, User.role_id == RoleManager.id)
        .where(
            and_(
                User.department_id == user.department_id,
                RoleManager.group_key == "faculty",
                User.is_approved == True
            )
        )
    )
    faculties = result.scalars().all()
    return [{"id": f.id, "name": f.name, "email": f.email, "designation": f.designation} for f in faculties]


@router.get("/dealing-assistants")
async def list_dealing_assistants(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(User)
        .join(RoleManager, User.role_id == RoleManager.id)
        .where(RoleManager.group_key == "verifier_da")
    )
    das = result.scalars().all()
    return [{"id": u.id, "name": u.name, "email": u.email} for u in das]


@router.get("/vendors")
async def list_vendors(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(VendorMaster).order_by(VendorMaster.vendor_name))
    vendors = result.scalars().all()
    return [{"id": v.id, "vendor_name": v.vendor_name, "email": v.email} for v in vendors]


@router.get("/{pr_id}")
async def get_pr(pr_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.referrals).selectinload(PRReferral.referred_by),
            selectinload(PurchaseRequest.referrals).selectinload(PRReferral.referred_to),
        )
        .where(PurchaseRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await db.refresh(pr, ["initiator", "purchase_category", "procurement", "items", "history", "flow",
                          "technical_evaluations", "financial_evaluations", "commercial_evaluations", "assignments", "documents",
                          "faculty1", "faculty2", "faculty3", "aa_approver", "bill_passing", "deliveries", "referrals"])

    # BOLA check: department-scope check
    group = user.role.group_key if user.role else None
    is_expected_user = False
    if pr.flow:
        res = await db.execute(
            select(WorkFlowHierarchy).where(
                and_(
                    WorkFlowHierarchy.category_id == pr.category_id,
                    WorkFlowHierarchy.procurement_id == pr.procurement_id,
                    WorkFlowHierarchy.purchase_type == pr.purchase_type,
                    WorkFlowHierarchy.phase_id == pr.flow.phase_id,
                    WorkFlowHierarchy.step_order == pr.flow.step_order,
                    WorkFlowHierarchy.is_enabled == True,
                )
            )
        )
        step = res.scalar_one_or_none()
        if step and step.user_type == "user" and step.user_id == user.id:
            is_expected_user = True

    # Check active referral for this user
    is_consulted = False
    referral_check = await db.execute(
        select(PRReferral).where(
            and_(
                PRReferral.purchase_request_id == pr.id,
                PRReferral.referred_to_id == user.id,
                PRReferral.status == "pending"
            )
        )
    )
    if referral_check.scalar_one_or_none():
        is_consulted = True

    if not is_expected_user and not is_consulted:
        allowed_nominees = {pr.faculty1_id, pr.faculty2_id, pr.faculty3_id}
        if user.id not in allowed_nominees:
            if group == "faculty" and pr.initiator_id != user.id:
                raise HTTPException(status_code=403, detail="Access denied")
            if group == "hod":
                if pr.initiator.department_id != user.department_id:
                    raise HTTPException(status_code=403, detail="Access denied")
                           
    expected_group = None
    expected_role_id = None
    expected_role_name = None
    expected_user_id = None
    expected_user_name = None
    phase_name = None
    if pr.flow:
        res = await db.execute(
            select(WorkFlowHierarchy).where(
                and_(
                    WorkFlowHierarchy.category_id == pr.category_id,
                    WorkFlowHierarchy.procurement_id == pr.procurement_id,
                    WorkFlowHierarchy.purchase_type == pr.purchase_type,
                    WorkFlowHierarchy.phase_id == pr.flow.phase_id,
                    WorkFlowHierarchy.step_order == pr.flow.step_order,
                    WorkFlowHierarchy.is_enabled == True,
                )
            )
        )
        step = res.scalar_one_or_none()
        if step:
            await db.refresh(step, ["role", "user"])
            expected_group = step.user_group
            expected_role_id = step.role_id
            expected_role_name = step.role.name if step.role else (step.user_group.replace("_", " ").title() if step.user_group else None)
            if step.user_type == "user" and step.user_id:
                expected_user_id = step.user_id
                expected_user_name = step.user.name if step.user else None
        phase_res = await db.execute(select(PhaseManager.phase_name).where(PhaseManager.id == pr.flow.phase_id))
        phase_name = phase_res.scalar_one_or_none()

        # Get threshold and comparison if exists in the current phase
        threshold_res = await db.execute(
            select(WorkFlowHierarchy.tender_vendors_threshold, WorkFlowHierarchy.tender_vendors_comparison)
            .where(
                and_(
                    WorkFlowHierarchy.category_id == pr.category_id,
                    WorkFlowHierarchy.procurement_id == pr.procurement_id,
                    WorkFlowHierarchy.purchase_type == pr.purchase_type,
                    WorkFlowHierarchy.phase_id == pr.flow.phase_id,
                    WorkFlowHierarchy.tender_vendors_threshold != None,
                )
            )
            .limit(1)
        )
        row = threshold_res.first()
        tender_vendors_threshold = row[0] if row else None
        tender_vendors_comparison = row[1] if row else None

    await db.refresh(pr.initiator, ["department"])
    dept = pr.initiator.department

    # Gather user IDs for batch loading (prevents N+1 queries)
    user_ids = set()
    for h in pr.history:
        if h.current_approver_id:
            user_ids.add(h.current_approver_id)
    for a in pr.assignments:
        if a.assigned_da_id:
            user_ids.add(a.assigned_da_id)
    if dept:
        if dept.expert1_id:
            user_ids.add(dept.expert1_id)
        if dept.expert2_id:
            user_ids.add(dept.expert2_id)
        if dept.director_faculty_id:
            user_ids.add(dept.director_faculty_id)

    users_by_id = {}
    if user_ids:
        users_res = await db.execute(
            select(User)
            .options(selectinload(User.role))
            .where(User.id.in_(list(user_ids)))
        )
        for u in users_res.scalars().all():
            users_by_id[u.id] = u

    history = []
    # Deduplicate dual logging entries (e.g. custom action + generic Forwarded) by the same user within 60s
    for h in sorted(pr.history, key=lambda x: x.acted_at or datetime.min):
        if h.status in ("Forwarded", "Forwarded to next phase"):
            has_specific_entry = any(
                other.current_approver_id == h.current_approver_id
                and other.status
                and other.status not in ("Forwarded", "Forwarded to next phase")
                and other.acted_at
                and h.acted_at
                and abs((other.acted_at - h.acted_at).total_seconds()) < 60
                for other in pr.history
            )
            if has_specific_entry:
                continue
        actor_name = ""
        actor_role_name = ""
        if h.current_approver_id:
            actor = users_by_id.get(h.current_approver_id)
            if actor:
                actor_name = actor.name
                actor_role_name = actor.role.name if actor.role else ""
        history.append({
            "id": h.id,
            "status": h.status,
            "remarks": h.remarks,
            "acted_at": h.acted_at.isoformat() + "Z" if h.acted_at else None,
            "approver_id": h.current_approver_id,
            "actor_name": actor_name,
            "actor_role_name": actor_role_name,
        })

    assignments_list = []
    for a in pr.assignments:
        da_name = ""
        if a.assigned_da_id:
            da_user = users_by_id.get(a.assigned_da_id)
            da_name = da_user.name if da_user else ""
        assignments_list.append({
            "id": a.id,
            "assigned_da_id": a.assigned_da_id,
            "assigned_da_name": da_name,
            "status": a.status,
        })

    commercial_evaluations = [
        {
            "id": ce.id,
            "vendor_name": ce.vendor_name,
            "vendor_email": ce.vendor_email,
            "quoted_amount": ce.quoted_amount,
            "is_qualified": ce.is_qualified,
            "remarks": ce.remarks,
        }
        for ce in pr.commercial_evaluations
    ]
    technical_evaluations = [
        {
            "id": te.id,
            "vendor_name": te.vendor_name,
            "is_qualified": te.is_qualified,
            "remarks": te.remarks,
        }
        for te in pr.technical_evaluations
    ]
    financial_evaluations = [
        {
            "id": fe.id,
            "vendor_name": fe.vendor_name,
            "quoted_amount": fe.quoted_amount,
            "ranking": fe.ranking,
            "is_awarded": fe.is_awarded,
            "remarks": fe.remarks,
            "unit_price": fe.unit_price,
            "taxes": fe.taxes,
            "delivery_period": fe.delivery_period,
            "warranty": fe.warranty,
        }
        for fe in pr.financial_evaluations
    ]

    # Load HOD and department committee
    from app.models.user import RoleManager
    hod_res = await db.execute(
        select(User)
        .join(RoleManager, User.role_id == RoleManager.id)
        .where(
            and_(
                User.department_id == pr.initiator.department_id,
                RoleManager.group_key == "hod"
            )
        )
    )
    hod = hod_res.scalar_one_or_none()
    
    expert1 = users_by_id.get(dept.expert1_id) if dept and dept.expert1_id else None
    expert2 = users_by_id.get(dept.expert2_id) if dept and dept.expert2_id else None
    director_faculty = users_by_id.get(dept.director_faculty_id) if dept and dept.director_faculty_id else None

    budget_file = None
    if pr.items:
        first_item = pr.items[0]
        if first_item.budget_file_id:
            budget_file_res = await db.execute(
                select(BudgetMaster)
                .options(
                    selectinload(BudgetMaster.expert1),
                    selectinload(BudgetMaster.expert2),
                    selectinload(BudgetMaster.director_faculty),
                )
                .where(BudgetMaster.id == first_item.budget_file_id)
            )
            budget_file = budget_file_res.scalar_one_or_none()

    return {
        **_serialize_pr(pr),
        "initiator_id": pr.initiator_id,
        "faculty1_id": pr.faculty1_id,
        "faculty2_id": pr.faculty2_id,
        "faculty3_id": pr.faculty3_id,
        "aa_approver_id": pr.aa_approver_id,
        "faculty1": {"id": pr.faculty1.id, "name": pr.faculty1.name, "email": pr.faculty1.email} if pr.faculty1 else None,
        "faculty2": {"id": pr.faculty2.id, "name": pr.faculty2.name, "email": pr.faculty2.email} if pr.faculty2 else None,
        "faculty3": {"id": pr.faculty3.id, "name": pr.faculty3.name, "email": pr.faculty3.email} if pr.faculty3 else None,
        "aa_approver": {"id": pr.aa_approver.id, "name": pr.aa_approver.name, "email": pr.aa_approver.email} if pr.aa_approver else None,
        "budget_file": {
            "id": budget_file.id,
            "file_no": budget_file.file_no,
            "department_id": budget_file.department_id,
            "expert1_id": budget_file.expert1_id,
            "expert2_id": budget_file.expert2_id,
            "director_faculty_id": budget_file.director_faculty_id,
            "expert1": {"id": budget_file.expert1.id, "name": budget_file.expert1.name, "email": budget_file.expert1.email} if budget_file.expert1 else None,
            "expert2": {"id": budget_file.expert2.id, "name": budget_file.expert2.name, "email": budget_file.expert2.email} if budget_file.expert2 else None,
            "director_faculty": {"id": budget_file.director_faculty.id, "name": budget_file.director_faculty.name, "email": budget_file.director_faculty.email} if budget_file.director_faculty else None,
        } if budget_file else None,
        "hod_id": hod.id if hod else None,
        "expert1_id": dept.expert1_id if dept else None,
        "expert2_id": dept.expert2_id if dept else None,
        "director_faculty_id": dept.director_faculty_id if dept else None,
        "hod": {"id": hod.id, "name": hod.name, "email": hod.email} if hod else None,
        "expert1": {"id": expert1.id, "name": expert1.name, "email": expert1.email} if expert1 else None,
        "expert2": {"id": expert2.id, "name": expert2.name, "email": expert2.email} if expert2 else None,
        "director_faculty": {"id": director_faculty.id, "name": director_faculty.name, "email": director_faculty.email} if director_faculty else None,
        "emd": pr.emd,
        "performance_security": pr.performance_security,
        "is_item_split": pr.is_item_split,
        "is_quantity_split": pr.is_quantity_split,
        "exemption": pr.exemption,
        "is_training_required": pr.is_training_required,
        "tender_reference_number": pr.tender_reference_number,
        "vendor_list_link": pr.vendor_list_link,
        "date_of_tender": pr.date_of_tender.isoformat() if pr.date_of_tender else None,
        "date_of_tech_bid_opening": pr.date_of_tech_bid_opening.isoformat() if pr.date_of_tech_bid_opening else None,
        "date_of_financial_bid_opening": pr.date_of_financial_bid_opening.isoformat() if pr.date_of_financial_bid_opening else None,
        "te_initiated_at": pr.te_initiated_at.isoformat() + "Z" if pr.te_initiated_at else None,
        # Delivery & Basis fields
        "delivery_location": pr.delivery_location,
        "delivery_mode": pr.delivery_mode,
        "basis_of_estimate": pr.basis_of_estimate_details,
        # LPC & Single Bid
        "lpc_remarks": pr.lpc_remarks,
        "lpc_committee_members": pr.lpc_committee_members,
        "lpc_minutes_reference": pr.lpc_minutes_reference,
        "single_bid_justification": pr.single_bid_justification,
        # Bill Passing
        "bill_passing": {
            "id": pr.bill_passing.id,
            "invoice_number": pr.bill_passing.invoice_number,
            "invoice_date": pr.bill_passing.invoice_date.isoformat() if pr.bill_passing.invoice_date else None,
            "challan_number": pr.bill_passing.challan_number,
            "challan_date": pr.bill_passing.challan_date.isoformat() if pr.bill_passing.challan_date else None,
            "bill_amount": pr.bill_passing.bill_amount,
            "gst_amount": pr.bill_passing.gst_amount,
            "payment_terms": pr.bill_passing.payment_terms,
            "passed_by_id": pr.bill_passing.passed_by_id,
            "remarks": pr.bill_passing.remarks,
        } if pr.bill_passing else None,
        # Deliveries
        "deliveries": [
            {
                "id": d.id,
                "status": d.status,
                "challan_number": d.challan_number,
                "invoice_number": d.invoice_number,
                "received_date": d.received_date.isoformat() if d.received_date else None,
                "created_at": d.created_at.isoformat() + "Z" if d.created_at else None,
                "items": [
                    {
                        "id": item.id,
                        "name": item.name,
                        "challan_quantity": item.challan_quantity,
                        "unit_price": item.unit_price,
                    }
                    for item in d.items
                ]
            }
            for d in pr.deliveries
        ],
        "referrals": [
            {
                "id": ref.id,
                "referred_by": {"id": ref.referred_by.id, "name": ref.referred_by.name, "email": ref.referred_by.email} if ref.referred_by else None,
                "referred_to": {"id": ref.referred_to.id, "name": ref.referred_to.name, "email": ref.referred_to.email} if ref.referred_to else None,
                "query": ref.query,
                "response": ref.response,
                "response_document_path": ref.response_document_path,
                "status": ref.status,
                "created_at": ref.created_at.isoformat() + "Z" if ref.created_at else None,
                "responded_at": ref.responded_at.isoformat() + "Z" if ref.responded_at else None,
            }
            for ref in pr.referrals
        ],
        "history": history,
        "items": [{"id": i.id, "item_description": i.item_description, "estimated_total": i.estimated_total, "quantity": i.quantity} for i in pr.items],
        "flow": {
            "phase_id": pr.flow.phase_id,
            "phase_name": phase_name,
            "step_order": pr.flow.step_order,
            "rejected": pr.flow.rejected,
            "expected_group": expected_group,
            "expected_role_id": expected_role_id,
            "expected_role_name": expected_role_name,
            "expected_user_id": expected_user_id,
            "expected_user_name": expected_user_name,
            "workflow_step_id": step.id if step else None,
            "tender_vendors_threshold": tender_vendors_threshold,
            "tender_vendors_comparison": tender_vendors_comparison,
        } if pr.flow else None,
        "commercial_evaluations": commercial_evaluations,
        "technical_evaluations": technical_evaluations,
        "financial_evaluations": financial_evaluations,
        "assignments": assignments_list,
        "documents": [
            {
                "id": doc.id,
                "doc_key": doc.doc_key,
                "original_name": doc.doc_value.get("original_name"),
                "path": f"/storage/{doc.doc_value.get('path')}" if doc.doc_value.get("path") else None,
                "uploaded_by_id": doc.uploaded_by_id,
                "updated_at": doc.updated_at.isoformat() + "Z" if doc.updated_at else None,
            }
            for doc in pr.documents
        ],
    }


async def verify_no_active_referral(pr_id: int, db: AsyncSession):
    from app.models.purchase_request import PRReferral
    referral_check = await db.execute(
        select(PRReferral).where(
            and_(
                PRReferral.purchase_request_id == pr_id,
                PRReferral.status == "pending"
            )
        )
    )
    if referral_check.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Cannot perform workflow action. Awaiting opinion from consulted user.")


@router.post("/{pr_id}/advance")
async def advance_pr(pr_id: int, body: dict, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    remarks = body.get("remarks")
    if not remarks or not remarks.strip():
        raise HTTPException(status_code=400, detail="Remarks are mandatory for all workflow actions")
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    await verify_no_active_referral(pr.id, db)

    await db.refresh(user, ["role"])
    if user.role and user.role.group_key == "hod":
        from app.models.budget import PhaseManager
        await db.refresh(pr, ["flow"])
        if pr.flow:
            phase_res = await db.execute(select(PhaseManager).where(PhaseManager.id == pr.flow.phase_id))
            phase = phase_res.scalar_one_or_none()
            
            # check if the step expects HOD
            step_res = await db.execute(
                select(WorkFlowHierarchy).where(
                    and_(
                        WorkFlowHierarchy.category_id == pr.category_id,
                        WorkFlowHierarchy.procurement_id == pr.procurement_id,
                        WorkFlowHierarchy.purchase_type == pr.purchase_type,
                        WorkFlowHierarchy.phase_id == pr.flow.phase_id,
                        WorkFlowHierarchy.step_order == pr.flow.step_order,
                        WorkFlowHierarchy.is_enabled == True,
                    )
                )
            )
            step = step_res.scalar_one_or_none()
            is_hod_step = False
            if step:
                await db.refresh(step, ["role"])
                is_hod_step = (step.user_group == "hod") or (step.role and step.role.group_key == "hod")
                
            if (phase and phase.phase_name == "Administrative Approval") or is_hod_step:
                # Auto-assign from budget file nominees if present, else fallback to department
                budget_file = None
                await db.refresh(pr, ["items"])
                if pr.items:
                    budget_file_id = pr.items[0].budget_file_id
                    if budget_file_id:
                        budget_res = await db.execute(select(BudgetMaster).where(BudgetMaster.id == budget_file_id))
                        budget_file = budget_res.scalar_one_or_none()

                if budget_file and (budget_file.expert1_id or budget_file.expert2_id or budget_file.director_faculty_id):
                    pr.faculty1_id = budget_file.expert1_id
                    pr.faculty2_id = budget_file.expert2_id
                    pr.faculty3_id = budget_file.director_faculty_id
                else:
                    await db.refresh(pr, ["initiator"])
                    await db.refresh(pr.initiator, ["department"])
                    dept = pr.initiator.department
                    if dept:
                        pr.faculty1_id = dept.expert1_id
                        pr.faculty2_id = dept.expert2_id
                        pr.faculty3_id = dept.director_faculty_id
                if not pr.faculty1_id or not pr.faculty2_id or not pr.faculty3_id:
                    raise HTTPException(status_code=400, detail="The purchase committee has not been fully configured yet by HOD and Director (either on the budget file or globally for the department). HOD must nominate Expert 1 & 2 and Director must nominate Faculty representative.")

    flow_engine = FlowEngineService(db, background_tasks)
    try:
        await flow_engine.advance(pr, user, remarks, body.get("status"))
        await db.commit()
        return {"message": "PR advanced", "status": pr.current_status}
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{pr_id}/reject")
async def reject_pr(pr_id: int, body: dict, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    reason = body.get("reason")
    if not reason or not reason.strip():
        raise HTTPException(status_code=400, detail="Reason is mandatory for all workflow actions")
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    await verify_no_active_referral(pr.id, db)
    flow_engine = FlowEngineService(db, background_tasks)
    try:
        await flow_engine.reject(pr, user, reason)
        await db.commit()
        return {"message": "PR rejected"}
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{pr_id}/send-back")
async def send_back_pr(pr_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    reason = body.get("reason")
    if not reason or not reason.strip():
        raise HTTPException(status_code=400, detail="Reason is mandatory for all workflow actions")
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    await verify_no_active_referral(pr.id, db)
    flow_engine = FlowEngineService(db)
    try:
        await flow_engine.send_back(pr, user, body["to_step"], reason)
        await db.commit()
        return {"message": "PR sent back"}
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


async def verify_current_user_group_for_pr(pr: PurchaseRequest, user: User, db: AsyncSession, action_type: Optional[str] = None):
    # Admin bypass
    await db.refresh(user, ["role"])
    if user.role.group_key == "admin":
        return
    
    await db.refresh(pr, ["flow"])
    if not pr.flow:
        raise HTTPException(status_code=400, detail="PR has no active workflow")
    
    # Load phase details to check phase name
    phase_res = await db.execute(select(PhaseManager).where(PhaseManager.id == pr.flow.phase_id))
    phase = phase_res.scalar_one_or_none()
    phase_name = phase.phase_name if phase else ""

    result = await db.execute(
        select(WorkFlowHierarchy).where(
            and_(
                WorkFlowHierarchy.category_id == pr.category_id,
                WorkFlowHierarchy.procurement_id == pr.procurement_id,
                WorkFlowHierarchy.purchase_type == pr.purchase_type,
                WorkFlowHierarchy.phase_id == pr.flow.phase_id,
                WorkFlowHierarchy.step_order == pr.flow.step_order,
                WorkFlowHierarchy.is_enabled == True,
            )
        )
    )
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(status_code=400, detail="Workflow step not configured")

    if step.user_type == "user" and step.user_id:
        if user.id != step.user_id:
            user_res = await db.execute(select(User).where(User.id == step.user_id))
            expected_user = user_res.scalar_one_or_none()
            expected_name = expected_user.name if expected_user else f"ID {step.user_id}"
            raise HTTPException(
                status_code=403,
                detail=f"Action requires user {expected_name}, but user is {user.name}",
            )
        return

    expected = step.user_group
    group = user.role.group_key

    # Special tag validations first
    if step.user_type == "purchase_initiator":
        if pr.initiator_id != user.id:
            raise HTTPException(status_code=403, detail="Only the purchase initiator can perform this step")
        return

    elif step.user_type == "da_assigner":
        if action_type == "assign-da":
            if phase_name != "Tendering" or pr.flow.step_order != 1:
                raise HTTPException(status_code=403, detail="DA can only be assigned at Tendering step 1")
        if step.role_id:
            if user.role_id != step.role_id:
                raise HTTPException(status_code=403, detail="Only the Superintendent may perform this action")
        else:
            if group not in ["superintendent", "verifier_sp"]:
                raise HTTPException(status_code=403, detail="Only the Superintendent may perform this action")
        return

    elif step.user_type == "verifier_da":
        assignment_result = await db.execute(
            select(PurchaseRequestAssignment).where(
                and_(
                    PurchaseRequestAssignment.purchase_request_id == pr.id,
                    PurchaseRequestAssignment.assigned_da_id == user.id
                )
            )
        )
        assignment = assignment_result.scalar_one_or_none()
        if not assignment:
            any_assignment_result = await db.execute(
                select(PurchaseRequestAssignment).where(
                    PurchaseRequestAssignment.purchase_request_id == pr.id
                )
            )
            any_assignment = any_assignment_result.scalar_one_or_none()
            if any_assignment:
                raise HTTPException(status_code=403, detail="User is not the assigned Dealing Assistant for this PR")
            auto_assignment = PurchaseRequestAssignment(
                purchase_request_id=pr.id,
                assigned_by_id=user.id,
                assigned_da_id=user.id,
                status=AssignmentStatus.PENDING,
            )
            db.add(auto_assignment)
            await db.flush()
        return

    elif step.user_type == "tech_evaluation":
        from app.models.user import RoleManager
        hod_res = await db.execute(
            select(User)
            .join(RoleManager, User.role_id == RoleManager.id)
            .where(
                and_(
                    User.department_id == pr.initiator.department_id,
                    RoleManager.group_key == "hod"
                )
            )
        )
        hod = hod_res.scalar_one_or_none()
        hod_id = hod.id if hod else None

        await db.refresh(pr.initiator, ["department"])
        dept = pr.initiator.department
        expert1_id = dept.expert1_id if dept else None
        expert2_id = dept.expert2_id if dept else None
        director_faculty_id = dept.director_faculty_id if dept else None

        committee_ids = [hod_id, pr.initiator_id, expert1_id, expert2_id, director_faculty_id]
        if any(x is None for x in committee_ids):
            raise HTTPException(status_code=400, detail="The department purchase committee is not fully formed/configured yet by HOD and Director. Please contact them.")

        # Must be one of the committee members
        if user.id not in committee_ids:
            raise HTTPException(status_code=403, detail="Only the department purchase committee nominees can perform technical evaluation")

        # Check sequential signing order
        since = pr.te_initiated_at or pr.created_at or datetime.min
        await db.refresh(pr, ["history"])
        approved_ids = {
            h.current_approver_id for h in pr.history 
            if h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
            and (h.acted_at is None or h.acted_at >= since)
        }

        pending_index = None
        for idx, cid in enumerate(committee_ids):
            if cid not in approved_ids:
                pending_index = idx
                break

        if pending_index is not None:
            current_turn_id = committee_ids[pending_index]
            if user.id != current_turn_id:
                turn_user_res = await db.execute(select(User.name).where(User.id == current_turn_id))
                turn_user_name = turn_user_res.scalar_one_or_none() or "Another member"
                raise HTTPException(status_code=403, detail=f"It is not your turn to sign/approve. The next signer is {turn_user_name}.")
        return

    # Route action-specific checks (e.g. data uploads)
    if action_type == "assign-da":
        if phase_name != "Tendering" or pr.flow.step_order != 1:
            raise HTTPException(status_code=403, detail="DA can only be assigned at Tendering step 1")
        if step.role_id and user.role_id != step.role_id:
            raise HTTPException(status_code=403, detail="Only the Superintendent may assign a Dealing Assistant")
        return

    if action_type in ["tender-details", "technical-eval", "financial-bids"] and (group == "verifier_da" or step.user_type == "verifier_da"):
        assignment_result = await db.execute(
            select(PurchaseRequestAssignment).where(
                and_(
                    PurchaseRequestAssignment.purchase_request_id == pr.id,
                    PurchaseRequestAssignment.assigned_da_id == user.id
                )
            )
        )
        assignment = assignment_result.scalar_one_or_none()
        if not assignment:
            raise HTTPException(status_code=403, detail="User is not the assigned Dealing Assistant for this PR")
        if action_type == "tender-details" and phase_name != "Tendering":
            raise HTTPException(status_code=403, detail="Tender details can only be registered during Tendering phase")
        if action_type == "technical-eval" and phase_name != "Technical Evaluation":
            raise HTTPException(status_code=403, detail="Technical evaluations can only be registered during Technical Evaluation phase")
        if action_type == "financial-bids" and phase_name not in ["Tendering", "Financial Sanction"]:
            raise HTTPException(status_code=403, detail="Financial bids can only be registered during Tendering or Financial Sanction phase")
        return

    is_initiator_acting_as_faculty = (
        (expected == "faculty" or step.user_type == "purchase_initiator")
        and pr.initiator_id == user.id
    )

    if action_type == "technical-eval" and (group == "faculty" or step.user_type == "tech_evaluation" or user.id == pr.initiator_id):
        from app.models.user import RoleManager
        hod_res = await db.execute(
            select(User)
            .join(RoleManager, User.role_id == RoleManager.id)
            .where(
                and_(
                    User.department_id == pr.initiator.department_id,
                    RoleManager.group_key == "hod"
                )
            )
        )
        hod = hod_res.scalar_one_or_none()
        hod_id = hod.id if hod else None

        await db.refresh(pr.initiator, ["department"])
        dept = pr.initiator.department
        expert1_id = dept.expert1_id if dept else None
        expert2_id = dept.expert2_id if dept else None
        director_faculty_id = dept.director_faculty_id if dept else None

        committee_ids = [hod_id, pr.initiator_id, expert1_id, expert2_id, director_faculty_id]
        if any(x is None for x in committee_ids):
            raise HTTPException(status_code=400, detail="The department purchase committee is not fully formed/configured yet by HOD and Director. Please contact them.")

        if user.id not in committee_ids:
            raise HTTPException(status_code=403, detail="Only the department purchase committee nominees can perform technical evaluation")
        if phase_name != "Technical Evaluation":
            raise HTTPException(status_code=403, detail="Technical evaluations can only be registered during Technical Evaluation phase")
        if step.user_type != "tech_evaluation" and step.user_type != "purchase_initiator" and expected != "faculty":
            raise HTTPException(status_code=403, detail="Evaluator can only submit evaluation when it is their workflow step")
        return

    if action_type == "financial-bids" and (group == "faculty" or step.user_type == "purchase_initiator" or user.id == pr.initiator_id):
        if pr.initiator_id != user.id:
            raise HTTPException(status_code=403, detail="Only the PR initiator can register financial bids")
        if phase_name != "Financial Sanction":
            raise HTTPException(status_code=403, detail="Financial bids can only be registered during Financial Sanction phase")
        if expected != "faculty" and step.user_type != "purchase_initiator":
            raise HTTPException(status_code=403, detail="Initiator can only submit financial bids when it is their workflow step")
        return

    # Standard role checking
    if step.role_id and user.role_id != step.role_id and not is_initiator_acting_as_faculty:
        await db.refresh(step, ["role"])
        role_label = step.role.name if step.role else expected
        raise HTTPException(
            status_code=403,
            detail=f"Action requires {role_label}, but your account has a different role",
        )
    elif expected != group and not is_initiator_acting_as_faculty:
        raise HTTPException(
            status_code=403,
            detail=f"Action requires role {expected}, but user has {group}",
        )
        
    if (expected == "faculty" or step.user_type == "purchase_initiator") and pr.initiator_id != user.id:
        raise HTTPException(status_code=403, detail="Only the initiator can perform this step")
    elif expected == "hod":
        await db.refresh(pr, ["initiator"])
        if pr.initiator.department_id != user.department_id:
            raise HTTPException(status_code=403, detail="Only the HOD of the initiator's department can perform this step")
    elif expected == "verifier_da":
        assignment_result = await db.execute(
            select(PurchaseRequestAssignment).where(
                and_(
                    PurchaseRequestAssignment.purchase_request_id == pr.id,
                    PurchaseRequestAssignment.assigned_da_id == user.id
                )
            )
        )
        assignment = assignment_result.scalar_one_or_none()
        if not assignment:
            # Check if ANY DA is assigned — if not (e.g. Direct Purchase skips Tendering phase),
            # auto-assign the acting DA so they can process this PR without a prior SP assignment step.
            any_assignment_result = await db.execute(
                select(PurchaseRequestAssignment).where(
                    PurchaseRequestAssignment.purchase_request_id == pr.id
                )
            )
            any_assignment = any_assignment_result.scalar_one_or_none()
            if any_assignment:
                # A different DA is already assigned — this user can't act
                raise HTTPException(status_code=403, detail="User is not the assigned Dealing Assistant for this PR")
            # Auto-assign this DA (Direct Purchase flow — no prior SP step)
            auto_assignment = PurchaseRequestAssignment(
                purchase_request_id=pr.id,
                assigned_by_id=user.id,
                assigned_da_id=user.id,
                status=AssignmentStatus.PENDING,
            )
            db.add(auto_assignment)
            await db.commit()



@router.get("/{pr_id}/send-back-candidates")
async def get_send_back_candidates(pr_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")
    flow_engine = FlowEngineService(db)
    candidates = await flow_engine.get_send_back_candidates(pr)
    return [
        {
            "step_order": c.step_order,
            "user_group": c.user_group,
            "user_type": c.role.name if c.role else c.user_type,
        }
        for c in candidates
    ]


@router.post("/{pr_id}/assign-da")
async def assign_da(
    pr_id: int,
    body: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")
    
    await verify_current_user_group_for_pr(pr, user, db, "assign-da")

    da_result = await db.execute(select(User).where(User.id == body["da_id"]))
    da = da_result.scalar_one_or_none()
    if not da:
        raise HTTPException(status_code=404, detail="DA not found")
    assignment = PurchaseRequestAssignment(
        purchase_request_id=pr.id,
        assigned_by_id=user.id,
        assigned_da_id=da.id,
        status=AssignmentStatus.PENDING,
    )
    db.add(assignment)

    flow_engine = FlowEngineService(db, background_tasks)
    try:
        await flow_engine.advance(
            pr=pr,
            acted_by=user,
            remarks=f"Assigned Dealing Assistant: {da.name}",
            status=f"Assigned to {da.name}",
            db_flush=False
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"message": f"PR assigned to {da.name}"}


@router.post("/{pr_id}/tender-details")
async def add_tender_details(
    pr_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("verifier_da")),
):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")
    
    await verify_current_user_group_for_pr(pr, user, db, "tender-details")

    content_type = request.headers.get("content-type", "")
    draft_file = None
    tender_file = None
    form = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw = form.get("payload")
        if not raw:
            raise HTTPException(status_code=400, detail="Missing payload field")
        body = json.loads(raw)
        # Use form.get() directly — more reliable than isinstance filtering
        draft_file = form.get("draft_tender_document")
        tender_file = form.get("tender_document")
        # Treat empty-filename uploads (no file chosen) as None
        if draft_file and not getattr(draft_file, "filename", None):
            draft_file = None
        if tender_file and not getattr(tender_file, "filename", None):
            tender_file = None
    else:
        body = await request.json()

    # Enforce draft tender document validation only for multipart (frontend) requests
    if "multipart/form-data" in content_type:
        await db.refresh(pr, ["documents"])
        existing_draft = next((d for d in pr.documents if d.doc_key == "draft_tender_document"), None)
        if not existing_draft and not draft_file:
            raise HTTPException(status_code=400, detail="Draft tender document is mandatory")

    pr.tender_reference_number = body.get("tender_reference_number")
    if not pr.tender_reference_number or not pr.tender_reference_number.strip():
        raise HTTPException(status_code=400, detail="Tender Reference Number is required")
    
    from datetime import date
    if body.get("date_of_tender"):
        pr.date_of_tender = date.fromisoformat(body["date_of_tender"])
    if body.get("date_of_tech_bid_opening"):
        pr.date_of_tech_bid_opening = date.fromisoformat(body["date_of_tech_bid_opening"])
    if body.get("date_of_financial_bid_opening"):
        pr.date_of_financial_bid_opening = date.fromisoformat(body["date_of_financial_bid_opening"])

    if body.get("vendor_list_link"):
        pr.vendor_list_link = body.get("vendor_list_link")

    # LPC fields
    pr.lpc_remarks = body.get("lpc_remarks")
    pr.lpc_committee_members = body.get("lpc_committee_members")
    pr.lpc_minutes_reference = body.get("lpc_minutes_reference")

    # Document upload handling
    doc_svc = DocumentService(db)
    if draft_file:
        await db.refresh(pr, ["documents"])
        existing_draft = next((d for d in pr.documents if d.doc_key == "draft_tender_document"), None)
        if existing_draft:
            await db.delete(existing_draft)
        await doc_svc.save_upload(pr, "draft_tender_document", draft_file, user.id)

    if tender_file:
        await db.refresh(pr, ["documents"])
        existing_tender = next((d for d in pr.documents if d.doc_key == "tender_document"), None)
        if existing_tender:
            await db.delete(existing_tender)
        await doc_svc.save_upload(pr, "tender_document", tender_file, user.id)

    # Validate vendor name is non-empty
    vendors_input = body.get("vendors", [])
    if not vendors_input:
        raise HTTPException(status_code=400, detail="At least one vendor is required")
    
    for v in vendors_input:
        if not v.get("name") or not v.get("name").strip():
            raise HTTPException(status_code=400, detail="Vendor name cannot be empty")

    # Clear previous evaluations
    await db.execute(delete(CommercialEvaluation).where(CommercialEvaluation.purchase_request_id == pr.id))
    await db.execute(delete(FinancialEvaluation).where(FinancialEvaluation.purchase_request_id == pr.id))

    # Add commercial evaluations
    for v in vendors_input:
        quoted_amt = None
        if v.get("quoted_amount") is not None and str(v.get("quoted_amount")).strip() != "":
            quoted_amt = float(v.get("quoted_amount"))
        
        ce = CommercialEvaluation(
            purchase_request_id=pr.id,
            vendor_name=v["name"].strip(),
            vendor_email=v.get("email").strip() if v.get("email") else None,
            quoted_amount=quoted_amt,
            is_qualified=v.get("is_qualified", True),
            remarks=v.get("remarks"),
        )
        db.add(ce)

    # Auto-populate FinancialEvaluation with rankings
    # Filter qualified vendors that have a quoted amount
    bids = [
        v for v in vendors_input 
        if v.get("quoted_amount") is not None and str(v.get("quoted_amount")).strip() != "" and v.get("is_qualified", True)
    ]
    bids_sorted = sorted(bids, key=lambda x: float(x.get("quoted_amount")))
    for idx, v in enumerate(bids_sorted):
        fa = FinancialEvaluation(
            purchase_request_id=pr.id,
            vendor_name=v["name"].strip(),
            quoted_amount=float(v["quoted_amount"]),
            ranking=f"L{idx+1}",
            remarks=v.get("remarks"),
            is_awarded=False,
        )
        db.add(fa)

    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Tender Details Registered",
        remarks=body.get("remarks") or "Tender details and commercial vendors registered.",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    await db.commit()
    return {"message": "Tender details and vendors saved successfully"}


@router.post("/{pr_id}/technical-eval")
async def add_technical_eval(
    pr_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")

    await verify_current_user_group_for_pr(pr, user, db, "technical-eval")

    content_type = request.headers.get("content-type", "")
    tech_eval_file = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw = form.get("payload")
        if not raw:
            raise HTTPException(status_code=400, detail="Missing payload field in multipart form")
        body = json.loads(raw)
        tech_eval_file = form.get("tech_evaluation_document")
        if tech_eval_file and not getattr(tech_eval_file, "filename", None):
            tech_eval_file = None
    else:
        body = await request.json()

    # Require the tech evaluation PDF document
    if "multipart/form-data" in content_type:
        await db.refresh(pr, ["documents"])
        doc_key = f"tech_eval_doc_{user.id}"
        existing_te_doc = next((d for d in pr.documents if d.doc_key == doc_key), None)
        if not existing_te_doc and not tech_eval_file:
            raise HTTPException(
                status_code=400,
                detail="Technical Evaluation Report PDF is mandatory. Please upload your signed evaluation document."
            )

    # Prevent duplicate submission
    await db.refresh(pr, ["history"])
    has_approval_log = any(
        h.current_approver_id == user.id
        and h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
        for h in pr.history
    )
    if has_approval_log:
        raise HTTPException(
            status_code=409,
            detail="You have already submitted your technical evaluation for this PR."
        )

    # Save tech evaluation PDF document
    doc_svc = DocumentService(db)
    if tech_eval_file:
        doc_key = f"tech_eval_doc_{user.id}"
        await db.refresh(pr, ["documents"])
        existing_te_doc = next((d for d in pr.documents if d.doc_key == doc_key), None)
        if existing_te_doc:
            await db.delete(existing_te_doc)
        await doc_svc.save_upload(pr, doc_key, tech_eval_file, user.id)

    # Save vendor technical qualifications (only initiator submits the vendor list)
    if pr.initiator_id == user.id:
        for vendor in body.get("vendors", []):
            ev = TechnicalEvaluation(
                purchase_request_id=pr.id,
                vendor_name=vendor["name"],
                is_qualified=vendor.get("is_qualified", False),
                remarks=vendor.get("remarks"),
                created_at=datetime.utcnow(),
            )
            db.add(ev)

    status = "Technical Evaluation Completed" if pr.initiator_id == user.id else "Technical Evaluation Approved"
    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status=status,
        remarks=body.get("remarks") or f"Technical evaluation submitted by {user.name}.",
        acted_at=datetime.utcnow(),
    )
    db.add(history)
    await db.commit()
    return {"message": "Technical evaluation saved"}


@router.post("/{pr_id}/financial-bids")
async def add_financial_bids(pr_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")
    
    await verify_current_user_group_for_pr(pr, user, db, "financial-bids")

    # Clear previous financial evaluations
    await db.execute(delete(FinancialEvaluation).where(FinancialEvaluation.purchase_request_id == pr.id))

    # Save single bid justification if provided
    pr.single_bid_justification = body.get("single_bid_justification")

    vendors_input = body.get("vendors", [])
    # Sort vendors by quoted_amount ascending
    vendors_sorted = sorted(vendors_input, key=lambda x: float(x.get("quoted_amount", 0)))

    for idx, vendor in enumerate(vendors_sorted):
        fa = FinancialEvaluation(
            purchase_request_id=pr.id,
            vendor_name=vendor["name"],
            quoted_amount=float(vendor["quoted_amount"]),
            ranking=f"L{idx+1}",
            remarks=vendor.get("remarks"),
            is_awarded=False,
            unit_price=float(vendor["unit_price"]) if vendor.get("unit_price") is not None else None,
            taxes=float(vendor.get("taxes") or 0.0),
            delivery_period=int(vendor["delivery_period"]) if vendor.get("delivery_period") is not None else None,
            warranty=int(vendor["warranty"]) if vendor.get("warranty") is not None else None,
        )
        db.add(fa)

    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Financial Bids Submitted",
        remarks=body.get("remarks"),
        acted_at=datetime.utcnow(),
    )
    db.add(history)
    await db.commit()
    return {"message": "Financial bids saved"}


@router.post("/{pr_id}/award-bid")
async def award_bid(pr_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")

    # Verify the user is the initiator (Faculty)
    if pr.initiator_id != user.id:
        raise HTTPException(status_code=403, detail="Only the purchase initiator can award/select a bid")

    await db.refresh(pr, ["flow"])
    if not pr.flow:
        raise HTTPException(status_code=400, detail="PR has no active workflow")

    phase_res = await db.execute(select(PhaseManager).where(PhaseManager.id == pr.flow.phase_id))
    phase = phase_res.scalar_one_or_none()
    phase_name = phase.phase_name if phase else ""
    
    if phase_name != "Technical Evaluation":
        raise HTTPException(status_code=400, detail="Bids can only be selected during Technical Evaluation phase")

    vendor_id = body.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=400, detail="vendor_id is required")

    eval_result = await db.execute(select(FinancialEvaluation).where(FinancialEvaluation.purchase_request_id == pr.id))
    evals = eval_result.scalars().all()

    found = False
    selected_vendor_name = ""
    for ev in evals:
        if ev.id == int(vendor_id):
            ev.is_awarded = True
            selected_vendor_name = ev.vendor_name
            found = True
        else:
            ev.is_awarded = False

    if not found:
        raise HTTPException(status_code=404, detail="Selected vendor bid not found for this PR")

    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Bid Selected",
        remarks=body.get("remarks") or f"Initiator selected vendor: {selected_vendor_name}",
        acted_at=datetime.utcnow(),
    )
    db.add(history)
    await db.commit()
    return {"message": "Bid awarded successfully", "vendor_name": selected_vendor_name}



@router.get("/{pr_id}/print")
async def print_pr(pr_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await db.refresh(pr, [
        "initiator",
        "purchase_category",
        "procurement",
        "items",
        "history",
        "commercial_evaluations",
        "technical_evaluations",
        "financial_evaluations",
        "assignments",
        "faculty1",
        "faculty2",
        "faculty3",
        "aa_approver",
        "bill_passing",
        "deliveries"
    ])
    if pr.initiator:
        await db.refresh(pr.initiator, ["department"])
    if pr.faculty1:
        await db.refresh(pr.faculty1, ["department"])
    if pr.faculty2:
        await db.refresh(pr.faculty2, ["department"])
    if pr.faculty3:
        await db.refresh(pr.faculty3, ["department"])
    if pr.aa_approver:
        await db.refresh(pr.aa_approver, ["department"])
    
    import io
    import os
    from app.core.config import settings
    history_serialized = []
    # Deduplicate dual logging entries (e.g. custom action + generic Forwarded) by the same user within 60s
    for h in sorted(pr.history, key=lambda x: x.acted_at or datetime.min):
        if h.status in ("Forwarded", "Forwarded to next phase"):
            has_specific_entry = any(
                other.current_approver_id == h.current_approver_id
                and other.status
                and other.status not in ("Forwarded", "Forwarded to next phase")
                and other.acted_at
                and h.acted_at
                and abs((other.acted_at - h.acted_at).total_seconds()) < 60
                for other in pr.history
            )
            if has_specific_entry:
                continue
        actor_name = "System"
        signature_url = None
        designation = "-"
        if h.current_approver_id:
            actor_res = await db.execute(
                select(User)
                .options(selectinload(User.role))
                .where(User.id == h.current_approver_id)
            )
            actor = actor_res.scalar_one_or_none()
            if actor:
                actor_name = actor.name
                designation = actor.designation or (actor.role.name if actor.role else "-")
                if actor.signature_path:
                    signature_url = f"file://{os.path.join(settings.STORAGE_PATH, actor.signature_path)}"
        local_acted_at = to_local_time(h.acted_at)
        history_serialized.append({
            "actor_name": actor_name,
            "designation": designation,
            "status": h.status,
            "remarks": h.remarks or "-",
            "signature_url": signature_url,
            "acted_at_str": local_acted_at.strftime("%d/%m/%Y %H:%M") if local_acted_at else "-"
        })

    from fastapi.templating import Jinja2Templates
    import weasyprint

    local_created_at = to_local_time(pr.created_at)
    local_aa_approved_at = to_local_time(pr.aa_approved_at)

    templates = Jinja2Templates(directory="app/templates")
    html_content = templates.get_template("administrative_approval.html").render({
        "pr": pr,
        "history_serialized": history_serialized,
        "storage_dir": settings.STORAGE_PATH,
        "pr_created_at_str": local_created_at.strftime("%d/%m/%Y %H:%M") if local_created_at else "-",
        "pr_aa_approved_at_str": local_aa_approved_at.strftime("%d/%m/%Y %H:%M") if local_aa_approved_at else "-",
    })

    try:
        pdf_bytes = weasyprint.HTML(string=html_content, base_url=settings.STORAGE_PATH).write_pdf()
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="administrative_approval_pr_{pr_id}.pdf"'}
        )
    except Exception as e:
        import logging
        logging.exception("WeasyPrint PDF generation failed, falling back to HTML representation")
        return HTMLResponse(
            content=html_content,
            status_code=200
        )


@router.post("/{pr_id}/cancel-po")
async def cancel_po(
    pr_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cancel PO for a purchase request and rollback deducted budget amount."""
    result = await db.execute(
        select(PurchaseRequest).where(PurchaseRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    if pr.current_status != RequestStatus.PO_ISSUED:
        raise HTTPException(
            status_code=400,
            detail="Only purchase requests in PO_ISSUED status can have their PO cancelled"
        )

    # Verify permission: initiator, department HOD, or admin
    is_initiator = pr.initiator_id == user.id
    await db.refresh(user, ["role"])
    is_admin = user.role.group_key == "admin"
    
    await db.refresh(pr, ["initiator"])
    is_hod = user.role.group_key == "hod" and user.department_id == pr.initiator.department_id

    if not (is_initiator or is_hod or is_admin):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to cancel this PO"
        )

    reason = body.get("reason")
    reinitiation_method = body.get("reinitiation_method", "none")
    reallocated_amount = float(body.get("reallocated_amount", 0.0))

    if not reason or not reason.strip():
        raise HTTPException(status_code=400, detail="Reason for cancellation is required")

    from app.models.purchase_request import POCancellation
    po_cancel = POCancellation(
        purchase_request_id=pr.id,
        reason=reason,
        reinitiation_method=reinitiation_method,
        reallocated_amount=reallocated_amount,
        cancelled_by_id=user.id,
        cancelled_at=datetime.utcnow()
    )
    db.add(po_cancel)

    # Rollback budget: decrement deducted_amount in BudgetMaster
    from app.models.purchase_request import PurchaseRequestItem
    item_res = await db.execute(
        select(PurchaseRequestItem).where(PurchaseRequestItem.purchase_request_id == pr.id)
    )
    items = item_res.scalars().all()
    
    from collections import defaultdict
    deltas = defaultdict(float)
    for item in items:
        if item.budget_file_id is not None:
            deltas[item.budget_file_id] += item.estimated_total

    from app.models.budget import BudgetMaster
    from sqlalchemy import update, func
    for budget_file_id, delta in deltas.items():
        await db.execute(
            update(BudgetMaster)
            .where(BudgetMaster.id == budget_file_id)
            .values(deducted_amount=func.greatest(0.0, BudgetMaster.deducted_amount - delta))
            .execution_options(synchronize_session=False)
        )

    # Log action to PR history
    from app.models.purchase_request import PurchaseRequestHistory
    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="PO Cancelled",
        remarks=f"Method: {reinitiation_method}. Reason: {reason}",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    # Delete active workflow flow
    from app.models.purchase_request import PurchaseRequestFlow
    await db.execute(
        delete(PurchaseRequestFlow).where(PurchaseRequestFlow.purchase_request_id == pr.id)
    )

    pr.current_status = RequestStatus.CANCELLED
    await db.commit()

    return {"message": "Purchase Order cancelled and budget refunded successfully"}


@router.post("/{pr_id}/bill-passing")
async def add_bill_passing(
    pr_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")

    # Check user role group is verifier_da or admin
    await db.refresh(user, ["role"])
    group = user.role.group_key if user.role else None
    if group not in ("verifier_da", "admin"):
        raise HTTPException(status_code=403, detail="Only Dealing Assistants and Admins can pass bills")

    if pr.current_status != RequestStatus.PO_ISSUED:
        raise HTTPException(status_code=400, detail="Bills can only be passed for PO Issued requests")

    # Verify that there is at least one verified delivery for this PO
    from app.models.inventory import Delivery, DeliveryStatus
    delivery_res = await db.execute(
        select(Delivery).where(
            and_(
                Delivery.po_id == pr.id,
                Delivery.status == DeliveryStatus.VERIFIED
            )
        )
    )
    verified_delivery = delivery_res.scalar_one_or_none()
    if not verified_delivery:
        raise HTTPException(status_code=400, detail="Cannot pass bill. Delivery must be verified first.")

    # Save BillPassing record
    from app.models import BillPassing
    from datetime import date
    invoice_date_str = body.get("invoice_date")
    challan_date_str = body.get("challan_date")

    invoice_date_val = datetime.strptime(invoice_date_str, "%Y-%m-%d").date() if invoice_date_str else date.today()
    challan_date_val = datetime.strptime(challan_date_str, "%Y-%m-%d").date() if challan_date_str else None

    # Clear previous bill passing if exists
    await db.execute(delete(BillPassing).where(BillPassing.purchase_request_id == pr.id))

    bp = BillPassing(
        purchase_request_id=pr.id,
        invoice_number=body["invoice_number"],
        invoice_date=invoice_date_val,
        challan_number=body.get("challan_number"),
        challan_date=challan_date_val,
        bill_amount=float(body["bill_amount"]),
        gst_amount=float(body.get("gst_amount") or 0.0),
        payment_terms=body.get("payment_terms"),
        passed_by_id=user.id,
        remarks=body.get("remarks"),
    )
    db.add(bp)

    # Set PR status to completed
    pr.current_status = RequestStatus.COMPLETED

    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Bill Passed (PR Completed)",
        remarks=body.get("remarks") or f"Bill passed for Invoice No: {body['invoice_number']}",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    await db.commit()
    return {"message": "Bill passed successfully. Purchase Request is now completed."}


@router.post("/{pr_id}/cancel-tender")
async def cancel_tender(
    pr_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cancel tender process for a purchase request and unlock budget."""
    result = await db.execute(
        select(PurchaseRequest).where(PurchaseRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    if pr.current_status in (RequestStatus.PO_ISSUED, RequestStatus.REJECTED, RequestStatus.CANCELLED, RequestStatus.COMPLETED):
        raise HTTPException(
            status_code=400,
            detail="Only active in-progress purchase requests can have their tender process cancelled"
        )

    # Verify permission: initiator, department HOD, or admin
    is_initiator = pr.initiator_id == user.id
    await db.refresh(user, ["role"])
    is_admin = user.role.group_key == "admin"
    
    await db.refresh(pr, ["initiator"])
    is_hod = user.role.group_key == "hod" and user.department_id == pr.initiator.department_id

    if not (is_initiator or is_hod or is_admin):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to cancel this tender"
        )

    reason = body.get("reason")
    reinitiation_method = body.get("reinitiation_method", "none")

    if not reason or not reason.strip():
        raise HTTPException(status_code=400, detail="Reason for cancellation is required")

    from app.models.purchase_request import TenderCancellation
    tender_cancel = TenderCancellation(
        purchase_request_id=pr.id,
        reason=reason,
        reinitiation_method=reinitiation_method,
        cancelled_by_id=user.id,
        cancelled_at=datetime.utcnow()
    )
    db.add(tender_cancel)

    # Rollback budget: release the locked_amount
    from app.services.budget_service import BudgetService
    budget_svc = BudgetService(db)
    await budget_svc.unlock_amount(pr)

    # Log action to PR history
    from app.models.purchase_request import PurchaseRequestHistory
    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Tender Cancelled",
        remarks=f"Method: {reinitiation_method}. Reason: {reason}",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    # Delete active workflow flow
    from app.models.purchase_request import PurchaseRequestFlow
    await db.execute(
        delete(PurchaseRequestFlow).where(PurchaseRequestFlow.purchase_request_id == pr.id)
    )

    pr.current_status = RequestStatus.CANCELLED
    await db.commit()

    return {"message": "Tender process cancelled and budget released successfully"}


@router.post("/{pr_id}/reinitiate")
async def reinitiate_pr(
    pr_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Re-initiate a cancelled purchase request by cloning items and metadata into a new workflow."""
    result = await db.execute(
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.items),
            selectinload(PurchaseRequest.initiator)
        )
        .where(PurchaseRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Original purchase request not found")

    if pr.current_status != RequestStatus.CANCELLED:
        raise HTTPException(
            status_code=400,
            detail="Only cancelled purchase requests can be re-initiated"
        )

    # Verify permission: initiator, department HOD, or admin
    is_initiator = pr.initiator_id == user.id
    await db.refresh(user, ["role"])
    is_admin = user.role.group_key == "admin"
    is_hod = user.role.group_key == "hod" and user.department_id == pr.initiator.department_id

    if not (is_initiator or is_hod or is_admin):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to re-initiate this request"
        )

    # Create new cloned purchase request
    new_pr = PurchaseRequest(
        category_id=pr.category_id,
        financial_year_id=pr.financial_year_id,
        initiator_id=pr.initiator_id,
        nominee_id=pr.nominee_id,
        procurement_id=pr.procurement_id,
        purchase_type=pr.purchase_type,
        amount=pr.amount,
        emd=pr.emd,
        performance_security=pr.performance_security,
        current_status=RequestStatus.PR_SUBMITTED,
        basis_of_estimate_details=pr.basis_of_estimate_details,
        delivery_mode=pr.delivery_mode,
        delivery_location=pr.delivery_location,
        is_service_center_in_south=pr.is_service_center_in_south,
        service_center_south_desc=pr.service_center_south_desc,
        is_quantity_split=pr.is_quantity_split,
        quantity_split_details=pr.quantity_split_details,
        is_item_split=pr.is_item_split,
        item_split_justification=pr.item_split_justification,
        exemption=pr.exemption,
        exemption_remarks=pr.exemption_remarks,
        is_training_required=pr.is_training_required,
        training_type=pr.training_type,
        training_vendor=pr.training_vendor,
        training_comments=pr.training_comments,
        form_data=pr.form_data,
        parent_pr_id=pr.id,
    )
    db.add(new_pr)
    await db.flush()

    # Clone items
    for item in pr.items:
        new_item = PurchaseRequestItem(
            purchase_request_id=new_pr.id,
            budget_file_id=item.budget_file_id,
            item_description=item.item_description,
            quantity=item.quantity,
            estimated_total=item.estimated_total,
            charges=item.charges,
            requirement_type=item.requirement_type,
            availability=item.availability,
            availability_remarks=item.availability_remarks,
            site_readiness=item.site_readiness,
            site_readiness_remarks=item.site_readiness_remarks,
            warranty=item.warranty,
            delivery_period=item.delivery_period,
            present_stock=item.present_stock,
            justification_for_procurement=item.justification_for_procurement,
            previous_file_no_reference=item.previous_file_no_reference,
            installation_required=item.installation_required,
            tech_specs_text=item.tech_specs_text,
            gem_link=item.gem_link,
        )
        db.add(new_item)
    await db.flush()

    # Clone documents (e.g. tech specs, quotations)
    from app.models.purchase_request import Document
    doc_res = await db.execute(select(Document).where(Document.purchase_request_id == pr.id))
    docs = doc_res.scalars().all()
    for doc in docs:
        new_doc = Document(
            purchase_request_id=new_pr.id,
            doc_key=doc.doc_key,
            doc_value=doc.doc_value,
            uploaded_by_id=doc.uploaded_by_id,
        )
        db.add(new_doc)

    # Set cloned ICR number
    from app.models.budget import FinancialYear
    fy_res = await db.execute(select(FinancialYear).where(FinancialYear.id == new_pr.financial_year_id))
    fy = fy_res.scalar_one()
    
    await db.refresh(pr.initiator, ["department"])
    dept_code = pr.initiator.department.short_code if pr.initiator.department else "GEN"
    new_pr.icr_number = f"ICR/S&P/{fy.label}/{dept_code}/{new_pr.id}"

    # Initialize new workflow using FlowEngineService (locks budget, triggers step 1)
    from app.services.flow_engine import FlowEngineService
    flow_engine = FlowEngineService(db, background_tasks)
    await flow_engine.initialize(new_pr, pr.initiator)
    
    await db.commit()

    return {
        "message": "Purchase request re-initiated successfully",
        "id": new_pr.id,
        "icr_number": new_pr.icr_number
    }


@router.post("/{pr_id}/refer")
async def refer_pr(pr_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    # Validate that the user is the currently expected approver of the active step
    await verify_current_user_group_for_pr(pr, user, db)

    # Check if there is already an active pending referral
    active_ref = await db.execute(
        select(PRReferral).where(
            and_(
                PRReferral.purchase_request_id == pr.id,
                PRReferral.status == "pending"
            )
        )
    )
    if active_ref.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This purchase request is already referred for consultation")

    referred_to_id = body.get("referred_to_id")
    query = body.get("query")
    if not referred_to_id:
        raise HTTPException(status_code=400, detail="referred_to_id is required")
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Consultation query is required")

    # Validate referred_to user
    target_res = await db.execute(select(User).where(User.id == referred_to_id))
    target_user = target_res.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=400, detail="Selected consultation user not found")

    referral = PRReferral(
        purchase_request_id=pr.id,
        referred_by_id=user.id,
        referred_to_id=referred_to_id,
        query=query.strip(),
        status="pending"
    )
    db.add(referral)

    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Referred for Consultation",
        remarks=f"Referred to {target_user.name} ({target_user.email}) for opinion. Query: {query}",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    await db.commit()
    return {"message": "Purchase request referred for consultation successfully", "referral_id": referral.id}


@router.post("/{pr_id}/refer/respond")
async def respond_referral(
    pr_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    # Fetch active pending referral for this user on this PR
    ref_res = await db.execute(
        select(PRReferral).where(
            and_(
                PRReferral.purchase_request_id == pr.id,
                PRReferral.referred_to_id == user.id,
                PRReferral.status == "pending"
            )
        )
    )
    referral = ref_res.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=403, detail="You do not have a pending consultation request for this purchase request")

    content_type = request.headers.get("content-type", "")
    response_file = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw = form.get("payload")
        if not raw:
            raise HTTPException(status_code=400, detail="Missing payload field")
        body = json.loads(raw)
        response_file = form.get("response_document")
        if response_file and not getattr(response_file, "filename", None):
            response_file = None
    else:
        body = await request.json()

    response_text = body.get("response")
    if not response_text or not response_text.strip():
        raise HTTPException(status_code=400, detail="Response comments are required")

    # Save document if uploaded
    doc_path = None
    if response_file:
        from app.services.document_service import DocumentService
        doc_svc = DocumentService(db)
        doc_record = await doc_svc.save_upload(pr, f"referral_{referral.id}_response", response_file, user.id)
        doc_path = f"/storage/{doc_record.doc_value.get('path')}"

    # Update referral record
    referral.response = response_text.strip()
    referral.response_document_path = doc_path
    referral.status = "responded"
    referral.responded_at = datetime.utcnow()

    # Log history
    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Consultation Response Submitted",
        remarks=f"Opinion provided by {user.name}: {response_text.strip()}",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    await db.commit()
    return {"message": "Consultation response submitted successfully"}
