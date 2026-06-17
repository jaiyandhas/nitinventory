# IRIS — NIT Tiruchirappalli Inventory & Procurement Management System

## Project Overview

IRIS is a full-stack institutional procurement workflow management and asset tracking system for NIT Tiruchirappalli. It automates the complete procurement lifecycle from purchase request (PR) submission through multi-stage approvals, purchase order issuance, goods receipt, and asset registry.

**Stack**: FastAPI (Python) + React 18 (TypeScript) + PostgreSQL 16 + Docker Compose

---

## Quick Start

```bash
# Start all services
docker compose up

# Full reset (wipes all data)
RESET_DEMO_DATA=true docker compose up

# Run backend tests
docker exec nitinventory-backend pytest

# Run e2e workflow test
docker exec nitinventory-backend python3 -m app.e2e_test
```

**URLs after startup:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

**Demo credentials** (all passwords: `password`):

| Email | Role |
|-------|------|
| `admin@nitt.edu` | Administrator |
| `faculty.cse@nitt.edu` | Faculty (PR initiator) |
| `hod.cse@nitt.edu` | Head of Department |
| `dean.pd@nitt.edu` | Dean P&D |
| `director@nitt.edu` | Director |
| `sp.stores@nitt.edu` | Superintendent S&P |
| `da.stores@nitt.edu` | Dealing Assistant |

---

## Architecture

```
iris_aa/
├── backend/
│   └── app/
│       ├── core/           # DB engine, auth, config, dependency injection
│       ├── models/         # SQLAlchemy ORM models (25+ tables)
│       ├── routers/        # FastAPI route handlers
│       ├── services/       # Business logic engines
│       ├── schemas/        # Pydantic request/response schemas
│       ├── templates/      # Jinja2 PDF templates
│       └── main.py         # FastAPI app entry point
├── frontend/
│   └── src/
│       ├── components/     # Reusable UI components
│       ├── pages/          # Route-level page components
│       ├── context/        # Auth context provider
│       ├── services/       # Axios API client
│       ├── types/          # TypeScript interfaces
│       └── App.tsx         # Route definitions
└── docker-compose.yml
```

---

## Core Business Domain

### Procurement Categories (by amount)
- **Cat 1**: ≤ ₹10,00,000
- **Cat 2**: ₹10,00,001 – ₹30,00,000
- **Cat 3**: > ₹30,00,000

### Procurement Methods
- **Direct**: Unilateral purchase
- **GeM**: Government e-Marketplace
- **LPC**: Local Purchase Committee
- **CPPP**: Centralized Public Procurement Portal

### PR Workflow Phases (in order)
```
AA (Admin Approval) → TE (Tendering) → Technical Evaluation → Financial Sanction → PO (Purchase Order)
                                                                                        ↓
                                               COMPLETED ← GRN/Delivery ← Bill Passing
```

Phases can be **skipped** based on AST-evaluated `skip_condition` expressions stored per workflow step.

---

## Key Services

### `backend/app/services/flow_engine.py` (~600 lines)
The core workflow state machine. Manages PR phase transitions, skip conditions, tech committee multi-user approval, and SOF (source-of-fund) routing.

Key methods:
- `initialize_pr_flow()` — set up initial workflow state
- `advance_step()` — move PR to next approver/phase
- `send_back_pr()` — revert to earlier step
- `reject_pr()` — terminal rejection with budget unlock
- `realign_pr_flow()` — sync flow state with history (for send-backs)

### `backend/app/services/budget_service.py` (~120 lines)
Atomic budget lock/unlock/deduct operations using single-statement SQL updates.

- `lock_amount()` — increment `committed_amount` on PR submission
- `unlock_amount()` — decrement on reject/cancel
- `deduct_amount()` — committed → utilized on PO issue

### `backend/app/services/asset_service.py` (~400 lines)
Asset creation from GRNs, QR code generation, and atomic tag sequencing via PostgreSQL `nextval()`.

Asset tag format: `NIT-{DEPT}-{YY}-{SEQ:03d}` (e.g., `NIT-CSE-26-001`)

### `backend/app/services/evaluator.py` (~150 lines)
Safe AST-based expression evaluator for workflow skip conditions. Never uses `eval()`.

### `backend/app/services/tech_committee.py` (~200 lines)
Tech committee resolution with 3-level fallback: PR → BudgetMaster → Department.

---

## Database Schema

### Key Tables

| Table | Purpose |
|-------|---------|
| `purchase_requests` | Core PR entity with `form_data` JSON and `current_status` |
| `workflow_hierarchies` | Dynamic workflow step definitions per category/method/phase |
| `purchase_request_flows` | Current workflow state (phase, step) |
| `purchase_request_history` | Immutable audit trail with frozen actor snapshots |
| `budget_master` | Budget files with `committed_amount` / `utilized_amount` |
| `assets` | Asset registry with QR codes and movement tracking |
| `deliveries` / `delivery_items` | GRN workflow tables |
| `administrative_approvals` | Specialized purchase AA workflow |
| `technical_evaluations` | Vendor tech bid evaluation records |
| `financial_evaluations` | Vendor cost bid comparison records |

### Critical Invariants
- `budget_master.committed_amount` must never go negative (guarded by `func.greatest(0.0, ...)`)
- Asset tags are generated via PostgreSQL sequences — never generate client-side
- `purchase_request_history` is append-only; never update or delete rows
- `dept_asset_logs` is immutable after creation; stores receipt moves to `stores_asset_logs`

---

## API Routes

| Router | Base Path | Key Endpoints |
|--------|-----------|---------------|
| auth | `/api/auth` | `/login`, `/register`, `/me`, `/logout` |
| purchase_requests | `/api/purchase-requests` | `POST /`, `GET /{id}`, `/advance`, `/reject`, `/send-back`, `/tender-schedule`, `/technical-eval`, `/financial-bids`, `/purchase-order`, `/bill-passing` |
| budget | `/api/budget` | `/overview`, `/files`, `/financial-years` |
| admin | `/api/admin` | `/users`, `/departments`, `/workflows`, `/budget/categories` |
| assets | `/api/assets` | `GET/POST /`, `/upload-csv`, `/{tag}/print-qr` |
| inventory | `/api/inventory` | `/deliveries`, `/deliveries/{id}/confirm`, `/deliveries/{id}/grn` |
| administrative_approval | `/api/administrative-approvals` | `GET/POST /`, `/{id}/advance`, `/{id}/reject` |

---

## Frontend Routes

| Path | Who Can Access | Purpose |
|------|---------------|---------|
| `/dashboard` | All authenticated | Role-specific dashboard |
| `/pr/create` | Faculty only | PR creation wizard (5-step) |
| `/pr/{id}` | All except Dean Budget | PR detail + workflow actions |
| `/budget` | Faculty, HOD, Admin, Dean | Budget overview |
| `/admin/users` | Admin only | User management |
| `/admin/settings` | Admin only | System settings |
| `/assets` | All | Asset registry |
| `/inventory/deliveries` | Faculty, HOD, Stores | Delivery tracking |
| `/administrative-approvals` | All | AA workflow list |
| `/public/asset/{tag}` | Public (no auth) | QR code scan view |

---

## Authentication

- JWT stored in HttpOnly cookie (`auth_token`), 8-hour expiry
- Role-based access via `User.role_id` → `RoleManager.value`
- Department-scoped data: HOD/Faculty see only their department's PRs/assets

**Auth dependency**: `get_current_user()` in `backend/app/core/deps.py`

---

## Workflow Engine Details

### WorkFlowHierarchy Table
Each row = one approval step. Key columns:
- `category_id`, `procurement_id`, `phase_id` — determines which PRs this step applies to
- `step_order` — sequential order within a phase
- `user_type` / `user_group` / `role_id` — who must act on this step
- `skip_condition` — AST expression; if truthy, step is bypassed
- `source_of_fund_id` — NULL = default, non-NULL = fund-specific variant
- `purchase_type` — "department" or "office"

### Skip Condition Examples
```python
"pr.amount < 100000"
"pr.procurement_id == 1"
"pr.form_data.get('is_renewal') == True"
```

### Multi-User Tech Committee
All 3 committee members (Expert1, Expert2, Director Nominee) must sign off independently. Flow engine tracks per-member approval in `purchase_request_history` and advances only when all have acted.

---

## Adding a New Workflow Step

1. Insert into `workflow_hierarchies` via `POST /api/admin/workflows`
2. Specify: `category_id`, `procurement_id`, `phase_id`, `step_order`, `role_id`, `user_group`, `skip_condition`
3. Re-seed (restart backend) to pick up changes
4. Existing in-flight PRs are not affected until they reach that step

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql+asyncpg://...` | PostgreSQL connection |
| `SECRET_KEY` | required | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 480 | Session duration |
| `SMTP_*` | optional | Email notifications |
| `STORAGE_PATH` | `/app/storage` | File upload directory |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |
| `RESET_DEMO_DATA` | false | Wipe & re-seed on start |

---

## Testing

```bash
# All unit/integration tests
docker exec nitinventory-backend pytest

# Specific test file
docker exec nitinventory-backend pytest tests/test_flow_engine.py -v

# E2E full lifecycle test
docker exec nitinventory-backend python3 -m app.e2e_test

# Check DB state
docker exec nitinventory-backend python3 backend/app/db_check.py
```

Test files in `backend/tests/`:
- `test_flow_engine.py` — phase transitions, skip conditions
- `test_budget_service.py` — lock/unlock/deduct, negative balance prevention
- `test_asset_service.py` — race-safe tag sequencing
- `test_committee_workflow.py` — multi-user tech committee
- `test_bill_passing_and_single_bid.py` — single-bid director routing
- `test_cancellation.py` — PO cancellation & reinitiation

---

## Common Pitfalls

1. **Budget negative values**: Always use `func.greatest(0.0, ...)` in budget SQL updates
2. **Asset tag races**: Never generate `NIT-DEPT-YY-XXX` in Python — always use `SELECT nextval('asset_seq_cse')` etc.
3. **History immutability**: Never UPDATE `purchase_request_history` — only INSERT new rows
4. **Skip condition AST**: Only literals, arithmetic, comparisons, logical ops, and attribute/subscript access are allowed — no function calls on unknown objects
5. **SOF routing**: If a PR's budget file has a non-null `source_of_fund_id`, the workflow engine will prefer fund-specific workflow rows over the default NULL rows
6. **Tech committee all-sign**: `advance_pr` for TE phase only moves forward when ALL committee members have a history row for that step

---

## Storage Structure

```
backend/storage/
├── qr/                  # Asset QR code PNGs (NIT-CSE-26-001.png)
├── attachments/         # PR & AA form file attachments
├── pdfs/                # Generated PDF reports
├── signatures/          # User signature images (transparent PNG)
├── NITLOGO.png          # Organization logo
└── NITLOGO_watermark.png
```
