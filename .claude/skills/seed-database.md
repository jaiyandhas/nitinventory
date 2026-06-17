---
name: seed-database
description: Reset or re-seed the IRIS PostgreSQL database. Covers demo data reset, partial re-seed of masters/workflows, and applying schema changes via seed.py.
---

Reset or re-seed the IRIS database. Use when demo data needs refreshing, after schema changes, or to test a clean state.

## Modes

### A. Full Reset (wipes everything)
```bash
RESET_DEMO_DATA=true docker compose down -v && RESET_DEMO_DATA=true docker compose up
```
- Drops and recreates all tables
- Re-seeds all roles, departments, procurement methods, workflow hierarchy
- Creates 14 demo users, 2024-25 financial year, 8 demo PRs
- **Destructive** — all existing data lost

### B. Partial Re-seed (preserves PR/budget data)
```bash
docker compose restart nitinventory-backend
```
- Runs `seed.py` on start (without RESET_DEMO_DATA)
- Re-seeds: workflow hierarchy, roles, procurement masters, source_of_funds
- Skips truncating: purchase_requests, budget_master (if any rows exist)
- Use this after adding new workflow steps or modifying masters

### C. Apply Schema Change Only (new column/table)
1. Add the new column/model in the relevant `app/models/*.py` file
2. Add ALTER TABLE or CREATE TABLE in `seed.py` under the inline migration block
3. Restart backend: `docker compose restart nitinventory-backend`
4. Verify: `docker exec nitinventory-backend python3 backend/app/db_check.py`

### D. Run Seed Manually (inside container)
```bash
docker exec -it nitinventory-backend python3 seed.py
```

## Checking DB State After Seed
```bash
# Table overview
docker exec nitinventory-backend python3 backend/app/db_check.py

# PR/budget counts
docker exec nitinventory-backend python3 backend/app/inspect_aa_wf.py

# Workflow hierarchy for a specific category
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "
SELECT pm.phase_name, wh.step_order, wh.user_group, wh.role_id, wh.skip_condition
FROM workflow_hierarchies wh
JOIN phase_managers pm ON pm.id = wh.phase_id
WHERE wh.category_id = 1 AND wh.procurement_id = 2
ORDER BY pm.phase_order, wh.step_order;"
```

## Adding New Demo Data to seed.py

`backend/seed.py` is the authoritative seeding script. Structure:

```python
# 1. Create tables (always)
await conn.run_sync(Base.metadata.create_all)

# 2. Run inline migrations
await db.execute(text("ALTER TABLE ... ADD COLUMN IF NOT EXISTS ..."))

# 3. Seed masters (idempotent - uses INSERT ... ON CONFLICT DO NOTHING)
await seed_roles(db)
await seed_departments(db)
await seed_procurement_methods(db)
await seed_workflow_hierarchy(db)

# 4. Seed demo data (only if RESET_DEMO_DATA=true)
if os.getenv("RESET_DEMO_DATA"):
    await seed_demo_users(db)
    await seed_demo_budget(db)
    await seed_demo_prs(db)
```

To add a new seed value (e.g., a new source_of_fund):
1. Add the INSERT in the appropriate `seed_*` function in `seed.py`
2. Make it idempotent: `INSERT INTO ... ON CONFLICT (name) DO NOTHING`
3. Restart backend

## Common Issues

| Issue | Fix |
|-------|-----|
| "relation does not exist" | Schema change not applied — restart backend |
| Demo PRs missing | Start with `RESET_DEMO_DATA=true` |
| Workflow steps missing | Check `seed_workflow_hierarchy()` function in seed.py |
| User password not working | Re-seed users (passwords are bcrypt hashed at seed time) |
| Asset sequences missing | Add `CREATE SEQUENCE IF NOT EXISTS asset_seq_<dept>` in seed.py |
