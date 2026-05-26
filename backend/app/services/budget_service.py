"""Budget service: locks, unlocks, and deducts department budget allocations atomically."""
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from app.models.budget import BudgetMaster
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem


class BudgetService:
    def __init__(self, db: AsyncSession):
        """Initialize BudgetService with database session."""
        self.db = db

    async def lock_amount(self, pr: PurchaseRequest) -> None:
        """Lock budget allocation for purchase request items. Avoids N+1 queries and applies atomic increments."""
        result = await self.db.execute(
            select(PurchaseRequestItem).where(
                PurchaseRequestItem.purchase_request_id == pr.id
            )
        )
        items = result.scalars().all()
        if not items:
            return

        # Aggregate estimated totals by budget master file ID to minimize database updates
        deltas = defaultdict(float)
        for item in items:
            if item.budget_file_id is not None:
                deltas[item.budget_file_id] += item.estimated_total

        # Apply atomic updates to master balances to prevent concurrent lost updates
        for budget_file_id, delta in deltas.items():
            await self.db.execute(
                update(BudgetMaster)
                .where(BudgetMaster.id == budget_file_id)
                .values(locked_amount=BudgetMaster.locked_amount + delta)
                .execution_options(synchronize_session=False)
            )
        await self.db.flush()

    async def unlock_amount(self, pr: PurchaseRequest) -> None:
        """Unlock budget allocation if purchase request is rejected or cancelled. Deletion-safe, atomic decrement."""
        result = await self.db.execute(
            select(PurchaseRequestItem).where(
                PurchaseRequestItem.purchase_request_id == pr.id
            )
        )
        items = result.scalars().all()
        if not items:
            return

        deltas = defaultdict(float)
        for item in items:
            if item.budget_file_id is not None:
                deltas[item.budget_file_id] += item.estimated_total

        # Apply atomic decrement bounded to never fall below 0
        for budget_file_id, delta in deltas.items():
            await self.db.execute(
                update(BudgetMaster)
                .where(BudgetMaster.id == budget_file_id)
                .values(locked_amount=func.greatest(0.0, BudgetMaster.locked_amount - delta))
                .execution_options(synchronize_session=False)
            )
        await self.db.flush()

    async def deduct_amount(self, pr: PurchaseRequest) -> None:
        """Deduct budget on purchase order issuance. Atomic transfer from locked to deducted balance."""
        result = await self.db.execute(
            select(PurchaseRequestItem).where(
                PurchaseRequestItem.purchase_request_id == pr.id
            )
        )
        items = result.scalars().all()
        if not items:
            return

        deltas = defaultdict(float)
        for item in items:
            if item.budget_file_id is not None:
                deltas[item.budget_file_id] += item.estimated_total

        # Atomically transfer locked allocation into final deducted expenditure balance
        for budget_file_id, delta in deltas.items():
            await self.db.execute(
                update(BudgetMaster)
                .where(BudgetMaster.id == budget_file_id)
                .values(
                    locked_amount=func.greatest(0.0, BudgetMaster.locked_amount - delta),
                    deducted_amount=BudgetMaster.deducted_amount + delta
                )
                .execution_options(synchronize_session=False)
            )
        await self.db.flush()

    async def get_available(self, department_id: int, financial_year_id: int) -> list:
        """Retrieve all active budget entries for a department and financial year."""
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
