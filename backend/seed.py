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
        await conn.execute(text("ALTER TABLE workflow_hierarchies ADD COLUMN IF NOT EXISTS tender_vendors_threshold INTEGER;"))
        await conn.execute(text("ALTER TABLE departments ADD COLUMN IF NOT EXISTS expert1_id INTEGER;"))
        await conn.execute(text("ALTER TABLE departments ADD COLUMN IF NOT EXISTS expert2_id INTEGER;"))
        await conn.execute(text("ALTER TABLE departments ADD COLUMN IF NOT EXISTS director_faculty_id INTEGER;"))
        await conn.execute(text("ALTER TABLE workflow_hierarchies ADD COLUMN IF NOT EXISTS tender_vendors_comparison VARCHAR(20);"))
        await conn.execute(text("ALTER TABLE procurement_managers ADD COLUMN IF NOT EXISTS form_schema JSONB;"))
        await conn.execute(text("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS form_data JSONB;"))
        await conn.execute(text("ALTER TABLE workflow_hierarchies ADD COLUMN IF NOT EXISTS skip_condition VARCHAR(500);"))
        await conn.execute(text("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS parent_pr_id INTEGER REFERENCES purchase_requests(id);"))
        await conn.execute(text("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS lpc_remarks TEXT;"))
        await conn.execute(text("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS lpc_committee_members TEXT;"))
        await conn.execute(text("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS lpc_minutes_reference VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS single_bid_justification TEXT;"))
        await conn.execute(text("ALTER TABLE financial_evaluations ADD COLUMN IF NOT EXISTS unit_price DOUBLE PRECISION;"))
        await conn.execute(text("ALTER TABLE financial_evaluations ADD COLUMN IF NOT EXISTS taxes DOUBLE PRECISION DEFAULT 0.0;"))
        await conn.execute(text("ALTER TABLE financial_evaluations ADD COLUMN IF NOT EXISTS delivery_period INTEGER;"))
        await conn.execute(text("ALTER TABLE financial_evaluations ADD COLUMN IF NOT EXISTS warranty INTEGER;"))
        
        # BudgetMaster committee fields
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS expert1_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS expert2_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS director_faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))

        # referrals table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pr_referrals (
                id SERIAL PRIMARY KEY,
                purchase_request_id INTEGER REFERENCES purchase_requests(id) ON DELETE CASCADE,
                referred_by_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                referred_to_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                query TEXT NOT NULL,
                response TEXT,
                response_document_path VARCHAR(500),
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
                responded_at TIMESTAMP WITHOUT TIME ZONE
            );
        """))
    print("✓ Database tables verified/created")


async def seed():
    async with SessionLocal() as db:
        print("🌱 Checking database state for seeding...")

        # 1. Departments
        dept_check = await db.execute(select(Department).limit(1))
        has_depts = dept_check.scalar_one_or_none() is not None
        cse = None
        if not has_depts:
            print("  Seeding departments...")
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
            for name, code in departments_spec:
                dept = Department(name=name, short_code=code)
                db.add(dept)
                if code == "CSE":
                    cse = dept
            await db.flush()
        else:
            cse_res = await db.execute(select(Department).where(Department.short_code == "CSE"))
            cse = cse_res.scalar_one_or_none()

        # 2. Roles
        roles_check = await db.execute(select(RoleManager).limit(1))
        has_roles = roles_check.scalar_one_or_none() is not None
        roles: dict[str, RoleManager] = {}
        if not has_roles:
            print("  Seeding roles...")
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
            for name, value, group_key in roles_spec:
                r = RoleManager(name=name, value=value, group_key=group_key)
                db.add(r)
                roles[value] = r
            await db.flush()
        else:
            roles_res = await db.execute(select(RoleManager))
            for r in roles_res.scalars():
                roles[r.value] = r

        # 3. Users
        users_check = await db.execute(select(User).limit(1))
        has_users = users_check.scalar_one_or_none() is not None
        users: dict[str, User] = {}
        if not has_users:
            print("  Seeding users...")
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
        else:
            users_res = await db.execute(select(User))
            for u in users_res.scalars():
                users[u.email] = u

        # 4. Financial Year
        fy_check = await db.execute(select(FinancialYear).limit(1))
        has_fy = fy_check.scalar_one_or_none() is not None
        fy = None
        if not has_fy:
            print("  Seeding financial year...")
            fy = FinancialYear(
                label="2026-27",
                start_date=date(2026, 4, 1),
                end_date=date(2027, 3, 31),
                is_active=True,
            )
            db.add(fy)
            await db.flush()
        else:
            fy_res = await db.execute(select(FinancialYear).where(FinancialYear.is_active == True))
            fy = fy_res.scalar_one_or_none()

        # 5. Procurement Methods
        proc_check = await db.execute(select(ProcurementManager).limit(1))
        has_procs = proc_check.scalar_one_or_none() is not None
        procs: list[ProcurementManager] = []
        if not has_procs:
            print("  Seeding procurement methods...")
            procs = [
                ProcurementManager(
                    name="GeM",
                    description="Government e-Marketplace",
                    form_schema={
                        "type": "object",
                        "title": "GeM Procurement Details",
                        "properties": {
                            "gem_link": { "type": "string", "title": "GeM Bid / RA Link" },
                            "gem_nac_attached": { "type": "boolean", "title": "GeM Non-Availability Certificate (NAC) Attached?" }
                        },
                        "required": ["gem_link"]
                    }
                ),
                ProcurementManager(
                    name="CPPP",
                    description="Central Public Procurement Portal",
                    form_schema={
                        "type": "object",
                        "title": "CPPP Procurement Details",
                        "properties": {
                            "tender_id": { "type": "string", "title": "CPPP Tender ID" },
                            "publication_date": { "type": "string", "title": "Publication Date (YYYY-MM-DD)" }
                        },
                        "required": ["tender_id"]
                    }
                ),
                ProcurementManager(
                    name="Limited Tender",
                    description="Limited tender enquiry",
                    form_schema={
                        "type": "object",
                        "title": "Limited Tender Details",
                        "properties": {
                            "invited_vendors": { "type": "string", "title": "List of Invited Vendors (comma separated)" }
                        },
                        "required": ["invited_vendors"]
                    }
                ),
                ProcurementManager(
                    name="Proprietary Purchase",
                    description="Single / proprietary source",
                    form_schema={
                        "type": "object",
                        "title": "Proprietary Article Certificate (PAC)",
                        "properties": {
                            "manufacturer_name": { "type": "string", "title": "OEM Manufacturer Name" },
                            "manufacturer_address": { "type": "string", "title": "OEM Address" },
                            "justification_type": {
                                "type": "string",
                                "enum": ["sole_manufacturer", "no_alternative", "similar_unavailable"],
                                "title": "PAC Justification Basis"
                            },
                            "finance_concurrence_ref": { "type": "string", "title": "Finance Concurrence Reference" }
                        },
                        "required": ["manufacturer_name", "justification_type"]
                    }
                ),
            ]
            for p in procs:
                db.add(p)
            await db.flush()
        else:
            procs_res = await db.execute(select(ProcurementManager))
            procs = list(procs_res.scalars())

        # 6. Purchase Categories
        cat_check = await db.execute(select(PurchaseCategory).limit(1))
        has_cats = cat_check.scalar_one_or_none() is not None
        categories = {}
        if not has_cats:
            print("  Seeding purchase categories...")
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
        else:
            cats_res = await db.execute(select(PurchaseCategory))
            for cat in cats_res.scalars():
                if cat.procurement_id not in categories:
                    categories[cat.procurement_id] = {}
                if cat.max_amount <= 100_000:
                    categories[cat.procurement_id]["cat1"] = cat
                elif cat.max_amount <= 1_000_000:
                    categories[cat.procurement_id]["cat2"] = cat
                else:
                    categories[cat.procurement_id]["cat3"] = cat

        # 7. Phase Manager
        phase_check = await db.execute(select(PhaseManager).limit(1))
        has_phases = phase_check.scalar_one_or_none() is not None
        phases: dict[str, PhaseManager] = {}
        if not has_phases:
            print("  Seeding phase managers...")
            phase_rows = [
                ("AA", "Administrative Approval", "Initial administrative approval", 1),
                ("TD", "Tendering", "Tender preparation and publication", 2),
                ("TE", "Technical Evaluation", "Technical bid evaluation", 3),
                ("FS", "Financial Sanction", "Financial sanction", 4),
                ("PO", "Purchase Order", "Purchase order and receipt", 5),
            ]
            for key, name, desc, order in phase_rows:
                pm = PhaseManager(phase_name=name, description=desc, phase_order=order)
                db.add(pm)
                phases[key] = pm
            await db.flush()
        else:
            phases_res = await db.execute(select(PhaseManager))
            for p in phases_res.scalars():
                key = {"Administrative Approval": "AA", "Tendering": "TD", "Technical Evaluation": "TE",
                       "Financial Sanction": "FS", "Purchase Order": "PO"}.get(p.phase_name)
                if key:
                    phases[key] = p

        # 8. Workflow Hierarchy
        from app.models.purchase_request import WorkFlowHierarchy
        print("  Re-seeding all workflow steps to apply updates...")
        await db.execute(text("DELETE FROM workflow_hierarchies;"))
        seeded_count = 0
        for ptype in ("department", "office"):
            for proc in procs:
                proc_cats = categories.get(proc.id, categories)
                for cat_key in ("cat1", "cat2", "cat3"):
                    cat = proc_cats.get(cat_key) if isinstance(proc_cats, dict) else None
                    if not cat:
                        continue
                    existing = await db.execute(
                        select(WorkFlowHierarchy).where(
                            WorkFlowHierarchy.category_id == cat.id,
                            WorkFlowHierarchy.procurement_id == proc.id,
                            WorkFlowHierarchy.purchase_type == ptype,
                        ).limit(1)
                    )
                    if existing.scalar_one_or_none() is None:
                        # No steps yet for this combo — generate and insert them
                        wf_rows = build_workflow_steps(
                            roles, phases, {cat_key: cat}, [proc]
                        )
                        for w in wf_rows:
                            if w.purchase_type == ptype:
                                db.add(w)
                        seeded_count += len([w for w in wf_rows if w.purchase_type == ptype])
        if seeded_count:
            await db.flush()
            print(f"  Seeded {seeded_count} missing workflow steps.")
        else:
            print("  All workflow hierarchies are already present.")

        # 9. Budget Master Items
        budget_check = await db.execute(select(BudgetMaster).limit(1))
        has_budget = budget_check.scalar_one_or_none() is not None
        if not has_budget and cse and fy:
            print("  Seeding budget master items...")
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

        # 10. Settings
        settings_check = await db.execute(select(Settings).limit(1))
        has_settings = settings_check.scalar_one_or_none() is not None
        if not has_settings:
            print("  Seeding settings...")
            for key, val in [
                ("institution_name", "National Institute of Technology, Tiruchirappalli"),
                ("system_name", "NIT Inventory"),
                ("institution_short", "NIT Tiruchirappalli"),
            ]:
                db.add(Settings(key_name=key, value=val))

        await db.commit()
        print("✅ Database verification and seeding process completed successfully!")


async def main():
    await create_tables()
    await seed()


if __name__ == "__main__":
    asyncio.run(main())
