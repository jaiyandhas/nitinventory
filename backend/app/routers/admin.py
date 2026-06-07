from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.limiter import limiter
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload
from datetime import datetime
from typing import Optional, List
from app.core.config import settings

from app.core.database import get_db
from app.core.deps import require_roles, get_current_user
from app.core.security import get_password_hash
from app.models.user import User, Department, RoleManager
from app.models.budget import BudgetMaster, FinancialYear, PurchaseCategory, ProcurementManager, PhaseManager, Settings
from app.models.purchase_request import WorkFlowHierarchy

router = APIRouter(prefix="/api/admin", tags=["admin"])
AdminDep = Depends(require_roles("admin"))
DeanOrAdminDep = Depends(require_roles("admin", "dean_approver", "apex_approver"))
DeanBudgetDep = Depends(require_roles("dean_approver"))
BudgetViewDep = Depends(require_roles("admin", "dean_approver", "hod", "faculty", "apex_approver"))


# ─────────────────────────────────────────────────────────────────────────────
# USERS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(User).order_by(User.name))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "title": u.title,
            "name": u.name,
            "email": u.email,
            "designation": u.designation,
            "gender": u.gender,
            "role_id": u.role_id,
            "department_id": u.department_id,
            "is_active": u.is_active,
            "is_approved": u.is_approved,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("/users")
async def create_user(body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    existing = await db.execute(select(User).where(User.email == body["email"].lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already in use")
    u = User(
        title=body.get("title", "Mr."),
        name=body["name"],
        email=body["email"].lower(),
        hashed_password=get_password_hash(body["password"]),
        designation=body.get("designation", ""),
        gender=body.get("gender", "male"),
        role_id=body.get("role_id"),
        department_id=body.get("department_id"),
        is_active=True,
        is_approved=body.get("is_approved", True),
    )
    db.add(u)
    await db.commit()
    return {"message": "User created", "id": u.id}


@router.get("/users/import-template")
async def import_template(_=AdminDep):
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from fastapi.responses import StreamingResponse

    wb = Workbook()
    ws = wb.active
    ws.title = "Users Import"

    # Set headers
    headers = ["Name", "Email", "Department Name", "Role Name"]
    ws.append(headers)

    # Styling
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid") # Dark Blue
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    center_align = Alignment(horizontal="center", vertical="center")
    thin_border = Border(
        left=Side(style='thin', color='CCCCCC'),
        right=Side(style='thin', color='CCCCCC'),
        top=Side(style='thin', color='CCCCCC'),
        bottom=Side(style='thin', color='CCCCCC')
    )

    for col_idx, col in enumerate(ws.iter_cols(min_row=1, max_row=1, min_col=1, max_col=len(headers))):
        for cell in col:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
            cell.border = thin_border

    # Sample rows
    samples = [
        ["John Doe", "john.doe@nitt.edu", "Computer Science and Engineering", "Faculty"],
        ["Jane Smith", "jane.smith@nitt.edu", "Electronics and Communication Engineering", "Head of Department"],
    ]
    for row in samples:
        ws.append(row)

    # Style samples
    for row_idx in range(2, len(samples) + 2):
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.font = Font(name="Calibri", size=11)
            cell.border = thin_border

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = col[0].column_letter
        ws.column_dimensions[col_letter].width = max(max_len + 3, 15)

    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="users_import_template.xlsx"'}
    )


@router.post("/users/import")
async def import_users(file: UploadFile, db: AsyncSession = Depends(get_db), _=AdminDep):
    from app.services.import_service import ImportService
    content = await file.read()
    import_service = ImportService(db)
    return await import_service.import_users(content, file.filename)


@router.put("/users/{user_id}")
async def update_user(user_id: int, body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if "name" in body:
        u.name = body["name"]
    if "email" in body:
        new_email = body["email"].lower()
        if new_email != u.email:
            existing = await db.execute(select(User).where(User.email == new_email))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Email already in use")
            u.email = new_email
    if "password" in body and body["password"]:
        u.hashed_password = get_password_hash(body["password"])
    if "title" in body:
        u.title = body["title"]
    if "designation" in body:
        u.designation = body["designation"]
    if "role_id" in body:
        u.role_id = body["role_id"]
    if "department_id" in body:
        u.department_id = body["department_id"]
    if "is_active" in body:
        u.is_active = bool(body["is_active"])
    if "is_approved" in body:
        u.is_approved = bool(body["is_approved"])
    await db.commit()
    return {"message": "User updated"}


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: int, body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    new_password = body.get("password", "Password@123")
    u.hashed_password = get_password_hash(new_password)
    await db.commit()
    return {"message": "Password reset successfully"}


# ─────────────────────────────────────────────────────────────────────────────
# DEPARTMENTS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/departments")
async def list_departments(db: AsyncSession = Depends(get_db), _=DeanOrAdminDep):
    result = await db.execute(select(Department).order_by(Department.short_code))
    return [{"id": d.id, "name": d.name, "short_code": d.short_code} for d in result.scalars()]


@router.post("/departments")
async def create_department(body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    d = Department(name=body["name"], short_code=body["short_code"].upper())
    db.add(d)
    await db.commit()
    return {"message": "Department created", "id": d.id}


# ─────────────────────────────────────────────────────────────────────────────
# ROLES
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/roles")
async def list_roles(db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(RoleManager).order_by(RoleManager.name))
    return [{"id": r.id, "name": r.name, "value": r.value, "group_key": r.group_key} for r in result.scalars()]


@router.post("/roles")
async def create_role(body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    name = body.get("name")
    value = body.get("value")
    group_key = body.get("group_key")
    if not name or not value or not group_key:
        raise HTTPException(status_code=400, detail="Missing name, value, or group_key")
    
    res = await db.execute(select(RoleManager).where(RoleManager.value == value))
    existing = res.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"Role value '{value}' already exists")
        
    role = RoleManager(name=name, value=value, group_key=group_key)
    db.add(role)
    await db.commit()
    return {"message": "Role created", "id": role.id}


# ─────────────────────────────────────────────────────────────────────────────
# FINANCIAL YEARS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/financial-years")
async def list_financial_years(db: AsyncSession = Depends(get_db), _=DeanOrAdminDep):
    result = await db.execute(select(FinancialYear).order_by(FinancialYear.start_date.desc()))
    return [{"id": fy.id, "label": fy.label, "start_date": fy.start_date.isoformat(), "end_date": fy.end_date.isoformat(), "is_active": fy.is_active} for fy in result.scalars()]


@router.post("/financial-years")
async def create_financial_year(body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    from datetime import date as dateobj
    fy = FinancialYear(
        label=body["label"],
        start_date=dateobj.fromisoformat(body["start_date"]),
        end_date=dateobj.fromisoformat(body["end_date"]),
        is_active=body.get("is_active", True),
        is_closed=body.get("is_closed", False),
    )
    db.add(fy)
    await db.commit()
    return {"message": "Financial year created", "id": fy.id}


@router.post("/financial-years/rollover")
async def financial_year_rollover(
    db: AsyncSession = Depends(get_db),
    _=AdminDep
):
    # 1. Find the current active financial year
    active_fy_stmt = select(FinancialYear).where(FinancialYear.is_active == True)
    active_fy_res = await db.execute(active_fy_stmt)
    active_fy = active_fy_res.scalar_one_or_none()
    if not active_fy:
        raise HTTPException(status_code=400, detail="No active financial year found to rollover.")

    # 2. Parse current active FY label to calculate the next FY label
    import re
    match = re.match(r"^(\d{4})-(\d{2})$", active_fy.label)
    if not match:
        raise HTTPException(status_code=400, detail=f"Invalid financial year label format: {active_fy.label}")
    
    start_year = int(match.group(1))
    end_year_short = int(match.group(2))
    
    next_start_year = start_year + 1
    next_end_year_short = (end_year_short + 1) % 100
    next_label = f"{next_start_year}-{next_end_year_short:02d}"
    
    from datetime import date
    next_start_date = date(next_start_year, 4, 1)
    next_end_date = date(next_start_year + 1, 3, 31)

    # Find if next FY already exists
    next_fy_stmt = select(FinancialYear).where(FinancialYear.label == next_label)
    next_fy_res = await db.execute(next_fy_stmt)
    next_fy = next_fy_res.scalar_one_or_none()
    
    if next_fy:
        if next_fy.is_closed:
            raise HTTPException(status_code=400, detail=f"The next financial year '{next_label}' is already closed.")
        next_fy.is_active = True
    else:
        next_fy = FinancialYear(
            label=next_label,
            start_date=next_start_date,
            end_date=next_end_date,
            is_active=True,
            is_closed=False
        )
        db.add(next_fy)
        await db.flush()

    # Close current active FY
    active_fy.is_active = False
    active_fy.is_closed = True

    # 3. Find all active/in-progress PRs in the closed FY
    from app.models.purchase_request import PurchaseRequest, RequestStatus, PurchaseRequestItem, PurchaseRequestFlow, PurchaseRequestAssignment, TechnicalEvaluation, FinancialEvaluation, CommercialEvaluation, Document, PRReferral, PurchaseRequestHistory
    
    active_prs_res = await db.execute(
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.items).selectinload(PurchaseRequestItem.budget_file),
            selectinload(PurchaseRequest.flow),
            selectinload(PurchaseRequest.assignments),
            selectinload(PurchaseRequest.technical_evaluations),
            selectinload(PurchaseRequest.financial_evaluations),
            selectinload(PurchaseRequest.commercial_evaluations),
            selectinload(PurchaseRequest.documents),
            selectinload(PurchaseRequest.referrals),
            selectinload(PurchaseRequest.initiator).selectinload(User.department)
        )
        .where(
            PurchaseRequest.financial_year_id == active_fy.id,
            PurchaseRequest.current_status.in_([
                RequestStatus.PR_SUBMITTED,
                RequestStatus.IN_PROGRESS,
                RequestStatus.SENT_BACK
            ])
        )
    )
    old_prs = active_prs_res.scalars().all()

    from app.services.budget_service import BudgetService
    budget_svc = BudgetService(db)
    dept_seqs = {}

    for old_pr in old_prs:
        # Unlock budget reservations in old FY
        await budget_svc.unlock_amount(old_pr)

        # For each item, resolve or clone its budget file to the new FY
        for item in old_pr.items:
            old_bm = item.budget_file
            if old_bm:
                new_bm_file_no = old_bm.file_no.replace(active_fy.label, next_fy.label)
                new_bm_file_no_alt = old_bm.file_no.replace(active_fy.label.lower(), next_fy.label.lower())
                
                bm_find = await db.execute(
                    select(BudgetMaster).where(
                        BudgetMaster.financial_year_id == next_fy.id,
                        BudgetMaster.file_no.in_([new_bm_file_no, new_bm_file_no_alt, old_bm.file_no])
                    )
                )
                new_bm = bm_find.scalar_one_or_none()
                if not new_bm:
                    new_bm = BudgetMaster(
                        department_id=old_bm.department_id,
                        financial_year_id=next_fy.id,
                        expenditure_category=old_bm.expenditure_category,
                        item_name=old_bm.item_name,
                        category=old_bm.category,
                        course_code=old_bm.course_code,
                        unit_cost=old_bm.unit_cost,
                        quantity=old_bm.quantity,
                        total_allocation=old_bm.total_allocation,
                        file_no=new_bm_file_no,
                        is_revision=old_bm.is_revision,
                        expert1_id=old_bm.expert1_id,
                        expert2_id=old_bm.expert2_id,
                        director_faculty_id=old_bm.director_faculty_id,
                        committed_amount=0.0,
                        utilized_amount=0.0
                    )
                    db.add(new_bm)
                    await db.flush()

        # Generate revised reference sequence number per department
        dept_id = old_pr.initiator.department_id
        if dept_id not in dept_seqs:
            q = await db.execute(
                select(func.count(PurchaseRequest.id))
                .join(User, PurchaseRequest.initiator_id == User.id)
                .where(
                    PurchaseRequest.financial_year_id == next_fy.id,
                    PurchaseRequest.parent_pr_id.isnot(None),
                    User.department_id == dept_id
                )
            )
            dept_seqs[dept_id] = q.scalar() or 0
        
        dept_seqs[dept_id] += 1
        seq_num = dept_seqs[dept_id]
        dept_code = old_pr.initiator.department.short_code if old_pr.initiator.department else "GEN"
        revised_ref = f"PR/{dept_code}/{next_fy.label}/R-{seq_num:02d}"

        # Clone the Purchase Request
        new_pr = PurchaseRequest(
            category_id=old_pr.category_id,
            financial_year_id=next_fy.id,
            initiator_id=old_pr.initiator_id,
            nominee_id=old_pr.nominee_id,
            procurement_id=old_pr.procurement_id,
            purchase_type=old_pr.purchase_type,
            amount=old_pr.amount,
            emd=old_pr.emd,
            performance_security=old_pr.performance_security,
            current_status=old_pr.current_status,
            vendor_list_link=old_pr.vendor_list_link,
            is_item_split=old_pr.is_item_split,
            item_split_justification=old_pr.item_split_justification,
            is_quantity_split=old_pr.is_quantity_split,
            quantity_split_details=old_pr.quantity_split_details,
            is_service_center_in_south=old_pr.is_service_center_in_south,
            service_center_south_desc=old_pr.service_center_south_desc,
            basis_of_estimate_details=old_pr.basis_of_estimate_details,
            delivery_mode=old_pr.delivery_mode,
            delivery_location=old_pr.delivery_location,
            exemption=old_pr.exemption,
            exemption_remarks=old_pr.exemption_remarks,
            is_training_required=old_pr.is_training_required,
            training_type=old_pr.training_type,
            training_vendor=old_pr.training_vendor,
            training_comments=old_pr.training_comments,
            tender_reference_number=old_pr.tender_reference_number,
            date_of_tender=old_pr.date_of_tender,
            date_of_tech_bid_opening=old_pr.date_of_tech_bid_opening,
            date_of_financial_bid_opening=old_pr.date_of_financial_bid_opening,
            aa_approved_at=old_pr.aa_approved_at,
            te_initiated_at=old_pr.te_initiated_at,
            te_approved_at=old_pr.te_approved_at,
            fs_initiated_at=old_pr.fs_initiated_at,
            fs_approved_at=old_pr.fs_approved_at,
            po_initiated_at=old_pr.po_initiated_at,
            po_approved_at=old_pr.po_approved_at,
            faculty1_id=old_pr.faculty1_id,
            faculty2_id=old_pr.faculty2_id,
            faculty3_id=old_pr.faculty3_id,
            aa_approver_id=old_pr.aa_approver_id,
            form_data=old_pr.form_data,
            parent_pr_id=old_pr.id,
            lpc_remarks=old_pr.lpc_remarks,
            lpc_committee_members=old_pr.lpc_committee_members,
            lpc_minutes_reference=old_pr.lpc_minutes_reference,
            single_bid_justification=old_pr.single_bid_justification,
            icr_number=revised_ref
        )
        db.add(new_pr)
        await db.flush()

        # Clone items, linking to new budgets
        for item in old_pr.items:
            old_item_bm = item.budget_file
            new_item_bm = None
            if old_item_bm:
                new_item_bm_file_no = old_item_bm.file_no.replace(active_fy.label, next_fy.label)
                new_item_bm_file_no_alt = old_item_bm.file_no.replace(active_fy.label.lower(), next_fy.label.lower())
                new_bm_find = await db.execute(
                    select(BudgetMaster).where(
                        BudgetMaster.financial_year_id == next_fy.id,
                        BudgetMaster.file_no.in_([new_item_bm_file_no, new_item_bm_file_no_alt, old_item_bm.file_no])
                    )
                )
                new_item_bm = new_bm_find.scalar_one_or_none()

            new_item = PurchaseRequestItem(
                purchase_request_id=new_pr.id,
                budget_file_id=new_item_bm.id if new_item_bm else None,
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

        # Clone flow state
        if old_pr.flow:
            new_flow = PurchaseRequestFlow(
                purchase_request_id=new_pr.id,
                phase_id=old_pr.flow.phase_id,
                step_order=old_pr.flow.step_order,
                rejected=old_pr.flow.rejected
            )
            db.add(new_flow)

        # Clone assignments
        for ass in old_pr.assignments:
            new_ass = PurchaseRequestAssignment(
                purchase_request_id=new_pr.id,
                assigned_by_id=ass.assigned_by_id,
                assigned_da_id=ass.assigned_da_id,
                status=ass.status,
                assigned_at=ass.assigned_at
            )
            db.add(new_ass)

        # Clone evaluations
        for te in old_pr.technical_evaluations:
            new_te = TechnicalEvaluation(
                purchase_request_id=new_pr.id,
                vendor_name=te.vendor_name,
                is_qualified=te.is_qualified,
                remarks=te.remarks,
                created_at=te.created_at
            )
            db.add(new_te)
        
        for fe in old_pr.financial_evaluations:
            new_fe = FinancialEvaluation(
                purchase_request_id=new_pr.id,
                vendor_name=fe.vendor_name,
                quoted_amount=fe.quoted_amount,
                ranking=fe.ranking,
                is_awarded=fe.is_awarded,
                remarks=fe.remarks,
                unit_price=fe.unit_price,
                taxes=fe.taxes,
                delivery_period=fe.delivery_period,
                warranty=fe.warranty,
                created_at=fe.created_at
            )
            db.add(new_fe)
            
        for ce in old_pr.commercial_evaluations:
            new_ce = CommercialEvaluation(
                purchase_request_id=new_pr.id,
                vendor_name=ce.vendor_name,
                vendor_email=ce.vendor_email,
                quoted_amount=ce.quoted_amount,
                is_qualified=ce.is_qualified,
                remarks=ce.remarks
            )
            db.add(new_ce)

        # Clone documents
        for doc in old_pr.documents:
            new_doc = Document(
                purchase_request_id=new_pr.id,
                doc_key=doc.doc_key,
                doc_value=doc.doc_value,
                uploaded_by_id=doc.uploaded_by_id,
                updated_at=doc.updated_at
            )
            db.add(new_doc)

        # Clone referrals
        for ref in old_pr.referrals:
            new_ref = PRReferral(
                purchase_request_id=new_pr.id,
                referred_by_id=ref.referred_by_id,
                referred_to_id=ref.referred_to_id,
                query=ref.query,
                query_document_path=ref.query_document_path,
                response=ref.response,
                response_document_path=ref.response_document_path,
                status=ref.status,
                created_at=ref.created_at,
                responded_at=ref.responded_at
            )
            db.add(new_ref)

        # Lock budget amounts on the new cloned budget files
        await budget_svc.lock_amount(new_pr)

        # Mark old PR as rolled_over
        old_pr.current_status = RequestStatus.ROLLED_OVER

        # Add history entries
        old_history = PurchaseRequestHistory(
            purchase_request_id=old_pr.id,
            status="Rolled Over",
            remarks=f"Purchase request rolled over to next financial year {next_fy.label}. Revised reference: {revised_ref}",
            acted_at=datetime.utcnow()
        )
        db.add(old_history)

        new_history = PurchaseRequestHistory(
            purchase_request_id=new_pr.id,
            status="Rolled Over",
            remarks=f"Purchase request rolled over from financial year {active_fy.label}. Original reference: {old_pr.icr_number}",
            acted_at=datetime.utcnow()
        )
        db.add(new_history)

    await db.commit()
    return {
        "message": "Financial Year rollover completed successfully.",
        "closed_year": active_fy.label,
        "opened_year": next_fy.label,
        "rolled_over_count": len(old_prs)
    }


# ─────────────────────────────────────────────────────────────────────────────
# SETTINGS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(Settings))
    return {s.key_name: s.value for s in result.scalars()}


@router.put("/settings/{key}")
async def update_setting(key: str, body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(Settings).where(Settings.key_name == key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = body["value"]
    else:
        setting = Settings(key_name=key, value=body["value"])
        db.add(setting)
    await db.commit()
    return {"message": "Setting updated"}


# ─────────────────────────────────────────────────────────────────────────────
# BUDGET
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/budget")
async def list_budget(
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    search: Optional[str] = None,
    department_id: Optional[int] = None,
    financial_year_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _=BudgetViewDep
):
    base_query = select(BudgetMaster)
    
    group_key = user.role.group_key if user.role else None
    filters = []
    
    if financial_year_id is not None:
        filters.append(BudgetMaster.financial_year_id == financial_year_id)
        
    if search:
        search_pattern = f"%{search}%"
        filters.append(
            or_(
                BudgetMaster.file_no.ilike(search_pattern),
                BudgetMaster.item_name.ilike(search_pattern)
            )
        )

    # Scopes
    if group_key in ("hod", "faculty") and user.department_id:
        filters.append(BudgetMaster.department_id == user.department_id)
        
    if group_key == "faculty":
        from sqlalchemy import exists
        from app.models.purchase_request import PurchaseRequestItem, PurchaseRequest, PurchaseRequestHistory
        
        pr_budget_exists = exists().where(
            and_(
                PurchaseRequestItem.budget_file_id == BudgetMaster.id,
                PurchaseRequestItem.purchase_request_id == PurchaseRequest.id,
                or_(
                    PurchaseRequest.initiator_id == user.id,
                    exists().where(
                        and_(
                            PurchaseRequestHistory.purchase_request_id == PurchaseRequest.id,
                            PurchaseRequestHistory.current_approver_id == user.id
                        )
                    )
                )
            )
        )
        filters.append(
            or_(
                BudgetMaster.allocated_initiator_id == user.id,
                pr_budget_exists
            )
        )
    else:
        if department_id is not None:
            filters.append(BudgetMaster.department_id == department_id)

    if filters:
        base_query = base_query.where(and_(*filters))

    # Get total count matching criteria
    total = await db.scalar(select(func.count()).select_from(base_query.subquery())) or 0

    result = await db.execute(
        base_query
        .outerjoin(Department)
        .options(
            selectinload(BudgetMaster.expert1),
            selectinload(BudgetMaster.expert2),
            selectinload(BudgetMaster.director_faculty),
            selectinload(BudgetMaster.allocated_initiator)
        )
        .order_by(Department.short_code.asc(), BudgetMaster.file_no.asc())
        .offset(skip)
        .limit(limit)
    )
    entries = result.scalars().all()
    items = [
        {
            "id": b.id, "item_name": b.item_name,
            "total_cost": b.total_allocation,
            "total_allocation": b.total_allocation,
            "locked_amount": b.committed_amount,
            "committed_amount": b.committed_amount,
            "deducted_amount": b.utilized_amount,
            "utilized_amount": b.utilized_amount,
            "available_amount": b.available_balance,
            "available_balance": b.available_balance,
            "department_id": b.department_id,
            "financial_year_id": b.financial_year_id, "expenditure_category": b.expenditure_category,
            "category": b.category, "unit_cost": b.unit_cost, "quantity": b.quantity,
            "file_no": b.file_no,
            "remarks": b.remarks,
            "expert1_id": b.expert1_id,
            "expert2_id": b.expert2_id,
            "director_faculty_id": b.director_faculty_id,
            "allocated_initiator_id": b.allocated_initiator_id,
            "expert1": {"id": b.expert1.id, "name": b.expert1.name, "email": b.expert1.email} if b.expert1 else None,
            "expert2": {"id": b.expert2.id, "name": b.expert2.name, "email": b.expert2.email} if b.expert2 else None,
            "director_faculty": {"id": b.director_faculty.id, "name": b.director_faculty.name, "email": b.director_faculty.email} if b.director_faculty else None,
            "allocated_initiator": {"id": b.allocated_initiator.id, "name": b.allocated_initiator.name, "email": b.allocated_initiator.email} if b.allocated_initiator else None,
        }
        for b in entries
    ]
    return {"items": items, "total": total}


@router.get("/budget/summary")
async def budget_summary(db: AsyncSession = Depends(get_db), _=DeanOrAdminDep):
    """System-wide consolidated budget totals for admin dashboard."""
    result = await db.execute(select(BudgetMaster))
    entries = result.scalars().all()
    total = sum(b.total_cost for b in entries)
    locked = sum(b.locked_amount for b in entries)
    deducted = sum(b.deducted_amount for b in entries)
    return {"total": total, "locked": locked, "deducted": deducted, "available": total - locked - deducted}


async def get_stored_categories(db: AsyncSession):
    result_exp = await db.execute(select(Settings).where(Settings.key_name == "budget_expenditure_categories"))
    exp_setting = result_exp.scalar_one_or_none()
    if exp_setting:
        exp_list = [c.strip() for c in exp_setting.value.split(",") if c.strip()]
    else:
        exp_list = ["CAPEX", "OPEX"]
        db.add(Settings(key_name="budget_expenditure_categories", value="CAPEX,OPEX"))
        await db.flush()

    result_item = await db.execute(select(Settings).where(Settings.key_name == "budget_item_categories"))
    item_setting = result_item.scalar_one_or_none()
    if item_setting:
        item_list = [c.strip() for c in item_setting.value.split(",") if c.strip()]
    else:
        item_list = ["computer", "lab_equipment", "software", "furniture"]
        db.add(Settings(key_name="budget_item_categories", value="computer,lab_equipment,software,furniture"))
        await db.flush()

    # Also load added_by_dean
    result_dean = await db.execute(select(Settings).where(Settings.key_name == "budget_categories_added_by_dean"))
    dean_setting = result_dean.scalar_one_or_none()
    if dean_setting:
        import json
        try:
            dean_cats = json.loads(dean_setting.value)
        except Exception:
            dean_cats = {"expenditure": [], "item": []}
    else:
        dean_cats = {"expenditure": [], "item": []}

    return {
        "expenditure_categories": exp_list,
        "item_categories": item_list,
        "added_by_dean": dean_cats
    }


@router.get("/budget/categories")
async def get_budget_categories(db: AsyncSession = Depends(get_db), _=BudgetViewDep):
    return await get_stored_categories(db)


@router.post("/budget/categories")
async def add_budget_category(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await db.refresh(current_user, ["role"])
    if current_user.role.group_key != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    cat_type = body.get("type")
    val = body.get("value")
    if not val or not val.strip():
        raise HTTPException(status_code=400, detail="Category value is required")
    val = val.strip()

    if cat_type == "expenditure":
        key = "budget_expenditure_categories"
    elif cat_type == "item":
        key = "budget_item_categories"
    else:
        raise HTTPException(status_code=400, detail="Invalid type: must be 'expenditure' or 'item'")

    result = await db.execute(select(Settings).where(Settings.key_name == key))
    setting = result.scalar_one_or_none()
    
    already_exists = False
    
    if setting:
        existing = [c.strip() for c in setting.value.split(",") if c.strip()]
        if val in existing:
            already_exists = True
        else:
            existing.append(val)
            setting.value = ",".join(existing)
    else:
        if cat_type == "expenditure":
            defaults = ["CAPEX", "OPEX", val]
        else:
            defaults = ["computer", "lab_equipment", "software", "furniture", val]
        setting = Settings(key_name=key, value=",".join(defaults))
        db.add(setting)

    # Record if added by admin or dean budget role
    if not already_exists and current_user.role.group_key in ["admin", "dean_approver"]:
        result_dean = await db.execute(select(Settings).where(Settings.key_name == "budget_categories_added_by_dean"))
        dean_setting = result_dean.scalar_one_or_none()
        import json
        if dean_setting:
            try:
                dean_cats = json.loads(dean_setting.value)
            except Exception:
                dean_cats = {"expenditure": [], "item": []}
            
            if cat_type == "expenditure":
                if "expenditure" not in dean_cats:
                    dean_cats["expenditure"] = []
                if val not in dean_cats["expenditure"]:
                    dean_cats["expenditure"].append(val)
            else:
                if "item" not in dean_cats:
                    dean_cats["item"] = []
                if val not in dean_cats["item"]:
                    dean_cats["item"].append(val)
            dean_setting.value = json.dumps(dean_cats)
        else:
            if cat_type == "expenditure":
                dean_cats = {"expenditure": [val], "item": []}
            else:
                dean_cats = {"expenditure": [], "item": [val]}
            db.add(Settings(key_name="budget_categories_added_by_dean", value=json.dumps(dean_cats)))

    await db.commit()
    return await get_stored_categories(db)


@router.delete("/budget/categories")
async def delete_budget_category(
    type: str = Query(...),
    value: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await db.refresh(current_user, ["role"])
    if current_user.role.group_key != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete categories")

    value = value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Category value is required")

    if type == "expenditure":
        key = "budget_expenditure_categories"
    elif type == "item":
        key = "budget_item_categories"
    else:
        raise HTTPException(status_code=400, detail="Invalid type: must be 'expenditure' or 'item'")

    # Load dean_setting to remove from there if needed
    result_dean = await db.execute(select(Settings).where(Settings.key_name == "budget_categories_added_by_dean"))
    dean_setting = result_dean.scalar_one_or_none()
    dean_cats = {"expenditure": [], "item": []}
    if dean_setting:
        import json
        try:
            dean_cats = json.loads(dean_setting.value)
        except Exception:
            dean_cats = {"expenditure": [], "item": []}

    # Verify if category exists in Settings
    result_setting = await db.execute(select(Settings).where(Settings.key_name == key))
    setting = result_setting.scalar_one_or_none()
    existing = []
    if setting:
        existing = [c.strip() for c in setting.value.split(",") if c.strip()]
    else:
        # Fallback default values
        if type == "expenditure":
            existing = ["CAPEX", "OPEX"]
        else:
            existing = ["computer", "lab_equipment", "software", "furniture"]

    if value not in existing:
        raise HTTPException(status_code=400, detail=f"Category '{value}' does not exist")

    # Check if category is currently used by any BudgetMaster entry
    if type == "expenditure":
        count_stmt = select(func.count(BudgetMaster.id)).where(BudgetMaster.expenditure_category == value)
    else:
        count_stmt = select(func.count(BudgetMaster.id)).where(BudgetMaster.category == value)

    count_res = await db.execute(count_stmt)
    use_count = count_res.scalar() or 0
    if use_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Category '{value}' is in use by {use_count} budget file(s) and cannot be deleted"
        )

    # Perform deletion from Settings
    if setting:
        existing.remove(value)
        setting.value = ",".join(existing)
    else:
        existing.remove(value)
        setting = Settings(key_name=key, value=",".join(existing))
        db.add(setting)

    # Remove from dean_cats metadata list if it exists there
    if type == "expenditure":
        if value in dean_cats.get("expenditure", []):
            dean_cats["expenditure"].remove(value)
    else:
        if value in dean_cats.get("item", []):
            dean_cats["item"].remove(value)

    if dean_setting:
        dean_setting.value = json.dumps(dean_cats)

    await db.commit()
    return await get_stored_categories(db)


@router.get("/budget/next-file-number")
async def get_next_file_number(
    department_id: int,
    expenditure_category: str,
    financial_year_id: int,
    db: AsyncSession = Depends(get_db),
    _=BudgetViewDep
):
    from app.models.user import Department
    from app.models.budget import FinancialYear, BudgetMaster
    from sqlalchemy import func

    dept_res = await db.execute(select(Department).where(Department.id == department_id))
    dept = dept_res.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    fy_res = await db.execute(select(FinancialYear).where(FinancialYear.id == financial_year_id))
    fy = fy_res.scalar_one_or_none()
    if not fy:
        raise HTTPException(status_code=404, detail="Financial Year not found")

    stmt = select(func.count(BudgetMaster.id)).where(
        and_(
            BudgetMaster.department_id == department_id,
            BudgetMaster.expenditure_category == expenditure_category,
            BudgetMaster.financial_year_id == financial_year_id
        )
    )
    count_res = await db.execute(stmt)
    count = count_res.scalar() or 0
    next_num = count + 1

    dept_code = dept.short_code.upper()
    source_code = expenditure_category.upper()
    fy_label = fy.label.upper()

    file_no = f"NITT/{dept_code}/{source_code}/{fy_label}/{next_num}"
    return {"file_no": file_no}


@router.get("/budget/{b_id}")
async def get_budget_detail(b_id: int, db: AsyncSession = Depends(get_db), _=BudgetViewDep):
    result = await db.execute(
        select(BudgetMaster).where(BudgetMaster.id == b_id)
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {
        "id": b.id,
        "department_id": b.department_id,
        "financial_year_id": b.financial_year_id,
        "expenditure_category": b.expenditure_category,
        "item_name": b.item_name,
        "category": b.category,
        "unit_cost": b.unit_cost,
        "quantity": b.quantity,
        "total_cost": b.total_allocation,
        "total_allocation": b.total_allocation,
        "file_no": b.file_no,
        "remarks": b.remarks,
        "expert1_id": b.expert1_id,
        "expert2_id": b.expert2_id,
        "director_faculty_id": b.director_faculty_id,
        "allocated_initiator_id": b.allocated_initiator_id
    }


@router.post("/budget")
async def create_budget(body: dict, db: AsyncSession = Depends(get_db), _=DeanBudgetDep):
    fy_id = int(body["financial_year_id"])
    fy_res = await db.execute(select(FinancialYear).where(FinancialYear.id == fy_id))
    fy = fy_res.scalar_one_or_none()
    if not fy:
        raise HTTPException(status_code=400, detail="Financial Year not found")
    if fy.is_closed:
        raise HTTPException(status_code=400, detail="The selected financial year is closed. Budgets in closed financial years cannot be modified.")

    b = BudgetMaster(
        department_id=int(body["department_id"]),
        financial_year_id=fy_id,
        expenditure_category=body["expenditure_category"],
        item_name=body["item_name"],
        category=body["category"],
        course_code=body.get("course_code", "N/A"),
        unit_cost=float(body["unit_cost"]),
        quantity=int(body["quantity"]),
        total_cost=float(body["unit_cost"]) * int(body["quantity"]),
        file_no=body["file_no"].upper(),
        remarks=body.get("remarks"),
        is_revision=False,
        allocated_initiator_id=body.get("allocated_initiator_id")
    )
    db.add(b)
    await db.commit()
    return {"message": "Budget created", "id": b.id}


@router.put("/budget/{b_id}")
async def update_budget(b_id: int, body: dict, db: AsyncSession = Depends(get_db), _=DeanBudgetDep):

    result = await db.execute(select(BudgetMaster).where(BudgetMaster.id == b_id))
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Not found")

    # Check if current budget file belongs to closed financial year
    current_fy_res = await db.execute(select(FinancialYear).where(FinancialYear.id == b.financial_year_id))
    current_fy = current_fy_res.scalar_one_or_none()
    if current_fy and current_fy.is_closed:
        raise HTTPException(status_code=400, detail="The current financial year for this budget is closed. Budgets in closed financial years cannot be modified.")

    b.item_name = body.get("item_name", b.item_name)
    if "department_id" in body:
        b.department_id = int(body["department_id"])
    if "financial_year_id" in body:
        new_fy_id = int(body["financial_year_id"])
        new_fy_res = await db.execute(select(FinancialYear).where(FinancialYear.id == new_fy_id))
        new_fy = new_fy_res.scalar_one_or_none()
        if not new_fy:
            raise HTTPException(status_code=400, detail="Financial Year not found")
        if new_fy.is_closed:
            raise HTTPException(status_code=400, detail="The target financial year is closed. Budgets in closed financial years cannot be modified.")
        b.financial_year_id = new_fy_id
    if "expenditure_category" in body:
        b.expenditure_category = body["expenditure_category"]
    if "category" in body:
        b.category = body["category"]
    if "file_no" in body:
        b.file_no = body["file_no"].upper()
    if "unit_cost" in body and "quantity" in body:
        b.unit_cost = float(body["unit_cost"])
        b.quantity = int(body["quantity"])
        b.total_cost = b.unit_cost * b.quantity
    if "allocated_initiator_id" in body:
        b.allocated_initiator_id = body["allocated_initiator_id"]
    if "remarks" in body:
        b.remarks = body["remarks"]
    await db.commit()
    return {"message": "Budget updated"}


@router.delete("/budget/clear")
async def clear_all_budgets(db: AsyncSession = Depends(get_db), _=DeanBudgetDep):
    """Deletes all budget master entries to start fresh. Skips any budgets linked to active PR items or belonging to closed financial years."""
    from app.models.purchase_request import PurchaseRequestItem
    from sqlalchemy import delete

    # Get linked budget IDs
    linked_res = await db.execute(select(PurchaseRequestItem.budget_file_id))
    linked_ids = {row[0] for row in linked_res.fetchall() if row[0] is not None}

    closed_fy_res = await db.execute(select(FinancialYear.id).where(FinancialYear.is_closed == True))
    closed_fy_ids = [row[0] for row in closed_fy_res.fetchall()]

    stmt = delete(BudgetMaster)
    if closed_fy_ids:
        stmt = stmt.where(BudgetMaster.financial_year_id.not_in(closed_fy_ids))
    if linked_ids:
        stmt = stmt.where(BudgetMaster.id.not_in(linked_ids))

    result = await db.execute(stmt)
    await db.commit()
    return {"message": f"Cleared {result.rowcount} unlinked budget files. Budgets in closed financial years and those linked to active Purchase Requests could not be deleted."}


# ─────────────────────────────────────────────────────────────────────────────
# PROCUREMENT METHODS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/procurement-methods")
async def list_procurement_methods(db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(ProcurementManager).order_by(ProcurementManager.name))
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "max_amount": p.max_amount,
            "form_schema": p.form_schema
        }
        for p in result.scalars()
    ]


@router.post("/procurement-methods")
async def create_procurement_method(body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    p = ProcurementManager(
        name=body["name"],
        description=body.get("description"),
        max_amount=float(body["max_amount"]) if body.get("max_amount") is not None else None,
        form_schema=body.get("form_schema")
    )
    db.add(p)
    await db.commit()
    return {"message": "Procurement method created", "id": p.id}


@router.put("/procurement-methods/{pm_id}")
async def update_procurement_method(pm_id: int, body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(ProcurementManager).where(ProcurementManager.id == pm_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Procurement method not found")
    if "name" in body:
        p.name = body["name"]
    if "description" in body:
        p.description = body["description"]
    if "max_amount" in body:
        p.max_amount = float(body["max_amount"]) if body["max_amount"] is not None else None
    if "form_schema" in body:
        p.form_schema = body["form_schema"]
    await db.commit()
    return {"message": "Procurement method updated"}


@router.delete("/procurement-methods/{pm_id}")
async def delete_procurement_method(pm_id: int, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(ProcurementManager).where(ProcurementManager.id == pm_id))
    p = result.scalar_one_or_none()
    if p:
        await db.delete(p)
        await db.commit()
    return {"message": "Procurement method deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# WORKFLOWS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/workflows")
async def list_workflows(db: AsyncSession = Depends(get_db), _=AdminDep):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(WorkFlowHierarchy).options(
            selectinload(WorkFlowHierarchy.role),
            selectinload(WorkFlowHierarchy.user)
        ).order_by(
            WorkFlowHierarchy.category_id,
            WorkFlowHierarchy.procurement_id,
            WorkFlowHierarchy.phase_id,
            WorkFlowHierarchy.step_order,
        )
    )
    entries = result.scalars().all()
    return [
        {
            "id": w.id,
            "category_id": w.category_id,
            "procurement_id": w.procurement_id,
            "phase_id": w.phase_id,
            "step_order": w.step_order,
            "user_type": w.user_type,
            "user_id": w.user_id,
            "user_name": w.user.name if w.user else None,
            "user_group": w.user_group,
            "role_id": w.role_id,
            "role_name": w.role.name if w.role else (w.user_group.replace("_", " ").title() if w.user_group else None),
            "is_enabled": w.is_enabled,
            "purchase_type": w.purchase_type,
            "tender_vendors_threshold": w.tender_vendors_threshold,
            "tender_vendors_comparison": w.tender_vendors_comparison,
            "skip_condition": w.skip_condition,
            "condition_field": w.condition_field,
            "condition_operator": w.condition_operator,
            "condition_value": w.condition_value,
        }
        for w in entries
    ]


@router.post("/workflows")
async def create_workflow(body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    role_id = body.get("role_id")
    user_id = body.get("user_id")
    user_group = body.get("user_group")
    user_type = body.get("user_type", "verifier")

    if user_type == "user" and user_id:
        user_res = await db.execute(select(User).where(User.id == user_id))
        user_obj = user_res.scalar_one_or_none()
        if not user_obj:
            raise HTTPException(status_code=400, detail="User not found")
        role_id = None
        user_group = None
    elif user_type in ["purchase_initiator", "da_assigner", "verifier_da", "tech_evaluation"]:
        user_id = None
        role_id = None
        user_group = None
    else:
        if user_type not in ["verifier", "approver", "partial_approver"]:
            user_type = "verifier"
        user_id = None
        if role_id:
            role_res = await db.execute(select(RoleManager).where(RoleManager.id == role_id))
            role_obj = role_res.scalar_one_or_none()
            if role_obj:
                user_group = role_obj.group_key
                
    purchase_type = body.get("purchase_type", "department")
    wf = WorkFlowHierarchy(
        category_id=body["category_id"],
        phase_id=body["phase_id"],
        procurement_id=body["procurement_id"],
        step_order=body["step_order"],
        user_type=user_type,
        user_id=user_id,
        user_group=user_group,
        role_id=role_id,
        purchase_type=purchase_type,
        is_enabled=True,
        tender_vendors_threshold=body.get("tender_vendors_threshold"),
        tender_vendors_comparison=body.get("tender_vendors_comparison"),
        skip_condition=body.get("skip_condition"),
        condition_field=body.get("condition_field"),
        condition_operator=body.get("condition_operator"),
        condition_value=body.get("condition_value"),
    )
    db.add(wf)
    await db.commit()
    return {"message": "Workflow created", "id": wf.id}


@router.put("/workflows/{wf_id}")
async def update_workflow(wf_id: int, body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(WorkFlowHierarchy).where(WorkFlowHierarchy.id == wf_id))
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Not found")
    if "step_order" in body:
        wf.step_order = body["step_order"]
    if "user_type" in body:
        wf.user_type = body["user_type"]
        if wf.user_type in ["purchase_initiator", "da_assigner", "verifier_da", "tech_evaluation"]:
            wf.user_id = None
            wf.role_id = None
            wf.user_group = None
        elif wf.user_type == "user":
            wf.role_id = None
            wf.user_group = None
        elif wf.user_type not in ["verifier", "approver", "partial_approver"]:
            pass
    if "user_id" in body:
        wf.user_id = body["user_id"]
        if wf.user_id:
            wf.role_id = None
            wf.user_group = None
            wf.user_type = "user"
    if "role_id" in body:
        wf.role_id = body["role_id"]
        if wf.role_id:
            role_res = await db.execute(select(RoleManager).where(RoleManager.id == wf.role_id))
            role_obj = role_res.scalar_one_or_none()
            if role_obj:
                wf.user_group = role_obj.group_key
                wf.user_id = None
                if wf.user_type not in ["verifier", "approver", "partial_approver"]:
                    wf.user_type = "verifier"
        else:
            wf.role_id = None
    elif "user_group" in body:
        wf.user_group = body["user_group"]
        wf.user_id = None
        wf.role_id = None
        if wf.user_type not in ["verifier", "approver", "partial_approver"]:
            wf.user_type = "verifier"
    if "is_enabled" in body:
        wf.is_enabled = bool(body["is_enabled"])
    if "tender_vendors_threshold" in body:
        # Accept null/None to clear the threshold
        wf.tender_vendors_threshold = body["tender_vendors_threshold"]
    if "tender_vendors_comparison" in body:
        wf.tender_vendors_comparison = body["tender_vendors_comparison"]
    if "skip_condition" in body:
        wf.skip_condition = body["skip_condition"]
    if "condition_field" in body:
        wf.condition_field = body["condition_field"]
    if "condition_operator" in body:
        wf.condition_operator = body["condition_operator"]
    if "condition_value" in body:
        wf.condition_value = body["condition_value"]
    await db.commit()
    return {"message": "Workflow updated"}


@router.post("/workflows/reorder")
async def reorder_workflows(body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    steps = body.get("steps", [])
    for item in steps:
        res = await db.execute(select(WorkFlowHierarchy).where(WorkFlowHierarchy.id == item["id"]))
        wf = res.scalar_one_or_none()
        if wf:
            wf.step_order = item["step_order"]
    await db.commit()
    return {"message": "Steps reordered"}


@router.patch("/workflows/{wf_id}/toggle")
async def toggle_workflow_step(wf_id: int, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(WorkFlowHierarchy).where(WorkFlowHierarchy.id == wf_id))
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Not found")
    wf.is_enabled = not wf.is_enabled
    await db.commit()
    return {"message": "Toggled", "is_enabled": wf.is_enabled}


@router.delete("/workflows/{wf_id}")
async def delete_workflow(wf_id: int, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(WorkFlowHierarchy).where(WorkFlowHierarchy.id == wf_id))
    wf = result.scalar_one_or_none()
    if wf:
        await db.delete(wf)
        await db.commit()
    return {"message": "Workflow deleted"}


@router.post("/workflows/reset-defaults")
async def reset_workflows(body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    """Reset workflow steps for one category × procurement × purchase type to seeded defaults."""
    from sqlalchemy import delete
    from app.seed_workflows import build_workflow_steps

    cat_id = body.get("category_id")
    proc_id = body.get("procurement_id")
    purchase_type = body.get("purchase_type", "department")
    if not cat_id or not proc_id:
        raise HTTPException(status_code=400, detail="Missing category_id or procurement_id")

    cat_res = await db.execute(select(PurchaseCategory).where(PurchaseCategory.id == cat_id))
    cat = cat_res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    proc_res = await db.execute(select(ProcurementManager).where(ProcurementManager.id == proc_id))
    proc = proc_res.scalar_one_or_none()
    if not proc:
        raise HTTPException(status_code=404, detail="Procurement method not found")

    await db.execute(
        delete(WorkFlowHierarchy).where(
            WorkFlowHierarchy.category_id == cat_id,
            WorkFlowHierarchy.procurement_id == proc_id,
            WorkFlowHierarchy.purchase_type == purchase_type,
        )
    )

    roles_res = await db.execute(select(RoleManager))
    roles = {r.value: r for r in roles_res.scalars()}

    phases_res = await db.execute(select(PhaseManager))
    phases = {}
    for p in phases_res.scalars():
        key = {"Administrative Approval": "AA", "Tendering": "TD", "Technical Evaluation": "TE",
               "Financial Sanction": "FS", "Purchase Order": "PO"}.get(p.phase_name)
        if key:
            phases[key] = p

    cat_key = "cat1" if cat.max_amount <= 100_000 else ("cat2" if cat.max_amount <= 1_000_000 else "cat3")
    categories = {cat_key: cat}

    all_rows = build_workflow_steps(roles, phases, categories, [proc])
    for w in all_rows:
        if w.purchase_type == purchase_type:
            db.add(w)

    await db.commit()
    return {"message": "Workflows reset to defaults"}



# ─────────────────────────────────────────────────────────────────────────────
# PHASES & CATEGORIES
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/phases")
async def list_phases(db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(PhaseManager).order_by(PhaseManager.phase_order))
    return [{"id": p.id, "phase_name": p.phase_name} for p in result.scalars()]


@router.get("/categories")
async def list_categories(procurement_id: Optional[int] = None, db: AsyncSession = Depends(get_db), _=AdminDep):
    stmt = select(PurchaseCategory)
    if procurement_id is not None:
        stmt = stmt.where(PurchaseCategory.procurement_id == procurement_id)
    stmt = stmt.order_by(PurchaseCategory.procurement_id, PurchaseCategory.min_amount)
    result = await db.execute(stmt)
    return [
        {
            "id": c.id,
            "title": c.title,
            "min_amount": c.min_amount,
            "max_amount": c.max_amount,
            "is_active": c.is_active,
            "procurement_id": c.procurement_id,
            "requirement_type": c.requirement_type,
        }
        for c in result.scalars()
    ]


@router.post("/categories")
async def create_category(body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    c = PurchaseCategory(
        title=body["title"],
        min_amount=float(body["min_amount"]),
        max_amount=float(body["max_amount"]),
        is_active=body.get("is_active", True),
        procurement_id=int(body["procurement_id"]),
        requirement_type=body.get("requirement_type") if body.get("requirement_type") else None
    )
    db.add(c)
    await db.commit()
    return {"message": "Category created", "id": c.id}


@router.put("/categories/{cat_id}")
async def update_category(cat_id: int, body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(PurchaseCategory).where(PurchaseCategory.id == cat_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Category not found")
    if "title" in body:
        c.title = body["title"]
    if "min_amount" in body:
        c.min_amount = float(body["min_amount"])
    if "max_amount" in body:
        c.max_amount = float(body["max_amount"])
    if "is_active" in body:
        c.is_active = bool(body["is_active"])
    if "procurement_id" in body:
        c.procurement_id = int(body["procurement_id"])
    if "requirement_type" in body:
        c.requirement_type = body["requirement_type"] if body["requirement_type"] else None
    await db.commit()
    return {"message": "Category updated"}


@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: int, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(PurchaseCategory).where(PurchaseCategory.id == cat_id))
    c = result.scalar_one_or_none()
    if c:
        await db.delete(c)
        await db.commit()
    return {"message": "Category deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# PENDING USER ONBOARDING
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/users/pending")
async def get_pending_users(db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.is_approved == False)
        .order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "title": u.title,
            "name": u.name,
            "email": u.email,
            "designation": u.designation,
            "gender": u.gender,
            "role": {"group_key": u.role.group_key, "name": u.role.name} if u.role else None,
            "department": {"name": u.department.name, "short_code": u.department.short_code} if u.department else None,
            "signature_path": f"/storage/{u.signature_path}" if u.signature_path else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("/users/{user_id}/approve")
async def approve_user(user_id: int, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_approved = True
    await db.commit()
    return {"message": "User approved successfully"}


@router.post("/users/{user_id}/reject")
async def reject_user(user_id: int, db: AsyncSession = Depends(get_db), _=AdminDep):
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.signature_path:
        import os
        abs_path = os.path.join(settings.STORAGE_PATH, u.signature_path)
        if os.path.exists(abs_path):
            try:
                os.remove(abs_path)
            except Exception:
                pass
    await db.delete(u)
    await db.commit()
    return {"message": "User onboarding request rejected and deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# BUDGET CSV EXPORT & IMPORT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/budget/import-template")
async def download_budget_template(_=DeanBudgetDep):
    import io
    import csv
    from fastapi.responses import StreamingResponse

    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(["S.No", "Department", "File No", "Procurement", "Budget Amount (INR)"])
    writer.writerow(["1", "CSE", "NITT/CSE/2026-27/005", "GPU Server Purchase", "1500000"])
    writer.writerow(["2", "ECE", "NITT/ECE/2026-27/001", "Lab Oscilloscopes", "800000"])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="budget_import_template.csv"'}
    )


@router.post("/budget/import")
@limiter.limit("10/minute")
async def import_budget_csv(
    request: Request,
    file: UploadFile,
    financial_year_id: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
    _=DeanBudgetDep
):
    from app.services.import_service import ImportService
    content = await file.read()
    import_service = ImportService(db)
    return await import_service.import_budget_csv(content, file.filename, financial_year_id)


@router.patch("/users/{user_id}/role")
async def update_user_role(user_id: int, body: dict, db: AsyncSession = Depends(get_db), _=AdminDep):
    role_id = body.get("role_id")
    if not role_id:
        raise HTTPException(status_code=400, detail="role_id is required")
        
    user_res = await db.execute(select(User).where(User.id == user_id))
    u = user_res.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
        
    role_res = await db.execute(select(RoleManager).where(RoleManager.id == role_id))
    role = role_res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role selected")
        
    u.role_id = role_id
    await db.commit()
    return {"message": "User role updated successfully"}


@router.post("/purchase-requests/{pr_id}/force-advance")
async def force_advance_pr(
    pr_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("admin"))
):
    remarks = body.get("remarks")
    if not remarks or not remarks.strip():
        raise HTTPException(status_code=400, detail="Remarks are mandatory for force-advancing")
        
    result = await db.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")
        
    from app.services.flow_engine import FlowEngineService
    flow_engine = FlowEngineService(db)
    
    try:
        await flow_engine.force_advance(pr, user, remarks)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
    return {"message": "Purchase request force-advanced successfully"}


@router.post("/designations")
async def add_designation(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    await db.refresh(user, ["role"])
    if user.role.group_key != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    value = body.get("value", "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Designation value is required")

    result = await db.execute(select(Settings).where(Settings.key_name == "designations"))
    setting = result.scalar_one_or_none()
    existing = []
    if setting:
        existing = [d.strip() for d in setting.value.split(",") if d.strip()]
        if value in existing:
            raise HTTPException(status_code=400, detail="Designation already exists")
        existing.append(value)
        setting.value = ",".join(existing)
    else:
        existing = ["Assistant Professor", "Associate Professor", "Professor", "Dean P&D (Budget)", "Dean P&D", "Director", "Registrar"]
        if value in existing:
            raise HTTPException(status_code=400, detail="Designation already exists")
        existing.append(value)
        setting = Settings(key_name="designations", value=",".join(existing))
        db.add(setting)

    await db.commit()
    return {"message": "Designation added successfully", "designations": existing}


@router.delete("/designations")
async def delete_designation(
    value: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    await db.refresh(user, ["role"])
    if user.role.group_key != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    value = value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Designation value is required")

    # Check if designation is currently used by any user
    user_check = await db.execute(select(User).where(User.designation == value))
    if user_check.scalars().first() is not None:
        raise HTTPException(status_code=400, detail="Designation is currently assigned to users and cannot be deleted")

    result = await db.execute(select(Settings).where(Settings.key_name == "designations"))
    setting = result.scalar_one_or_none()
    existing = []
    if setting:
        existing = [d.strip() for d in setting.value.split(",") if d.strip()]
    else:
        existing = ["Assistant Professor", "Associate Professor", "Professor", "Dean P&D (Budget)", "Dean P&D", "Director", "Registrar"]

    if value not in existing:
        raise HTTPException(status_code=400, detail="Designation does not exist")

    existing.remove(value)
    if setting:
        setting.value = ",".join(existing)
    else:
        setting = Settings(key_name="designations", value=",".join(existing))
        db.add(setting)

    await db.commit()
    return {"message": "Designation deleted successfully", "designations": existing}

