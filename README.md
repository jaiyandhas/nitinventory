<<<<<<< HEAD
# NITT-INVENTORY-MANAGEMENT-SYSTEM
=======
# IRIS — Institutional Resource & Inventory System
**NIT Tiruchirappalli** | v1.0

A full-stack procurement workflow + asset tracking system built with:
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: FastAPI + Python 3.12 + SQLAlchemy 2.0 (async)
- **Database**: PostgreSQL 16
- **Auth**: JWT in HttpOnly SameSite=Lax cookies

---

## 🚀 Quick Start

```bash
cd iris
docker compose up --build
```

The system starts automatically:
1. `iris-db` — PostgreSQL database (port 5432)
2. `iris-backend` — FastAPI backend (port 8000), runs migrations + seeds on start
3. `iris-frontend` — React dev server (port 5173)

Open: **http://localhost:5173**

---

## 👤 Demo logins (password: `password`)

| Email | Role |
|-------|------|
| `admin@nitt.edu` | Administrator |
| `faculty.cse@nitt.edu` | Faculty (PI) — CSE |
| `hod.cse@nitt.edu` | Head of Department — CSE |
| `dean.pd@nitt.edu` | Dean P&D |
| `dean.budget@nitt.edu` | Dean P&D (budget allocation) |
| `director@nitt.edu` | Director |
| `sp.stores@nitt.edu` | Superintendent S&P |
| `da.stores@nitt.edu` | Dealing Assistant |
| `consultant.stores@nitt.edu` | Consultant S&P |
| `ar.stores@nitt.edu` | Assistant Registrar |
| `dr.stores@nitt.edu` | Deputy Registrar |
| `vg.pd@nitt.edu` | Associate Dean P&D |

---

## 🔧 Key Fixes from NPFS

1. **Budget deduction**: Budget is now locked on PR submission and deducted on PO issuance
2. **Email queue**: Replaced broken PHP queue with FastAPI `BackgroundTasks`
3. **BOLA fix**: Document and PR access is role + department scoped

## 📦 Inventory Module

When a PR reaches `PO_ISSUED` status, the system automatically:
1. Creates a `Delivery` record with items
2. HOD logs physical receipt (immutable)
3. Stores officer logs document verification
4. System reconciles quantities — mismatches create a `Discrepancy` and block payment
5. If all match → Assets auto-created with `NIT-DEPT-001` tags + QR codes

**Public QR Scan URL**: `http://localhost:5173/public/asset/NIT-CSE-001`

---

## 📁 Project Structure

```
iris/
├── backend/         FastAPI + SQLAlchemy backend
│   ├── app/
│   │   ├── core/    config, security, database, deps
│   │   ├── models/  SQLAlchemy models (22 tables)
│   │   ├── routers/ auth, pr, budget, inventory, assets, admin
│   │   └── services/flow_engine, budget, grn, asset, qr, email, pdf
│   ├── alembic/     Migrations
│   └── seed.py      Sample data seeder
├── frontend/        React + TypeScript + Tailwind SPA
│   └── src/
│       ├── pages/   Login, Dashboard, PRList, PRDetail, Assets, Inventory
│       ├── layouts/ Role-based glassmorphism sidebar
│       └── context/ AuthContext
└── docker-compose.yml
```
>>>>>>> 113d8a0a357564bbb34edb97f208643dd94d19ab
