"""
IRIS database bootstrap: drop/create tables and seed demo data.
Workflow definitions match NIT Tiruchirappalli procurement policy (3 categories × 4 procurement methods × 2 purchase types).
"""
import asyncio
import os
from datetime import date, datetime

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
RESET_DEMO_DATA = os.getenv("RESET_DEMO_DATA", "false").strip().lower() in ("1", "true", "yes", "y")


async def create_tables():
    async with engine.begin() as conn:
        # We do not drop tables in production/development to persist user changes
        if RESET_DEMO_DATA:
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS remarks TEXT;"))
        await conn.execute(text("ALTER TABLE financial_years ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT FALSE;"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS legacy_asset_tag VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS fund_source VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS supplier_address TEXT;"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS bill_number VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS bill_date DATE;"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS stock_register_volume VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS stock_register_page VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS delivery_date DATE;"))
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
        await conn.execute(text("ALTER TABLE bill_passings ADD COLUMN IF NOT EXISTS extra_info JSONB;"))
        
        # BudgetMaster committee fields
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS expert1_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS expert2_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS director_faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS allocated_initiator_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))

        # Update existing purchase categories for cat3 bounds
        await conn.execute(text("UPDATE purchase_categories SET max_amount = 999999999, title = REPLACE(title, 'Rs. 10,00,001 to Rs. 30,00,000', 'Rs. 10,00,001 and above') WHERE title LIKE '%Rs. 10,00,001 to Rs. 30,00,000%';"))
        # Also clean up old southern region service center references or GFR details if needed (no column drop needed)


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

        # purchase_request_history frozen fields
        await conn.execute(text("ALTER TABLE purchase_request_history ADD COLUMN IF NOT EXISTS frozen_actor_name VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE purchase_request_history ADD COLUMN IF NOT EXISTS frozen_designation VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE purchase_request_history ADD COLUMN IF NOT EXISTS frozen_department VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE purchase_request_history ADD COLUMN IF NOT EXISTS frozen_signature_path VARCHAR(500);"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS title VARCHAR(50) DEFAULT 'Mr.';"))
        await conn.execute(text("ALTER TABLE purchase_request_history ADD COLUMN IF NOT EXISTS frozen_title VARCHAR(50);"))

        # Clean up existing users' names and set titles
        await conn.execute(text("UPDATE users SET title='Dr.', name='A. Kumar' WHERE name='Dr. A. Kumar';"))
        await conn.execute(text("UPDATE users SET title='Dr.', name='B. Prasad' WHERE name='Dr. B. Prasad';"))
        await conn.execute(text("UPDATE users SET title='Dr.', name='C. Singh' WHERE name='Dr. C. Singh';"))
        await conn.execute(text("UPDATE users SET title='Prof.', name='D. Rajan' WHERE name='Prof. D. Rajan';"))
        await conn.execute(text("UPDATE users SET title='Prof.', name='H. Dean' WHERE name='Prof. H. Dean';"))
        await conn.execute(text("UPDATE users SET title='Prof.', name='J. Director' WHERE name='Prof. J. Director';"))
        await conn.execute(text("UPDATE users SET title='Mr.', name='L. Superintendent' WHERE name='Mr. L. Superintendent';"))
        await conn.execute(text("UPDATE users SET title='Mr.', name='K. DA Stores' WHERE name='Mr. K. DA Stores';"))
        await conn.execute(text("UPDATE users SET title='Mr.', name='M. Consultant' WHERE name='Mr. M. Consultant';"))
        await conn.execute(text("UPDATE users SET title='Mr.', name='N. Asst Registrar' WHERE name='Mr. N. Asst Registrar';"))
        await conn.execute(text("UPDATE users SET title='Mr.', name='O. Dy Registrar' WHERE name='Mr. O. Dy Registrar';"))
        await conn.execute(text("UPDATE users SET title='Dr.', name='P. Associate Dean' WHERE name='Dr. P. Associate Dean';"))
        await conn.execute(text("UPDATE users SET title='Prof.', name='Q. Dean Budget' WHERE name='Prof. Q. Dean Budget';"))

        # pr_referrals query document field
        await conn.execute(text("ALTER TABLE pr_referrals ADD COLUMN IF NOT EXISTS query_document_path VARCHAR(500);"))

        # Rename budget_master columns safely
        await conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='budget_master' AND column_name='total_cost') THEN
                    ALTER TABLE budget_master RENAME COLUMN total_cost TO total_allocation;
                END IF;
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='budget_master' AND column_name='locked_amount') THEN
                    ALTER TABLE budget_master RENAME COLUMN locked_amount TO committed_amount;
                END IF;
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='budget_master' AND column_name='deducted_amount') THEN
                    ALTER TABLE budget_master RENAME COLUMN deducted_amount TO utilized_amount;
                END IF;
            END $$;
        """))

        # Add condition columns to workflow_hierarchies
        await conn.execute(text("ALTER TABLE workflow_hierarchies ADD COLUMN IF NOT EXISTS condition_field VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE workflow_hierarchies ADD COLUMN IF NOT EXISTS condition_operator VARCHAR(20);"))
        await conn.execute(text("ALTER TABLE workflow_hierarchies ADD COLUMN IF NOT EXISTS condition_value INTEGER;"))

        # Data migration for threshold rules
        await conn.execute(text("""
            UPDATE workflow_hierarchies 
            SET condition_field = 'qualified_vendor_count', 
                condition_operator = COALESCE(tender_vendors_comparison, '<'), 
                condition_value = COALESCE(tender_vendors_threshold, 3) 
            WHERE tender_vendors_threshold IS NOT NULL AND condition_field IS NULL;
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
                ("Mr.", "Administrator", "admin@nitt.edu", "System Administrator", "male", "admin", None),
                ("Dr.", "A. Kumar", "faculty.cse@nitt.edu", "Assistant Professor", "male", "faculty", cse),
                ("Dr.", "B. Prasad", "faculty1.cse@nitt.edu", "Assistant Professor", "male", "faculty", cse),
                ("Dr.", "C. Singh", "faculty2.cse@nitt.edu", "Assistant Professor", "male", "faculty", cse),
                ("Prof.", "D. Rajan", "hod.cse@nitt.edu", "Head of Department", "male", "hod", cse),
                ("Prof.", "H. Dean", "dean.pd@nitt.edu", "Dean P&D", "male", "dean_pd", None),
                ("Prof.", "J. Director", "director@nitt.edu", "Director", "male", "director", None),
                ("Mr.", "L. Superintendent", "sp.stores@nitt.edu", "Superintendent S&P", "male", "superintendent", None),
                ("Mr.", "K. DA Stores", "da.stores@nitt.edu", "Dealing Assistant", "male", "dealing_assistant", None),
                ("Mr.", "M. Consultant", "consultant.stores@nitt.edu", "Consultant S&P", "male", "consultant_sp", None),
                ("Mr.", "N. Asst Registrar", "ar.stores@nitt.edu", "Assistant Registrar", "male", "assistant_registrar", None),
                ("Mr.", "O. Dy Registrar", "dr.stores@nitt.edu", "Deputy Registrar", "male", "deputy_registrar", None),
                ("Dr.", "P. Associate Dean", "vg.pd@nitt.edu", "Associate Dean P&D", "male", "adpd", None),
                ("Prof.", "Q. Dean Budget", "dean.budget@nitt.edu", "Dean P&D (Budget)", "male", "dean_pd", None),
            ]
            for title, name, email, desig, gender, role_val, dept in users_spec:
                u = User(
                    title=title,
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

        # Seed dummy digital signatures for workflow approval steps.
        # Some demo users might not have uploaded signatures yet, and PO approvals require signature_path.
        default_sig_rel_path = "signatures/6_ae8ad3496eae4809b4a946314e0c79e1_signature.png"
        for u in users.values():
            if not u.signature_path:
                u.signature_path = default_sig_rel_path
        await db.flush()

        # 4. Financial Year
        fy_labels = ["2025-26", "2026-27", "2027-28"]
        seeded_fys = {}
        for label in fy_labels:
            fy_res = await db.execute(select(FinancialYear).where(FinancialYear.label == label))
            existing_fy = fy_res.scalar_one_or_none()
            if not existing_fy:
                if label == "2025-26":
                    fy_obj = FinancialYear(label=label, start_date=date(2025, 4, 1), end_date=date(2026, 3, 31), is_active=False, is_closed=True)
                elif label == "2026-27":
                    fy_obj = FinancialYear(label=label, start_date=date(2026, 4, 1), end_date=date(2027, 3, 31), is_active=True, is_closed=False)
                else:
                    fy_obj = FinancialYear(label=label, start_date=date(2027, 4, 1), end_date=date(2028, 3, 31), is_active=False, is_closed=False)
                db.add(fy_obj)
                await db.flush()
                seeded_fys[label] = fy_obj
            else:
                seeded_fys[label] = existing_fy
        fy = seeded_fys["2026-27"]

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
                            "gem_link": { "type": "string", "title": "GeM Bid / RA Link" }
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
                            "publication_date": { "type": "string", "title": "Publication Date (YYYY-MM-DD)" },
                            "gem_nac_attached": { "type": "boolean", "title": "GeM Non-Availability Certificate (NAC) Attached?" }
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
                            "gem_nac_attached": { "type": "boolean", "title": "GeM Non-Availability Certificate (NAC) Attached?" }
                        },
                        "required": []
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
                            "finance_concurrence_ref": { "type": "string", "title": "Finance Concurrence Reference" },
                            "gem_nac_attached": { "type": "boolean", "title": "GeM Non-Availability Certificate (NAC) Attached?" }
                        },
                        "required": ["manufacturer_name", "justification_type"]
                    }
                ),
                ProcurementManager(
                    name="Direct Purchase",
                    description="Direct Purchase without bids (for low-value items under ₹25,000)",
                    max_amount=25000.0,
                    form_schema={
                        "type": "object",
                        "title": "Direct Purchase Details",
                        "properties": {
                            "justification": { "type": "string", "title": "Justification for Direct Purchase" },
                            "gem_nac_attached": { "type": "boolean", "title": "GeM Non-Availability Certificate (NAC) Attached?" }
                        },
                        "required": ["justification"]
                    }
                ),
            ]
            for p in procs:
                db.add(p)
            await db.flush()
        else:
            # Ensure Direct Purchase exists in the database
            dp_check = await db.execute(select(ProcurementManager).where(ProcurementManager.name == "Direct Purchase"))
            dp = dp_check.scalar_one_or_none()
            if not dp:
                dp = ProcurementManager(
                    name="Direct Purchase",
                    description="Direct Purchase without bids (for low-value items under ₹25,000)",
                    max_amount=25000.0,
                    form_schema={
                        "type": "object",
                        "title": "Direct Purchase Details",
                        "properties": {
                            "justification": { "type": "string", "title": "Justification for Direct Purchase" }
                        },
                        "required": ["justification"]
                    }
                )
                db.add(dp)
                await db.flush()
            procs_res = await db.execute(select(ProcurementManager))
            procs = list(procs_res.scalars())
            # Synchronize schema for existing methods
            for p_item in procs:
                if p_item.name == "GeM":
                    p_item.form_schema = {
                        "type": "object",
                        "title": "GeM Procurement Details",
                        "properties": {
                            "gem_link": { "type": "string", "title": "GeM Bid / RA Link" }
                        },
                        "required": ["gem_link"]
                    }
                elif p_item.name == "CPPP":
                    p_item.form_schema = {
                        "type": "object",
                        "title": "CPPP Procurement Details",
                        "properties": {
                            "tender_id": { "type": "string", "title": "CPPP Tender ID" },
                            "publication_date": { "type": "string", "title": "Publication Date (YYYY-MM-DD)" },
                            "gem_nac_attached": { "type": "boolean", "title": "GeM Non-Availability Certificate (NAC) Attached?" }
                        },
                        "required": ["tender_id"]
                    }
                elif p_item.name == "Limited Tender":
                    p_item.form_schema = {
                        "type": "object",
                        "title": "Limited Tender Details",
                        "properties": {
                            "gem_nac_attached": { "type": "boolean", "title": "GeM Non-Availability Certificate (NAC) Attached?" }
                        },
                        "required": []
                    }
                elif p_item.name == "Proprietary Purchase":
                    p_item.form_schema = {
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
                            "finance_concurrence_ref": { "type": "string", "title": "Finance Concurrence Reference" },
                            "gem_nac_attached": { "type": "boolean", "title": "GeM Non-Availability Certificate (NAC) Attached?" }
                        },
                        "required": ["manufacturer_name", "justification_type"]
                    }
                elif p_item.name == "Direct Purchase":
                    p_item.form_schema = {
                        "type": "object",
                        "title": "Direct Purchase Details",
                        "properties": {
                            "justification": { "type": "string", "title": "Justification for Direct Purchase" },
                            "gem_nac_attached": { "type": "boolean", "title": "GeM Non-Availability Certificate (NAC) Attached?" }
                        },
                        "required": ["justification"]
                    }
            await db.flush()

        # 6. Purchase Categories
        cat_check = await db.execute(select(PurchaseCategory).limit(1))
        has_cats = cat_check.scalar_one_or_none() is not None
        categories = {}
        if not has_cats:
            print("  Seeding purchase categories...")
            for proc in procs:
                if proc.name == "Direct Purchase":
                    cat1 = PurchaseCategory(
                        title=f"{proc.name}: Upto Rs. 25,000",
                        min_amount=1,
                        max_amount=25000,
                        is_active=True,
                        procurement_id=proc.id
                    )
                    db.add(cat1)
                    await db.flush()
                    categories[proc.id] = {"cat1": cat1}
                else:
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
                        title=f"{proc.name}: Rs. 10,00,001 and above",
                        min_amount=1_000_001,
                        max_amount=999_999_999,
                        is_active=True,
                        procurement_id=proc.id
                    )
                    db.add_all([cat1, cat2, cat3])
                    await db.flush()
                    categories[proc.id] = {"cat1": cat1, "cat2": cat2, "cat3": cat3}
        else:
            # Check and seed Direct Purchase category specifically if missing
            dp_res = await db.execute(select(ProcurementManager).where(ProcurementManager.name == "Direct Purchase"))
            dp = dp_res.scalar_one_or_none()
            if dp:
                dp_cat_res = await db.execute(select(PurchaseCategory).where(PurchaseCategory.procurement_id == dp.id))
                if not dp_cat_res.scalars().all():
                    dp_cat = PurchaseCategory(
                        title=f"{dp.name}: Upto Rs. 25,000",
                        min_amount=1,
                        max_amount=25000,
                        is_active=True,
                        procurement_id=dp.id
                    )
                    db.add(dp_cat)
                    await db.flush()
            
            cats_res = await db.execute(select(PurchaseCategory))
            for cat in cats_res.scalars():
                if cat.procurement_id not in categories:
                    categories[cat.procurement_id] = {}
                if cat.max_amount <= 25000 and cat.title.startswith("Direct Purchase"):
                    categories[cat.procurement_id]["cat1"] = cat
                elif cat.max_amount <= 100_000:
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

        # 9. Clear and Reseed Transactional & Budget Data
        if RESET_DEMO_DATA:
            print("🧹 Clearing previous transactional and budget data...")
            tables_to_truncate = [
                "asset_logs", "asset_movements", "assets", "payments", "discrepancies",
                "stores_asset_logs", "dept_asset_logs", "delivery_items", "deliveries",
                "bill_passings", "tender_cancellations", "po_cancellations", "pr_referrals",
                "purchase_request_assignments", "purchase_request_history", "purchase_request_flows",
                "technical_evaluations", "financial_evaluations", "commercial_evaluations",
                "documents", "purchase_request_items", "purchase_requests", "budget_master"
            ]
            try:
                await db.execute(text(f"TRUNCATE TABLE {', '.join(tables_to_truncate)} RESTART IDENTITY CASCADE;"))
                print("✓ Transactional tables cleared successfully.")
            except Exception as e:
                print(f"⚠ Failed to truncate tables via cascade: {e}. Trying simple delete...")
                for table in reversed(tables_to_truncate):
                    try:
                        await db.execute(text(f"DELETE FROM {table};"))
                        await db.execute(text(f"ALTER SEQUENCE IF EXISTS {table}_id_seq RESTART WITH 1;"))
                    except Exception as ex:
                        print(f"  Could not clear {table}: {ex}")

        # Update CSE department with committee experts
        faculty_expert1 = users.get("faculty1.cse@nitt.edu") or users.get("faculty.cse@nitt.edu")
        faculty_expert2 = users.get("faculty2.cse@nitt.edu") or faculty_expert1
        cse.expert1_id = faculty_expert1.id if faculty_expert1 else None
        cse.expert2_id = faculty_expert2.id if faculty_expert2 else None
        cse.director_faculty_id = faculty_expert2.id if faculty_expert2 else None
        db.add(cse)
        await db.flush()

        # Seed settings if not present
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
            await db.flush()

        # Seed designations if not present
        desig_check = await db.execute(select(Settings).where(Settings.key_name == "designations"))
        if not desig_check.scalar_one_or_none():
            default_desigs = "Assistant Professor,Associate Professor,Professor,Dean P&D (Budget),Dean P&D,Director,Registrar"
            db.add(Settings(key_name="designations", value=default_desigs))
            await db.flush()

        # Ensure E2E free budget files are visible/allocatable to the seeded faculty.
        # E2E test uses /api/budget/files and requires available_amount >= unit_cost, and
        # the budget file must be in the faculty's scoped list (allocated_initiator_id or referenced by PR).
        faculty_user = users.get("faculty.cse@nitt.edu")
        if faculty_user:
            await db.execute(
                text("""
                    UPDATE budget_master
                    SET allocated_initiator_id = :faculty_id
                    WHERE file_no LIKE '%/E2E/FREE-%'
                      AND allocated_initiator_id IS NULL
                """),
                {"faculty_id": faculty_user.id},
            )
            await db.flush()

        # Reseed 8 representative purchase requests at various stages of completion.
        # Default behavior is to preserve existing PRs (prevents "PR disappearance" during routine seeding).
        from app.models.purchase_request import PurchaseRequest
        if not RESET_DEMO_DATA:
            pr_exists = (await db.execute(select(PurchaseRequest.id).limit(1))).scalar_one_or_none()
            if pr_exists is not None:
                await db.commit()
                print("✅ Workflow/masters reseeded. Existing purchase requests preserved.")
                return

        print("🌱 Seeding 8 representative workflow-centric purchase requests...")
        from app.models.purchase_request import (
            PurchaseRequest,
            PurchaseRequestItem,
            PurchaseRequestFlow,
            PurchaseRequestHistory,
            RequestStatus,
            CommercialEvaluation,
            TechnicalEvaluation,
            FinancialEvaluation,
            PurchaseRequestAssignment,
            BillPassing,
            Document
        )
        from app.models.inventory import Delivery, DeliveryItem
        from app.models.asset import Asset

        faculty = users["faculty.cse@nitt.edu"]
        
        def seed_pac_file(pr_id: int, doc_key: str, original_name: str, filename: str):
            rel_path = f"attachments/{pr_id}/{filename}"
            abs_path = os.path.join(settings.STORAGE_PATH, rel_path)
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)
            with open(abs_path, "wb") as f:
                f.write(b"%PDF-1.4\n%mock PDF file for seeding\n%%EOF\n")
            return Document(
                purchase_request_id=pr_id,
                doc_key=doc_key,
                doc_value={"path": rel_path, "original_name": original_name},
                uploaded_by_id=faculty.id,
                updated_at=datetime.utcnow(),
            )

        faculty1 = users["faculty1.cse@nitt.edu"]
        faculty2 = users["faculty2.cse@nitt.edu"]
        hod = users["hod.cse@nitt.edu"]
        dean = users["dean.pd@nitt.edu"]
        director = users["director@nitt.edu"]
        sp = users["sp.stores@nitt.edu"]
        da = users["da.stores@nitt.edu"]

        # Helper function to get Category ID
        async def get_category(proc_id, amount):
            res = await db.execute(
                select(PurchaseCategory).where(
                    PurchaseCategory.procurement_id == proc_id,
                    PurchaseCategory.min_amount <= amount,
                    PurchaseCategory.max_amount >= amount
                )
            )
            return res.scalar_one()

        # Helper function to create PR
        async def create_seeded_pr(
            icr_number, proc_manager, amount, current_status,
            initiator, form_data, budget_item_name, budget_file_no,
            flow_phase=None, flow_step_order=None, budget_deduct=False
        ):
            # Create a budget master file for this PR
            bm = BudgetMaster(
                department_id=cse.id,
                financial_year_id=fy.id,
                source_of_fund="CAPEX" if amount > 100000 else "OPEX",
                item_name=budget_item_name,
                category="computer" if "server" in budget_item_name.lower() or "workstation" in budget_item_name.lower() else "equipment",
                course_code="CSE-SEED-" + icr_number.split("/")[-1],
                unit_cost=float(amount),
                quantity=1,
                total_allocation=float(amount),
                file_no=budget_file_no,
                is_revision=False,
                committed_amount=0.0 if budget_deduct else float(amount),
                utilized_amount=float(amount) if budget_deduct else 0.0,
                expert1_id=faculty1.id,
                expert2_id=faculty2.id,
                director_faculty_id=faculty2.id,
                allocated_initiator_id=initiator.id
            )
            db.add(bm)
            await db.flush()

            # Get Category
            cat = await get_category(proc_manager.id, amount)

            # Create PurchaseRequest
            pr = PurchaseRequest(
                icr_number=icr_number,
                category_id=cat.id,
                financial_year_id=fy.id,
                initiator_id=initiator.id,
                procurement_id=proc_manager.id,
                purchase_type="department",
                current_status=current_status,
                amount=amount,
                emd=2.0,
                performance_security=3.0,
                delivery_location="CSE Department, NIT Tiruchirappalli",
                delivery_mode="Door delivery",
                basis_of_estimate_details="Market survey and vendor quotations",
                faculty1_id=faculty1.id,
                faculty2_id=faculty2.id,
                faculty3_id=faculty2.id,
                form_data=form_data
            )
            db.add(pr)
            await db.flush()

            # Create PurchaseRequestItem
            pri = PurchaseRequestItem(
                purchase_request_id=pr.id,
                budget_file_id=bm.id,
                item_description=budget_item_name,
                quantity=1,
                estimated_total=amount,
                requirement_type="Research",
                availability="No",
                site_readiness=True,
                justification_for_procurement="This item is essential for departmental research lab infrastructure and student assignments.",
                installation_required=False,
                tech_specs_text="Standard specifications compliant with GFR 2017.",
            )
            db.add(pri)
            await db.flush()

            # Create initial submission history
            h1 = PurchaseRequestHistory(
                purchase_request_id=pr.id,
                current_approver_id=initiator.id,
                status="PR Submitted",
                remarks="Auto-advanced (PI is first assignee)" if flow_phase else "Initial submission of Purchase Indent.",
                acted_at=datetime.utcnow(),
                frozen_actor_name=initiator.name,
                frozen_designation=initiator.designation,
                frozen_department="Computer Science and Engineering",
            )
            db.add(h1)
            await db.flush()

            # Create flow record if active flow
            if flow_phase:
                flow = PurchaseRequestFlow(
                    purchase_request_id=pr.id,
                    phase_id=flow_phase.id,
                    step_order=flow_step_order,
                    rejected=False
                )
                db.add(flow)
                await db.flush()
                
            return pr, bm

        # Retrieve procurement methods
        gem_proc = (await db.execute(select(ProcurementManager).where(ProcurementManager.name == "GeM"))).scalar_one()
        cppp_proc = (await db.execute(select(ProcurementManager).where(ProcurementManager.name == "CPPP"))).scalar_one()
        lt_proc = (await db.execute(select(ProcurementManager).where(ProcurementManager.name == "Limited Tender"))).scalar_one()
        pac_proc = (await db.execute(select(ProcurementManager).where(ProcurementManager.name == "Proprietary Purchase"))).scalar_one()

        # Retrieve phases
        aa_phase = phases["AA"]
        td_phase = phases["TD"]
        te_phase = phases["TE"]
        fs_phase = phases["FS"]
        po_phase = phases["PO"]

        # PR 1 (Request Stage): GeM procurement, status pr_submitted
        pr1, bm1 = await create_seeded_pr(
            icr_number="ICR/CSE/2026-27/001",
            proc_manager=gem_proc,
            amount=80000.0,
            current_status="pr_submitted",
            initiator=faculty,
            form_data={"gem_link": "https://gem.gov.in/bid/GEM/2026/B/1001"},
            budget_item_name="GeM Consumables (Cat1)",
            budget_file_no="NITT/F.No.0001/OPEX/2026-27/CSE",
            flow_phase=None,
            flow_step_order=None
        )

        # PR 2 (AA Stage): CPPP procurement, status in_progress, HOD approval step
        pr2, bm2 = await create_seeded_pr(
            icr_number="ICR/CSE/2026-27/002",
            proc_manager=cppp_proc,
            amount=750000.0,
            current_status="in_progress",
            initiator=faculty,
            form_data={"tender_id": "CPPP/CSE/2026/02", "publication_date": "2026-05-01", "gem_nac_attached": True},
            budget_item_name="High-End Workstations (CPPP)",
            budget_file_no="NITT/F.No.0002/CAPEX/2026-27/CSE",
            flow_phase=aa_phase,
            flow_step_order=2
        )

        # PR 3 (Tendering Stage): Limited Tender, status in_progress, DA tender registration step
        pr3, bm3 = await create_seeded_pr(
            icr_number="ICR/CSE/2026-27/003",
            proc_manager=lt_proc,
            amount=450000.0,
            current_status="in_progress",
            initiator=faculty,
            form_data={"invited_vendors": "Vendor Alpha, Vendor Beta, Vendor Gamma", "gem_nac_attached": True},
            budget_item_name="Lab Equipment Kits (LT)",
            budget_file_no="NITT/F.No.0003/CAPEX/2026-27/CSE",
            flow_phase=td_phase,
            flow_step_order=2
        )
        # History for PR 3
        for actor_user, status_str, remarks_str in [
            (hod, "Approved", "Approved and forwarded to Dean."),
            (dean, "Approved", "Administratively approved."),
            (sp, "Forwarded to next phase", "Assigned to Dealing Assistant.")
        ]:
            db.add(PurchaseRequestHistory(
                purchase_request_id=pr3.id,
                current_approver_id=actor_user.id,
                status=status_str,
                remarks=remarks_str,
                acted_at=datetime.utcnow(),
                frozen_actor_name=actor_user.name,
                frozen_designation=actor_user.designation,
                frozen_department="Computer Science and Engineering" if actor_user.department_id else None
            ))
        # Assignment for PR 3
        db.add(PurchaseRequestAssignment(
            purchase_request_id=pr3.id,
            assigned_by_id=sp.id,
            assigned_da_id=da.id,
            status="pending"
        ))

        # PR 4 (Technical Evaluation Stage): Proprietary purchase, status in_progress, awaiting committee technical evaluation
        pr4, bm4 = await create_seeded_pr(
            icr_number="ICR/CSE/2026-27/004",
            proc_manager=pac_proc,
            amount=980000.0,
            current_status="in_progress",
            initiator=faculty,
            form_data={
                "manufacturer_name": "Keysight Technologies",
                "manufacturer_address": "Bengaluru",
                "justification_type": "sole_manufacturer",
                "finance_concurrence_ref": "FC/2026/001",
                "gem_nac_attached": True
            },
            budget_item_name="Keysight Spectrum Analyzer (PAC)",
            budget_file_no="NITT/F.No.0004/CAPEX/2026-27/CSE",
            flow_phase=te_phase,
            flow_step_order=1
        )
        pr4.tender_reference_number = "PAC/CSE/2026/04"
        pr4.date_of_tender = date(2026, 5, 10)
        pr4.date_of_tech_bid_opening = date(2026, 5, 20)
        pr4.date_of_financial_bid_opening = date(2026, 5, 22)
        pr4.te_initiated_at = datetime.utcnow()
        db.add(pr4)
        db.add(seed_pac_file(pr4.id, "dept_pac_file", "dept_pac_form.pdf", "dummy_dept_pac.pdf"))
        db.add(seed_pac_file(pr4.id, "oem_pac_file", "oem_pac_certificate.pdf", "dummy_oem_pac.pdf"))
        db.add(seed_pac_file(pr4.id, "oem_auth_file", "oem_authorization.pdf", "dummy_oem_auth.pdf"))
        # Commercial evaluation for PR 4
        db.add(CommercialEvaluation(
            purchase_request_id=pr4.id,
            vendor_name="Keysight Technologies India Pvt. Ltd.",
            vendor_email="sales@keysight.com",
            is_qualified=True,
            remarks="OEM Manufacturer bid registered."
        ))
        # History for PR 4
        for actor_user, status_str, remarks_str in [
            (hod, "Approved", "Approved by HOD."),
            (dean, "Approved", "Approved by Dean P&D."),
            (sp, "Forwarded to next phase", "Tender registration assigned."),
            (da, "Tender Details Registered", "Tender details and OEM bidder registered.")
        ]:
            db.add(PurchaseRequestHistory(
                purchase_request_id=pr4.id,
                current_approver_id=actor_user.id,
                status=status_str,
                remarks=remarks_str,
                acted_at=datetime.utcnow(),
                frozen_actor_name=actor_user.name,
                frozen_designation=actor_user.designation,
            ))

        # PR 5 (Financial Sanction Stage): Limited Tender, status in_progress, awaiting initiator financial bid entries
        pr5, bm5 = await create_seeded_pr(
            icr_number="ICR/CSE/2026-27/005",
            proc_manager=lt_proc,
            amount=1500000.0,
            current_status="in_progress",
            initiator=faculty,
            form_data={"invited_vendors": "Alpha Tech, Beta Eng, Gamma Systems", "gem_nac_attached": True},
            budget_item_name="GPU Server Nodes (LT)",
            budget_file_no="NITT/F.No.0005/CAPEX/2026-27/CSE",
            flow_phase=fs_phase,
            flow_step_order=1
        )
        pr5.tender_reference_number = "LTE/CSE/2026/05"
        pr5.date_of_tender = date(2026, 5, 5)
        pr5.date_of_tech_bid_opening = date(2026, 5, 15)
        pr5.date_of_financial_bid_opening = date(2026, 5, 18)
        db.add(pr5)
        # Commercial evaluations for PR 5
        db.add(CommercialEvaluation(purchase_request_id=pr5.id, vendor_name="Alpha Tech", vendor_email="info@alphatech.com", is_qualified=True))
        db.add(CommercialEvaluation(purchase_request_id=pr5.id, vendor_name="Beta Eng", vendor_email="sales@betaeng.com", is_qualified=True))
        # Technical evaluations for PR 5
        db.add(TechnicalEvaluation(purchase_request_id=pr5.id, vendor_name="Alpha Tech", is_qualified=True, remarks="Complies with technical requirements"))
        db.add(TechnicalEvaluation(purchase_request_id=pr5.id, vendor_name="Beta Eng", is_qualified=True, remarks="Complies with technical requirements"))
        # History for PR 5
        for actor_user, status_str, remarks_str in [
            (hod, "Approved", "Approved by HOD."),
            (dean, "Approved", "Approved by Dean."),
            (director, "Approved", "Approved by Director."),
            (da, "Tender Details Registered", "Tender details and bidders registered."),
            (hod, "Technical Evaluation Approved", "Committee signs TE phase."),
            (faculty1, "Technical Evaluation Approved", "Expert 1 signs."),
            (faculty2, "Technical Evaluation Approved", "Expert 2 signs."),
            (dean, "Technical Evaluation Phase Completed", "Dean certifies TE phase completed.")
        ]:
            db.add(PurchaseRequestHistory(
                purchase_request_id=pr5.id,
                current_approver_id=actor_user.id,
                status=status_str,
                remarks=remarks_str,
                acted_at=datetime.utcnow(),
                frozen_actor_name=actor_user.name,
                frozen_designation=actor_user.designation,
            ))

        # PR 6 (Purchase Order Stage): GeM procurement, status in_progress, awaiting HOD PO signature
        pr6, bm6 = await create_seeded_pr(
            icr_number="ICR/CSE/2026-27/006",
            proc_manager=gem_proc,
            amount=600000.0,
            current_status="in_progress",
            initiator=faculty,
            form_data={"gem_link": "https://gem.gov.in/bid/GEM/2026/B/1006"},
            budget_item_name="Office Workstations (GeM)",
            budget_file_no="NITT/F.No.0006/CAPEX/2026-27/CSE",
            flow_phase=po_phase,
            flow_step_order=1
        )
        pr6.tender_reference_number = "GEM/CSE/2026/06"
        pr6.date_of_tender = date(2026, 5, 1)
        db.add(pr6)
        # Commercial & Technical evaluations for PR 6
        db.add(CommercialEvaluation(purchase_request_id=pr6.id, vendor_name="Alpha Technologies Pvt. Ltd.", is_qualified=True))
        db.add(TechnicalEvaluation(purchase_request_id=pr6.id, vendor_name="Alpha Technologies Pvt. Ltd.", is_qualified=True))
        # Financial evaluations L1 for PR 6
        db.add(FinancialEvaluation(
            purchase_request_id=pr6.id,
            vendor_name="Alpha Technologies Pvt. Ltd.",
            quoted_amount=550000.0,
            ranking="L1",
            is_awarded=True,
            remarks="L1 bidder accepted."
        ))
        # History for PR 6
        for actor_user, status_str, remarks_str in [
            (hod, "Approved", "Approved."),
            (dean, "Approved", "Approved."),
            (da, "Tender Details Registered", "Registered bid."),
            (dean, "Technical Evaluation Phase Completed", "TE completed."),
            (dean, "Financial Sanction Approved", "FS completed.")
        ]:
            db.add(PurchaseRequestHistory(
                purchase_request_id=pr6.id,
                current_approver_id=actor_user.id,
                status=status_str,
                remarks=remarks_str,
                acted_at=datetime.utcnow(),
                frozen_actor_name=actor_user.name,
                frozen_designation=actor_user.designation,
            ))

        # PR 7 (Delivery Stage): LPC procurement, status po_issued, awaiting GRN receipt logging
        pr7, bm7 = await create_seeded_pr(
            icr_number="ICR/CSE/2026-27/007",
            proc_manager=lt_proc,
            amount=50000.0,
            current_status="po_issued",
            initiator=faculty,
            form_data={"invited_vendors": "Local Furniture Vendor", "gem_nac_attached": True},
            budget_item_name="LPC Lab Furniture",
            budget_file_no="NITT/F.No.0007/OPEX/2026-27/CSE",
            flow_phase=None,
            flow_step_order=None
        )
        pr7.po_approved_at = datetime.utcnow()
        db.add(pr7)
        # History for PR 7
        for actor_user, status_str, remarks_str in [
            (hod, "Approved", "Approved."),
            (da, "PO Registered", "PO reference GEM-PO-1007 generated.")
        ]:
            db.add(PurchaseRequestHistory(
                purchase_request_id=pr7.id,
                current_approver_id=actor_user.id,
                status=status_str,
                remarks=remarks_str,
                acted_at=datetime.utcnow(),
                frozen_actor_name=actor_user.name,
                frozen_designation=actor_user.designation,
            ))
        # Pending delivery record for PR 7
        d7 = Delivery(
            po_id=pr7.id,
            challan_number="CH-2026-77",
            invoice_number="INV-2026-77",
            department_id=cse.id,
            status="pending",
            created_at=datetime.utcnow()
        )
        db.add(d7)
        await db.flush()
        db.add(DeliveryItem(
            delivery_id=d7.id,
            name="LPC Lab Furniture",
            category="furniture",
            challan_quantity=1,
            unit_price=50000.0
        ))

        # PR 8 (Asset Registration Stage): Proprietary purchase, status completed, with assets generated
        pr8, bm8 = await create_seeded_pr(
            icr_number="ICR/CSE/2026-27/008",
            proc_manager=pac_proc,
            amount=2400000.0,
            current_status="completed",
            initiator=faculty,
            form_data={
                "manufacturer_name": "Thermo Fisher Scientific",
                "manufacturer_address": "Mumbai",
                "justification_type": "sole_manufacturer",
                "gem_nac_attached": True
            },
            budget_item_name="Mass Spectrometer System (PAC)",
            budget_file_no="NITT/F.No.0008/CAPEX/2026-27/CSE",
            flow_phase=None,
            flow_step_order=None,
            budget_deduct=True
        )
        pr8.po_approved_at = datetime.utcnow()
        db.add(pr8)
        db.add(seed_pac_file(pr8.id, "dept_pac_file", "dept_pac_form.pdf", "dummy_dept_pac.pdf"))
        db.add(seed_pac_file(pr8.id, "oem_pac_file", "oem_pac_certificate.pdf", "dummy_oem_pac.pdf"))
        db.add(seed_pac_file(pr8.id, "oem_auth_file", "oem_authorization.pdf", "dummy_oem_auth.pdf"))
        # History for PR 8
        for actor_user, status_str, remarks_str in [
            (hod, "Approved", "Approved by HOD."),
            (dean, "Approved", "Approved by Dean P&D."),
            (director, "Approved", "Approved by Director."),
            (da, "Tender Details Registered", "Registered proprietary tender."),
            (hod, "Technical Evaluation Approved", "TSC completed."),
            (dean, "Financial Sanction Approved", "FS completed."),
            (da, "PO Dispatched", "PO issued to Thermo Fisher."),
            (hod, "Goods Received", "Delivered item received and logged in department."),
            (da, "Bill Passed (PR Completed)", "Passed payment invoice.")
        ]:
            db.add(PurchaseRequestHistory(
                purchase_request_id=pr8.id,
                current_approver_id=actor_user.id,
                status=status_str,
                remarks=remarks_str,
                acted_at=datetime.utcnow(),
                frozen_actor_name=actor_user.name,
                frozen_designation=actor_user.designation,
            ))
        # Verified delivery record for PR 8
        d8 = Delivery(
            po_id=pr8.id,
            challan_number="CH-2026-88",
            invoice_number="INV-2026-88",
            department_id=cse.id,
            status="verified",
            received_date=datetime.utcnow(),
            created_at=datetime.utcnow()
        )
        db.add(d8)
        await db.flush()
        di8 = DeliveryItem(
            delivery_id=d8.id,
            name="Mass Spectrometer System",
            category="equipment",
            challan_quantity=1,
            unit_price=2400000.0
        )
        db.add(di8)
        await db.flush()
        # Bill passing certificate for PR 8
        db.add(BillPassing(
            purchase_request_id=pr8.id,
            invoice_number="INV-2026-88",
            invoice_date=datetime.utcnow(),
            bill_amount=2400000.0,
            gst_amount=432000.0,
            payment_terms="Immediate",
            remarks="Equipment received and verified. Bill passed to finance.",
            passed_by_id=da.id
        ))
        # Registered asset for PR 8
        db.add(Asset(
            asset_tag="NITT-CSE-2026-0001",
            name="Mass Spectrometer System",
            category="lab_equipment",
            department_id=cse.id,
            building="CSE Building",
            room="Research Lab 2",
            custodian="Dr. A. Kumar",
            serial_number="MS-998877",
            condition="working",
            purchase_date=date(2026, 6, 1),
            unit_cost=2400000.0,
            delivery_item_id=di8.id,
            created_at=datetime.utcnow()
        ))

        # Seed 4 free budget files for E2E testing
        for i, (item_name, amount) in enumerate([
            ("E2E Free Budget Cat1", 80000.0),
            ("E2E Free Budget Cat1 HOD", 50000.0),
            ("E2E Free Budget Cat2", 450000.0),
            ("E2E Free Budget Cat3", 1500000.0),
        ]):
            db.add(BudgetMaster(
                department_id=cse.id,
                financial_year_id=fy.id,
                source_of_fund="CAPEX" if amount > 100000 else "OPEX",
                item_name=item_name,
                category="equipment",
                course_code=f"CSE-E2E-{i}",
                unit_cost=float(amount),
                quantity=1,
                total_allocation=float(amount),
                file_no=f"NITT/F.No.{9000+i:04d}/CAPEX/2026-27/CSE",
                is_revision=False,
                committed_amount=0.0,
                utilized_amount=0.0,
                allocated_initiator_id=faculty.id,
                expert1_id=faculty1.id,
                expert2_id=faculty2.id,
                director_faculty_id=faculty2.id
            ))
        await db.flush()

        await db.commit()
        print("✅ Database verification and seeding process completed successfully!")



async def main():
    await create_tables()
    await seed()


if __name__ == "__main__":
    asyncio.run(main())
