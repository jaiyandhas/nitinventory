---
name: debug-pr-workflow
description: Debug a stuck or misbehaving Purchase Request workflow. Inspects flow state, history, and workflow hierarchy to diagnose why a PR is not advancing.
---

Debug the workflow state for a specific Purchase Request. Use when a PR is stuck, not routing correctly, or an approver can't see/act on it.

## Information to Gather First

Ask the user for:
- PR ID or ICR number
- The symptom (stuck at step X, wrong approver, skipped phase, etc.)

## Diagnostic Steps

### 1. Check PR Current State
Read `backend/app/routers/purchase_requests.py` and look at the `GET /{id}` endpoint to understand response shape, then run:
```bash
docker exec nitinventory-backend python3 -c "
import asyncio
from app.core.database import get_async_session
from app.models.purchase_request import PurchaseRequest, PurchaseRequestFlow, PurchaseRequestHistory
from sqlalchemy import select

async def check(pr_id):
    async for db in get_async_session():
        pr = await db.get(PurchaseRequest, pr_id)
        print('PR status:', pr.current_status)
        print('Amount:', pr.amount)
        print('Category:', pr.category_id)
        print('Procurement:', pr.procurement_id)
        print('SOF items:', pr.committee_nominee_ids)
        
        flow = (await db.execute(select(PurchaseRequestFlow).where(PurchaseRequestFlow.purchase_request_id == pr_id))).scalar_one_or_none()
        if flow:
            print('Phase ID:', flow.phase_id, 'Step:', flow.step_order, 'Rejected:', flow.rejected)
        
        hist = (await db.execute(select(PurchaseRequestHistory).where(PurchaseRequestHistory.purchase_request_id == pr_id).order_by(PurchaseRequestHistory.id))).scalars().all()
        for h in hist:
            print(f'  [{h.id}] {h.status} by user={h.current_approver_id} at {h.acted_at} remarks={h.remarks}')

asyncio.run(check(<PR_ID>))
"
```

### 2. Check Workflow Hierarchy for This PR's Category/Method
```bash
docker exec nitinventory-backend python3 backend/app/inspect_aa_wf.py
```
Or query directly:
```sql
SELECT wh.id, pm.phase_name, wh.step_order, wh.user_type, wh.user_group, 
       wh.role_id, wh.skip_condition, wh.source_of_fund_id, wh.purchase_type
FROM workflow_hierarchies wh
JOIN phase_managers pm ON pm.id = wh.phase_id
WHERE wh.category_id = <cat_id> AND wh.procurement_id = <proc_id>
ORDER BY pm.phase_order, wh.step_order;
```

### 3. Evaluate Skip Conditions Against PR
Check `backend/app/services/evaluator.py` — the `safe_eval()` function. For each step's `skip_condition`, manually evaluate it with the PR's values to see if it would be skipped.

### 4. Check Tech Committee Configuration
If stuck at Technical Evaluation phase:
```bash
docker exec nitinventory-backend python3 -c "
import asyncio
from app.core.database import get_async_session
from app.services.tech_committee import get_tech_committee_member_ids

async def check(pr_id):
    async for db in get_async_session():
        ids = await get_tech_committee_member_ids(db, pr_id)
        print('Committee IDs:', ids)

asyncio.run(check(<PR_ID>))
"
```

### 5. Common Root Causes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| PR not advancing | Wrong `user_group` in step | Update WorkFlowHierarchy row |
| Phase skipped unexpectedly | Skip condition evaluating True | Check `skip_condition` expression |
| TE stuck waiting | Not all committee members acted | Check history for missing committee member rows |
| SOF routing wrong | PR's budget item has SOF ID but no SOF-specific workflow row | Add fund-specific workflow row or null out SOF |
| "No current approver" | Flow phase/step points to non-existent WFH row | Realign flow with `flow_engine.realign_pr_flow()` |
| Budget not locking | Item has no `budget_file_id` | Check PurchaseRequestItem records |

### 6. Resolution Actions

- **Stuck at wrong step**: Call `realign_pr_flow()` from the flow engine
- **Missing workflow step**: Add row to `workflow_hierarchies` via `POST /api/admin/workflows`
- **Committee incomplete**: Update department or budget file committee nominee IDs
- **Skip condition bug**: Fix the expression string in the workflow hierarchy row
