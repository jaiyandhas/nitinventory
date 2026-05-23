from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Form, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime
import os
import uuid

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import User
from app.models.inventory import Delivery, DeliveryItem, DeptAssetLog, StoresAssetLog, Discrepancy, DiscrepancyStatus, DeliveryStatus
from app.models.purchase_request import PurchaseRequest
from app.services.grn_service import GrnService
from app.core.config import settings

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("/deliveries")
async def list_deliveries(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Delivery).order_by(Delivery.created_at.desc())
    if user.role.group_key == "faculty":
        query = query.join(Delivery.purchase_request).where(PurchaseRequest.initiator_id == user.id)
    elif user.role.group_key == "hod":
        query = query.where(Delivery.department_id == user.department_id, Delivery.status != DeliveryStatus.PENDING)
    elif user.role.group_key == "verifier_sp":
        query = query.where(Delivery.status != DeliveryStatus.PENDING)
        
    result = await db.execute(query)
    deliveries = result.scalars().all()
    return [
        {
            "id": d.id,
            "po_id": d.po_id,
            "status": d.status,
            "challan_number": d.challan_number,
            "invoice_number": d.invoice_number,
            "invoice_pdf_path": d.invoice_pdf_path,
            "challan_pdf_path": d.challan_pdf_path,
            "created_at": d.created_at.isoformat()
        }
        for d in deliveries
    ]



from sqlalchemy.orm import selectinload

@router.get("/deliveries/{delivery_id}")
async def get_delivery(delivery_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Delivery)
        .options(
            selectinload(Delivery.items).selectinload(DeliveryItem.dept_log),
            selectinload(Delivery.items).selectinload(DeliveryItem.stores_log),
            selectinload(Delivery.items).selectinload(DeliveryItem.discrepancy),
            selectinload(Delivery.payments),
            selectinload(Delivery.purchase_request)
        )
        .where(Delivery.id == delivery_id)
    )
    delivery = result.scalar_one_or_none()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
        
    # Authorization checks
    if user.role.group_key == "faculty":
        if not delivery.purchase_request or delivery.purchase_request.initiator_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied. Only the PR initiator can view this delivery.")
    elif user.role.group_key == "hod":
        if delivery.department_id != user.department_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if delivery.status == DeliveryStatus.PENDING:
            raise HTTPException(status_code=403, detail="Access denied. Delivery is pending initiator confirmation.")
    elif user.role.group_key == "verifier_sp":
        if delivery.status == DeliveryStatus.PENDING:
            raise HTTPException(status_code=403, detail="Access denied. Delivery is pending initiator confirmation.")
    
    return {
        "id": delivery.id, "po_id": delivery.po_id, "status": delivery.status,
        "challan_number": delivery.challan_number, "invoice_number": delivery.invoice_number,
        "received_date": delivery.received_date.isoformat() if delivery.received_date else None,
        "invoice_pdf_path": delivery.invoice_pdf_path,
        "challan_pdf_path": delivery.challan_pdf_path,
        "purchase_request": {
            "id": delivery.purchase_request.id,
            "initiator_id": delivery.purchase_request.initiator_id,
        } if delivery.purchase_request else None,
        "items": [
            {
                "id": i.id, "name": i.name, "category": i.category, 
                "challan_quantity": i.challan_quantity, "unit_price": i.unit_price,
                "dept_log": {
                    "id": i.dept_log.id,
                    "quantity": i.dept_log.quantity,
                    "condition": i.dept_log.condition,
                    "building": i.dept_log.building,
                    "room": i.dept_log.room,
                    "custodian_name": i.dept_log.custodian_name,
                    "serial_numbers": i.dept_log.serial_numbers,
                    "remarks": i.dept_log.remarks
                } if i.dept_log else None,
                "stores_log": {
                    "id": i.stores_log.id,
                    "quantity": i.stores_log.quantity,
                    "condition": i.stores_log.condition,
                    "building": i.stores_log.building,
                    "room": i.stores_log.room,
                    "custodian_name": i.stores_log.custodian_name,
                    "serial_numbers": i.stores_log.serial_numbers,
                    "is_approved": i.stores_log.is_approved
                } if i.stores_log else None,
                "discrepancy": {
                    "id": i.discrepancy.id,
                    "status": i.discrepancy.status,
                    "dept_qty": i.discrepancy.dept_qty,
                    "stores_qty": i.discrepancy.stores_qty
                } if i.discrepancy else None
            }
            for i in delivery.items
        ],
        "payments": [
            {
                "id": p.id,
                "amount": p.amount,
                "status": p.status,
                "invoice_number": p.invoice_number
            }
            for p in delivery.payments
        ]
    }


@router.post("/deliveries/{delivery_id}/items/{item_id}/dept-log")
async def log_dept_receipt(
    delivery_id: int, item_id: int, body: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("hod")),
):
    """HOD logs physical receipt — IMMUTABLE after submit."""
    # Ensure delivery belongs to HOD's department
    result = await db.execute(select(Delivery).where(Delivery.id == delivery_id))
    delivery = result.scalar_one_or_none()
    if not delivery or delivery.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if delivery.status == DeliveryStatus.PENDING:
        raise HTTPException(status_code=400, detail="Cannot log receipt for pending delivery. Awaiting initiator confirmation.")

    # Quantity cannot exceed challan
    di_result = await db.execute(select(DeliveryItem).where(and_(DeliveryItem.id == item_id, DeliveryItem.delivery_id == delivery_id)))
    di = di_result.scalar_one_or_none()
    if not di:
        raise HTTPException(status_code=404, detail="Delivery item not found")
    if body.get("quantity", 0) > di.challan_quantity:
        raise HTTPException(status_code=400, detail=f"Quantity cannot exceed challan quantity of {di.challan_quantity}")

    grn_svc = GrnService(db, background_tasks)
    try:
        log = await grn_svc.log_dept_receipt(item_id, body, user)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    await db.commit()
    return {"message": "Department receipt logged (immutable)", "id": log.id}


@router.put("/deliveries/{delivery_id}/items/{item_id}/stores-log")
async def log_stores_receipt(
    delivery_id: int, item_id: int, body: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("verifier_sp")),
):
    """Stores logs receipt. Editable until approved."""
    # Fetch delivery to verify status
    result = await db.execute(select(Delivery).where(Delivery.id == delivery_id))
    delivery = result.scalar_one_or_none()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    if delivery.status == DeliveryStatus.PENDING:
        raise HTTPException(status_code=400, detail="Cannot log receipt for pending delivery. Awaiting initiator confirmation.")

    di_result = await db.execute(select(DeliveryItem).where(and_(DeliveryItem.id == item_id, DeliveryItem.delivery_id == delivery_id)))
    di = di_result.scalar_one_or_none()
    if not di:
        raise HTTPException(status_code=404, detail="Delivery item not found")
    if body.get("quantity", 0) > di.challan_quantity:
        raise HTTPException(status_code=400, detail=f"Quantity cannot exceed challan quantity of {di.challan_quantity}")

    grn_svc = GrnService(db, background_tasks)
    try:
        log = await grn_svc.log_stores_receipt(item_id, body, user)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    await db.commit()
    return {"message": "Stores receipt logged", "id": log.id}


@router.post("/deliveries/{delivery_id}/items/{item_id}/stores-log/approve")
async def approve_stores_log(
    delivery_id: int, item_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("apex_approver")),
):
    result = await db.execute(select(StoresAssetLog).where(StoresAssetLog.delivery_item_id == item_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Stores log not found")
    log.is_approved = True
    log.approved_by_id = user.id
    log.approved_at = datetime.utcnow()
    await db.commit()
    return {"message": "Stores log approved"}


@router.get("/discrepancies")
async def list_discrepancies(db: AsyncSession = Depends(get_db), user: User = Depends(require_roles("admin", "verifier_sp", "apex_approver"))):
    result = await db.execute(select(Discrepancy).order_by(Discrepancy.created_at.desc()))
    items = result.scalars().all()
    return [
        {"id": d.id, "delivery_item_id": d.delivery_item_id, "challan_qty": d.challan_qty,
         "dept_qty": d.dept_qty, "stores_qty": d.stores_qty, "status": d.status,
         "created_at": d.created_at.isoformat()}
        for d in items
    ]


@router.post("/deliveries/{delivery_id}/confirm")
async def confirm_delivery(
    delivery_id: int,
    invoice_number: str = Form(...),
    invoice_pdf: UploadFile = File(...),
    challan_pdf: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Delivery)
        .options(selectinload(Delivery.purchase_request))
        .where(Delivery.id == delivery_id)
    )
    delivery = result.scalar_one_or_none()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
        
    if not delivery.purchase_request or delivery.purchase_request.initiator_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied. Only the PR initiator can confirm delivery.")

    # Save invoice PDF
    invoice_ext = os.path.splitext(invoice_pdf.filename or "")[1].lower() or ".pdf"
    invoice_filename = f"invoice_{uuid.uuid4().hex}{invoice_ext}"
    invoice_rel_path = os.path.join("deliveries", str(delivery_id), invoice_filename)
    invoice_abs_path = os.path.join(settings.STORAGE_PATH, invoice_rel_path)
    os.makedirs(os.path.dirname(invoice_abs_path), exist_ok=True)
    
    invoice_content = await invoice_pdf.read()
    with open(invoice_abs_path, "wb") as f:
        f.write(invoice_content)

    # Save challan PDF
    challan_ext = os.path.splitext(challan_pdf.filename or "")[1].lower() or ".pdf"
    challan_filename = f"challan_{uuid.uuid4().hex}{challan_ext}"
    challan_rel_path = os.path.join("deliveries", str(delivery_id), challan_filename)
    challan_abs_path = os.path.join(settings.STORAGE_PATH, challan_rel_path)
    os.makedirs(os.path.dirname(challan_abs_path), exist_ok=True)
    
    challan_content = await challan_pdf.read()
    with open(challan_abs_path, "wb") as f:
        f.write(challan_content)

    delivery.invoice_number = invoice_number
    delivery.invoice_pdf_path = invoice_rel_path
    delivery.challan_pdf_path = challan_rel_path
    delivery.received_date = datetime.utcnow()
    delivery.status = DeliveryStatus.INITIATOR_CONFIRMED

    await db.commit()
    return {
        "message": "Delivery confirmed successfully",
        "delivery_id": delivery_id,
        "status": delivery.status,
        "invoice_pdf_path": invoice_rel_path,
        "challan_pdf_path": challan_rel_path,
    }
