import json
import io
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, UploadFile, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.limiter import limiter
from sqlalchemy import select, and_, delete, or_, func
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime, date

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import User, RoleManager, Department
from app.models.purchase_request import (
    PurchaseRequest, PurchaseRequestItem, PurchaseRequestHistory,
    PurchaseRequestFlow, PurchaseRequestAssignment, TechnicalEvaluation, FinancialEvaluation,
    CommercialEvaluation, Document, WorkFlowHierarchy, RequestStatus, AssignmentStatus,
    VendorMaster, PRReferral, PurchaseOrder
)
from app.models.budget import BudgetMaster, PurchaseCategory, ProcurementManager, PhaseManager, FinancialYear
from app.services.flow_engine import FlowEngineService
from app.services.budget_service import BudgetService
from app.services.document_service import DocumentService
from app.models.inventory import Delivery
from app.models.administrative_approval import AdministrativeApproval

from app.schemas.pr_create import PRCreatePayload, PRItemCreate
from app.schemas.purchase_order import PurchaseOrderCreate

from datetime import timedelta, timezone

router = APIRouter(prefix="/api/pr", tags=["purchase-requests"])

# Roles/group_keys that can view any PR cross-department.
# Includes apex leadership AND cross-department procurement staff.
ADMIN_ROLES = {
    # Admin / apex group keys
    "admin", "director", "dean", "dean_pd", "dean_approver", "apex_approver",
    # Procurement staff group keys (cross-department by nature)
    "verifier_sp",      # Superintendent, Consultant S&P, AR, DR
    "verifier_da",      # Dealing Assistant
    "verifier_general", # Associate Dean P&D
    # And their individual role values for belt-and-suspenders coverage
    "superintendent", "consultant_sp", "assistant_registrar", "deputy_registrar",
    "dealing_assistant", "adpd",
}

async def check_pr_access(pr: PurchaseRequest, user: User, db: AsyncSession):
    # Admin bypass
    await db.refresh(user, ["role"])
    group_key = user.role.group_key if user.role else None
    role_value = user.role.value if user.role else None
    
    if group_key in ADMIN_ROLES or role_value in ADMIN_ROLES:
        return
        
    is_direct_actor = False
    if pr.initiator_id == user.id or user.id in (pr.faculty1_id, pr.faculty2_id, pr.faculty3_id, pr.nominee_id):
        is_direct_actor = True
        
    if not is_direct_actor:
        from app.models.purchase_request import PurchaseRequestAssignment
        da_check = await db.execute(
            select(PurchaseRequestAssignment).where(
                and_(
                    PurchaseRequestAssignment.purchase_request_id == pr.id,
                    PurchaseRequestAssignment.assigned_da_id == user.id
                )
            )
        )
        if da_check.scalar_one_or_none():
            is_direct_actor = True
            
    if not is_direct_actor:
        from app.models.purchase_request import PRReferral
        ref_check = await db.execute(
            select(PRReferral).where(
                and_(
                    PRReferral.purchase_request_id == pr.id,
                    PRReferral.referred_to_id == user.id,
                    PRReferral.status == "pending"
                )
            )
        )
        if ref_check.scalar_one_or_none():
            is_direct_actor = True
            
    if not is_direct_actor:
        await db.refresh(pr, ["flow"])
        if pr.flow:
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
            if step and step.user_type == "user" and step.user_id == user.id:
                is_direct_actor = True
            
    await db.refresh(pr, ["initiator"])
    pr_dept_id = pr.initiator.department_id if pr.initiator else None
    # Same-department check: both must have a non-None department that matches.
    is_same_dept = (pr_dept_id is not None and pr_dept_id == user.department_id)

    if not (is_same_dept or is_direct_actor):
        raise HTTPException(
            status_code=403,
            detail="Access denied: you are not associated with this purchase request"
        )


async def check_pr_fy_closed(pr: PurchaseRequest, db: AsyncSession):
    from app.models.budget import FinancialYear
    fy_res = await db.execute(select(FinancialYear).where(FinancialYear.id == pr.financial_year_id))
    fy = fy_res.scalar_one_or_none()
    if fy and fy.is_closed:
        raise HTTPException(
            status_code=400,
            detail="Action not allowed: The financial year for this purchase request is closed."
        )


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
    parent_pr_data = None
    if "parent_pr" in pr.__dict__ and pr.parent_pr:
        parent_pr_data = {"id": pr.parent_pr.id, "icr_number": pr.parent_pr.icr_number}
        
    child_prs_data = []
    if "child_prs" in pr.__dict__ and pr.child_prs:
        child_prs_data = [{"id": c.id, "icr_number": c.icr_number} for c in pr.child_prs]

    aa_data = None
    if "administrative_approval" in pr.__dict__ and pr.administrative_approval:
        aa = pr.administrative_approval
        aa_data = {
            "id": aa.id,
            "aa_number": aa.aa_number,
            "status": aa.status,
            "attachment_path": aa.attachment_path,
            "attachment_url": f"/static/uploads/{aa.attachment_path}" if aa.attachment_path else None,
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
        }

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
        "parent_pr": parent_pr_data,
        "child_prs": child_prs_data,
        "administrative_approval_id": pr.administrative_approval_id,
        "administrative_approval": aa_data,
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
    initiator_id = user.id
    if user.role.group_key == "hod":
        if not payload.initiator_id:
            raise HTTPException(status_code=400, detail="Purchase Initiator must be assigned by HOD")
        init_res = await db.execute(
            select(User)
            .join(RoleManager, User.role_id == RoleManager.id)
            .where(
                and_(
                    User.id == payload.initiator_id,
                    User.department_id == user.department_id,
                    RoleManager.group_key == "faculty",
                )
            )
        )
        target_init = init_res.scalar_one_or_none()
        if not target_init:
            raise HTTPException(
                status_code=400,
                detail="Invalid Purchase Initiator. The initiator must be a faculty member in your department."
            )
        initiator_id = payload.initiator_id

    selected_file_ids = payload.selected_file_ids

    # Validate administrative approval (mandatory)
    if not payload.administrative_approval_id:
        raise HTTPException(
            status_code=400,
            detail="Administrative Approval is mandatory before creating a Purchase Request."
        )
    aa_res = await db.execute(
        select(AdministrativeApproval)
        .options(selectinload(AdministrativeApproval.nominees))
        .where(AdministrativeApproval.id == payload.administrative_approval_id)
    )
    aa = aa_res.scalar_one_or_none()
    if not aa:
        raise HTTPException(status_code=400, detail="Invalid Administrative Approval reference.")
    if aa.status != "Administrative Approval Granted":
        raise HTTPException(status_code=400, detail="Administrative Approval is not granted yet.")
    if aa.budget_file_id not in selected_file_ids:
        raise HTTPException(
            status_code=400,
            detail="Selected budget file does not match the budget file of the Administrative Approval."
        )


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
        bm_result = await db.execute(select(BudgetMaster).where(BudgetMaster.id == fid).with_for_update())
        bm = bm_result.scalar_one_or_none()
        if not bm:
            raise HTTPException(status_code=404, detail=f"Budget file {fid} not found")
        if bm.department_id != user.department_id:
            raise HTTPException(status_code=403, detail="Budget file belongs to a different department")
        if user.role.group_key == "faculty" and bm.allocated_initiator_id != user.id:
            raise HTTPException(status_code=403, detail="Budget file is not allocated to you")
        if bm.file_no.upper().startswith("TEMP"):
            raise HTTPException(
                status_code=400,
                detail=f"Budget file {bm.file_no} has a temporary file number and cannot be selected for a Purchase Indent until the Dean allocates a permanent file number."
            )
        budget_by_id[fid] = bm
        
        item_data = items_by_budget.get(fid)
        if not item_data:
            raise HTTPException(status_code=400, detail=f"Missing item details for budget file {fid}")
            
        # Allow override of locked quantity by user specified quantity
        item_qty = item_data.quantity if (item_data and item_data.quantity is not None) else bm.quantity
        item_est_total = item_qty * bm.unit_cost
        
        # If this budget file has a linked AA that has committed budget, add it back for validation
        effective_available = bm.available_balance
        if aa and aa.budget_file_id == fid:
            effective_available += aa.total_cost

        if item_est_total > effective_available:
            raise HTTPException(
                status_code=422,
                detail=f"Requested amount ₹{item_est_total:,.2f} (Qty: {item_qty}) for item '{bm.item_name}' exceeds available budget ₹{effective_available:,.2f}."
            )
        total_amount += item_est_total

    if len(budget_by_id) > 1:
        sources_of_fund = sorted(list({bm.source_of_fund for bm in budget_by_id.values() if bm.source_of_fund}))
        if len(sources_of_fund) > 1:
            raise HTTPException(
                status_code=422,
                detail=f"All items in a Purchase Indent must belong to the same Source of Fund. Found: {', '.join(sources_of_fund)}."
            )

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

    fy_result = await db.execute(
        select(FinancialYear).where(FinancialYear.is_active == True)
    )
    financial_year = fy_result.scalar_one_or_none()
    if not financial_year:
        raise HTTPException(status_code=400, detail="No active financial year configured")
    if financial_year.is_closed:
        raise HTTPException(status_code=400, detail="The active financial year is closed. No new purchase requests can be created.")

    proc_result = await db.execute(select(ProcurementManager).where(ProcurementManager.id == payload.mop))
    procurement = proc_result.scalar_one_or_none()
    if not procurement:
        raise HTTPException(status_code=400, detail="Invalid procurement method")

    # Ensure AA mode of procurement matches the selected procurement method (mop)
    if aa:
        mopName = aa.mode_of_procurement.lower()
        procName = procurement.name.lower()
        if not (mopName in procName or procName in mopName):
            raise HTTPException(
                status_code=400,
                detail=f"Selected Procurement Method '{procurement.name}' does not match the Administrative Approval's Mode of Procurement '{aa.mode_of_procurement}'."
            )

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

    # Load committee defaults: budget file nominees take precedence over department defaults
    dept = user.department
    faculty1_id = None
    faculty2_id = None
    faculty3_id = None
    if dept:
        faculty1_id = dept.expert1_id
        faculty2_id = dept.expert2_id
        faculty3_id = dept.director_faculty_id

    committee_nominee_ids = None
    if aa and aa.nominees:
        committee_nominee_ids = [nom.nominee_id for nom in aa.nominees]

    if selected_file_ids:
        primary_budget = budget_by_id.get(selected_file_ids[0])
        if primary_budget:
            faculty1_id = primary_budget.expert1_id or faculty1_id
            faculty2_id = primary_budget.expert2_id or faculty2_id
            faculty3_id = primary_budget.director_faculty_id or faculty3_id
            if not committee_nominee_ids and primary_budget.nominee_ids:
                committee_nominee_ids = list(primary_budget.nominee_ids)

    merged_form_data = payload.form_data or {}
    merged_form_data.update({
        "laboratory_office": payload.laboratory_office,
        "source_of_fund": payload.source_of_fund,
        "source_of_fund_project_code": payload.source_of_fund_project_code,
        "source_of_fund_others": payload.source_of_fund_others,
        "bog_resolution_no": payload.bog_resolution_no,
        "fc_resolution_no": payload.fc_resolution_no,
        "item_category": payload.item_category,
        "basis_of_estimate_others": payload.basis_of_estimate_others,
        "purpose": payload.purpose,
        "purpose_justification": payload.purpose_justification,
        "mii_clause": payload.mii_clause,
        "mii_justification": payload.mii_justification,
    })
 
    any_training_required = False
    specs_dict = merged_form_data.get("specs", {})
    if isinstance(specs_dict, dict):
        for s_val in specs_dict.values():
            if isinstance(s_val, dict) and s_val.get("training_required") == "Yes":
                any_training_required = True

    pr = PurchaseRequest(
        category_id=category.id,
        financial_year_id=financial_year.id,
        initiator_id=initiator_id,
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
        is_training_required=any_training_required,
        training_type=payload.training_type,
        training_vendor=payload.training_vendor,
        form_data=merged_form_data,
        faculty1_id=faculty1_id,
        faculty2_id=faculty2_id,
        faculty3_id=faculty3_id,
        administrative_approval_id=payload.administrative_approval_id,
        committee_nominee_ids=committee_nominee_ids,
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

        # Allow override of locked quantity by user specified quantity
        item_qty = item_data.quantity if (item_data and item_data.quantity is not None) else bm.quantity
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

    dept_pac = uploads.get("dept_pac_file")
    if dept_pac and dept_pac.filename:
        await doc_svc.save_upload(pr, "dept_pac_file", dept_pac, user.id)

    oem_pac = uploads.get("oem_pac_file")
    if oem_pac and oem_pac.filename:
        await doc_svc.save_upload(pr, "oem_pac_file", oem_pac, user.id)

    oem_auth = uploads.get("oem_auth_file")
    if oem_auth and oem_auth.filename:
        await doc_svc.save_upload(pr, "oem_auth_file", oem_auth, user.id)

    dept_code = user.department.short_code if user.department else "GEN"
    pr.icr_number = f"ICR/S&P/{financial_year.label}/{dept_code}/{pr.id}"

    flow_engine = FlowEngineService(db, background_tasks)
    await flow_engine.initialize(pr, user)
    await db.commit()

    return {"message": "Purchase request created", "id": pr.id, "icr_number": pr.icr_number}


@router.post("/")
@limiter.limit("20/minute")
async def create_pr(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("faculty")),
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
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List PRs filtered by role scope."""
    base_query = select(PurchaseRequest)
    group = user.role.group_key if user.role else None

    if group == "faculty":
        base_query = base_query.join(User, PurchaseRequest.initiator_id == User.id).join(Department, User.department_id == Department.id)
        base_query = base_query.where(
            or_(
                PurchaseRequest.initiator_id == user.id,
                PurchaseRequest.faculty1_id == user.id,
                PurchaseRequest.faculty2_id == user.id,
                PurchaseRequest.faculty3_id == user.id,
                and_(PurchaseRequest.faculty1_id == None, Department.expert1_id == user.id),
                and_(PurchaseRequest.faculty2_id == None, Department.expert2_id == user.id),
            )
        )
    elif group == "hod":
        # HOD sees all PRs from their department
        base_query = base_query.join(User, PurchaseRequest.initiator_id == User.id).where(
            User.department_id == user.department_id
        )
    elif group in ("verifier_sp", "superintendent"):
        # SP Exclusivity: hide PRs at Tendering Step 1 that are already claimed by a different SP.
        # A PR is "claimed" when another SP created a PurchaseRequestAssignment (assigned_by_id != user.id).
        # Unclaimed PRs, self-claimed PRs, and PRs in all other phases/steps remain visible.
        other_sp_claimed_subq = (
            select(PurchaseRequestAssignment.purchase_request_id)
            .where(PurchaseRequestAssignment.assigned_by_id != user.id)
        ).scalar_subquery()
        tendering_step1_subq = (
            select(PurchaseRequestFlow.purchase_request_id)
            .where(
                and_(
                    PurchaseRequestFlow.step_order == 1,
                    PurchaseRequestFlow.phase_id.in_(
                        select(PhaseManager.id).where(PhaseManager.phase_name == "Tendering")
                    )
                )
            )
        ).scalar_subquery()
        base_query = base_query.where(
            or_(
                # Not at Tendering step 1 — always visible to all SPs
                ~PurchaseRequest.id.in_(tendering_step1_subq),
                # At Tendering step 1 but NOT claimed by any other SP
                ~PurchaseRequest.id.in_(other_sp_claimed_subq),
            )
        )

    # Get total count
    from sqlalchemy import func
    count_query = select(func.count(PurchaseRequest.id))
    if group == "faculty":
        count_query = count_query.join(User, PurchaseRequest.initiator_id == User.id).join(Department, User.department_id == Department.id)
        count_query = count_query.where(
            or_(
                PurchaseRequest.initiator_id == user.id,
                PurchaseRequest.faculty1_id == user.id,
                PurchaseRequest.faculty2_id == user.id,
                PurchaseRequest.faculty3_id == user.id,
                and_(PurchaseRequest.faculty1_id == None, Department.expert1_id == user.id),
                and_(PurchaseRequest.faculty2_id == None, Department.expert2_id == user.id),
            )
        )
    elif group == "hod":
        count_query = count_query.join(User, PurchaseRequest.initiator_id == User.id).where(
            User.department_id == user.department_id
        )
    elif group in ("verifier_sp", "superintendent"):
        # Mirror the SP exclusivity filter for the count query
        other_sp_claimed_subq_c = (
            select(PurchaseRequestAssignment.purchase_request_id)
            .where(PurchaseRequestAssignment.assigned_by_id != user.id)
        ).scalar_subquery()
        tendering_step1_subq_c = (
            select(PurchaseRequestFlow.purchase_request_id)
            .where(
                and_(
                    PurchaseRequestFlow.step_order == 1,
                    PurchaseRequestFlow.phase_id.in_(
                        select(PhaseManager.id).where(PhaseManager.phase_name == "Tendering")
                    )
                )
            )
        ).scalar_subquery()
        count_query = count_query.where(
            or_(
                ~PurchaseRequest.id.in_(tendering_step1_subq_c),
                ~PurchaseRequest.id.in_(other_sp_claimed_subq_c),
            )
        )
    
    total = await db.scalar(count_query) or 0

    query = base_query.options(
        selectinload(PurchaseRequest.initiator).selectinload(User.department),
        selectinload(PurchaseRequest.purchase_category),
        selectinload(PurchaseRequest.procurement),
        selectinload(PurchaseRequest.flow),
        selectinload(PurchaseRequest.referrals).selectinload(PRReferral.referred_by),
        selectinload(PurchaseRequest.referrals).selectinload(PRReferral.referred_to),
        selectinload(PurchaseRequest.history),
        selectinload(PurchaseRequest.assignments).selectinload(PurchaseRequestAssignment.assigned_by)
    ).order_by(PurchaseRequest.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    prs = result.scalars().all()

    serialized = []
    for pr in prs:
        flow_data = None
        if pr.flow:
            res = await db.execute(
                select(WorkFlowHierarchy).options(
                    selectinload(WorkFlowHierarchy.role),
                    selectinload(WorkFlowHierarchy.user)
                ).where(
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
            phase_res = await db.execute(select(PhaseManager.phase_name).where(PhaseManager.id == pr.flow.phase_id))
            phase_name = phase_res.scalar_one_or_none()
            if step:
                expected_user_id = step.user_id
                expected_user_name = step.user.name if step.user else None
                if step.role and step.role.value == "superintendent" and pr.flow.step_order > 1 and pr.assignments:
                    latest_assignment = pr.assignments[-1]
                    if latest_assignment.assigned_by:
                        expected_user_id = latest_assignment.assigned_by_id
                        expected_user_name = latest_assignment.assigned_by.name

                flow_data = {
                    "phase_id": pr.flow.phase_id,
                    "phase_name": phase_name,
                    "step_order": pr.flow.step_order,
                    "expected_group": step.user_group,
                    "expected_role_id": step.role_id,
                    "expected_role_name": step.role.name if step.role else (step.user_group.replace("_", " ").title() if step.user_group else None),
                    "expected_user_id": expected_user_id,
                    "expected_user_name": expected_user_name,
                    "step_type": step.user_type,
                }
        
        referrals_data = []
        for ref in pr.referrals:
            referrals_data.append({
                "id": ref.id,
                "status": ref.status,
                "referred_to": {"id": ref.referred_to.id} if ref.referred_to else None,
                "referred_by": {"id": ref.referred_by.id} if ref.referred_by else None,
            })

        history_data = []
        for h in pr.history:
            history_data.append({
                "id": h.id,
                "status": h.status,
                "approver_id": h.current_approver_id,
                "acted_at": h.acted_at.isoformat() + "Z" if h.acted_at else None,
            })

        pr_dict = _serialize_pr(pr)
        pr_dict["flow"] = flow_data
        pr_dict["referrals"] = referrals_data
        pr_dict["history"] = history_data
        pr_dict["te_initiated_at"] = pr.te_initiated_at.isoformat() + "Z" if pr.te_initiated_at else None
        pr_dict["faculty1_id"] = pr.faculty1_id
        pr_dict["faculty2_id"] = pr.faculty2_id
        pr_dict["faculty3_id"] = pr.faculty3_id
        
        serialized.append(pr_dict)
    return {"items": serialized, "total": total}


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
            selectinload(PurchaseRequest.initiator).selectinload(User.department),
            selectinload(PurchaseRequest.purchase_category),
            selectinload(PurchaseRequest.procurement),
            selectinload(PurchaseRequest.items).selectinload(PurchaseRequestItem.budget_file),
            selectinload(PurchaseRequest.history),
            selectinload(PurchaseRequest.flow),
            selectinload(PurchaseRequest.technical_evaluations),
            selectinload(PurchaseRequest.financial_evaluations),
            selectinload(PurchaseRequest.commercial_evaluations),
            selectinload(PurchaseRequest.assignments).selectinload(PurchaseRequestAssignment.assigned_by),
            selectinload(PurchaseRequest.documents),
            selectinload(PurchaseRequest.faculty1),
            selectinload(PurchaseRequest.faculty2),
            selectinload(PurchaseRequest.faculty3),
            selectinload(PurchaseRequest.aa_approver),
            selectinload(PurchaseRequest.bill_passing),
            selectinload(PurchaseRequest.deliveries).selectinload(Delivery.items),
            selectinload(PurchaseRequest.referrals).selectinload(PRReferral.referred_by),
            selectinload(PurchaseRequest.referrals).selectinload(PRReferral.referred_to),
            selectinload(PurchaseRequest.parent_pr),
            selectinload(PurchaseRequest.child_prs),
            selectinload(PurchaseRequest.purchase_order),
            selectinload(PurchaseRequest.administrative_approval)
        )
        .where(PurchaseRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await check_pr_access(pr, user, db)

    if pr.flow:
        from app.models.budget import PhaseManager
        phase_res = await db.execute(select(PhaseManager.phase_name).where(PhaseManager.id == pr.flow.phase_id))
        phase_name_for_sync = phase_res.scalar_one_or_none()
        if phase_name_for_sync == "Technical Evaluation" and pr.flow.step_order == 1:
            from app.services.tech_committee import sync_tech_committee_to_pr
            await sync_tech_committee_to_pr(db, pr)
            await db.refresh(pr, ["faculty1", "faculty2", "faculty3"])
                           
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
            if step.role and step.role.value == "superintendent" and pr.flow.step_order > 1 and pr.assignments:
                latest_assignment = pr.assignments[-1]
                if latest_assignment.assigned_by:
                    expected_user_id = latest_assignment.assigned_by_id
                    expected_user_name = latest_assignment.assigned_by.name
        phase_res = await db.execute(select(PhaseManager.phase_name).where(PhaseManager.id == pr.flow.phase_id))
        phase_name = phase_res.scalar_one_or_none()

        # Get threshold and comparison if exists in the current phase
        from sqlalchemy import or_
        threshold_res = await db.execute(
            select(
                WorkFlowHierarchy.condition_field,
                WorkFlowHierarchy.condition_operator,
                WorkFlowHierarchy.condition_value,
                WorkFlowHierarchy.tender_vendors_threshold,
                WorkFlowHierarchy.tender_vendors_comparison
            )
            .where(
                and_(
                    WorkFlowHierarchy.category_id == pr.category_id,
                    WorkFlowHierarchy.procurement_id == pr.procurement_id,
                    WorkFlowHierarchy.purchase_type == pr.purchase_type,
                    WorkFlowHierarchy.phase_id == pr.flow.phase_id,
                    or_(
                        WorkFlowHierarchy.condition_field != None,
                        WorkFlowHierarchy.tender_vendors_threshold != None,
                    )
                )
            )
            .limit(1)
        )
        row = threshold_res.first()
        condition_field = row[0] if row else None
        condition_operator = row[1] if row else None
        condition_value = row[2] if row else None
        tender_vendors_threshold = row[3] if row else None
        tender_vendors_comparison = row[4] if row else None

    dept = pr.initiator.department

    # Gather user IDs for batch loading (prevents N+1 queries)
    user_ids = set()
    for h in pr.history:
        if h.current_approver_id:
            user_ids.add(h.current_approver_id)
    for a in pr.assignments:
        if a.assigned_da_id:
            user_ids.add(a.assigned_da_id)
    for d in pr.documents:
        if d.uploaded_by_id:
            user_ids.add(d.uploaded_by_id)
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
            .options(selectinload(User.role), selectinload(User.department))
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
        actor_name = h.frozen_actor_name or ""
        actor_role_name = h.frozen_designation or ""
        actor_dept_name = h.frozen_department or ""
        frozen_sig = None
        
        if h.current_approver_id:
            actor = users_by_id.get(h.current_approver_id)
            if actor:
                if not actor_name:
                    actor_name = actor.name
                if not actor_role_name:
                    actor_role_name = actor.role.name if actor.role else ""
                if not actor_dept_name:
                    actor_dept_name = actor.department.name if actor.department else ""
                if actor.signature_path:
                    frozen_sig = f"/storage/{actor.signature_path}"
                    
        if not frozen_sig:
            frozen_sig = h.frozen_signature_path
            if frozen_sig and not frozen_sig.startswith("/storage/") and not frozen_sig.startswith("http"):
                frozen_sig = f"/storage/{frozen_sig}"
                    
        history.append({
            "id": h.id,
            "status": h.status,
            "remarks": h.remarks,
            "acted_at": h.acted_at.isoformat() + "Z" if h.acted_at else None,
            "approver_id": h.current_approver_id,
            "actor_name": actor_name,
            "actor_role_name": actor_role_name,
            "frozen_actor_name": actor_name,
            "frozen_designation": actor_role_name,
            "frozen_department": actor_dept_name,
            "frozen_signature_path": frozen_sig,
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
    hod = hod_res.scalars().first()
    
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

    # Split-demand detection logic
    is_potential_split = False
    if pr.procurement and pr.procurement.max_amount is not None:
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        split_prs_res = await db.execute(
            select(PurchaseRequest)
            .join(User, PurchaseRequest.initiator_id == User.id)
            .where(
                and_(
                    PurchaseRequest.id != pr.id,
                    PurchaseRequest.category_id == pr.category_id,
                    PurchaseRequest.initiator_id == pr.initiator_id,
                    User.department_id == pr.initiator.department_id,
                    PurchaseRequest.created_at >= thirty_days_ago,
                    PurchaseRequest.current_status != "rejected",
                )
            )
        )
        split_prs = split_prs_res.scalars().all()
        combined_total = pr.amount + sum(sp.amount for sp in split_prs)
        if combined_total > pr.procurement.max_amount:
            is_potential_split = True

    return {
        **_serialize_pr(pr),
        "is_potential_split": is_potential_split,
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
        "tender_scheduling_done": pr.tender_scheduling_done,
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
                "query_document_path": ref.query_document_path,
                "response": ref.response,
                "response_document_path": ref.response_document_path,
                "status": ref.status,
                "referral_type": ref.referral_type,
                "created_at": ref.created_at.isoformat() + "Z" if ref.created_at else None,
                "responded_at": ref.responded_at.isoformat() + "Z" if ref.responded_at else None,
            }
            for ref in pr.referrals
        ],
        "history": history,
        "items": [
            {
                "id": i.id,
                "item_description": i.item_description,
                "estimated_total": i.estimated_total,
                "quantity": i.quantity,
                "budget_file_id": i.budget_file_id,
                "charges": i.charges,
                "requirement_type": i.requirement_type,
                "availability": i.availability,
                "availability_remarks": i.availability_remarks,
                "site_readiness": i.site_readiness,
                "site_readiness_remarks": i.site_readiness_remarks,
                "warranty": i.warranty,
                "delivery_period": i.delivery_period,
                "present_stock": i.present_stock,
                "justification_for_procurement": i.justification_for_procurement,
                "previous_file_no_reference": i.previous_file_no_reference,
                "installation_required": i.installation_required,
                "tech_specs_text": i.tech_specs_text,
                "gem_link": i.gem_link,
                "budget_file": {
                    "id": i.budget_file.id,
                    "file_no": i.budget_file.file_no,
                    "department_id": i.budget_file.department_id,
                } if i.budget_file else None,
            }
            for i in pr.items
        ],
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
            "step_type": step.user_type if step else None,
            "tender_vendors_threshold": tender_vendors_threshold,
            "tender_vendors_comparison": tender_vendors_comparison,
            "condition_field": condition_field,
            "condition_operator": condition_operator,
            "condition_value": condition_value,
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
                "path": f"/static/uploads/{doc.doc_value.get('path')}" if doc.doc_value.get("path") else None,
                "uploaded_by_id": doc.uploaded_by_id,
                "uploaded_by_name": users_by_id.get(doc.uploaded_by_id).name if doc.uploaded_by_id and users_by_id.get(doc.uploaded_by_id) else None,
                "updated_at": doc.updated_at.isoformat() + "Z" if doc.updated_at else None,
            }
            for doc in pr.documents
        ],
        "purchase_order": {
            "id": pr.purchase_order.id,
            "po_number": pr.purchase_order.po_number,
            "vendor_name": pr.purchase_order.vendor_name,
            "vendor_address": pr.purchase_order.vendor_address,
            "vendor_gst": pr.purchase_order.vendor_gst,
            "vendor_bank_account": pr.purchase_order.vendor_bank_account,
            "vendor_bank_name": pr.purchase_order.vendor_bank_name,
            "vendor_ifsc": pr.purchase_order.vendor_ifsc,
            "po_amount": pr.purchase_order.po_amount,
            "delivery_due_date": pr.purchase_order.delivery_due_date.isoformat() if pr.purchase_order.delivery_due_date else None,
            "ps_amount": pr.purchase_order.ps_amount,
            "ps_mode": pr.purchase_order.ps_mode,
            "ps_validity": pr.purchase_order.ps_validity.isoformat() if pr.purchase_order.ps_validity else None,
            "emd_amount": pr.purchase_order.emd_amount,
            "ld_applicable": pr.purchase_order.ld_applicable,
            "issued_by_id": pr.purchase_order.issued_by_id,
            "issued_at": pr.purchase_order.issued_at.isoformat() + "Z" if pr.purchase_order.issued_at else None,
            "remarks": pr.purchase_order.remarks,
        } if pr.purchase_order else None,
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
    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)
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
                
            if phase and phase.phase_name in ("Indent and Detailed Tech Specification", "Administrative Approval") and is_hod_step:
                # Prioritize overrides passed in the request body
                body_faculty1 = body.get("faculty1_id")
                body_faculty2 = body.get("faculty2_id")
                body_faculty3 = body.get("faculty3_id")
                
                if body_faculty1 and body_faculty2:
                    pr.faculty1_id = body_faculty1
                    pr.faculty2_id = body_faculty2
                else:
                    # Auto-assign from department default if budget master doesn't have it
                    await db.refresh(pr, ["initiator"])
                    if pr.initiator:
                        await db.refresh(pr.initiator, ["department"])
                    dept = pr.initiator.department if pr.initiator else None
                    
                    budget_file = None
                    await db.refresh(pr, ["items"])
                    if pr.items:
                        budget_file_id = pr.items[0].budget_file_id
                        if budget_file_id:
                            budget_res = await db.execute(select(BudgetMaster).where(BudgetMaster.id == budget_file_id))
                            budget_file = budget_res.scalar_one_or_none()
  
                    expert1_id = budget_file.expert1_id if (budget_file and budget_file.expert1_id) else (dept.expert1_id if dept else None)
                    expert2_id = budget_file.expert2_id if (budget_file and budget_file.expert2_id) else (dept.expert2_id if dept else None)
                    
                    pr.faculty1_id = expert1_id
                    pr.faculty2_id = expert2_id

                if body_faculty3:
                    pr.faculty3_id = body_faculty3

                if not pr.faculty1_id or not pr.faculty2_id:
                    raise HTTPException(
                        status_code=400,
                        detail="The purchase committee experts (Expert 1 & 2) have not been configured yet. HOD must nominate Expert 1 & 2."
                    )

    user_group = user.role.group_key if user.role else None
    user_role = user.role.value if user.role else None

    if user_role == "director" or user_group == "admin" or user_group == "apex_approver":
        from app.models.budget import PhaseManager
        await db.refresh(pr, ["flow"])
        if pr.flow:
            phase_res = await db.execute(select(PhaseManager).where(PhaseManager.id == pr.flow.phase_id))
            phase = phase_res.scalar_one_or_none()
            if phase and phase.phase_name in ("Indent and Detailed Tech Specification", "Administrative Approval"):
                body_faculty3 = body.get("faculty3_id")
                if body_faculty3:
                    pr.faculty3_id = body_faculty3
                else:
                    # Auto-assign from department default if budget master doesn't have it
                    await db.refresh(pr, ["initiator"])
                    if pr.initiator:
                        await db.refresh(pr.initiator, ["department"])
                    dept = pr.initiator.department if pr.initiator else None
                    
                    budget_file = None
                    await db.refresh(pr, ["items"])
                    if pr.items:
                        budget_file_id = pr.items[0].budget_file_id
                        if budget_file_id:
                            budget_res = await db.execute(select(BudgetMaster).where(BudgetMaster.id == budget_file_id))
                            budget_file = budget_res.scalar_one_or_none()
                            
                    faculty3_id = budget_file.director_faculty_id if (budget_file and budget_file.director_faculty_id) else (dept.director_faculty_id if dept else None)
                    pr.faculty3_id = faculty3_id
                
                if not pr.faculty3_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Director nominee has not been configured yet. Director must nominate a faculty representative."
                    )
 
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
    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)
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
    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)
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
        from app.services.tech_committee import is_tech_committee_configured, get_tech_committee_member_ids, sync_tech_committee_to_pr
        await sync_tech_committee_to_pr(db, pr)
        if not await is_tech_committee_configured(db, pr):
            raise HTTPException(
                status_code=400,
                detail="The technical evaluation committee is not fully configured on the budget file. "
                       "Assign Expert 1, Expert 2, and Director nominee before proceeding.",
            )
        committee_ids = await get_tech_committee_member_ids(db, pr)

        # Must be one of the committee members
        if user.id not in committee_ids:
            raise HTTPException(status_code=403, detail="Only the department purchase committee nominees can perform technical evaluation")

        # Check if user has already signed
        since = pr.te_initiated_at or pr.created_at or datetime.min
        await db.refresh(pr, ["history"])
        approved_ids = {
            h.current_approver_id for h in pr.history 
            if h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
            and (h.acted_at is None or h.acted_at >= since)
        }

        if user.id in approved_ids:
            raise HTTPException(status_code=400, detail="You have already signed/approved the technical evaluation.")
        return

    # Route action-specific checks (e.g. data uploads)
    if action_type == "assign-da":
        if phase_name != "Tendering" or pr.flow.step_order != 1:
            raise HTTPException(status_code=403, detail="DA can only be assigned at Tendering step 1")
        if step.role_id and user.role_id != step.role_id:
            raise HTTPException(status_code=403, detail="Only the Superintendent may assign a Dealing Assistant")
        return

    if action_type in ["tender-schedule", "tender-details", "technical-eval", "financial-bids"] and (group == "verifier_da" or step.user_type == "verifier_da"):
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
        if action_type == "tender-schedule" and phase_name != "Tendering":
            raise HTTPException(status_code=403, detail="Tender can only be scheduled during Tendering phase")
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

    if action_type == "technical-eval":
        if phase_name != "Technical Evaluation":
            raise HTTPException(status_code=403, detail="Technical evaluations can only be registered during Technical Evaluation phase")
        if step.user_type != "tech_evaluation":
            raise HTTPException(status_code=403, detail="Evaluator can only submit evaluation when it is their workflow step")

        from app.services.tech_committee import is_tech_committee_configured, get_tech_committee_member_ids, sync_tech_committee_to_pr
        await sync_tech_committee_to_pr(db, pr)
        if not await is_tech_committee_configured(db, pr):
            raise HTTPException(
                status_code=400,
                detail="The technical evaluation committee is not fully configured on the budget file.",
            )
        committee_ids = await get_tech_committee_member_ids(db, pr)

        if user.id not in committee_ids:
            raise HTTPException(status_code=403, detail="Only the department purchase committee nominees can perform technical evaluation")
        return

    if action_type == "financial-bids" and (group == "faculty" or step.user_type == "purchase_initiator" or user.id == pr.initiator_id):
        if pr.initiator_id != user.id:
            raise HTTPException(status_code=403, detail="Only the PR initiator can register financial bids")
        if phase_name != "Financial Sanction":
            raise HTTPException(status_code=403, detail="Financial bids can only be registered during Financial Sanction phase")
        if expected != "faculty" and step.user_type != "purchase_initiator":
            raise HTTPException(status_code=403, detail="Initiator can only submit financial bids when it is their workflow step")
        return

    # Enforce that only the Superintendent who assigned the DA can perform subsequent steps
    if step.role_id:
        await db.refresh(step, ["role"])
        if step.role and step.role.value == "superintendent" and pr.flow.step_order > 1:
            await db.refresh(pr, ["assignments"])
            if pr.assignments:
                latest_assignment = pr.assignments[-1]
                if latest_assignment.assigned_by_id != user.id:
                    await db.refresh(latest_assignment, ["assigned_by"])
                    assigner_name = latest_assignment.assigned_by.name if latest_assignment.assigned_by else f"ID {latest_assignment.assigned_by_id}"
                    raise HTTPException(
                        status_code=403,
                        detail=f"Only the Superintendent who assigned the Dealing Assistant ({assigner_name}) can perform this action"
                    )

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
    await check_pr_access(pr, user, db)
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
    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)
    
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


@router.post("/{pr_id}/tender-schedule")
async def schedule_tender(
    pr_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("verifier_da")),
):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")
    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)
    
    await verify_current_user_group_for_pr(pr, user, db, "tender-schedule")

    if pr.tender_scheduling_done:
        raise HTTPException(status_code=400, detail="Tender is already scheduled")

    content_type = request.headers.get("content-type", "")
    draft_file = None
    form = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw = form.get("payload")
        if not raw:
            raise HTTPException(status_code=400, detail="Missing payload field")
        body = json.loads(raw)
        draft_file = form.get("draft_tender_document")
        if draft_file and not getattr(draft_file, "filename", None):
            draft_file = None
    else:
        body = await request.json()

    if "multipart/form-data" in content_type:
        await db.refresh(pr, ["documents"])
        existing_draft = next((d for d in pr.documents if d.doc_key == "draft_tender_document"), None)
        if not existing_draft and not draft_file:
            raise HTTPException(status_code=400, detail="Draft tender document is mandatory")

    tender_ref = body.get("tender_reference_number")
    if not tender_ref or not tender_ref.strip():
        raise HTTPException(status_code=400, detail="Tender Reference Number is required")
    pr.tender_reference_number = tender_ref

    from datetime import date
    if body.get("date_of_tender"):
        pr.date_of_tender = date.fromisoformat(body["date_of_tender"])
    else:
        raise HTTPException(status_code=400, detail="Tender date is required")

    if body.get("date_of_tech_bid_opening"):
        pr.date_of_tech_bid_opening = date.fromisoformat(body["date_of_tech_bid_opening"])
    if body.get("date_of_financial_bid_opening"):
        pr.date_of_financial_bid_opening = date.fromisoformat(body["date_of_financial_bid_opening"])

    doc_svc = DocumentService(db)
    if draft_file:
        await db.refresh(pr, ["documents"])
        existing_draft = next((d for d in pr.documents if d.doc_key == "draft_tender_document"), None)
        if existing_draft:
            await db.delete(existing_draft)
        await doc_svc.save_upload(pr, "draft_tender_document", draft_file, user.id)

    pr.tender_scheduling_done = True

    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Tender Scheduled",
        remarks=body.get("remarks") or "Tender scheduled — Awaiting SP Review.",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    await db.commit()
    return {"message": "Tender scheduled successfully"}


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
    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)
    
    await verify_current_user_group_for_pr(pr, user, db, "tender-details")

    if not pr.tender_scheduling_done:
        raise HTTPException(status_code=400, detail="Tender must be scheduled first before entering vendor details")

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
        draft_file = form.get("draft_tender_document")
        tender_file = form.get("tender_document")
        if draft_file and not getattr(draft_file, "filename", None):
            draft_file = None
        if tender_file and not getattr(tender_file, "filename", None):
            tender_file = None
    else:
        body = await request.json()

    if body.get("tender_reference_number"):
        pr.tender_reference_number = body.get("tender_reference_number")
    
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
    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)

    # Eagerly load initiator (and its department) so verify_current_user_group_for_pr
    # doesn't trigger lazy-load MissingGreenlet errors in async context
    await db.refresh(pr, ["initiator", "flow"])
    if pr.initiator:
        await db.refresh(pr.initiator, ["department"])

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
    await db.flush()

    # Auto-advance when every committee member has signed (same request as /advance after submit)
    from app.services.flow_engine import FlowEngineService
    from app.services.tech_committee import is_tech_committee_configured, get_tech_committee_member_ids, sync_tech_committee_to_pr
    await sync_tech_committee_to_pr(db, pr)
    since = pr.te_initiated_at or pr.created_at or datetime.min
    await db.refresh(pr, ["history", "flow"])
    if await is_tech_committee_configured(db, pr):
        required_ids = set(await get_tech_committee_member_ids(db, pr))
        approved_ids = {
            h.current_approver_id for h in pr.history
            if h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
            and (h.acted_at is None or h.acted_at >= since)
        }
        if required_ids.issubset(approved_ids) and pr.flow:
            flow_engine = FlowEngineService(db)
            try:
                await flow_engine.advance(pr, user, body.get("remarks") or "All committee members signed — advancing")
            except ValueError:
                pass

    await db.commit()
    return {"message": "Technical evaluation saved"}


@router.post("/{pr_id}/financial-bids")
async def add_financial_bids(pr_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")
    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)
    
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
    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)

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
async def print_pr(
    pr_id: int,
    module: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    import io
    from app.services.pdf_service import PDFService

    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await check_pr_access(pr, user, db)

    pdf_service = PDFService(db)
    pdf_bytes, filename, is_fallback, html_content = await pdf_service.generate_pr_pdf(pr, module)

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


@router.post("/{pr_id}/purchase-order")
async def create_purchase_order(
    pr_id: int,
    payload: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a Purchase Order for a Purchase Request."""
    result = await db.execute(
        select(PurchaseRequest).where(PurchaseRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)

    # Restriction check: stores/admin/DA
    await db.refresh(user, ["role"])
    group_key = user.role.group_key if user.role else None
    if group_key not in ("verifier_sp", "verifier_da", "admin"):
        raise HTTPException(status_code=403, detail="You do not have permission to issue a purchase order")

    # Check if a PO already exists for this PR
    po_res = await db.execute(
        select(PurchaseOrder).where(PurchaseOrder.purchase_request_id == pr_id)
    )
    existing_po = po_res.scalar_one_or_none()
    if existing_po:
        raise HTTPException(status_code=400, detail="A purchase order has already been issued for this purchase request")

    # Generate PO Number: PO/{financial_year.label}/{dept_short_code}/{seq:03d}
    await db.refresh(pr, ["financial_year", "initiator"])
    if pr.initiator:
        await db.refresh(pr.initiator, ["department"])
    
    fy_label = pr.financial_year.label if pr.financial_year else "FY"
    dept_code = pr.initiator.department.short_code if (pr.initiator and pr.initiator.department) else "DEPT"

    # Count how many POs exist in the current financial year
    count_stmt = select(func.count(PurchaseOrder.id)).join(
        PurchaseRequest, PurchaseOrder.purchase_request_id == PurchaseRequest.id
    ).where(PurchaseRequest.financial_year_id == pr.financial_year_id)
    
    count_res = await db.execute(count_stmt)
    po_count = count_res.scalar_one()
    seq = po_count + 1
    po_number = f"PO/{fy_label}/{dept_code}/{seq:03d}"

    # Create PurchaseOrder
    new_po = PurchaseOrder(
        purchase_request_id=pr.id,
        po_number=po_number,
        vendor_name=payload.vendor_name,
        vendor_address=payload.vendor_address,
        vendor_gst=payload.vendor_gst,
        vendor_bank_account=payload.vendor_bank_account,
        vendor_bank_name=payload.vendor_bank_name,
        vendor_ifsc=payload.vendor_ifsc,
        po_amount=payload.po_amount,
        delivery_due_date=payload.delivery_due_date,
        ps_amount=payload.ps_amount,
        ps_mode=payload.ps_mode,
        ps_validity=payload.ps_validity,
        emd_amount=payload.emd_amount,
        ld_applicable=payload.ld_applicable,
        issued_by_id=user.id,
        remarks=payload.remarks,
    )
    db.add(new_po)

    pr.current_status = RequestStatus.PO_ISSUED
    
    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="PO Issued",
        remarks=payload.remarks or f"Purchase Order {po_number} issued to {payload.vendor_name}",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    await db.commit()
    await db.refresh(new_po)
    
    return {
        "message": "Purchase order issued successfully",
        "po_number": new_po.po_number,
        "po": {
            "id": new_po.id,
            "po_number": new_po.po_number,
            "vendor_name": new_po.vendor_name,
            "po_amount": new_po.po_amount,
            "issued_at": new_po.issued_at.isoformat() + "Z" if new_po.issued_at else None,
        }
    }


@router.get("/{pr_id}/purchase-order")
async def get_purchase_order(
    pr_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fetch Purchase Order details for a Purchase Request."""
    result = await db.execute(
        select(PurchaseRequest).where(PurchaseRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await check_pr_access(pr, user, db)

    po_res = await db.execute(
        select(PurchaseOrder).where(PurchaseOrder.purchase_request_id == pr_id)
    )
    po = po_res.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found for this purchase request")

    return {
        "id": po.id,
        "purchase_request_id": po.purchase_request_id,
        "po_number": po.po_number,
        "vendor_name": po.vendor_name,
        "vendor_address": po.vendor_address,
        "vendor_gst": po.vendor_gst,
        "vendor_bank_account": po.vendor_bank_account,
        "vendor_bank_name": po.vendor_bank_name,
        "vendor_ifsc": po.vendor_ifsc,
        "po_amount": po.po_amount,
        "delivery_due_date": po.delivery_due_date.isoformat() if po.delivery_due_date else None,
        "ps_amount": po.ps_amount,
        "ps_mode": po.ps_mode,
        "ps_validity": po.ps_validity.isoformat() if po.ps_validity else None,
        "emd_amount": po.emd_amount,
        "ld_applicable": po.ld_applicable,
        "issued_by_id": po.issued_by_id,
        "issued_at": po.issued_at.isoformat() + "Z" if po.issued_at else None,
        "remarks": po.remarks,
    }


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

    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)

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
            .values(utilized_amount=func.greatest(0.0, BudgetMaster.utilized_amount - delta))
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
    result = await db.execute(
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.bill_passing),
            selectinload(PurchaseRequest.initiator),
            selectinload(PurchaseRequest.history),
        )
        .where(PurchaseRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")

    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)

    if pr.current_status != RequestStatus.PO_ISSUED and pr.current_status != RequestStatus.COMPLETED:
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

    await db.refresh(user, ["role"])
    group = user.role.group_key if user.role else None

    from app.models import BillPassing
    from app.services.flow_engine import FlowEngineService
    from datetime import date
    flow_svc = FlowEngineService(db)

    # Let's check the stage based on existing bill_passing record
    bp = pr.bill_passing
    if not bp:
        # STAGE 1: Purchase Initiator Drafting
        if pr.initiator_id != user.id and group != "admin":
            raise HTTPException(status_code=403, detail="Only the Purchase Initiator or Admin can draft the bill passing details.")

        invoice_date_str = body.get("invoice_date")
        challan_date_str = body.get("challan_date")
        invoice_date_val = datetime.strptime(invoice_date_str, "%Y-%m-%d").date() if invoice_date_str else date.today()
        challan_date_val = datetime.strptime(challan_date_str, "%Y-%m-%d").date() if challan_date_str else None

        # Build extra_info
        extra_info = {
            "status": "pending_hod",
            "packing_and_forwarding_charges": float(body.get("packing_and_forwarding_charges") or 0.0),
            "other_charges": float(body.get("other_charges") or 0.0),
            "other_charges_specification": body.get("other_charges_specification") or "",
            "due_date_of_supply": body.get("due_date_of_supply"),
            "actual_date_of_delivery": body.get("actual_date_of_delivery"),
            "delay_days": int(body.get("delay_days") or 0),
            "delay_reason": body.get("delay_reason") or "",
            "liquidity_damages_deducted": body.get("liquidity_damages_deducted") or "No",
            "justification_for_ld": body.get("justification_for_ld") or "",
            "ps_terms": body.get("ps_terms") or "",
            "warranty_terms": body.get("warranty_terms") or "",
            "mode_of_ps": body.get("mode_of_ps") or "",
            "value_of_ps": float(body.get("value_of_ps") or 0.0),
            "validity_of_ps": body.get("validity_of_ps") or "",
            "warranty_period_required": body.get("warranty_period_required") or "No",
            "warranty_period_months": int(body.get("warranty_period_months") or 0),
            "installation_required": body.get("installation_required") or "No",
            "installation_certificate_enclosed": body.get("installation_certificate_enclosed") or "No",
            "supplier_name": body.get("supplier_name") or "",
            "supplier_gst": body.get("supplier_gst") or "",
            "invoice_amount": float(body.get("invoice_amount") or 0.0),
            "justification": body.get("justification") or "",
            "firm_name": body.get("firm_name") or "",
            "account_number": body.get("account_number") or "",
            "account_holder_name": body.get("account_holder_name") or "",
            "bank_name": body.get("bank_name") or "",
            "branch_name": body.get("branch_name") or "",
            "ifsc_code": body.get("ifsc_code") or "",
            "lab_office_name": body.get("lab_office_name") or "",
            "total_accepted_value": float(body.get("total_accepted_value") or 0.0),
            "ps_withheld": float(body.get("ps_withheld") or 0.0),
            "ld_imposed": float(body.get("ld_imposed") or 0.0),
            "advance_paid": float(body.get("advance_paid") or 0.0),
            "lc_released": float(body.get("lc_released") or 0.0),
            "part_payment": float(body.get("part_payment") or 0.0),
            "net_amount": float(body.get("net_amount") or 0.0),
        }

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
            extra_info=extra_info,
        )
        db.add(bp)
        await flow_svc._add_history(pr, user, "Bill Passing Initiated", body.get("remarks") or "Bill passing drafted and submitted to HOD.")

    else:
        # Load extra_info
        extra_info = dict(bp.extra_info or {})
        bp_status = extra_info.get("status", "pending_hod")

        if bp_status == "pending_hod":
            # STAGE 2: HOD Review & Signing
            await db.refresh(pr, ["initiator"])
            if not pr.initiator:
                raise HTTPException(status_code=400, detail="PR has no initiator department context.")
            is_hod = group == "hod" and user.department_id == pr.initiator.department_id
            if not is_hod and group != "admin":
                raise HTTPException(status_code=403, detail="Only the department HOD or Admin can sign/approve this stage.")

            extra_info["non_consumable_vol"] = body.get("non_consumable_vol") or ""
            extra_info["non_consumable_page"] = body.get("non_consumable_page") or ""
            extra_info["consumable_vol"] = body.get("consumable_vol") or ""
            extra_info["consumable_page"] = body.get("consumable_page") or ""
            extra_info["status"] = "pending_superintendent"

            # Allow updates to bp primary fields if HOD changes them (optional safety)
            if "invoice_number" in body: bp.invoice_number = body["invoice_number"]
            if "bill_amount" in body: bp.bill_amount = float(body["bill_amount"])
            if "gst_amount" in body: bp.gst_amount = float(body["gst_amount"])
            if "remarks" in body: bp.remarks = body["remarks"]

            bp.extra_info = extra_info
            # Flag modified to persist
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(bp, "extra_info")
            await flow_svc._add_history(pr, user, "Bill Passing Approved by HOD", body.get("remarks") or "HOD verified stock entries and approved.")

        elif bp_status == "pending_superintendent":
            # STAGE 3: Superintendent S&P Review & Signing
            if group != "verifier_sp" and group != "admin":
                raise HTTPException(status_code=403, detail="Only Superintendent S&P or Admin can sign/approve this stage.")

            extra_info["asset_register_volume"] = body.get("asset_register_volume") or ""
            extra_info["asset_register_page"] = body.get("asset_register_page") or ""
            extra_info["received_stores_date"] = body.get("received_stores_date")
            extra_info["status"] = "completed"

            bp.extra_info = extra_info
            bp.passed_by_id = user.id
            if "remarks" in body: bp.remarks = body["remarks"]

            # Mark Purchase Request as COMPLETED
            pr.current_status = RequestStatus.COMPLETED

            # Flag modified to persist
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(bp, "extra_info")
            await flow_svc._add_history(pr, user, "Bill Passed (PR Completed)", body.get("remarks") or f"Bill passed for Invoice No: {bp.invoice_number}")

        else:
            raise HTTPException(status_code=400, detail="Bill passing is already completed.")

    await db.commit()
    return {"message": "Bill passing status updated successfully."}


@router.post("/{pr_id}/cancel-tender")
async def cancel_tender(
    pr_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cancel tender process is disabled. Purchase requests can only be cancelled after PO is issued."""
    raise HTTPException(
        status_code=400,
        detail="Cancellation is only allowed once the Purchase Order has been issued"
    )


@router.post("/{pr_id}/allocate-budget-file")
async def allocate_budget_file(
    pr_id: int,
    body: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Allow Dean Budget/Finance or Admin to directly allocate a permanent budget file number
    and resume a purchase request paused at the Budget File Allocation stage."""
    await db.refresh(user, ["role"])
    group_key = user.role.group_key if user.role else None
    if group_key not in ("dean_approver", "admin"):
        raise HTTPException(status_code=403, detail="Only Dean Budget/Finance or Admin can allocate a budget file number")

    # Allow Dean P&D (Budget) to allocate budget files

    result = await db.execute(
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.items).selectinload(PurchaseRequestItem.budget_file),
            selectinload(PurchaseRequest.flow),
        )
        .where(PurchaseRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    if pr.current_status != RequestStatus.BUDGET_FILE_ALLOCATION:
        raise HTTPException(
            status_code=400,
            detail="This purchase request is not paused at the Budget File Allocation stage"
        )

    new_file_no = (body.get("file_no") or "").strip().upper()
    allocation_remarks = (body.get("remarks") or "").strip()
    selected_budget_file_id = body.get("selected_budget_file_id")

    if new_file_no and new_file_no.upper().startswith("TEMP"):
        raise HTTPException(status_code=400, detail="The allocated file number must not be a temporary reference (must not start with TEMP)")

    # Update all temporary budget files linked to this PR to the permanent file number
    updated_budget_ids = set()
    allocated_names = []

    if selected_budget_file_id:
        from app.models.budget import BudgetMaster
        new_bm_res = await db.execute(select(BudgetMaster).where(BudgetMaster.id == selected_budget_file_id))
        new_bm = new_bm_res.scalar_one_or_none()
        if not new_bm:
            raise HTTPException(status_code=404, detail="Selected budget file not found")
        if new_bm.file_no.upper().startswith("TEMP"):
            raise HTTPException(status_code=400, detail="Selected budget file must be a permanent reference")

        for item in pr.items:
            old_bm = item.budget_file
            if old_bm and old_bm.file_no.upper().startswith("TEMP"):
                old_file_no = old_bm.file_no
                old_budget_id = old_bm.id

                # Dec locked amount on old temp budget
                old_bm.committed_amount = max(0.0, old_bm.committed_amount - item.estimated_total)

                # Inc locked amount on new selected budget
                new_bm.committed_amount += item.estimated_total

                # Re-link item to the permanent budget
                item.budget_file_id = new_bm.id
                await db.flush()

                updated_budget_ids.add(old_budget_id)
                allocated_names.append(f"{old_file_no} -> {new_bm.file_no} (Assigned Existing)")

                # Clean up the old temporary budget file if no longer referenced anywhere
                ref_count_res = await db.execute(
                    select(func.count(PurchaseRequestItem.id)).where(PurchaseRequestItem.budget_file_id == old_budget_id)
                )
                ref_count = ref_count_res.scalar() or 0
                if ref_count == 0:
                    await db.delete(old_bm)
                    await db.flush()
    else:
        for item in pr.items:
            if item.budget_file and item.budget_file.file_no.upper().startswith("TEMP"):
                if item.budget_file.id not in updated_budget_ids:
                    old_file_no = item.budget_file.file_no
                    if new_file_no:
                        item_file_no = new_file_no
                    else:
                        from app.routers.admin import generate_permanent_file_number
                        item_file_no = await generate_permanent_file_number(
                            db,
                            item.budget_file.department_id,
                            item.budget_file.source_of_fund,
                            item.budget_file.financial_year_id
                        )
                    item.budget_file.file_no = item_file_no
                    await db.flush()
                    updated_budget_ids.add(item.budget_file.id)
                    if allocation_remarks:
                        item.budget_file.remarks = allocation_remarks
                    allocated_names.append(f"{old_file_no} -> {item_file_no}")

    if not updated_budget_ids:
        raise HTTPException(
            status_code=400,
            detail="No temporary budget files found to allocate"
        )

    # Resume the PR
    pr.current_status = RequestStatus.IN_PROGRESS
    allocation_date_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    history_remarks = "Budget Files Allocated:\n" + "\n".join(allocated_names) + f"\nAllocation Date: {allocation_date_str}"
    if allocation_remarks:
        history_remarks += f"\nRemarks: {allocation_remarks}"

    flow_engine = FlowEngineService(db, background_tasks)
    await flow_engine._add_history(pr, user, "Budget File Allocated", history_remarks)

    # Notify next step approver(s)
    if pr.flow:
        from app.services.email_service import EmailService
        new_step_result = await db.execute(
            select(WorkFlowHierarchy).options(
                selectinload(WorkFlowHierarchy.role),
                selectinload(WorkFlowHierarchy.user),
            ).where(
                flow_engine._wf_filters(pr, pr.flow.phase_id, step_order=pr.flow.step_order)
            )
        )
        new_step = new_step_result.scalar_one_or_none()
        if new_step:
            email_svc = EmailService(background_tasks)
            if new_step.user_type == "user" and new_step.user_id:
                user_res = await db.execute(select(User.email).where(User.id == new_step.user_id))
                email_addr = user_res.scalar_one_or_none()
                next_emails = [email_addr] if email_addr else []
            else:
                next_emails = await flow_engine.get_next_approvers_emails(pr, new_step.user_group)
            for email_addr in next_emails:
                email_svc.notify_next_approver(pr.id, pr.icr_number, new_step.role.name if new_step.role else new_step.user_group, email_addr)

    await db.commit()
    return {"message": "Budget file number allocated and purchase request resumed successfully"}


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

    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)

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
async def refer_pr(
    pr_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)

    # Roles that are NOT allowed to initiate ad-hoc consultations:
    # - PI (faculty): Purchase Initiators are operators, not consultation senders
    # - DA (verifier_da): Dealing Assistants process; they don't initiate referrals
    # - SP (verifier_sp / superintendent): SPs assign DAs; they don't initiate referrals
    await db.refresh(user, ["role"])
    restricted_groups = {"faculty", "verifier_da", "verifier_sp", "superintendent"}
    user_group = user.role.group_key if user.role else None
    if user_group in restricted_groups:
        raise HTTPException(
            status_code=403,
            detail="Purchase Initiators, Dealing Assistants, and Superintendents are not authorized to initiate ad-hoc consultations."
        )

    # Validate that the user is the currently expected approver of the active step
    # Or, during Tendering phase, the purchase initiator is also allowed to seek consultation
    is_initiator_in_tendering = False
    if pr.flow:
        phase_res = await db.execute(select(PhaseManager).where(PhaseManager.id == pr.flow.phase_id))
        phase = phase_res.scalar_one_or_none()
        if phase and phase.phase_name == "Tendering" and pr.initiator_id == user.id:
            is_initiator_in_tendering = True

    if not is_initiator_in_tendering:
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

    content_type = request.headers.get("content-type", "")
    query_file = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw = form.get("payload")
        if not raw:
            raise HTTPException(status_code=400, detail="Missing payload field")
        body = json.loads(raw)
        query_file = form.get("query_document")
        if query_file and not getattr(query_file, "filename", None):
            query_file = None
    else:
        body = await request.json()

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
    await db.flush()

    # Save document if uploaded
    doc_path = None
    if query_file:
        from app.services.document_service import DocumentService
        doc_svc = DocumentService(db)
        doc_record = await doc_svc.save_upload(pr, f"referral_{referral.id}_query", query_file, user.id)
        doc_path = f"/static/uploads/{doc_record.doc_value.get('path')}"
        referral.query_document_path = doc_path

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

    await check_pr_access(pr, user, db)
    await check_pr_fy_closed(pr, db)

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
        doc_path = f"/static/uploads/{doc_record.doc_value.get('path')}"

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


# ─── Technical Clarification endpoints (PI ↔ Superintendent, non-blocking) ──

@router.post("/{pr_id}/clarify")
async def send_clarification(
    pr_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Send a technical clarification query between the Purchase Initiator and
    the Superintendent at the first Tendering step.  Non-blocking — does NOT
    freeze the workflow.  Both parties may initiate."""

    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await check_pr_access(pr, user, db)
    await db.refresh(pr, ["flow", "initiator"])

    # Determine who may send a clarification: initiator OR the current
    # superintendent (expected_role_name === 'Superintendent' at step 1)
    is_initiator = pr.initiator_id == user.id

    is_superintendent = False
    await db.refresh(user, ["role"])
    group = user.role.group_key if user.role else None
    if group in ("superintendent", "verifier_sp"):
        is_superintendent = True

    if not is_initiator and not is_superintendent:
        raise HTTPException(
            status_code=403,
            detail="Only the Purchase Initiator or Superintendent may send technical clarifications"
        )

    # Determine the recipient: if sender is initiator → superintendent, and vice versa
    if is_initiator:
        # Find the superintendent who is assigned to this PR (via assignment or expected user)
        await db.refresh(pr, ["assignments"])
        # Try the active assignment first
        if pr.assignments:
            last_assignment = pr.assignments[-1]
            await db.refresh(last_assignment, ["assigned_by"])
            target_user_id = last_assignment.assigned_by_id
        elif pr.flow and pr.flow.expected_user_id:
            target_user_id = pr.flow.expected_user_id
        else:
            raise HTTPException(
                status_code=400,
                detail="Cannot determine the Superintendent recipient. Tendering must be in progress."
            )
    else:
        # Superintendent → send to Purchase Initiator
        target_user_id = pr.initiator_id

    # Parse body
    content_type = request.headers.get("content-type", "")
    query_file = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw = form.get("payload")
        if not raw:
            raise HTTPException(status_code=400, detail="Missing payload field")
        body = json.loads(raw)
        query_file = form.get("query_document")
        if query_file and not getattr(query_file, "filename", None):
            query_file = None
    else:
        body = await request.json()

    query_text = body.get("query", "").strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="Clarification query text is required")

    # Validate recipient exists
    target_res = await db.execute(select(User).where(User.id == target_user_id))
    target_user = target_res.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=400, detail="Recipient user not found")

    # Create a clarification referral (non-blocking, type='clarification')
    clarification = PRReferral(
        purchase_request_id=pr.id,
        referred_by_id=user.id,
        referred_to_id=target_user_id,
        query=query_text,
        status="pending",
        referral_type="clarification",
    )
    db.add(clarification)
    await db.flush()

    # Optionally save attachment
    if query_file:
        from app.services.document_service import DocumentService
        doc_svc = DocumentService(db)
        doc_record = await doc_svc.save_upload(pr, f"clarification_{clarification.id}_query", query_file, user.id)
        clarification.query_document_path = f"/static/uploads/{doc_record.doc_value.get('path')}"

    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Technical Clarification Sent",
        remarks=f"Clarification from {user.name} to {target_user.name}: {query_text}",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    await db.commit()
    return {"message": "Clarification sent successfully", "clarification_id": clarification.id}


@router.post("/{pr_id}/clarify/{clarification_id}/respond")
async def respond_clarification(
    pr_id: int,
    clarification_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Reply to a specific technical clarification thread item."""

    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    await check_pr_access(pr, user, db)

    # Fetch the specific clarification record
    clar_res = await db.execute(
        select(PRReferral).where(
            and_(
                PRReferral.id == clarification_id,
                PRReferral.purchase_request_id == pr.id,
                PRReferral.referred_to_id == user.id,
                PRReferral.referral_type == "clarification",
                PRReferral.status == "pending",
            )
        )
    )
    clarification = clar_res.scalar_one_or_none()
    if not clarification:
        raise HTTPException(
            status_code=403,
            detail="No pending clarification found for you on this purchase request"
        )

    # Parse body
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

    response_text = body.get("response", "").strip()
    if not response_text:
        raise HTTPException(status_code=400, detail="Response text is required")

    # Save attachment if provided
    doc_path = None
    if response_file:
        from app.services.document_service import DocumentService
        doc_svc = DocumentService(db)
        doc_record = await doc_svc.save_upload(pr, f"clarification_{clarification.id}_response", response_file, user.id)
        doc_path = f"/static/uploads/{doc_record.doc_value.get('path')}"

    clarification.response = response_text
    clarification.response_document_path = doc_path
    clarification.status = "responded"
    clarification.responded_at = datetime.utcnow()

    history = PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=user.id,
        status="Technical Clarification Response Submitted",
        remarks=f"Clarification reply by {user.name}: {response_text}",
        acted_at=datetime.utcnow(),
    )
    db.add(history)

    await db.commit()
    return {"message": "Clarification response submitted successfully"}

