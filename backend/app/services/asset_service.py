"""Asset service: creates assets, logs movements and condition changes, handles disposal."""
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.asset import Asset, AssetMovement, AssetLog, DisposalStatus
from app.models.inventory import DeliveryItem, DeptAssetLog
from app.models.user import User
from app.services.qr_service import QrService


class AssetService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.qr_svc = QrService()

    async def _next_tag_sequence(self, dept_code: str, year_suffix: str) -> int:
        result = await self.db.execute(
            select(func.count(Asset.id)).where(
                Asset.asset_tag.like(f"NIT-{dept_code}-{year_suffix}-%")
            )
        )
        return (result.scalar() or 0) + 1

    async def create_assets_from_grn(self, delivery_item: DeliveryItem, dept_log: DeptAssetLog) -> list[Asset]:
        """Auto-create assets after GRN verification. One asset per serial number."""
        from app.models.user import Department
        dept_q = await self.db.execute(
            select(Department).where(Department.id == delivery_item.delivery.department_id)
        )
        dept = dept_q.scalar_one()
        dept_code = dept.short_code
        
        current_date = datetime.utcnow().date()
        year_suffix = str(current_date.year)[-2:]

        serial_numbers = dept_log.serial_numbers or []
        quantity = dept_log.quantity
        assets = []

        for i in range(quantity):
            seq = await self._next_tag_sequence(dept_code, year_suffix)
            asset_tag = f"NIT-{dept_code}-{year_suffix}-{seq:03d}"
            serial = serial_numbers[i] if i < len(serial_numbers) else None

            qr_url = self.qr_svc.generate(asset_tag)

            asset = Asset(
                asset_tag=asset_tag,
                name=delivery_item.name,
                category=delivery_item.category,
                department_id=delivery_item.delivery.department_id,
                building=dept_log.building,
                room=dept_log.room,
                custodian=dept_log.custodian_name,
                serial_number=serial,
                condition=dept_log.condition if dept_log.condition in ("working", "damaged") else "working",
                disposal_status=DisposalStatus.ACTIVE,
                qr_code_url=qr_url,
                purchase_date=datetime.utcnow().date(),
                unit_cost=delivery_item.unit_price,
                delivery_item_id=delivery_item.id,
            )
            self.db.add(asset)
            await self.db.flush()

            # Initial asset log
            log = AssetLog(
                asset_id=asset.id,
                action="asset_created",
                performed_by_id=dept_log.logged_by_id,
                old_value=None,
                new_value={"asset_tag": asset_tag, "condition": asset.condition},
                performed_at=datetime.utcnow(),
            )
            self.db.add(log)
            assets.append(asset)

        await self.db.flush()
        return assets

    async def update_condition(self, asset_id: int, new_condition: str, user: User) -> Asset:
        result = await self.db.execute(select(Asset).where(Asset.id == asset_id))
        asset = result.scalar_one()
        old_condition = asset.condition
        asset.condition = new_condition
        log = AssetLog(
            asset_id=asset.id,
            action="condition_updated",
            performed_by_id=user.id,
            old_value={"condition": old_condition},
            new_value={"condition": new_condition},
        )
        self.db.add(log)
        await self.db.flush()
        return asset

    async def move_asset(self, asset_id: int, to_building: str, to_room: str, user: User, reason: Optional[str]) -> Asset:
        result = await self.db.execute(select(Asset).where(Asset.id == asset_id))
        asset = result.scalar_one()
        movement = AssetMovement(
            asset_id=asset.id,
            from_building=asset.building,
            from_room=asset.room,
            to_building=to_building,
            to_room=to_room,
            moved_by_id=user.id,
            reason=reason,
        )
        log = AssetLog(
            asset_id=asset.id,
            action="asset_moved",
            performed_by_id=user.id,
            old_value={"building": asset.building, "room": asset.room},
            new_value={"building": to_building, "room": to_room},
        )
        asset.building = to_building
        asset.room = to_room
        self.db.add(movement)
        self.db.add(log)
        await self.db.flush()
        return asset

    async def flag_disposal(self, asset_id: int, user: User) -> Asset:
        result = await self.db.execute(select(Asset).where(Asset.id == asset_id))
        asset = result.scalar_one()
        asset.disposal_status = DisposalStatus.PENDING_DISPOSAL
        log = AssetLog(
            asset_id=asset.id,
            action="disposal_flagged",
            performed_by_id=user.id,
            old_value={"disposal_status": "active"},
            new_value={"disposal_status": "pending_disposal"},
        )
        self.db.add(log)
        await self.db.flush()
        return asset

    async def confirm_disposal(self, asset_id: int, admin_user: User) -> Asset:
        result = await self.db.execute(select(Asset).where(Asset.id == asset_id))
        asset = result.scalar_one()
        asset.disposal_status = DisposalStatus.DISPOSED
        log = AssetLog(
            asset_id=asset.id,
            action="disposal_confirmed",
            performed_by_id=admin_user.id,
            old_value={"disposal_status": "pending_disposal"},
            new_value={"disposal_status": "disposed"},
        )
        self.db.add(log)
        await self.db.flush()
        return asset
