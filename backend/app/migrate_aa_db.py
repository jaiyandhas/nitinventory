import asyncio
from sqlalchemy import text
from app.core.database import engine

async def migrate():
    async with engine.begin() as conn:
        print("Running AA table migrations...")
        queries = [
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS item_category VARCHAR(50);",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS stock_availability VARCHAR(10);",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS present_stock VARCHAR(255);",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS prev_file_no VARCHAR(255);",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS justification_procurement TEXT;",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS basis_of_estimation_path VARCHAR(512);",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS gem_non_availability_path VARCHAR(512);",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS authority_approval_path VARCHAR(512);",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS pac_dept_cert_path VARCHAR(512);",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS pac_vendor_cert_path VARCHAR(512);",
            "ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS generic_specification_declaration BOOLEAN DEFAULT FALSE;"
        ]
        for query in queries:
            try:
                await conn.execute(text(query))
                print(f"Executed: {query}")
            except Exception as e:
                print(f"Error executing {query}: {e}")
        print("AA table migration finished.")

if __name__ == "__main__":
    asyncio.run(migrate())
