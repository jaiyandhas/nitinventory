---
name: add-workflow-step
description: Add a new approval step to the IRIS procurement workflow for a specific category, procurement method, and phase. Covers skip conditions, SOF routing, and role assignment.
---

Add a new step to the WorkFlowHierarchy table for a specific procurement workflow variant.

## Required Information (ask user if missing)

- **Category**: Cat1 (≤10L), Cat2 (10L-30L), Cat3 (>30L) → maps to `category_id`
- **Procurement method**: Direct, GeM, LPC, CPPP → maps to `procurement_id`
- **Phase**: AA, TE (Tendering), Technical Eval, Financial Sanction, PO → maps to `phase_id`
- **Step order**: Integer; where in the phase sequence this step falls
- **Who acts**: Role name, user group, or specific user ID
- **Skip condition**: Optional AST expression (e.g., `pr.amount < 100000`)
- **Source of fund**: Optional — leave null for default, or specify fund ID for fund-specific routing
- **Purchase type**: `department` or `office` (or null for both)

## Steps

### 1. Look Up IDs
```bash
# Get category IDs
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "SELECT id, title, min_amount, max_amount FROM purchase_categories ORDER BY id;"

# Get procurement method IDs
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "SELECT id, name FROM procurement_managers ORDER BY id;"

# Get phase IDs (in order)
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "SELECT id, phase_name, phase_order FROM phase_managers ORDER BY phase_order;"

# Get role IDs
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "SELECT id, name, value FROM role_managers ORDER BY id;"

# Get source of fund IDs
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "SELECT id, name FROM source_of_funds WHERE is_active=true ORDER BY id;"
```

### 2. View Existing Steps for This Workflow
```bash
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "
SELECT wh.id, pm.phase_name, wh.step_order, wh.user_type, wh.user_group, wh.role_id, wh.skip_condition, wh.source_of_fund_id
FROM workflow_hierarchies wh
JOIN phase_managers pm ON pm.id = wh.phase_id
WHERE wh.category_id = <cat_id> AND wh.procurement_id = <proc_id>
ORDER BY pm.phase_order, wh.step_order;
"
```

### 3. Insert the New Step via Admin API
Use the admin workflow endpoint (requires admin JWT):
```bash
curl -X POST http://localhost:8000/api/admin/workflows \
  -H "Content-Type: application/json" \
  -b "auth_token=<admin_token>" \
  -d '{
    "category_id": <cat_id>,
    "procurement_id": <proc_id>,
    "phase_id": <phase_id>,
    "step_order": <order>,
    "user_type": "role",
    "user_group": null,
    "role_id": <role_id>,
    "is_enabled": true,
    "skip_condition": "<expr_or_null>",
    "tender_vendors_threshold": null,
    "source_of_fund_id": null,
    "purchase_type": null
  }'
```

Or insert directly via seed/migration:
```python
# In seed.py or a migration script
db.add(WorkFlowHierarchy(
    category_id=<cat_id>,
    procurement_id=<proc_id>,
    phase_id=<phase_id>,
    step_order=<order>,
    user_type="role",
    role_id=<role_id>,
    is_enabled=True,
    skip_condition=None,
))
```

### 4. Validate the New Step

Check that the step appears in the right position:
```bash
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "
SELECT wh.id, pm.phase_name, wh.step_order, wh.role_id, wh.skip_condition
FROM workflow_hierarchies wh
JOIN phase_managers pm ON pm.id = wh.phase_id
WHERE wh.category_id = <cat_id> AND wh.procurement_id = <proc_id>
ORDER BY pm.phase_order, wh.step_order;
"
```

Test a PR with the matching category/procurement to confirm routing.

### 5. Notes on Skip Conditions

Valid expressions (parsed by `backend/app/services/evaluator.py`):
- Arithmetic: `pr.amount * 1.18 < 500000`
- Comparisons: `pr.amount <= 100000`
- Logical: `pr.amount < 100000 and pr.procurement_id != 2`
- Attribute: `pr.form_data.get('is_renewal') == True`
- **NOT allowed**: function calls, imports, list comprehensions, walrus operator

### 6. Notes on SOF Routing

- `source_of_fund_id = NULL` → applies to all PRs of this category/method (default)
- `source_of_fund_id = <id>` → only applies when PR's budget items use this fund
- The flow engine prefers fund-specific rows over default rows; add both if you need different approvers per fund
