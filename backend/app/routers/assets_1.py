from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.limiter import limiter
from sqlalchemy import select, or_, func
from datetime import datetime, date

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles, require_own_department
from app.models.user import User
from app.models.asset import Asset, AssetMovement, AssetLog, InstallationRecord
from app.services.asset_service import AssetService
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import selectinload

class PublicAssetView(BaseModel):
    asset_tag: str
    asset_name: str
    location: str
    custodian_name: Optional[str] = None
    department_name: Optional[str] = None
    category: Optional[str] = None
    legacy_asset_tag: Optional[str] = None
    fund_source: Optional[str] = None
    condition: Optional[str] = None
    building: Optional[str] = None
    room: Optional[str] = None
    custodian: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None

    class Config:
        from_attributes = True


class InstallationRecordCreate(BaseModel):
    installation_date: Optional[date] = None
    installed_by: Optional[str] = None
    installation_scope: Optional[str] = None
    is_commissioned: bool = False
    certificate_path: Optional[str] = None
    remarks: Optional[str] = None

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/dashboard-stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_own_department())
):
    asset_query = select(Asset)
    if user.role.group_key in ("hod", "faculty"):
        asset_query = asset_query.where(Asset.department_id == user.department_id)
        
    result = await db.execute(asset_query)
    assets = result.scalars().all()
    
    total_assets = len(assets)
    pending_verification = len([a for a in assets if not a.is_verified])
    
    by_category = {}
    for a in assets:
        by_category[a.category] = by_category.get(a.category, 0) + 1
        
    by_condition = {}
    for a in assets:
        by_condition[a.condition] = by_condition.get(a.condition, 0) + 1
        
    by_department = {}
    if user.role.group_key not in ("hod", "faculty"):
        from app.models.user import Department
        dept_result = await db.execute(select(Department))
        depts = {d.id: d.name for d in dept_result.scalars().all()}
        for a in assets:
            dept_name = depts.get(a.department_id, "Unknown Department")
            by_department[dept_name] = by_department.get(dept_name, 0) + 1
            
    recent_query = select(Asset)
    if user.role.group_key in ("hod", "faculty"):
        recent_query = recent_query.where(Asset.department_id == user.department_id)
    recent_query = recent_query.order_by(Asset.created_at.desc()).limit(5)
    
    recent_result = await db.execute(recent_query)
    recent_assets = [
        {
            "id": a.id,
            "asset_tag": a.asset_tag,
            "name": a.name,
            "category": a.category,
            "condition": a.condition,
            "created_at": a.created_at.isoformat()
        }
        for a in recent_result.scalars().all()
    ]
    
    return {
        "total_assets": total_assets,
        "pending_verification": pending_verification,
        "by_category": by_category,
        "by_condition": by_condition,
        "by_department": by_department,
        "recent_assets": recent_assets
    }

@router.get("/")
async def list_assets(
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    search: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    disposal_status: Optional[str] = None,
    fund_source: Optional[str] = None,
    is_verified: Optional[bool] = None,
    department_id: Optional[int] = None,
    year: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_own_department())
):
    base_query = select(Asset)
    if user.role.group_key in ("hod", "faculty"):
        base_query = base_query.where(Asset.department_id == user.department_id)
    elif department_id is not None:
        base_query = base_query.where(Asset.department_id == department_id)
        
    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Asset.name.ilike(search_pattern),
                Asset.asset_tag.ilike(search_pattern),
                Asset.legacy_asset_tag.ilike(search_pattern),
                Asset.serial_number.ilike(search_pattern),
                Asset.custodian.ilike(search_pattern),
                Asset.building.ilike(search_pattern),
                Asset.room.ilike(search_pattern),
            )
        )
        
    if category:
        base_query = base_query.where(Asset.category == category)
    if condition:
        base_query = base_query.where(Asset.condition == condition)
    if disposal_status:
        base_query = base_query.where(Asset.disposal_status == disposal_status)
    if fund_source:
        base_query = base_query.where(Asset.fund_source == fund_source)
    if is_verified is not None:
        base_query = base_query.where(Asset.is_verified == is_verified)
    if year is not None:
        year_suffix = f"-{str(year)[-2:]}-"
        base_query = base_query.where(Asset.asset_tag.like(f"%{year_suffix}%"))
    
    count_query = select(func.count()).select_from(base_query.subquery())
    total = await db.scalar(count_query) or 0

    query = base_query.order_by(Asset.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    assets = result.scalars().all()
    
    items = [
        {"id": a.id, "asset_tag": a.asset_tag, "legacy_asset_tag": a.legacy_asset_tag, "fund_source": a.fund_source, "name": a.name, "category": a.category,
         "condition": a.condition, "disposal_status": a.disposal_status,
         "building": a.building, "room": a.room, "qr_code_url": a.qr_code_url,
         "delivery_item_id": a.delivery_item_id, "department_id": a.department_id,
         "serial_number": a.serial_number, "custodian": a.custodian,
         "remarks": a.remarks, "is_verified": a.is_verified, "asset_source": a.asset_source,
         "purchase_date": a.purchase_date.isoformat() if a.purchase_date else None,
         "unit_cost": a.unit_cost,
         "supplier_name": a.supplier_name,
         "supplier_address": a.supplier_address,
         "bill_number": a.bill_number,
         "bill_date": a.bill_date.isoformat() if a.bill_date else None,
         "stock_register_volume": a.stock_register_volume,
         "stock_register_page": a.stock_register_page,
         "delivery_date": a.delivery_date.isoformat() if a.delivery_date else None}
        for a in assets
    ]
    return {"items": items, "total": total}


@router.post("/")
async def register_asset(body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(require_roles("hod", "admin"))):
    svc = AssetService(db)
    asset = await svc.register_asset(body, user)
    await db.commit()
    return {
        "message": "Asset manually registered successfully",
        "id": asset.id,
        "asset_tag": asset.asset_tag,
        "legacy_asset_tag": asset.legacy_asset_tag,
        "fund_source": asset.fund_source
    }


@router.get("/qr/{asset_tag}", response_model=PublicAssetView)
async def public_asset_profile(asset_tag: str, db: AsyncSession = Depends(get_db)):
    """Public route — no auth. Accessible via QR scan."""
    result = await db.execute(
        select(Asset)
        .options(selectinload(Asset.department))
        .where(Asset.asset_tag == asset_tag)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {
        "asset_tag": asset.asset_tag,
        "asset_name": asset.name,
        "location": f"{asset.building or ''} {asset.room or ''}".strip(),
        "custodian_name": asset.custodian,
        "department_name": asset.department.name if asset.department else None,
        "category": asset.category,
        "legacy_asset_tag": asset.legacy_asset_tag,
        "fund_source": asset.fund_source,
        "condition": asset.condition,
        "building": asset.building,
        "room": asset.room,
        "custodian": asset.custodian,
        "serial_number": asset.serial_number,
        "purchase_date": asset.purchase_date,
        "warranty_expiry": asset.warranty_expiry,
    }


@router.get("/{asset_id}")
async def get_asset(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    result = await db.execute(
        select(Asset)
        .options(
            selectinload(Asset.movements),
            selectinload(Asset.logs).selectinload(AssetLog.performed_by),
            selectinload(Asset.installation_records)
        )
        .where(Asset.id == asset_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if user.role.group_key in ("hod", "faculty") and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return {
        "id": asset.id, "asset_tag": asset.asset_tag, "legacy_asset_tag": asset.legacy_asset_tag, "fund_source": asset.fund_source, "name": asset.name,
        "category": asset.category, "condition": asset.condition,
        "disposal_status": asset.disposal_status, "qr_code_url": asset.qr_code_url,
        "building": asset.building, "room": asset.room, "custodian": asset.custodian,
        "serial_number": asset.serial_number, "unit_cost": asset.unit_cost,
        "remarks": asset.remarks, "is_verified": asset.is_verified,
        "verified_at": asset.verified_at.isoformat() if asset.verified_at else None,
        "asset_source": asset.asset_source,
        "purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
        "warranty_expiry": asset.warranty_expiry.isoformat() if asset.warranty_expiry else None,
        "supplier_name": asset.supplier_name,
        "supplier_address": asset.supplier_address,
        "bill_number": asset.bill_number,
        "bill_date": asset.bill_date.isoformat() if asset.bill_date else None,
        "stock_register_volume": asset.stock_register_volume,
        "stock_register_page": asset.stock_register_page,
        "delivery_date": asset.delivery_date.isoformat() if asset.delivery_date else None,
        "movements": [{"from_room": m.from_room, "to_room": m.to_room, "moved_at": m.moved_at.isoformat(), "reason": m.reason} for m in asset.movements],
        "logs": [
            {
                "action": l.action,
                "performed_at": l.performed_at.isoformat(),
                "old_value": l.old_value,
                "new_value": l.new_value,
                "performed_by_name": l.performed_by.name if l.performed_by else f"User {l.performed_by_id}"
            }
            for l in asset.logs
        ],
        "installation_records": [
            {
                "id": ir.id,
                "installation_date": ir.installation_date.isoformat() if ir.installation_date else None,
                "installed_by": ir.installed_by,
                "installation_scope": ir.installation_scope,
                "is_commissioned": ir.is_commissioned,
                "certificate_path": ir.certificate_path,
                "remarks": ir.remarks,
                "recorded_at": ir.recorded_at.isoformat() if ir.recorded_at else None,
            }
            for ir in asset.installation_records
        ],
    }

@router.put("/{asset_id}")
async def update_asset(asset_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
        
    if user.role.group_key in ("hod", "faculty") and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    old_values = {
        "name": asset.name,
        "category": asset.category,
        "building": asset.building,
        "room": asset.room,
        "custodian": asset.custodian,
        "serial_number": asset.serial_number,
        "legacy_asset_tag": asset.legacy_asset_tag,
        "unit_cost": asset.unit_cost,
        "remarks": asset.remarks,
        "fund_source": asset.fund_source,
        "asset_source": asset.asset_source,
        "supplier_name": asset.supplier_name,
        "supplier_address": asset.supplier_address,
        "bill_number": asset.bill_number,
        "bill_date": asset.bill_date.isoformat() if asset.bill_date else None,
        "stock_register_volume": asset.stock_register_volume,
        "stock_register_page": asset.stock_register_page,
        "delivery_date": asset.delivery_date.isoformat() if asset.delivery_date else None,
    }
    
    if "name" in body:
        asset.name = body["name"]
    if "category" in body:
        asset.category = body["category"]
    if "building" in body:
        asset.building = body["building"]
    if "room" in body:
        asset.room = body["room"]
    if "custodian" in body:
        asset.custodian = body["custodian"]
    if "serial_number" in body:
        asset.serial_number = body["serial_number"]
    if "legacy_asset_tag" in body:
        asset.legacy_asset_tag = body["legacy_asset_tag"]
    if "unit_cost" in body:
        asset.unit_cost = float(body["unit_cost"]) if body["unit_cost"] is not None else None
    if "remarks" in body:
        asset.remarks = body["remarks"]
    if "fund_source" in body:
        asset.fund_source = body["fund_source"]
    if "asset_source" in body:
        asset.asset_source = body["asset_source"]
    if "supplier_name" in body:
        asset.supplier_name = body["supplier_name"]
    if "supplier_address" in body:
        asset.supplier_address = body["supplier_address"]
    if "bill_number" in body:
        asset.bill_number = body["bill_number"]
    if "stock_register_volume" in body:
        asset.stock_register_volume = body["stock_register_volume"]
    if "stock_register_page" in body:
        asset.stock_register_page = body["stock_register_page"]
        
    if "purchase_date" in body:
        if body["purchase_date"]:
            asset.purchase_date = datetime.strptime(body["purchase_date"], "%Y-%m-%d").date()
        else:
            asset.purchase_date = None
            
    if "warranty_expiry" in body:
        if body["warranty_expiry"]:
            asset.warranty_expiry = datetime.strptime(body["warranty_expiry"], "%Y-%m-%d").date()
        else:
            asset.warranty_expiry = None

    if "bill_date" in body:
        if body["bill_date"]:
            asset.bill_date = datetime.strptime(body["bill_date"], "%Y-%m-%d").date()
        else:
            asset.bill_date = None

    if "delivery_date" in body:
        if body["delivery_date"]:
            asset.delivery_date = datetime.strptime(body["delivery_date"], "%Y-%m-%d").date()
        else:
            asset.delivery_date = None
        
    new_values = {
        "name": asset.name,
        "category": asset.category,
        "building": asset.building,
        "room": asset.room,
        "custodian": asset.custodian,
        "serial_number": asset.serial_number,
        "legacy_asset_tag": asset.legacy_asset_tag,
        "unit_cost": asset.unit_cost,
        "remarks": asset.remarks,
        "fund_source": asset.fund_source,
        "asset_source": asset.asset_source,
        "supplier_name": asset.supplier_name,
        "supplier_address": asset.supplier_address,
        "bill_number": asset.bill_number,
        "bill_date": asset.bill_date.isoformat() if asset.bill_date else None,
        "stock_register_volume": asset.stock_register_volume,
        "stock_register_page": asset.stock_register_page,
        "delivery_date": asset.delivery_date.isoformat() if asset.delivery_date else None,
    }
    
    log = AssetLog(
        asset_id=asset.id,
        action="asset_updated",
        performed_by_id=user.id,
        old_value=old_values,
        new_value=new_values,
        performed_at=datetime.utcnow(),
    )
    db.add(log)
    await db.commit()
    return {"message": "Asset updated successfully"}

@router.post("/{asset_id}/verify")
async def verify_asset(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if user.role.group_key in ("hod", "faculty") and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    asset.is_verified = True
    asset.verified_at = datetime.utcnow()
    
    log = AssetLog(
        asset_id=asset.id,
        action="asset_verified",
        performed_by_id=user.id,
        old_value={"is_verified": False},
        new_value={"is_verified": True, "verified_at": asset.verified_at.isoformat()},
        performed_at=datetime.utcnow(),
    )
    db.add(log)
    await db.commit()
    return {"message": "Asset physically verified successfully", "is_verified": True}


@router.patch("/{asset_id}/condition")
async def update_condition(asset_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if user.role.group_key in ("hod", "faculty") and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")
    svc = AssetService(db)
    asset = await svc.update_condition(asset_id, body["condition"], user)
    await db.commit()
    return {"message": "Condition updated", "condition": asset.condition}


@router.post("/{asset_id}/move")
async def move_asset(asset_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if user.role.group_key in ("hod", "faculty") and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")
    svc = AssetService(db)
    await svc.move_asset(asset_id, body["to_building"], body["to_room"], user, body.get("reason"))
    await db.commit()
    return {"message": "Asset movement recorded"}


@router.post("/{asset_id}/flag-disposal")
async def flag_disposal(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    if user.role.group_key not in ("hod", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if user.role.group_key == "hod" and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")
    svc = AssetService(db)
    asset = await svc.flag_disposal(asset_id, user)
    await db.commit()
    return {"message": "Asset flagged for disposal", "disposal_status": asset.disposal_status}


@router.post("/{asset_id}/confirm-disposal")
async def confirm_disposal(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    if user.role.group_key != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    svc = AssetService(db)
    asset = await svc.confirm_disposal(asset_id, user)
    await db.commit()
    return {"message": "Disposal confirmed", "disposal_status": asset.disposal_status}


@router.delete("/{asset_id}")
async def delete_asset(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    if user.role.group_key not in ("hod", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if user.role.group_key == "hod" and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")
    svc = AssetService(db)
    await svc.delete_asset(asset_id, user)
    await db.commit()
    return {"message": "Asset deleted successfully"}


@router.post("/import")
@limiter.limit("10/minute")
async def import_assets(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("hod", "admin"))
):
    contents = await file.read()
    file_content = contents.decode("utf-8")
    svc = AssetService(db)
    result = await svc.import_assets_csv(file_content, user)
    await db.commit()
    return result


@router.post("/{asset_id}/installation")
async def record_installation(
    asset_id: int,
    payload: InstallationRecordCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Record installation details for an asset."""
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    await db.refresh(user, ["role"])
    if user.role.group_key in ("hod", "faculty") and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")

    record = InstallationRecord(
        asset_id=asset.id,
        installation_date=payload.installation_date,
        installed_by=payload.installed_by,
        installation_scope=payload.installation_scope,
        is_commissioned=payload.is_commissioned,
        certificate_path=payload.certificate_path,
        remarks=payload.remarks,
        recorded_by_id=user.id,
    )
    db.add(record)
    
    log = AssetLog(
        asset_id=asset.id,
        action="installation_recorded",
        performed_by_id=user.id,
        old_value=None,
        new_value={
            "installation_date": payload.installation_date.isoformat() if payload.installation_date else None,
            "installed_by": payload.installed_by,
            "is_commissioned": payload.is_commissioned,
        },
        performed_at=datetime.utcnow(),
    )
    db.add(log)
    await db.commit()
    return {"message": "Installation record saved successfully"}


@router.get("/{asset_id}/installation")
async def get_installation_records(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fetch installation records for an asset."""
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    await db.refresh(user, ["role"])
    if user.role.group_key in ("hod", "faculty") and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")

    rec_res = await db.execute(
        select(InstallationRecord)
        .where(InstallationRecord.asset_id == asset_id)
        .order_by(InstallationRecord.recorded_at.desc())
    )
    records = rec_res.scalars().all()
    return [
        {
            "id": r.id,
            "asset_id": r.asset_id,
            "installation_date": r.installation_date.isoformat() if r.installation_date else None,
            "installed_by": r.installed_by,
            "installation_scope": r.installation_scope,
            "is_commissioned": r.is_commissioned,
            "certificate_path": r.certificate_path,
            "remarks": r.remarks,
            "recorded_by_id": r.recorded_by_id,
            "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
        }
        for r in records
    ]
