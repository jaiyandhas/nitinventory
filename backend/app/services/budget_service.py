from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem
from app.models.budget import BudgetMaster


class BudgetService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def lock_amount(self, pr: PurchaseRequest) -> None:
        """Lock budget when PR is submitted. Bug fix #1 (partial)."""
        result = await self.db.execute(
            select(PurchaseRequestItem).where(
                PurchaseRequestItem.purchase_request_id == pr.id
            )
        )
        items = result.scalars().all()
        for item in items:
            bm_result = await self.db.execute(
                select(BudgetMaster).where(BudgetMaster.id == item.budget_file_id)
            )
            bm = bm_result.scalar_one_or_none()
            if bm:
                bm.locked_amount += item.estimated_total
        await self.db.flush()

    async def unlock_amount(self, pr: PurchaseRequest) -> None:
        """Unlock budget when PR is cancelled."""
        result = await self.db.execute(
            select(PurchaseRequestItem).where(
                PurchaseRequestItem.purchase_request_id == pr.id
            )
        )
        items = result.scalars().all()
        for item in items:
            bm_result = await self.db.execute(
                select(BudgetMaster).where(BudgetMaster.id == item.budget_file_id)
            )
            bm = bm_result.scalar_one_or_none()
            if bm:
                bm.locked_amount = max(0, bm.locked_amount - item.estimated_total)
        await self.db.flush()

    async def deduct_amount(self, pr: PurchaseRequest) -> None:
        """Deduct budget on PO approval. Bug fix #1 (completes the fix)."""
        result = await self.db.execute(
            select(PurchaseRequestItem).where(
                PurchaseRequestItem.purchase_request_id == pr.id
            )
        )
        items = result.scalars().all()
        for item in items:
            bm_result = await self.db.execute(
                select(BudgetMaster).where(BudgetMaster.id == item.budget_file_id)
            )
            bm = bm_result.scalar_one_or_none()
            if bm:
                bm.locked_amount = max(0, bm.locked_amount - item.estimated_total)
                bm.deducted_amount += item.estimated_total
        await self.db.flush()

    async def get_available(self, department_id: int, financial_year_id: int) -> list:
        result = await self.db.execute(
            select(BudgetMaster).where(
                BudgetMaster.department_id == department_id,
                BudgetMaster.financial_year_id == financial_year_id,
            )
        )
        entries = result.scalars().all()
        return [
            {
                "id": bm.id,
                "item_name": bm.item_name,
                "total_cost": bm.total_cost,
                "locked_amount": bm.locked_amount,
                "deducted_amount": bm.deducted_amount,
                "available_amount": bm.available_amount,
            }
            for bm in entries
        ]
