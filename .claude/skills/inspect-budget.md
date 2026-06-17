---
name: inspect-budget
description: Inspect the budget state for a department or budget file. Shows allocation, committed, utilized, and available amounts. Useful for diagnosing budget lock/unlock issues.
---

Inspect budget allocation and spending state for IRIS.

## Quick Budget Overview
```bash
# All budget files summary
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "
SELECT 
  bm.file_no,
  d.name as department,
  fy.label as financial_year,
  bm.total_allocation,
  bm.committed_amount,
  bm.utilized_amount,
  (bm.total_allocation - bm.committed_amount - bm.utilized_amount) as available
FROM budget_master bm
JOIN departments d ON d.id = bm.department_id
JOIN financial_years fy ON fy.id = bm.financial_year_id
ORDER BY d.name, bm.file_no;"
```

## Budget for a Specific Department
```bash
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "
SELECT bm.file_no, bm.item_name, bm.total_allocation, bm.committed_amount, 
       bm.utilized_amount, (bm.total_allocation - bm.committed_amount - bm.utilized_amount) as available
FROM budget_master bm
JOIN departments d ON d.id = bm.department_id
WHERE d.short_code = '<DEPT_CODE>'  -- e.g. CSE, ECE, MECH
ORDER BY bm.file_no;"
```

## Check PR Budget Links (which PRs are consuming this budget)
```bash
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "
SELECT 
  pr.icr_number,
  pr.current_status,
  pri.item_description,
  pri.estimated_total,
  pri.charges,
  bm.file_no
FROM purchase_request_items pri
JOIN purchase_requests pr ON pr.id = pri.purchase_request_id
JOIN budget_master bm ON bm.id = pri.budget_file_id
WHERE bm.file_no = '<FILE_NO>'
ORDER BY pr.id;"
```

## Diagnose Budget Lock/Unlock Discrepancy

If `committed_amount` looks wrong, trace which PRs locked budget:
```bash
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "
SELECT pr.id, pr.icr_number, pr.current_status, pr.amount,
       pri.estimated_total, pri.charges, pri.budget_file_id
FROM purchase_requests pr
JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
WHERE pri.budget_file_id = <BUDGET_FILE_ID>
  AND pr.current_status NOT IN ('REJECTED', 'CANCELLED')
ORDER BY pr.id;"
```

Expected: `SUM(estimated_total * (1 + charges/100))` of active PRs ≈ `committed_amount`

## Manually Correct Budget (emergency fix)
Only do this if you've verified the discrepancy is from a data integrity issue:
```bash
docker exec nitinventory-db psql -U nitinventory -d nitinventory -c "
UPDATE budget_master 
SET committed_amount = <correct_value>
WHERE file_no = '<FILE_NO>';"
```

## Budget Service Code Reference
- Lock: `backend/app/services/budget_service.py` → `lock_amount()`
- Unlock: `budget_service.py` → `unlock_amount()`  
- Deduct: `budget_service.py` → `deduct_amount()`

The service uses single-statement SQL with `func.greatest(0.0, ...)` to prevent negatives. If you need to change the lock logic, edit those methods — they are called from:
- Lock: `purchase_requests.py` → PR submission endpoint
- Unlock: `purchase_requests.py` → reject endpoint
- Deduct: `purchase_requests.py` → PO issuance endpoint
