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

    async def register_asset(self, data: dict, user: User) -> Asset:
        """Manually register a department asset."""
        from app.models.user import Department
        
        # Determine department_id
        dept_id = data.get("department_id") or user.department_id
        if not dept_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Department ID is required")
            
        # Get department short code
        dept_q = await self.db.execute(select(Department).where(Department.id == dept_id))
        dept = dept_q.scalar_one_or_none()
        if not dept:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Invalid department")
        dept_code = dept.short_code
        
        # Get selected year
        selected_year = data.get("year")
        if selected_year:
            try:
                year_val = int(selected_year)
                year_suffix = f"{year_val % 100:02d}"
            except (ValueError, TypeError):
                year_suffix = str(datetime.utcnow().date().year)[-2:]
        else:
            year_suffix = str(datetime.utcnow().date().year)[-2:]
            
        # Auto-generate next asset tag sequence for this year
        seq = await self._next_tag_sequence(dept_code, year_suffix)
        asset_tag = f"NIT-{dept_code}-{year_suffix}-{seq:03d}"
        
        # Check if asset_tag is unique (should be since sequence works, but safe check)
        check_q = await self.db.execute(select(Asset).where(Asset.asset_tag == asset_tag))
        if check_q.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Generated asset tag already exists")
            
        # Parse optional dates
        purchase_date = None
        if data.get("purchase_date"):
            purchase_date = datetime.strptime(data["purchase_date"], "%Y-%m-%d").date()
            
        warranty_expiry = None
        if data.get("warranty_expiry"):
            warranty_expiry = datetime.strptime(data["warranty_expiry"], "%Y-%m-%d").date()
            
        # Generate QR code
        qr_url = self.qr_svc.generate(asset_tag)
        
        asset = Asset(
            asset_tag=asset_tag,
            legacy_asset_tag=data.get("legacy_asset_tag"),
            fund_source=data.get("fund_source"),
            name=data["name"],
            category=data["category"],
            department_id=dept_id,
            building=data.get("building"),
            room=data.get("room"),
            custodian=data.get("custodian"),
            serial_number=data.get("serial_number"),
            condition=data.get("condition") or "working",
            disposal_status=DisposalStatus.ACTIVE,
            qr_code_url=qr_url,
            purchase_date=purchase_date,
            unit_cost=float(data["unit_cost"]) if data.get("unit_cost") else None,
            warranty_expiry=warranty_expiry,
        )
        self.db.add(asset)
        await self.db.flush()
        
        # Log manual registration
        log = AssetLog(
            asset_id=asset.id,
            action="asset_registered",
            performed_by_id=user.id,
            old_value=None,
            new_value={
                "asset_tag": asset_tag,
                "legacy_asset_tag": asset.legacy_asset_tag,
                "fund_source": asset.fund_source,
                "condition": asset.condition
            },
            performed_at=datetime.utcnow(),
        )
        self.db.add(log)
        await self.db.flush()
        return asset

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

    async def delete_asset(self, asset_id: int, user: User) -> None:
        """Permanently delete an asset from the system."""
        result = await self.db.execute(select(Asset).where(Asset.id == asset_id))
        asset = result.scalar_one_or_none()
        if not asset:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Asset not found")
        
        # Permission check: HODs can only delete assets belonging to their department. Admins can delete any.
        if user.role.group_key == "hod" and asset.department_id != user.department_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Access denied")
            
        await self.db.delete(asset)
        await self.db.flush()

    async def import_assets_csv(self, file_content: str, user: User) -> dict:
        import csv
        import io
        from fastapi import HTTPException
        from app.models.user import Department
        
        # Determine user group permission
        is_admin = user.role.group_key == "admin"
        is_hod = user.role.group_key == "hod"
        if not (is_admin or is_hod):
            raise HTTPException(status_code=403, detail="Only HODs and Admins can import assets")

        # Load departments for lookup
        dept_result = await self.db.execute(select(Department))
        dept_list = dept_result.scalars().all()
        dept_by_code = {d.short_code.upper(): d for d in dept_list}
        dept_by_id = {d.id: d for d in dept_list}

        reader = csv.reader(io.StringIO(file_content.strip()))
        rows = list(reader)
        if not rows:
            raise HTTPException(status_code=400, detail="Empty CSV file")
        
        headers = [h.strip().lower().replace(" ", "_").replace("-", "_") for h in rows[0]]
        
        # Helper to get column index by possible header aliases
        def get_col_index(aliases):
            for alias in aliases:
                normalized = alias.lower().replace(" ", "_").replace("-", "_")
                if normalized in headers:
                    return headers.index(normalized)
            return -1

        idx_year = get_col_index(["year", "asset_year"])
        idx_legacy = get_col_index(["legacy_asset_tag", "legacy_tag", "existing_asset_number", "existing_asset_no"])
        idx_name = get_col_index(["name", "asset_name"])
        idx_category = get_col_index(["category"])
        idx_fund = get_col_index(["fund_source", "funding", "funding_type", "fund_type"])
        idx_cost = get_col_index(["unit_cost", "cost", "price", "unit_price"])
        idx_condition = get_col_index(["condition"])
        idx_building = get_col_index(["building", "location_building"])
        idx_room = get_col_index(["room", "location_room"])
        idx_custodian = get_col_index(["custodian", "lab_in_charge"])
        idx_serial = get_col_index(["serial_number", "serial", "serial_no"])
        idx_purchase = get_col_index(["purchase_date", "purchase_day"])
        idx_warranty = get_col_index(["warranty_expiry", "warranty_date"])
        idx_dept = get_col_index(["department", "dept", "department_code", "dept_code", "department_id"])

        if idx_name == -1:
            raise HTTPException(status_code=400, detail="CSV must contain a 'name' or 'asset_name' column")
        if idx_legacy == -1:
            raise HTTPException(status_code=400, detail="CSV must contain a 'legacy_asset_tag' or 'existing_asset_number' column")

        imported_count = 0
        errors = []

        for i, row in enumerate(rows[1:], start=2):
            if not row or not any(field.strip() for field in row):
                continue # Skip empty rows

            # Helper to safely retrieve row column data
            def val(idx, default=""):
                if idx != -1 and idx < len(row):
                    return row[idx].strip()
                return default

            asset_name = val(idx_name)
            legacy_tag = val(idx_legacy)
            
            if not asset_name:
                errors.append(f"Row {i}: Asset name is required")
                continue
            if not legacy_tag:
                errors.append(f"Row {i}: Existing Asset / Reference Number is required")
                continue

            # Determine department
            dept_val = val(idx_dept)
            target_dept = None
            if is_hod:
                target_dept = dept_by_id.get(user.department_id)
            elif is_admin:
                if dept_val:
                    # Try lookup by short code
                    target_dept = dept_by_code.get(dept_val.upper())
                    if not target_dept:
                        # Try lookup by ID
                        try:
                            target_dept = dept_by_id.get(int(dept_val))
                        except ValueError:
                            pass
                if not target_dept:
                    errors.append(f"Row {i}: Invalid or missing department code/ID '{dept_val}'")
                    continue
            
            if not target_dept:
                errors.append(f"Row {i}: Department could not be determined")
                continue

            # Parse year
            year_str = val(idx_year)
            year_val = None
            if year_str:
                try:
                    year_val = int(year_str)
                except ValueError:
                    errors.append(f"Row {i}: Invalid year value '{year_str}'")
                    continue
            else:
                year_val = datetime.utcnow().date().year

            # Parse category
            cat_val = val(idx_category, "lab_equipment").lower().replace(" ", "_")
            if cat_val not in ("lab_equipment", "furniture", "computer", "other"):
                # try map matches
                if "equip" in cat_val or "lab" in cat_val:
                    cat_val = "lab_equipment"
                elif "furn" in cat_val:
                    cat_val = "furniture"
                elif "comp" in cat_val or "pc" in cat_val or "system" in cat_val:
                    cat_val = "computer"
                else:
                    cat_val = "other"

            # Parse fund source
            fund_val = val(idx_fund, "plan_fund").lower().replace(" ", "_").replace("-", "_")
            valid_funds = ("plan_fund", "non_plan_fund", "research_fund", "consultancy_fund", "dept_development_fund", "others")
            if fund_val not in valid_funds:
                # simple heuristics
                if "non" in fund_val:
                    fund_val = "non_plan_fund"
                elif "plan" in fund_val:
                    fund_val = "plan_fund"
                elif "research" in fund_val:
                    fund_val = "research_fund"
                elif "consult" in fund_val:
                    fund_val = "consultancy_fund"
                elif "dept" in fund_val or "develop" in fund_val:
                    fund_val = "dept_development_fund"
                else:
                    fund_val = "others"

            # Parse cost
            cost_str = val(idx_cost)
            cost_val = None
            if cost_str:
                try:
                    # Strip currency symbols and commas
                    cleaned_cost = cost_str.replace("₹", "").replace(",", "").strip()
                    cost_val = float(cleaned_cost)
                except ValueError:
                    errors.append(f"Row {i}: Invalid unit cost value '{cost_str}'")
                    continue

            # Parse condition
            cond_val = val(idx_condition, "working").lower().replace(" ", "_").replace("-", "_")
            if cond_val not in ("working", "damaged", "under_repair", "obsolete"):
                cond_val = "working"

            # Parse dates
            purchase_date = None
            purchase_str = val(idx_purchase)
            if purchase_str:
                for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%Y"):
                    try:
                        purchase_date = datetime.strptime(purchase_str, fmt).date()
                        break
                    except ValueError:
                        continue
                if not purchase_date:
                    errors.append(f"Row {i}: Invalid purchase date format '{purchase_str}'. Use YYYY-MM-DD")
                    continue

            warranty_expiry = None
            warranty_str = val(idx_warranty)
            if warranty_str:
                for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%Y"):
                    try:
                        warranty_expiry = datetime.strptime(warranty_str, fmt).date()
                        break
                    except ValueError:
                        continue
                if not warranty_expiry:
                    errors.append(f"Row {i}: Invalid warranty date format '{warranty_str}'. Use YYYY-MM-DD")
                    continue

            # Check legacy tag uniqueness in DB
            legacy_check_q = await self.db.execute(select(Asset).where(Asset.legacy_asset_tag == legacy_tag))
            if legacy_check_q.scalar_one_or_none():
                errors.append(f"Row {i}: Existing Asset Number '{legacy_tag}' is already registered in the system")
                continue

            # All validation passed! Call register_asset dict-style
            try:
                await self.register_asset({
                    "year": year_val,
                    "legacy_asset_tag": legacy_tag,
                    "fund_source": fund_val,
                    "name": asset_name,
                    "category": cat_val,
                    "department_id": target_dept.id,
                    "building": val(idx_building) or None,
                    "room": val(idx_room) or None,
                    "custodian": val(idx_custodian) or None,
                    "serial_number": val(idx_serial) or None,
                    "condition": cond_val,
                    "purchase_date": purchase_date.strftime("%Y-%m-%d") if purchase_date else None,
                    "unit_cost": cost_val,
                    "warranty_expiry": warranty_expiry.strftime("%Y-%m-%d") if warranty_expiry else None,
                }, user)
                imported_count += 1
            except Exception as e:
                errors.append(f"Row {i}: Database insertion failed: {str(e)}")

        if errors:
            # Rollback to avoid partial uploads
            await self.db.rollback()
            raise HTTPException(status_code=400, detail={"message": "CSV Import Failed", "errors": errors})
        
        return {"message": f"Successfully imported {imported_count} assets."}
