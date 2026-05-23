"""GRN Service: auto-creates delivery on PO_ISSUED, reconciles quantities, triggers asset creation."""
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import BackgroundTasks

from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem
from app.models.inventory import Delivery, DeliveryItem, DeptAssetLog, StoresAssetLog, Discrepancy, Payment, DeliveryStatus, DiscrepancyStatus, PaymentStatus
from app.models.user import User


class GrnService:
    def __init__(self, db: AsyncSession, background_tasks: Optional[BackgroundTasks] = None):
        self.db = db
        self.background_tasks = background_tasks

    async def create_delivery(self, pr: PurchaseRequest) -> Delivery:
        """Auto-called when PO_ISSUED. Creates Delivery + DeliveryItems from PR items."""
        await self.db.refresh(pr, ["initiator"])
        
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(PurchaseRequestItem)
            .where(PurchaseRequestItem.purchase_request_id == pr.id)
            .options(selectinload(PurchaseRequestItem.budget_file))
        )
        pr_items = result.scalars().all()

        delivery = Delivery(
            po_id=pr.id,
            department_id=pr.initiator.department_id,
            status=DeliveryStatus.PENDING,
        )
        self.db.add(delivery)
        await self.db.flush()

        for item in pr_items:
            di = DeliveryItem(
                delivery_id=delivery.id,
                name=item.item_description,
                category="other",
                challan_quantity=item.budget_file.quantity if item.budget_file else 1,
                unit_price=item.estimated_total / max(item.budget_file.quantity, 1) if item.budget_file else item.estimated_total,
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

        # Update delivery status
        di_result = await self.db.execute(select(DeliveryItem).where(DeliveryItem.id == delivery_item_id))
        di = di_result.scalar_one()
        delivery_result = await self.db.execute(select(Delivery).where(Delivery.id == di.delivery_id))
        delivery = delivery_result.scalar_one()
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
        else:
            log = StoresAssetLog(
                delivery_item_id=delivery_item_id,
                logged_by_id=user.id,
                quantity=data["quantity"],
                condition=data["condition"],
                building=data.get("building"),
                room=data.get("room"),
                custodian_name=data.get("custodian_name"),
                serial_numbers=data.get("serial_numbers", []),
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
        """Compare quantities. Create discrepancy or auto-create assets."""
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
            return  # Both logs not yet submitted

        challan_qty = di.challan_quantity
        dept_qty = dept_log.quantity
        stores_qty = stores_log.quantity

        delivery_result = await self.db.execute(
            select(Delivery).where(Delivery.id == di.delivery_id)
        )
        delivery = delivery_result.scalar_one()

        if dept_qty == stores_qty == challan_qty:
            # All match → create assets
            delivery.status = DeliveryStatus.VERIFIED
            from app.services.asset_service import AssetService
            asset_svc = AssetService(self.db)
            await asset_svc.create_assets_from_grn(di, dept_log)

            # Trigger payment
            payment = Payment(
                delivery_id=delivery.id,
                invoice_number=delivery.invoice_number or f"INV-{delivery.id}",
                amount=di.unit_price * di.challan_quantity,
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
        else:
            # Mismatch → discrepancy
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
