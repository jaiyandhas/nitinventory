"""GRN Service: auto-creates delivery on PO_ISSUED, reconciles quantities, triggers asset creation."""
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import BackgroundTasks

from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem
from app.models.inventory import Delivery, DeliveryItem, DeptAssetLog, StoresAssetLog, Discrepancy, Payment, DeliveryStatus, DiscrepancyStatus, PaymentStatus
from app.models.user import User


class GrnService:
    def __init__(self, db: AsyncSession, background_tasks: Optional[BackgroundTasks] = None):
        self.db = db
        self.background_tasks = background_tasks

    async def create_delivery(self, pr: PurchaseRequest) -> Delivery:
        """Auto-called when PO_ISSUED. Creates Delivery + DeliveryItems from PR items. Idempotent."""
        existing_res = await self.db.execute(select(Delivery).where(Delivery.po_id == pr.id))
        existing = existing_res.scalar_one_or_none()
        if existing:
            return existing

        await self.db.refresh(pr, ["initiator"])
        
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(PurchaseRequestItem)
            .where(PurchaseRequestItem.purchase_request_id == pr.id)
            .options(selectinload(PurchaseRequestItem.budget_file))
        )
        pr_items = result.scalars().all()

        # Auto-generate gin_number
        from app.models.budget import FinancialYear
        from sqlalchemy import func
        fy_result = await self.db.execute(
            select(FinancialYear).where(FinancialYear.is_active == True)
        )
        financial_year = fy_result.scalar_one_or_none()
        fy_label = financial_year.label if financial_year else "FY"
        fy_id = financial_year.id if financial_year else None

        if fy_id:
            count_stmt = select(func.count(Delivery.id)).join(
                PurchaseRequest, Delivery.po_id == PurchaseRequest.id
            ).where(PurchaseRequest.financial_year_id == fy_id)
        else:
            count_stmt = select(func.count(Delivery.id))
            
        count_res = await self.db.execute(count_stmt)
        seq = count_res.scalar_one() + 1
        gin_number = f"GIN/{fy_label}/{seq:03d}"

        delivery = Delivery(
            po_id=pr.id,
            department_id=pr.initiator.department_id,
            status=DeliveryStatus.PENDING,
            gin_number=gin_number,
        )
        self.db.add(delivery)
        await self.db.flush()

        for item in pr_items:
            qty = item.quantity if item.quantity else 1
            di = DeliveryItem(
                delivery_id=delivery.id,
                name=item.item_description,
                category="other",
                challan_quantity=qty,
                unit_price=item.estimated_total / max(qty, 1),
            )
            self.db.add(di)

        await self.db.flush()
        return delivery

    async def log_dept_receipt(self, delivery_item_id: int, data: dict, user: User) -> DeptAssetLog:
        """HOD logs physical receipt. IMMUTABLE — raises 409 if already exists."""
        existing = await self.db.execute(
            select(DeptAssetLog).where(DeptAssetLog.delivery_item_id == delivery_item_id)
        )
        if existing.scalar_one_or_none():
            raise ValueError("Department receipt already logged. This record is immutable.")

        log = DeptAssetLog(
            delivery_item_id=delivery_item_id,
            logged_by_id=user.id,
            quantity=data["quantity"],
            condition=data["condition"],
            building=data.get("building"),
            room=data.get("room"),
            custodian_name=data.get("custodian_name"),
            serial_numbers=data.get("serial_numbers", []),
            remarks=data.get("remarks"),
            logged_at=datetime.utcnow(),
        )
        self.db.add(log)

        # Advance delivery status (never regress)
        di_result = await self.db.execute(select(DeliveryItem).where(DeliveryItem.id == delivery_item_id))
        di = di_result.scalar_one()
        delivery_result = await self.db.execute(select(Delivery).where(Delivery.id == di.delivery_id))
        delivery = delivery_result.scalar_one()
        if delivery.status == DeliveryStatus.INITIATOR_CONFIRMED:
            delivery.status = DeliveryStatus.DEPT_LOGGED

        await self.db.flush()
        await self._try_reconcile(delivery_item_id)
        return log

    async def log_stores_receipt(self, delivery_item_id: int, data: dict, user: User) -> StoresAssetLog:
        """Stores logs or updates their receipt record."""
        existing_result = await self.db.execute(
            select(StoresAssetLog).where(StoresAssetLog.delivery_item_id == delivery_item_id)
        )
        log = existing_result.scalar_one_or_none()

        if log and log.is_approved:
            raise ValueError("Stores log already approved. Cannot modify.")

        if log:
            log.quantity = data["quantity"]
            log.condition = data["condition"]
            log.building = data.get("building")
            log.room = data.get("room")
            log.custodian_name = data.get("custodian_name")
            log.serial_numbers = data.get("serial_numbers", [])
            log.inspection_remarks = data.get("inspection_remarks")
        else:
            # Auto-generate grn_number
            from app.models.budget import FinancialYear
            from sqlalchemy import func
            fy_result = await self.db.execute(
                select(FinancialYear).where(FinancialYear.is_active == True)
            )
            financial_year = fy_result.scalar_one_or_none()
            fy_label = financial_year.label if financial_year else "FY"
            fy_id = financial_year.id if financial_year else None
            
            if fy_id:
                count_stmt = select(func.count(StoresAssetLog.id)).join(
                    DeliveryItem, StoresAssetLog.delivery_item_id == DeliveryItem.id
                ).join(
                    Delivery, DeliveryItem.delivery_id == Delivery.id
                ).join(
                    PurchaseRequest, Delivery.po_id == PurchaseRequest.id
                ).where(
                    and_(
                        PurchaseRequest.financial_year_id == fy_id,
                        StoresAssetLog.grn_number != None
                    )
                )
            else:
                count_stmt = select(func.count(StoresAssetLog.id)).where(StoresAssetLog.grn_number != None)
                
            count_res = await self.db.execute(count_stmt)
            seq = count_res.scalar_one() + 1
            grn_number = f"GRN/{fy_label}/{seq:03d}"

            log = StoresAssetLog(
                delivery_item_id=delivery_item_id,
                logged_by_id=user.id,
                quantity=data["quantity"],
                condition=data["condition"],
                building=data.get("building"),
                room=data.get("room"),
                custodian_name=data.get("custodian_name"),
                serial_numbers=data.get("serial_numbers", []),
                grn_number=grn_number,
                inspection_remarks=data.get("inspection_remarks"),
            )
            self.db.add(log)

        di_result = await self.db.execute(select(DeliveryItem).where(DeliveryItem.id == delivery_item_id))
        di = di_result.scalar_one()
        delivery_result = await self.db.execute(select(Delivery).where(Delivery.id == di.delivery_id))
        delivery = delivery_result.scalar_one()
        if delivery.status == DeliveryStatus.DEPT_LOGGED:
            delivery.status = DeliveryStatus.STORES_LOGGED

        await self.db.flush()
        await self._try_reconcile(delivery_item_id)
        return log

    async def _try_reconcile(self, delivery_item_id: int) -> None:
        """Compare quantities for one item. If all items in delivery reconcile, set VERIFIED."""
        di_result = await self.db.execute(
            select(DeliveryItem).where(DeliveryItem.id == delivery_item_id)
        )
        di = di_result.scalar_one()

        dept_result = await self.db.execute(
            select(DeptAssetLog).where(DeptAssetLog.delivery_item_id == delivery_item_id)
        )
        dept_log = dept_result.scalar_one_or_none()

        stores_result = await self.db.execute(
            select(StoresAssetLog).where(StoresAssetLog.delivery_item_id == delivery_item_id)
        )
        stores_log = stores_result.scalar_one_or_none()

        if not dept_log or not stores_log:
            return  # Both logs not yet submitted for this item

        challan_qty = di.challan_quantity
        dept_qty = dept_log.quantity
        stores_qty = stores_log.quantity

        delivery_result = await self.db.execute(
            select(Delivery).where(Delivery.id == di.delivery_id)
        )
        delivery = delivery_result.scalar_one()

        if dept_qty != stores_qty or stores_qty != challan_qty:
            # Mismatch on this item → discrepancy
            delivery.status = DeliveryStatus.DISCREPANCY
            disc = Discrepancy(
                delivery_item_id=delivery_item_id,
                challan_qty=challan_qty,
                dept_qty=dept_qty,
                stores_qty=stores_qty,
                status=DiscrepancyStatus.OPEN,
            )
            self.db.add(disc)

            # Block payment
            payment_result = await self.db.execute(
                select(Payment).where(Payment.delivery_id == delivery.id)
            )
            for pmt in payment_result.scalars().all():
                pmt.status = "blocked"

            await self.db.flush()
            if self.background_tasks:
                from app.services.email_service import EmailService
                email_svc = EmailService()
                self.background_tasks.add_task(
                    email_svc.notify_discrepancy,
                    delivery_item_id=delivery_item_id,
                    to_email="admin@nitt.edu",
                )
            return

        # This item matches — check if ALL items in this delivery are now reconciled
        all_items_result = await self.db.execute(
            select(DeliveryItem).where(DeliveryItem.delivery_id == di.delivery_id)
        )
        all_items = all_items_result.scalars().all()

        for item in all_items:
            d_log = await self.db.execute(select(DeptAssetLog).where(DeptAssetLog.delivery_item_id == item.id))
            s_log = await self.db.execute(select(StoresAssetLog).where(StoresAssetLog.delivery_item_id == item.id))
            d = d_log.scalar_one_or_none()
            s = s_log.scalar_one_or_none()
            if not d or not s:
                return  # Some items still awaiting both logs
            if d.quantity != s.quantity or s.quantity != item.challan_quantity:
                return  # Another item has a mismatch (discrepancy already recorded)

        # All items reconciled and matched → set VERIFIED and create assets for each
        delivery.status = DeliveryStatus.VERIFIED
        from app.services.asset_service import AssetService
        asset_svc = AssetService(self.db)

        for item in all_items:
            d_log_r = await self.db.execute(select(DeptAssetLog).where(DeptAssetLog.delivery_item_id == item.id))
            d_log_obj = d_log_r.scalar_one_or_none()
            if d_log_obj:
                await asset_svc.create_assets_from_grn(item, d_log_obj)

        # Trigger payment (single record for the delivery total)
        existing_payment = await self.db.execute(select(Payment).where(Payment.delivery_id == delivery.id))
        if not existing_payment.scalar_one_or_none():
            total_amount = sum(i.unit_price * i.challan_quantity for i in all_items)
            payment = Payment(
                delivery_id=delivery.id,
                invoice_number=delivery.invoice_number or f"INV-{delivery.id}",
                amount=total_amount,
                status=PaymentStatus.PENDING,
            )
            self.db.add(payment)

        await self.db.flush()

        if self.background_tasks:
            from app.services.email_service import EmailService
            email_svc = EmailService()
            self.background_tasks.add_task(
                email_svc.notify_assets_created,
                asset_tags=[f"NIT-AUTO-{delivery_item_id}"],
                to_email="admin@nitt.edu",
            )
