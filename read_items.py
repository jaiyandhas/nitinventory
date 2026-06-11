import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://iris:irispass@localhost:5432/iris_db')
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT id, amount, current_status, form_data FROM public.purchase_requests ORDER BY id DESC LIMIT 5"))
        print('--- Purchase Requests ---')
        for row in res.fetchall():
            print(f"ID: {row[0]} | Amount: {row[1]} | Status: {row[2]} | Form Data keys: {list(row[3].keys()) if row[3] else None}")
            
        res = await conn.execute(text("""
            SELECT id, purchase_request_id, item_description, quantity, estimated_total, charges 
            FROM public.purchase_request_items 
            ORDER BY id DESC LIMIT 10
        """))
        print('\n--- Purchase Request Items ---')
        for row in res.fetchall():
            print(f"ID: {row[0]} | PR_ID: {row[1]} | Desc: {row[2]} | Qty: {row[3]} | Est Total: {row[4]} | Charges (GST%): {row[5]}")

asyncio.run(main())
