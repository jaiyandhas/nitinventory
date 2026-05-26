import asyncio
import os
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Force DATABASE_URL to point to test database before importing any app models or settings
os.environ["DATABASE_URL"] = "postgresql+asyncpg://nitinventory:nitinventory_secret@nitinventory-db:5432/nitinventory_test"

# Import database module to monkeypatch
import app.core.database
from app.core.database import Base

@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop for tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database():
    """Create tables and run seed script once for the test session."""
    # Create test engine and sessionmaker inside the active event loop
    test_engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
    
    # Monkeypatch the database module
    app.core.database.engine = test_engine
    app.core.database.AsyncSessionLocal = TestSessionLocal
    
    # Ensure tables are created
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS legacy_asset_tag VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS fund_source VARCHAR(100);"))
    
    # Run the seed function from seed.py
    from seed import seed
    await seed()
    
    yield
    
    # Clean up at the end of session
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()

@pytest_asyncio.fixture
async def db_session():
    """Provide a transactional database session that rolls back after each test."""
    await app.core.database.engine.dispose()
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        async with session.begin():
            yield session
            await session.rollback()
    # Dispose pool after test so connections are closed before loop terminates
    await app.core.database.engine.dispose()
