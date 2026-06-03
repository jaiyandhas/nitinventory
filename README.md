# IRIS — Institutional Resource & Inventory System
**NIT Tiruchirappalli** | v1.0

A full-stack procurement workflow, budget allocation, and asset tracking system built for academic departments and central administration.

---

## 🛠️ Technology Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: FastAPI + Python 3.12 + SQLAlchemy 2.0 (async pg)
- **Database**: PostgreSQL 16
- **Authentication**: JWT stored in secure `HttpOnly`, `SameSite=Lax` cookies
- **Containerization**: Docker & Docker Compose

---

## 🚀 Quick Start

Ensure you have Docker and Docker Compose installed, then run:

```bash
cd iris
docker compose up --build
```

The system initializes automatically:
1. **`nitinventory-db`** — PostgreSQL database (port `5432`)
2. **`nitinventory-backend`** — FastAPI backend (port `8000`), automatically runs migrations and seeds demo data on start
3. **`nitinventory-frontend`** — React SPA dev server (port `5173`)

Access the application at: **[http://localhost:5173](http://localhost:5173)**

---

## 👤 Demo Logins (Password: `password`)

| Email | Role | Scope |
|-------|------|-------|
| `admin@nitt.edu` | Administrator | Global Access / Systems Control |
| `faculty.cse@nitt.edu` | Faculty (PI) | CSE Department |
| `faculty1.cse@nitt.edu` | Faculty Nominee 1 | CSE Department |
| `faculty2.cse@nitt.edu` | Faculty Nominee 2 | CSE Department |
| `hod.cse@nitt.edu` | Head of Department | CSE Department (Approver & Asset Manager) |
| `dean.pd@nitt.edu` | Dean P&D | Institutional Approver |
| `dean.budget@nitt.edu` | Dean P&D (Budget) | Budget Allocation / Creation |
| `director@nitt.edu` | Director | Ultimate Authority Approver |
| `sp.stores@nitt.edu` | Superintendent S&P | Stores and Purchase Admin |
| `da.stores@nitt.edu` | Dealing Assistant | Stores and Purchase Handling |
| `consultant.stores@nitt.edu` | Consultant S&P | Stores Advisory |
| `ar.stores@nitt.edu` | Assistant Registrar | Stores Approver |
| `dr.stores@nitt.edu` | Deputy Registrar | Stores Approver |
| `vg.pd@nitt.edu` | Associate Dean P&D | Institutional Approver |

---

## 🔧 Key Architecture & Concurrency Optimizations

1. **Race-Safe Asset Tag Sequencing**
   - Removed legacy client-side or count-based sequence generation.
   - Implemented dynamic, database-level Postgres sequences per department:
     `CREATE SEQUENCE IF NOT EXISTS asset_seq_<dept_code_lower> START 1`
   - Next sequences are generated atomically using `nextval('asset_seq_<dept_code_lower>')` to prevent duplicates under concurrent registrations or deletions.

2. **N+1 Query Elimination & Atomic Budget Locks**
   - Refactored `budget_service.py` (`lock_amount`, `unlock_amount`, `deduct_amount`) to batch-load related `BudgetMaster` records using SQLAlchemy `.in_()` instead of loop-bound lookups.
   - Replaced read-modify-write patterns with single-statement SQL updates incorporating `func.greatest(0.0, ...)` to guarantee no negative balances or concurrent state leakage.

3. **Metadata-Driven Dynamic Forms & Rule Engine**
   - Implemented a secure, dependency-free AST-based expression evaluator (`app/services/evaluator.py`) to safely execute custom rule expressions (e.g. `pr.amount < 100000`) without exposing `eval()` vulnerabilities.
   - Designed a dynamic step-skipping system in the workflow manager (`flow_engine.py`) using these AST rules to automatically bypass phases depending on form inputs or PR values.
   - Developed dynamic schemas (`form_schema`) per procurement type (GeM, LPC, CPPP, etc.) that render custom forms dynamically on the frontend via `DynamicFormRenderer.tsx`.

4. **Audit-Compliant Cancellations & PR Cloning**
   - Implemented PO and Tender cancellation endpoints which trigger automatic database-level balance reversals:
     - PO cancellation refunds `deducted_amount` back to the budget.
     - Tender cancellation releases `locked_amount` back to the budget.
   - Stored cancellation reasons in audit tables (`po_cancellations` and `tender_cancellations`).
   - Enabled HOD/Initiator to re-initiate a cancelled request, cloning all core metadata, items, and form data into a new PR with a self-referential `parent_pr_id` link.

5. **Advanced Procurement Lifecycle Modules**
   - **Techno-Commercial & Financial PCS**: Added multi-vendor side-by-side comparative statement tables (`PRItemsTable.tsx`) comparing bids on unit cost, taxes, delivery period, warranty, and qualification status.
   - **Single Bid Routing**: Enforced single-bid justification form input in the FS phase if only one vendor qualifies, dynamically routing approvals through the Director.
   - **LPC Committee Approvals**: Integrated Local Purchase Committee detail inputs (`lpc_remarks`, `lpc_committee_members`, `lpc_minutes_reference`) in the tendering phase.
   - **Purchase Bill Passing**: Created a secure invoice bill-passing module verifying that the bill amount does not exceed the PO allocation, and blocking bill passing until HOD/Stores record a `verified` GRN delivery.

6. **Budget Master Initiation, Technical Committee & Consultation Flow**
   - **Standalone Budget Initiation**: Created a full page form (`BudgetFormPage.tsx`) supporting live auto-rolling budget file reference numbers in the format `nitt/{dept}/{source_type}/{fy}/{seq}`.
   - **Editable Categories**: Managed categories dynamically, allowing on-the-fly custom category registration.
   - **Per-Budget Technical Committee**: Shifted committee nominations (Expert 1, Expert 2, and Director Nominee) from global user profiles to a per-budget-file basis. Nominated experts automatically sync to active PR workflows using the budget.
   - **Ad-hoc Consultation Opinion Referrals**: Enabled active approvers to refer a PR to any system user for a consultation query. This freezes standard workflow actions (approve, reject, send back). The consulted user can read the PR, type feedback, upload a PDF report, and send it back to unfreeze the workflow.

---

## 📥 Bulk Asset CSV Import

Department Heads (HODs) and Administrators can bulk-import assets.

### Key Rules & Behavior
- **Atomicity**: The entire import is fully transactional. If a single row fails verification (e.g. invalid date, duplicate tag, missing name), the entire import is aborted and rolled back.
- **Department Mapping**:
  - For **HODs**, assets are automatically and securely locked to their own department.
  - For **Admins**, the `department_code` column is analyzed to assign assets to various departments.

### CSV Columns Schema

| Column Header | Accepted Aliases | Required | Type / Values | Description |
|---|---|---|---|---|
| `name` | `asset_name` | **Yes** | String | Name of the asset (e.g. `Dell Latitude 7490`) |
| `legacy_asset_tag` | `legacy_tag`, `existing_asset_number`, `existing_asset_no` | **Yes** | String (Unique) | Reference tag or existing tag from previous systems |
| `year` | `asset_year` | No | Integer | Year of registration / purchase (e.g., `2026`) |
| `category` | — | No | Choice | `computer`, `lab_equipment`, `furniture`, `other` |
| `fund_source` | `funding`, `funding_type`, `fund_type` | No | Choice | `plan_fund`, `non_plan_fund`, `research_fund`, `consultancy_fund`, `dept_development_fund`, `others` |
| `unit_cost` | `cost`, `price`, `unit_price` | No | Numeric | Cost per unit (numbers only, currency symbols stripped) |
| `condition` | — | No | Choice | `working`, `under_maintenance`, `disposed`, `broken` |
| `building` | `location_building` | No | String | Building name (e.g. `Lyceum Block`) |
| `room` | `location_room` | No | String | Room or Lab name (e.g. `Software Lab 1`) |
| `custodian` | `lab_in_charge` | No | String | Person responsible for the asset |
| `serial_number` | `serial`, `serial_no` | No | String | Manufacturer serial number |
| `purchase_date` | `purchase_day` | No | Date | `YYYY-MM-DD` or `DD-MM-YYYY` |
| `warranty_expiry` | `warranty_date` | No | Date | `YYYY-MM-DD` or `DD-MM-YYYY` |
| `department_code` | `dept`, `dept_code`, `department`, `department_id` | **Yes (Admins only)** | String | Department Code (e.g. `CSE`, `ECE`, `MECH`) |

---

## 🧪 Testing Pipeline

The backend implements automated integration tests using pytest, executed against an isolated test database `nitinventory_test`.

### Executing Tests
To run tests inside the active running docker container:
```bash
# Run pytest inside the container
docker exec -e PYTHONPATH=. nitinventory-backend pytest
```

### Test Suites
- **`test_asset_service.py`**: Validates isolated sequence generation per department, concurrent worker thread resilience, and deletion checks.
- **`test_budget_service.py`**: Checks race-safe concurrency for lock/unlock operations and enforces constraints against negative amounts.
- **`test_flow_engine.py`**: Ensures state machine initialization, phase validation transitions, and state-rejection logic operate correctly.
- **`test_dynamic_evaluator.py`**: Validates safe AST execution of mathematical, boolean, and dict lookup rule conditions.
- **`test_committee_workflow.py`**: Asserts that skip conditions dynamically bypass workflow stages depending on the request value and attributes.
- **`test_bill_passing_and_single_bid.py`**: Verifies LPC approval data persistency, single bid routing conditions, and DA role checks for invoice verification.
- **`test_cancellation.py`**: Ensures PO/tender cancellation releases allocated budget categories and cloning re-initiation tracks parent PR IDs.
- **`test_consultation_and_budget_initiation.py`**: Verifies standalone budget initiation, editable categories, auto-rolling reference numbers, per-budget technical committee nominations, and the ad-hoc refer-and-respond consultation workflow.

---

## 📁 Directory Structure

```
iris/
├── backend/                  FastAPI + SQLAlchemy backend
│   ├── app/
│   │   ├── core/             DB configuration, auth, dependencies
│   │   ├── models/           SQLAlchemy models (25 tables)
│   │   ├── routers/          REST endpoints (Auth, PR, Budget, Assets, Inventory, Admin)
│   │   └── services/         Core engines (flow_engine, budget_service, asset_service, evaluator)
│   ├── alembic/              Database migrations
│   ├── tests/                Pytest suite (30 automated integration tests)
│   └── seed.py               Data seed script
├── frontend/                 React + TypeScript + Vite SPA
│   ├── src/
│   │   ├── components/       Shared assets and purchase request subcomponents
│   │   │   ├── assets/       CSV Upload, Form, & Listing table
│   │   │   └── pr/           PR Header (with Nominees Modal), Items list, Action panel (with Consultation), DynamicFormRenderer
│   │   ├── pages/            Views (Login, Dashboard, PRDetail, Assets, Inventory, BudgetPage, BudgetFormPage, ProfilePage)
│   │   ├── context/          Auth & Context providers
│   │   └── services/         Axios setup and endpoints integration
│   └── vite.config.ts        Vite build configuration with manual chunking
└── docker-compose.yml        Local development docker setup
```
