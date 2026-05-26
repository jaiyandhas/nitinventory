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
   - Replaced risky read-modify-write patterns with single-statement SQL updates incorporating `func.greatest(0.0, ...)` to guarantee no negative balances or concurrent state leakage.

3. **Axios Deep Link Session Recovery**
   - Configured Axios interceptors in `frontend/src/services/api.ts` to capture the current route inside `sessionStorage.redirect_after_login` upon encountering a HTTP `401 Unauthorized` token expiry.
   - `Login.tsx` reads and redirects the user back to their targeted deep link page upon successful re-login, avoiding losing work-in-progress views.

4. **Vite Bundle Optimization**
   - Implemented custom Rollup manual chunk configuration in `vite.config.ts` to segment major dependencies (`vendor-react-core`, `vendor-tanstack`, `vendor-lucide`, `vendor`).
   - Mitigated the Vite 500KB bundle warnings, improving page load efficiency.

5. **Monolithic UI Refactoring**
   - Refactored `PRDetail.tsx` (previously 1800+ lines) into clean, reusable modules:
     - `PRHeader.tsx`: Meta data, status tracking badges, print controls.
     - `PRItemsTable.tsx`: Tabular line items list, item quantities, and cost breakdown.
     - `PRActionPanel.tsx`: Dynamic actions depending on user roles and current workflow phase.
   - Refactored `Assets.tsx` into decoupled subcomponents:
     - `AssetTable.tsx` for tracking listings.
     - `AssetFormModal.tsx` for single asset registration.
     - `AssetCsvImportModal.tsx` for bulk asset imports.

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

### Sample CSV Structure
```csv
year,legacy_asset_tag,name,category,fund_source,unit_cost,condition,building,room,custodian,serial_number,purchase_date,warranty_expiry,department_code
2026,OLD-TAG-CSE-001,Lab Workstation HP Z2,computer,research_fund,95000,working,CSE Block,Lab 3,Dr. K. Aravind,SGH123456,2026-05-15,2029-05-15,CSE
```

---

## 🧪 Testing Pipeline

The backend implements automated integration tests using pytest, executed against an isolated test database `nitinventory_test`.

### Executing Tests
To run tests inside the active running docker container:
```bash
# Copy local test files to the active backend container
docker exec nitinventory-backend rm -rf /app/tests
docker cp backend/tests nitinventory-backend:/app/tests

# Run pytest inside the container
docker exec -e PYTHONPATH=/app nitinventory-backend pytest /app/tests/
```

### Test Suites
- **`test_asset_service.py`**: Validates isolated sequence generation per department, concurrent worker thread resilience (resolving event-loop session isolation), and deletion checks.
- **`test_budget_service.py`**: Checks race-safe concurrency for lock/unlock operations and enforces constraints against negative amounts.
- **`test_flow_engine.py`**: Ensures state machine initialization, phase validation transitions, and state-rejection logic operate correctly.

---

## 📁 Directory Structure

```
iris/
├── backend/                  FastAPI + SQLAlchemy backend
│   ├── app/
│   │   ├── core/             DB configuration, auth, dependencies
│   │   ├── models/           SQLAlchemy models (22 tables)
│   │   ├── routers/          REST endpoints (Auth, PR, Budget, Assets, Inventory)
│   │   └── services/         Core engines (flow_engine, budget_service, asset_service)
│   ├── alembic/              Database migrations
│   ├── tests/                Pytest suite
│   └── seed.py               Data seed script
├── frontend/                 React + TypeScript + Vite SPA
│   ├── src/
│   │   ├── components/       Shared assets and purchase request subcomponents
│   │   │   ├── assets/       CSV Upload, Form, & Listing table
│   │   │   └── pr/           PR Header, Items list, and actions panel
│   │   ├── pages/            Views (Login, Dashboard, PRDetail, Assets, Inventory)
│   │   ├── context/          Auth & Context providers
│   │   └── services/         Axios setup and endpoints integration
│   └── vite.config.ts        Vite build configuration with manual chunking
└── docker-compose.yml        Local development docker setup
```
