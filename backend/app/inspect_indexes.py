import asyncio
import json
from sqlalchemy import text
from app.core.database import engine

async def main():
    async with engine.connect() as conn:
        # 1. List all tables
        print("=== TABLES ===")
        res = await conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """))
        tables = [row[0] for row in res.fetchall()]
        print(f"Total tables: {len(tables)}")
        print(tables)
        
        # 2. List all indexes
        print("\n=== INDEXES ===")
        res = await conn.execute(text("""
            SELECT
                t.relname as table_name,
                i.relname as index_name,
                a.attname as column_name
            FROM
                pg_class t,
                pg_class i,
                pg_index ix,
                pg_attribute a
            WHERE
                t.oid = ix.indrelid
                and i.oid = ix.indexrelid
                and a.attrelid = t.oid
                and a.attnum = ANY(ix.indkey)
                and t.relkind = 'r'
                and t.relname not like 'pg_%'
                and t.relname not like 'sql_%'
            ORDER BY
                t.relname,
                i.relname;
        """))
        indexes = {}
        for row in res.fetchall():
            t_name, idx_name, col_name = row
            if t_name not in indexes:
                indexes[t_name] = []
            indexes[t_name].append(f"{idx_name}({col_name})")
        print(json.dumps(indexes, indent=2))
        
        # 3. List Foreign Keys that are missing indexes
        print("\n=== FOREIGN KEYS MISSING INDEXES ===")
        res = await conn.execute(text("""
            SELECT 
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name, 
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
            AND NOT EXISTS (
                SELECT 1 
                FROM pg_index ix
                JOIN pg_class t ON t.oid = ix.indrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
                WHERE t.relname = tc.table_name AND a.attname = kcu.column_name
            )
            ORDER BY tc.table_name, kcu.column_name;
        """))
        fkeys_missing = res.fetchall()
        print(f"Total FKs missing indexes: {len(fkeys_missing)}")
        for row in fkeys_missing:
            print(f"Table: {row[0]} | Column: {row[1]} -> references {row[2]}({row[3]})")

if __name__ == "__main__":
    asyncio.run(main())
