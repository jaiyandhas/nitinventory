from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.limiter import limiter
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles, require_own_department
from app.models.user import User
from app.models.asset import Asset, AssetMovement, AssetLog
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

    class Config:
        from_attributes = True

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/")
async def list_assets(
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_own_department())
):
    base_query = select(Asset)
    if user.role.group_key in ("hod", "faculty"):
        base_query = base_query.where(Asset.department_id == user.department_id)
        
    # Get total count
    from sqlalchemy import func
    count_query = select(func.count(Asset.id))
    if user.role.group_key in ("hod", "faculty"):
        count_query = count_query.where(Asset.department_id == user.department_id)
    
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
         "purchase_date": a.purchase_date.isoformat() if a.purchase_date else None,
         "unit_cost": a.unit_cost}
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
    }


@router.get("/{asset_id}")
async def get_asset(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_own_department())):
    result = await db.execute(
        select(Asset)
        .options(
            selectinload(Asset.movements),
            selectinload(Asset.logs)
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
        "purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
        "warranty_expiry": asset.warranty_expiry.isoformat() if asset.warranty_expiry else None,
        "movements": [{"from_room": m.from_room, "to_room": m.to_room, "moved_at": m.moved_at.isoformat(), "reason": m.reason} for m in asset.movements],
        "logs": [{"action": l.action, "performed_at": l.performed_at.isoformat(), "old_value": l.old_value, "new_value": l.new_value} for l in asset.logs],
    }


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
