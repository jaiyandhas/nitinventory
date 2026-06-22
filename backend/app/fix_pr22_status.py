"""
One-shot fix for PR #22:
- current_status is incorrectly set to 'po_issued' despite no Purchase Order existing
- Reset it back to 'in_progress' so the DA action panel becomes visible
- Also verify the flow is at Phase 5 Step 1
"""
import asyncio
from app.core.database import AsyncSessionLocal
from sqlalchemy import text


async def main():
    async with AsyncSessionLocal() as db:
        # Confirm no PO exists
        r = await db.execute(text("SELECT COUNT(*) FROM purchase_orders WHERE purchase_request_id=22"))
        po_count = r.scalar()
        print(f"PO count: {po_count}")

        # Get current status
        r = await db.execute(text("SELECT current_status FROM purchase_requests WHERE id=22"))
        status = r.scalar()
        print(f"Current status: {status}")

        if po_count == 0 and status == 'po_issued':
            # Reset to in_progress
            await db.execute(text(
                "UPDATE purchase_requests SET current_status='in_progress' WHERE id=22"
            ))
            await db.commit()
            print("✅ Fixed: reset current_status to 'in_progress'")
        else:
            print("No fix needed or PO exists — skipping")

        # Confirm flow state
        r = await db.execute(text(
            "SELECT phase_id, step_order FROM purchase_request_flows WHERE purchase_request_id=22"
        ))
        flow = r.fetchone()
        print(f"\nFlow: Phase ID={flow[0]} | Step={flow[1]}")


if __name__ == "__main__":
    asyncio.run(main())
