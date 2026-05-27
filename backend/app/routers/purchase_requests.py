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
    VendorMaster
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
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await db.refresh(pr, ["initiator", "purchase_category", "procurement", "items", "history", "flow",
                          "technical_evaluations", "financial_evaluations", "commercial_evaluations", "assignments", "documents",
                          "faculty1", "faculty2", "faculty3", "aa_approver"])

    # BOLA fix: department-scope check
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

    if not is_expected_user:
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
            from sqlalchemy.orm import selectinload
            await db.refresh(step, ["role", "user"])
            expected_group = step.user_group
            expected_role_id = step.role_id
            expected_role_name = step.role.name if step.role else (step.user_group.replace("_", " ").title() if step.user_group else None)
            if step.user_type == "user" and step.user_id:
                expected_user_id = step.user_id
                expected_user_name = step.user.name if step.user else None
        phase_res = await db.execute(select(PhaseManager.phase_name).where(PhaseManager.id == pr.flow.phase_id))
        phase_name = phase_res.scalar_one_or_none()

        # Get threshold if exists in the current phase
        threshold_res = await db.execute(
            select(WorkFlowHierarchy.tender_vendors_threshold)
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
            from sqlalchemy.orm import selectinload
            actor_res = await db.execute(
                select(User).options(selectinload(User.role)).where(User.id == h.current_approver_id)
            )
            actor = actor_res.scalar_one_or_none()
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
            da_res = await db.execute(select(User.name).where(User.id == a.assigned_da_id))
            da_name = da_res.scalar_one_or_none() or ""
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
        }
        for fe in pr.financial_evaluations
    ]

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
        # Delivery & Basis fields
        "delivery_location": pr.delivery_location,
        "delivery_mode": pr.delivery_mode,
        "basis_of_estimate": pr.basis_of_estimate_details,
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


@router.post("/{pr_id}/advance")
async def advance_pr(pr_id: int, body: dict, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    remarks = body.get("remarks")
    if not remarks or not remarks.strip():
        raise HTTPException(status_code=400, detail="Remarks are mandatory for all workflow actions")
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

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
                faculty1_id = body.get("faculty1_id") or pr.faculty1_id
                faculty2_id = body.get("faculty2_id") or pr.faculty2_id
                faculty3_id = body.get("faculty3_id") or pr.faculty3_id
                if not faculty1_id or not faculty2_id or not faculty3_id:
                    raise HTTPException(status_code=400, detail="HOD must assign Faculty 1, Faculty 2, and Director Nominee committee members to approve this request.")
                if len({faculty1_id, faculty2_id, faculty3_id}) < 3:
                    raise HTTPException(status_code=400, detail="All 3 committee members must be different.")
                pr.faculty1_id = faculty1_id
                pr.faculty2_id = faculty2_id
                pr.faculty3_id = faculty3_id

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
        allowed_ids = {pr.initiator_id, pr.faculty1_id, pr.faculty2_id, getattr(pr, "faculty3_id", None)}
        if user.id not in allowed_ids:
            raise HTTPException(status_code=403, detail="Only the purchase initiator or purchase committee nominees can perform technical evaluation")
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
        allowed_ids = {pr.initiator_id, pr.faculty1_id, pr.faculty2_id, getattr(pr, "faculty3_id", None)}
        if user.id not in allowed_ids:
            raise HTTPException(status_code=403, detail="Only the purchase initiator or purchase committee nominees can perform technical evaluation")
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
        "aa_approver"
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
