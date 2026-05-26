import asyncio
import pytest
from sqlalchemy import select
from app.services.budget_service import BudgetService
from app.models.budget import BudgetMaster
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem

@pytest.mark.asyncio
async def test_budget_lock_unlock_deduct(db_session):
    """Test locking, unlocking, and deducting budget balances sequentially."""
    service = BudgetService(db_session)
    
    # Query an existing BudgetMaster record
    bm_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget_master = bm_res.scalar_one()
    
    initial_locked = budget_master.locked_amount
    initial_deducted = budget_master.deducted_amount
    
    # Create a dummy Purchase Request and Items conforming to non-nullable fields
    pr = PurchaseRequest(
        amount=150000.0,
        purchase_type="department",
        initiator_id=1,
        category_id=1,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr)
    await db_session.flush()
    
    item1 = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Test Item 1",
        quantity=1,
        estimated_total=100000.0,
        budget_file_id=budget_master.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    item2 = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Test Item 2",
        quantity=1,
        estimated_total=50000.0,
        budget_file_id=budget_master.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    db_session.add_all([item1, item2])
    await db_session.flush()
    
    # Test lock_amount
    await service.lock_amount(pr)
    await db_session.refresh(budget_master)
    assert budget_master.locked_amount == initial_locked + 150000.0
    
    # Test unlock_amount (decrements locked back to initial)
    await service.unlock_amount(pr)
    await db_session.refresh(budget_master)
    assert budget_master.locked_amount == initial_locked
    
    # Re-lock for deduct test
    await service.lock_amount(pr)
    await db_session.refresh(budget_master)
    
    # Test deduct_amount (locked decremented, deducted incremented)
    await service.deduct_amount(pr)
    await db_session.refresh(budget_master)
    assert budget_master.locked_amount == initial_locked
    assert budget_master.deducted_amount == initial_deducted + 150000.0

@pytest.mark.asyncio
async def test_budget_negative_protection(db_session):
    """Test that unlocking more budget than locked does not result in negative locked balances."""
    service = BudgetService(db_session)
    
    # Query an existing BudgetMaster record
    bm_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget_master = bm_res.scalar_one()
    
    # Zero out locked_amount to test protection
    budget_master.locked_amount = 0.0
    await db_session.flush()
    
    pr = PurchaseRequest(
        amount=50000.0,
        purchase_type="department",
        initiator_id=1,
        category_id=1,
        financial_year_id=1,
        procurement_id=1,
        current_status="draft",
    )
    db_session.add(pr)
    await db_session.flush()
    
    item = PurchaseRequestItem(
        purchase_request_id=pr.id,
        item_description="Test Item",
        quantity=1,
        estimated_total=50000.0,
        budget_file_id=budget_master.id,
        requirement_type="temp",
        availability="no",
        site_readiness=True,
    )
    db_session.add(item)
    await db_session.flush()
    
    # Try unlocking 50000.0 when locked_amount is 0.0
    await service.unlock_amount(pr)
    await db_session.refresh(budget_master)
    assert budget_master.locked_amount == 0.0  # Protected, did not drop below zero

@pytest.mark.asyncio
async def test_budget_concurrency_lock(db_session):
    """Test concurrent budget locking to verify atomic balance safety under race conditions."""
    bm_res = await db_session.execute(select(BudgetMaster).limit(1))
    budget_master = bm_res.scalar_one()
    bm_id = budget_master.id
    initial_locked = budget_master.locked_amount
    
    # Create multiple concurrent PRs, each locking 10,000
    prs_data = []
    for _ in range(5):
        pr = PurchaseRequest(
            amount=10000.0,
            purchase_type="department",
            initiator_id=1,
            category_id=1,
            financial_year_id=1,
            procurement_id=1,
            current_status="draft",
        )
        db_session.add(pr)
        await db_session.flush()
        
        item = PurchaseRequestItem(
            purchase_request_id=pr.id,
            item_description="Concurrent Item",
            quantity=1,
            estimated_total=10000.0,
            budget_file_id=bm_id,
            requirement_type="temp",
            availability="no",
            site_readiness=True,
        )
        db_session.add(item)
        await db_session.flush()
        prs_data.append((pr.id, bm_id))
        
    await db_session.commit()
    
    async def worker(pr_id):
        import app.core.database
        async with app.core.database.AsyncSessionLocal() as session:
            service = BudgetService(session)
            # Re-fetch PR in the worker's session
            pr_res = await session.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))
            pr_obj = pr_res.scalar_one()
            await service.lock_amount(pr_obj)
            await session.commit()
            
    tasks = [worker(pr_id) for pr_id, _ in prs_data]
    await asyncio.gather(*tasks)
    
    # Assert result in a new session block
    import app.core.database
    async with app.core.database.AsyncSessionLocal() as assert_session:
        bm_res = await assert_session.execute(select(BudgetMaster).where(BudgetMaster.id == bm_id))
        budget_master = bm_res.scalar_one()
        assert budget_master.locked_amount == initial_locked + 50000.0
