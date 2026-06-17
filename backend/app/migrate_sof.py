"""
Migration: Add SourceOfFund master table and FK columns to workflow tables.

Run with: docker exec nitinventory-backend python -m app.migrate_sof
"""
import asyncio
import logging
from sqlalchemy import text
from app.core.database import engine

logger = logging.getLogger(__name__)

DEFAULT_FUNDS = [
    "CAPEX (OH-35)",
    "REVEX (OH-31)",
    "HOSTEL",
    "NIMCET",
    "ID",
    "PMRF",
    "SEED-GRANT",
    "HEFA",
    "STUDENT-WELFARE",
    "R&C",
]


async def run_migration():
    async with engine.begin() as conn:
        # 1. Create source_of_funds table if it doesn't exist (PostgreSQL syntax)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS source_of_funds (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                description VARCHAR(255),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        logger.info("✓ source_of_funds table ensured")

        # 2. Migrate existing values from Settings table
        existing_names_result = await conn.execute(
            text("SELECT name FROM source_of_funds")
        )
        existing_names = {row[0] for row in existing_names_result}

        # Fetch from Settings if available
        settings_result = await conn.execute(
            text("SELECT value FROM settings WHERE key_name = 'budget_source_of_fund_categories'")
        )
        row = settings_result.fetchone()
        if row and row[0]:
            fund_names = [n.strip() for n in row[0].split(",") if n.strip()]
        else:
            fund_names = DEFAULT_FUNDS

        for name in fund_names:
            if name not in existing_names:
                await conn.execute(
                    text("INSERT INTO source_of_funds (name, is_active, created_at) VALUES (:name, TRUE, NOW())"),
                    {"name": name}
                )
                logger.info(f"  + Inserted fund: {name}")

        logger.info("✓ Source of Funds migrated from Settings table")

        # 3. Add source_of_fund_id column to workflow_hierarchies if not present
        wfh_cols_result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'workflow_hierarchies' AND column_name = 'source_of_fund_id'
        """))
        if wfh_cols_result.fetchone() is None:
            await conn.execute(text(
                "ALTER TABLE workflow_hierarchies ADD COLUMN source_of_fund_id INTEGER REFERENCES source_of_funds(id) ON DELETE SET NULL"
            ))
            logger.info("✓ source_of_fund_id column added to workflow_hierarchies")
        else:
            logger.info("  (source_of_fund_id already exists in workflow_hierarchies)")

        # 4. Add source_of_fund_id column to administrative_approval_workflows if not present
        aaw_cols_result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'administrative_approval_workflows' AND column_name = 'source_of_fund_id'
        """))
        if aaw_cols_result.fetchone() is None:
            await conn.execute(text(
                "ALTER TABLE administrative_approval_workflows ADD COLUMN source_of_fund_id INTEGER REFERENCES source_of_funds(id) ON DELETE SET NULL"
            ))
            logger.info("✓ source_of_fund_id column added to administrative_approval_workflows")
        else:
            logger.info("  (source_of_fund_id already exists in administrative_approval_workflows)")

    logger.info("Migration complete.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_migration())
