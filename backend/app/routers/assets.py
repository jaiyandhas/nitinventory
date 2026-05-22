from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import User
from app.models.asset import Asset, AssetMovement, AssetLog
from app.services.asset_service import AssetService

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/")
async def list_assets(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Asset).order_by(Asset.created_at.desc())
    if user.role.group_key == "hod":
        query = query.where(Asset.department_id == user.department_id)
    result = await db.execute(query)
    assets = result.scalars().all()
    return [
        {"id": a.id, "asset_tag": a.asset_tag, "name": a.name, "category": a.category,
         "condition": a.condition, "disposal_status": a.disposal_status,
         "building": a.building, "room": a.room, "qr_code_url": a.qr_code_url,
         "delivery_item_id": a.delivery_item_id}
        for a in assets
    ]


@router.get("/qr/{asset_tag}")
async def public_asset_profile(asset_tag: str, db: AsyncSession = Depends(get_db)):
    """Public route — no auth. Accessible via QR scan."""
    result = await db.execute(select(Asset).where(Asset.asset_tag == asset_tag))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {
        "asset_tag": asset.asset_tag,
        "name": asset.name,
        "category": asset.category,
        "condition": asset.condition,
        "disposal_status": asset.disposal_status,
        "building": asset.building,
        "room": asset.room,
        "custodian": asset.custodian,
        "serial_number": asset.serial_number,
        "purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
        "warranty_expiry": asset.warranty_expiry.isoformat() if asset.warranty_expiry else None,
    }


@router.get("/{asset_id}")
async def get_asset(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if user.role.group_key == "hod" and asset.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.refresh(asset, ["movements", "logs"])
    return {
        "id": asset.id, "asset_tag": asset.asset_tag, "name": asset.name,
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
async def update_condition(asset_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    svc = AssetService(db)
    asset = await svc.update_condition(asset_id, body["condition"], user)
    await db.commit()
    return {"message": "Condition updated", "condition": asset.condition}


@router.post("/{asset_id}/move")
async def move_asset(asset_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    svc = AssetService(db)
    await svc.move_asset(asset_id, body["to_building"], body["to_room"], user, body.get("reason"))
    await db.commit()
    return {"message": "Asset movement recorded"}


@router.post("/{asset_id}/flag-disposal")
async def flag_disposal(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_roles("hod", "admin"))):
    svc = AssetService(db)
    asset = await svc.flag_disposal(asset_id, user)
    await db.commit()
    return {"message": "Asset flagged for disposal", "disposal_status": asset.disposal_status}


@router.post("/{asset_id}/confirm-disposal")
async def confirm_disposal(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_roles("admin"))):
    svc = AssetService(db)
    asset = await svc.confirm_disposal(asset_id, user)
    await db.commit()
    return {"message": "Disposal confirmed", "disposal_status": asset.disposal_status}
