import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    # Inside container we connect to "db" host
    engine = create_async_engine('postgresql+asyncpg://nitinventory:nitinventory_secret@db:5432/nitinventory')
    async with engine.connect() as conn:
        print('--- Administrative Approval Requests ---')
        res = await conn.execute(text("""
            SELECT id, aa_number, status, pending_with, total_cost, budget_file_id
            FROM administrative_approvals
            ORDER BY id DESC LIMIT 10
        """))
        aas = res.fetchall()
        for row in aas:
            print(f"ID: {row[0]} | AA No: {row[1]} | Status: {row[2]} | Pending With: {row[3]} | Cost: {row[4]} | Budget File: {row[5]}")
            
            # Get nominees for this AA
            nom_res = await conn.execute(text(f"""
                SELECT id, nominee_id, step_order, status, remarks
                FROM administrative_approval_nominees
                WHERE approval_id = {row[0]}
                ORDER BY step_order
            """))
            noms = nom_res.fetchall()
            if noms:
                print("  Nominees:")
                for n in noms:
                    print(f"    ID: {n[0]} | Nominee User ID: {n[1]} | Step: {n[2]} | Status: {n[3]} | Remarks: {n[4]}")
            else:
                print("  No nominees.")

async def run():
    try:
        await main()
    except Exception as e:
        print("Error:", e)

asyncio.run(run())
