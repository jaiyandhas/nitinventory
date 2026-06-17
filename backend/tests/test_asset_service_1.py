import asyncio
import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from app.services.asset_service import AssetService
from app.models.user import User, Department
from app.models.asset import Asset
from app.core.database import AsyncSessionLocal

@pytest.mark.asyncio
async def test_get_tag_sequences_isolation_and_nextval(db_session):
    """Test that tag sequences are isolated per department and return correct sequence values."""
    # Reset sequences for clean test run
    await db_session.execute(text("DROP SEQUENCE IF EXISTS asset_seq_cse;"))
    await db_session.execute(text("DROP SEQUENCE IF EXISTS asset_seq_ece;"))
    await db_session.flush()

    service = AssetService(db_session)
    
    # Generate sequences for CSE
    cse_seqs = await service._get_tag_sequences("CSE", 3)
    assert cse_seqs == [1, 2, 3]
    
    # Generate sequences for ECE
    ece_seqs = await service._get_tag_sequences("ECE", 2)
    assert ece_seqs == [1, 2]
    
    # Fetch next sequence for CSE
    cse_next = await service._get_tag_sequences("CSE", 1)
    assert cse_next == [4]

@pytest.mark.asyncio
async def test_get_tag_sequences_concurrency(db_session):
    """Test concurrent tag sequence requests to verify race-free generation without duplicate sequence IDs using separate sessions."""
    # Reset sequences for clean test run
    async with AsyncSessionLocal() as init_session:
        await init_session.execute(text("DROP SEQUENCE IF EXISTS asset_seq_cse;"))
        await init_session.commit()

    async def worker():
        async with AsyncSessionLocal() as session:
            service = AssetService(session)
            res = await service._get_tag_sequences("CSE", 2)
            await session.commit()
            return res
            
    tasks = [worker() for _ in range(5)]
    results = await asyncio.gather(*tasks)
    
    # Flatten the list of lists
    flattened = [val for sublist in results for val in sublist]
    
    # Ensure 10 unique sequences are generated
    assert len(flattened) == 10
    assert len(set(flattened)) == 10

@pytest.mark.asyncio
async def test_deleted_assets_do_not_affect_sequence(db_session):
    """Test that deleting an asset does not result in sequence regression or duplicate tag reuse."""
    # Reset sequence for clean test run
    await db_session.execute(text("DROP SEQUENCE IF EXISTS asset_seq_cse;"))
    await db_session.flush()

    service = AssetService(db_session)
    
    # Load HOD user with role loaded to prevent async lazy loading issues
    user_q = await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "hod.cse@nitt.edu")
    )
    hod_user = user_q.scalar_one()
    
    # Register an asset
    asset1 = await service.register_asset({
        "name": "Test Laptop A",
        "legacy_asset_tag": "LEGACY-001",
        "category": "computer",
        "department_id": hod_user.department_id,
        "year": "2026",
    }, hod_user)
    
    tag1 = asset1.asset_tag
    assert tag1.endswith("-001")
    
    # Delete the asset
    await service.delete_asset(asset1.id, hod_user)
    await db_session.flush()
    
    # Register a new asset to ensure sequence continued to 002 rather than reusing 001
    asset2 = await service.register_asset({
        "name": "Test Laptop B",
        "legacy_asset_tag": "LEGACY-002",
        "category": "computer",
        "department_id": hod_user.department_id,
        "year": "2026",
    }, hod_user)
    
    tag2 = asset2.asset_tag
    assert tag2.endswith("-002")
