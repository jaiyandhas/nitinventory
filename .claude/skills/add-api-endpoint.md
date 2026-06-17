---
name: add-api-endpoint
description: Add a new FastAPI endpoint to the IRIS backend. Covers router placement, Pydantic schema, SQLAlchemy query patterns, auth dependency, and frontend API wiring.
---

Add a new REST API endpoint to the IRIS FastAPI backend.

## Step 1: Identify the Right Router

| Domain | Router File |
|--------|------------|
| Purchase request actions | `backend/app/routers/purchase_requests.py` |
| Budget/financial year ops | `backend/app/routers/budget.py` |
| Asset CRUD | `backend/app/routers/assets.py` |
| Delivery/GRN workflow | `backend/app/routers/inventory.py` |
| Admin (users, workflows) | `backend/app/routers/admin.py` |
| Administrative Approvals | `backend/app/routers/administrative_approval.py` |
| Auth / user profile | `backend/app/routers/auth.py` |

## Step 2: Define Pydantic Schema (if needed)

Add request/response schemas in `backend/app/schemas/`:

```python
# backend/app/schemas/purchase_request.py (example)
from pydantic import BaseModel
from typing import Optional

class MyActionRequest(BaseModel):
    field_one: str
    field_two: Optional[int] = None

class MyActionResponse(BaseModel):
    id: int
    status: str

    class Config:
        from_attributes = True
```

## Step 3: Write the Endpoint

Pattern for a new action endpoint on a PR:

```python
# In backend/app/routers/purchase_requests.py

@router.post("/{pr_id}/my-action", response_model=schemas.MyActionResponse)
async def my_action(
    pr_id: int,
    body: schemas.MyActionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 1. Fetch the PR
    pr = await db.get(PurchaseRequest, pr_id)
    if not pr:
        raise HTTPException(status_code=404, detail="PR not found")

    # 2. Authorization check
    if current_user.role.value not in ["admin", "hod"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # 3. Business logic
    pr.some_field = body.field_one
    await db.flush()

    # 4. Create history entry (for PR actions)
    db.add(PurchaseRequestHistory(
        purchase_request_id=pr.id,
        current_approver_id=current_user.id,
        status="My Action Taken",
        remarks=body.field_one,
        acted_at=datetime.utcnow(),
        frozen_actor_name=current_user.name,
        frozen_designation=current_user.designation,
        frozen_department=current_user.department.name if current_user.department else None,
    ))

    await db.commit()
    await db.refresh(pr)
    return pr
```

## Step 4: Async SQLAlchemy Query Patterns

```python
# Fetch by ID
obj = await db.get(MyModel, obj_id)

# Fetch with filter
result = await db.execute(
    select(MyModel).where(MyModel.field == value).order_by(MyModel.created_at.desc())
)
items = result.scalars().all()

# Fetch with JOIN
result = await db.execute(
    select(PurchaseRequest)
    .options(selectinload(PurchaseRequest.items))
    .where(PurchaseRequest.department_id == dept_id)
)

# Count
count = await db.scalar(select(func.count()).select_from(MyModel).where(...))
```

## Step 5: Wire Up in Frontend

Add to `frontend/src/services/api.ts`:
```typescript
export const myAction = async (prId: number, payload: MyActionPayload) => {
  const { data } = await api.post(`/api/purchase-requests/${prId}/my-action`, payload);
  return data;
};
```

Add React Query mutation in the relevant component:
```typescript
const mutation = useMutation({
  mutationFn: (payload: MyActionPayload) => myAction(prId, payload),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pr(prId) });
    toast.success('Action completed');
  },
  onError: (err: AxiosError<{ detail: string }>) => {
    toast.error(err.response?.data?.detail ?? 'Error');
  },
});
```

## Checklist

- [ ] Pydantic schema defined in `schemas/`
- [ ] Endpoint added to correct router file
- [ ] Auth dependency (`Depends(get_current_user)`) included
- [ ] DB dependency (`Depends(get_db)`) included
- [ ] HTTP 404 for missing resource
- [ ] HTTP 403 for unauthorized role
- [ ] History entry added (for PR-modifying endpoints)
- [ ] `await db.commit()` called
- [ ] Frontend API function added
- [ ] React Query invalidation set up
- [ ] API registered in `backend/app/main.py` (if new router)
