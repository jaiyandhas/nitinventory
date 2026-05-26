"""
IRIS database bootstrap: drop/create tables and seed demo data.
Workflow definitions match NIT Tiruchirappalli procurement policy (3 categories × 4 procurement methods × 2 purchase types).
"""
import asyncio
from datetime import date

from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import settings
from app.core.database import Base
from app.core.security import get_password_hash
import app.models  # noqa: F401

from app.models.user import User, Department, RoleManager
from app.models.budget import (
    BudgetMaster,
    FinancialYear,
    PurchaseCategory,
    ProcurementManager,
    PhaseManager,
    Settings,
)
from app.seed_workflows import build_workflow_steps

engine = create_async_engine(settings.DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

DEMO_PASSWORD = get_password_hash("password")


async def create_tables():
    async with engine.begin() as conn:
        # We do not drop tables in production/development to persist user changes
        # await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS legacy_asset_tag VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS fund_source VARCHAR(100);"))
    print("✓ Database tables verified/created")


async def seed():
    async with SessionLocal() as db:
        # Check if the database has already been seeded
        check_user = await db.execute(select(User).where(User.email == "admin@nitt.edu"))
        if check_user.scalar_one_or_none():
            print("✓ Database already seeded. Skipping seeding to preserve data.")
            return

        print("🌱 Seeding NIT Inventory (demo: CSE only, password=password)...")

        # ─── Departments (All standard NIT Trichy departments) ──────────────────────────────────
        departments_spec = [
            ("Computer Science and Engineering", "CSE"),
            ("Electronics and Communication Engineering", "ECE"),
            ("Electrical and Electronics Engineering", "EEE"),
            ("Mechanical Engineering", "MECH"),
            ("Civil Engineering", "CIVIL"),
            ("Metallurgical and Materials Engineering", "MME"),
            ("Instrumentation and Control Engineering", "ICE"),
            ("Chemical Engineering", "CHEM"),
            ("Production Engineering", "PROD"),
            ("Chemistry", "CHY"),
            ("Physics", "PHY"),
            ("Mathematics", "MATH"),
            ("Computer Applications", "CA"),
            ("Management Studies", "DOMS"),
            ("Architecture", "ARCH"),
            ("Humanities and Social Sciences", "HSS")
        ]
        cse = None
        for name, code in departments_spec:
            dept = Department(name=name, short_code=code)
            db.add(dept)
            if code == "CSE":
                cse = dept
        await db.flush()

        # ─── Roles ───────────────────────────────────────────────────────────
        roles_spec = [
            ("Faculty", "faculty", "faculty"),
            ("HOD", "hod", "hod"),
            ("Admin", "admin", "admin"),
            ("Associate Dean P&D", "adpd", "verifier_general"),
            ("Dealing Assistant", "dealing_assistant", "verifier_da"),
            ("Superintendent", "superintendent", "verifier_sp"),
            ("Consultant S&P", "consultant_sp", "verifier_sp"),
            ("Assistant Registrar", "assistant_registrar", "verifier_sp"),
            ("Deputy Registrar", "deputy_registrar", "verifier_sp"),
            ("Dean P&D", "dean_pd", "dean_approver"),
            ("Director", "director", "apex_approver"),
        ]
        roles: dict[str, RoleManager] = {}
        for name, value, group_key in roles_spec:
            r = RoleManager(name=name, value=value, group_key=group_key)
            db.add(r)
            roles[value] = r
        await db.flush()

        # ─── Demo users ──────────────────────────────────────────────────────
        users_spec = [
            ("Administrator", "admin@nitt.edu", "System Administrator", "male", "admin", None),
            ("Dr. A. Kumar", "faculty.cse@nitt.edu", "Assistant Professor", "male", "faculty", cse),
            ("Dr. B. Prasad", "faculty1.cse@nitt.edu", "Assistant Professor", "male", "faculty", cse),
            ("Dr. C. Singh", "faculty2.cse@nitt.edu", "Assistant Professor", "male", "faculty", cse),
            ("Prof. D. Rajan", "hod.cse@nitt.edu", "Head of Department", "male", "hod", cse),
            ("Prof. H. Dean", "dean.pd@nitt.edu", "Dean P&D", "male", "dean_pd", None),
            ("Prof. J. Director", "director@nitt.edu", "Director", "male", "director", None),
            ("Mr. L. Superintendent", "sp.stores@nitt.edu", "Superintendent S&P", "male", "superintendent", None),
            ("Mr. K. DA Stores", "da.stores@nitt.edu", "Dealing Assistant", "male", "dealing_assistant", None),
            ("Mr. M. Consultant", "consultant.stores@nitt.edu", "Consultant S&P", "male", "consultant_sp", None),
            ("Mr. N. Asst Registrar", "ar.stores@nitt.edu", "Assistant Registrar", "male", "assistant_registrar", None),
            ("Mr. O. Dy Registrar", "dr.stores@nitt.edu", "Deputy Registrar", "male", "deputy_registrar", None),
            ("Dr. P. Associate Dean", "vg.pd@nitt.edu", "Associate Dean P&D", "male", "adpd", None),
            ("Prof. Q. Dean Budget", "dean.budget@nitt.edu", "Dean P&D (Budget)", "male", "dean_pd", None),
        ]
        users: dict[str, User] = {}
        for name, email, desig, gender, role_val, dept in users_spec:
            u = User(
                name=name,
                email=email,
                hashed_password=DEMO_PASSWORD,
                designation=desig,
                gender=gender,
                role_id=roles[role_val].id,
                department_id=dept.id if dept else None,
                is_active=True,
                is_approved=True,
            )
            db.add(u)
            users[email] = u
        await db.flush()

        # ─── Financial year ──────────────────────────────────────────────────
        fy = FinancialYear(
            label="2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        db.add(fy)
        await db.flush()

        # ─── Procurement methods ───────────────────────────────────────────
        procs = [
            ProcurementManager(name="GeM", description="Government e-Marketplace"),
            ProcurementManager(name="CPPP", description="Central Public Procurement Portal"),
            ProcurementManager(name="Limited Tender", description="Limited tender enquiry"),
            ProcurementManager(name="Proprietary Purchase", description="Single / proprietary source"),
        ]
        for p in procs:
            db.add(p)
        await db.flush()

        # ─── Purchase categories (amounts in rupees, configured per procurement method) ─────────
        categories = {}
        for proc in procs:
            cat1 = PurchaseCategory(
                title=f"{proc.name}: Upto Rs. 1,00,000",
                min_amount=1,
                max_amount=100_000,
                is_active=True,
                procurement_id=proc.id
            )
            cat2 = PurchaseCategory(
                title=f"{proc.name}: Rs. 1,00,001 to Rs. 10,00,000",
                min_amount=100_001,
                max_amount=1_000_000,
                is_active=True,
                procurement_id=proc.id
            )
            cat3 = PurchaseCategory(
                title=f"{proc.name}: Rs. 10,00,001 to Rs. 30,00,000",
                min_amount=1_000_001,
                max_amount=3_000_000,
                is_active=True,
                procurement_id=proc.id
            )
            db.add_all([cat1, cat2, cat3])
            await db.flush()
            categories[proc.id] = {"cat1": cat1, "cat2": cat2, "cat3": cat3}


        # ─── Phases ──────────────────────────────────────────────────────────
        phase_rows = [
            ("AA", "Administrative Approval", "Initial administrative approval", 1),
            ("TD", "Tendering", "Tender preparation and publication", 2),
            ("TE", "Technical Evaluation", "Technical bid evaluation", 3),
            ("FS", "Financial Sanction", "Financial sanction", 4),
            ("PO", "Purchase Order", "Purchase order and receipt", 5),
        ]
        phases: dict[str, PhaseManager] = {}
        for key, name, desc, order in phase_rows:
            pm = PhaseManager(phase_name=name, description=desc, phase_order=order)
            db.add(pm)
            phases[key] = pm
        await db.flush()

        # ─── Workflow hierarchies (truncate implied by drop_all) ─────────────
        wf_rows = build_workflow_steps(roles, phases, categories, procs)
        for w in wf_rows:
            db.add(w)
        await db.flush()
        print(f"✓ Seeded {len(wf_rows)} workflow hierarchy rows")

        # ─── Budget files (Dean allocates; faculty selects by amount band) ──
        budget_items = [
            (
                "NITT/CSE/2026-27/001",
                "Lab Consumables Pack",
                "OPEX",
                "consumables",
                "CSE-CON-001",
                50_000,
                1,
                50_000,
            ),
            (
                "NITT/CSE/2026-27/001-B",
                "Office Stationery Kit",
                "OPEX",
                "consumables",
                "CSE-CON-001-B",
                30_000,
                1,
                30_000,
            ),
            (
                "NITT/CSE/2026-27/002",
                "Department Workstation",
                "CAPEX",
                "computer",
                "CSE-WS-002",
                450_000,
                2,
                900_000,
            ),
            (
                "NITT/CSE/2026-27/003",
                "HPC Cluster Expansion",
                "CAPEX",
                "computer",
                "CSE-HPC-003",
                1_200_000,
                2,
                2_400_000,
            ),
        ]
        for file_no, item_name, exp_cat, cat, course, unit, qty, total in budget_items:
            db.add(
                BudgetMaster(
                    department_id=cse.id,
                    financial_year_id=fy.id,
                    expenditure_category=exp_cat,
                    item_name=item_name,
                    category=cat,
                    course_code=course,
                    unit_cost=float(unit),
                    quantity=int(qty),
                    total_cost=float(total),
                    file_no=file_no,
                    is_revision=False,
                )
            )
        await db.flush()

        # ─── Settings ────────────────────────────────────────────────────────
        for key, val in [
            ("institution_name", "National Institute of Technology, Tiruchirappalli"),
            ("system_name", "NIT Inventory"),
            ("institution_short", "NIT Tiruchirappalli"),
        ]:
            db.add(Settings(key_name=key, value=val))

        await db.commit()
        print("✅ Seeding complete!")
        print("\n📋 Demo logins (password: password)")
        for email in users:
            print(f"  {email}")


async def main():
    await create_tables()
    await seed()


if __name__ == "__main__":
    asyncio.run(main())
