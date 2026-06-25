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
from app.models.administrative_approval import AdministrativeApprovalWorkflow
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
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS project_code VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS principal_investigator VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS project_due_date DATE;"))
        await conn.execute(text("ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;"))
        await conn.execute(text("ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS attachment_path VARCHAR(512);"))
        await conn.execute(text("ALTER TABLE administrative_approvals ADD COLUMN IF NOT EXISTS sub_procurement_method VARCHAR(20);"))

        # committee_size on workflow steps: controls how many members must sign at tech_evaluation
        await conn.execute(text("ALTER TABLE workflow_hierarchies ADD COLUMN IF NOT EXISTS committee_size INTEGER;"))
        # Populate committee_size for existing tech_evaluation steps based on category amount ranges:
        #   Cat1 (max_amount <= 10L)  -> 1 (1 HOD Expert)
        #   Cat2 (max_amount <= 30L)  -> 2 (2 HOD Experts)
        #   Cat3 (max_amount > 30L)   -> 3 (2 HOD Experts + 1 Director Nominee)
        await conn.execute(text("""
            UPDATE workflow_hierarchies wh
            SET committee_size = CASE
                WHEN pc.max_amount IS NULL OR pc.max_amount > 3000000 THEN 3
                WHEN pc.max_amount > 1000000 THEN 2
                ELSE 1
            END
            FROM purchase_categories pc
            WHERE wh.category_id = pc.id
              AND wh.user_type = 'tech_evaluation'
              AND wh.committee_size IS NULL
        """))

        # Commercial evaluation tech-assessment fields (filled by PI at TE Step 1)
        await conn.execute(text("ALTER TABLE commercial_evaluations ADD COLUMN IF NOT EXISTS emd_status VARCHAR(50);"))
        await conn.execute(text("ALTER TABLE commercial_evaluations ADD COLUMN IF NOT EXISTS msme_status VARCHAR(50);"))
        await conn.execute(text("ALTER TABLE commercial_evaluations ADD COLUMN IF NOT EXISTS oem_status VARCHAR(50);"))
        await conn.execute(text("ALTER TABLE commercial_evaluations ADD COLUMN IF NOT EXISTS mii_class VARCHAR(50);"))
        await conn.execute(text("ALTER TABLE commercial_evaluations ADD COLUMN IF NOT EXISTS land_border_status VARCHAR(50);"))
        await conn.execute(text("ALTER TABLE commercial_evaluations ADD COLUMN IF NOT EXISTS tech_status VARCHAR(20);"))

        # ── Workflow step ordering migration ──────────────────────────────────
        # TE Phase: Insert PI data-entry step BEFORE the tech_evaluation committee step.
        # Old config: Step 1 = tech_evaluation (committee)
        # New config: Step 1 = purchase_initiator (PI), Step 2 = tech_evaluation (committee)
        # Idempotent: only runs when step 1 is still tech_evaluation.
        await conn.execute(text("""
            WITH te_old_combos AS (
                SELECT DISTINCT category_id, phase_id, procurement_id, purchase_type, source_of_fund_id
                FROM workflow_hierarchies
                WHERE phase_id = (SELECT id FROM phase_managers WHERE phase_name = 'Technical Evaluation' LIMIT 1)
                  AND step_order = 1
                  AND user_type = 'tech_evaluation'
            )
            UPDATE workflow_hierarchies wh
            SET step_order = wh.step_order + 1
            FROM te_old_combos tc
            WHERE wh.phase_id = tc.phase_id
              AND wh.category_id = tc.category_id
              AND wh.procurement_id = tc.procurement_id
              AND wh.purchase_type = tc.purchase_type
              AND wh.source_of_fund_id IS NOT DISTINCT FROM tc.source_of_fund_id
        """))
        await conn.execute(text("""
            INSERT INTO workflow_hierarchies
              (category_id, phase_id, procurement_id, step_order, user_type, user_group, role_id, purchase_type, is_enabled, source_of_fund_id)
            SELECT DISTINCT
              wh.category_id, wh.phase_id, wh.procurement_id,
              1, 'purchase_initiator', 'faculty',
              (SELECT id FROM role_managers WHERE value = 'faculty' LIMIT 1),
              wh.purchase_type, true, wh.source_of_fund_id
            FROM workflow_hierarchies wh
            WHERE wh.phase_id = (SELECT id FROM phase_managers WHERE phase_name = 'Technical Evaluation' LIMIT 1)
              AND wh.step_order = 2
              AND wh.user_type = 'tech_evaluation'
              AND NOT EXISTS (
                SELECT 1 FROM workflow_hierarchies x
                WHERE x.phase_id = wh.phase_id
                  AND x.category_id = wh.category_id
                  AND x.procurement_id = wh.procurement_id
                  AND x.purchase_type = wh.purchase_type
                  AND x.source_of_fund_id IS NOT DISTINCT FROM wh.source_of_fund_id
                  AND x.step_order = 1
                  AND x.user_type = 'purchase_initiator'
              )
        """))

        # FS Phase: Insert DA amount-entry step BEFORE the purchase_initiator ranking step.
        # Old config: Step 1 = purchase_initiator (PI)
        # New config: Step 1 = verifier_da (DA), Step 2 = purchase_initiator (PI)
        # Idempotent: only runs when step 1 is still purchase_initiator (no verifier_da at step 1).
        await conn.execute(text("""
            WITH fs_old_combos AS (
                SELECT DISTINCT category_id, phase_id, procurement_id, purchase_type, source_of_fund_id
                FROM workflow_hierarchies
                WHERE phase_id = (SELECT id FROM phase_managers WHERE phase_name = 'Financial Sanction' LIMIT 1)
                  AND step_order = 1
                  AND user_type = 'purchase_initiator'
                  AND NOT EXISTS (
                    SELECT 1 FROM workflow_hierarchies x2
                    WHERE x2.phase_id = (SELECT id FROM phase_managers WHERE phase_name = 'Financial Sanction' LIMIT 1)
                      AND x2.category_id = workflow_hierarchies.category_id
                      AND x2.procurement_id = workflow_hierarchies.procurement_id
                      AND x2.purchase_type = workflow_hierarchies.purchase_type
                      AND x2.source_of_fund_id IS NOT DISTINCT FROM workflow_hierarchies.source_of_fund_id
                      AND x2.step_order = 1
                      AND x2.user_type = 'verifier_da'
                  )
            )
            UPDATE workflow_hierarchies wh
            SET step_order = wh.step_order + 1
            FROM fs_old_combos fc
            WHERE wh.phase_id = fc.phase_id
              AND wh.category_id = fc.category_id
              AND wh.procurement_id = fc.procurement_id
              AND wh.purchase_type = fc.purchase_type
              AND wh.source_of_fund_id IS NOT DISTINCT FROM fc.source_of_fund_id
        """))
        await conn.execute(text("""
            INSERT INTO workflow_hierarchies
              (category_id, phase_id, procurement_id, step_order, user_type, user_group, role_id, purchase_type, is_enabled, source_of_fund_id)
            SELECT DISTINCT
              wh.category_id, wh.phase_id, wh.procurement_id,
              1, 'verifier_da', 'verifier_da',
              (SELECT id FROM role_managers WHERE value = 'dealing_assistant' LIMIT 1),
              wh.purchase_type, true, wh.source_of_fund_id
            FROM workflow_hierarchies wh
            WHERE wh.phase_id = (SELECT id FROM phase_managers WHERE phase_name = 'Financial Sanction' LIMIT 1)
              AND wh.step_order = 2
              AND wh.user_type = 'purchase_initiator'
              AND NOT EXISTS (
                SELECT 1 FROM workflow_hierarchies x
                WHERE x.phase_id = wh.phase_id
                  AND x.category_id = wh.category_id
                  AND x.procurement_id = wh.procurement_id
                  AND x.purchase_type = wh.purchase_type
                  AND x.source_of_fund_id IS NOT DISTINCT FROM wh.source_of_fund_id
                  AND x.step_order = 1
                  AND x.user_type = 'verifier_da'
              )
        """))

        # Update existing purchase categories for cat3 bounds
        await conn.execute(text("UPDATE purchase_categories SET max_amount = 999999999, title = REPLACE(title, 'Rs. 10,00,001 to Rs. 30,00,000', 'Rs. 10,00,001 and above') WHERE title LIKE '%Rs. 10,00,001 to Rs. 30,00,000%';"))

        # Rename purchase_type values: department→research, office→others
        await conn.execute(text("UPDATE purchase_requests SET purchase_type = 'research' WHERE purchase_type = 'department';"))
        await conn.execute(text("UPDATE purchase_requests SET purchase_type = 'others' WHERE purchase_type = 'office';"))
        await conn.execute(text("UPDATE workflow_hierarchies SET purchase_type = 'research' WHERE purchase_type = 'department';"))
        await conn.execute(text("UPDATE workflow_hierarchies SET purchase_type = 'others' WHERE purchase_type = 'office';"))
        await conn.execute(text("UPDATE workflow_hierarchies SET skip_condition = REPLACE(skip_condition, '''department''', '''research''') WHERE skip_condition LIKE '%''department''%';"))
        await conn.execute(text("UPDATE workflow_hierarchies SET skip_condition = REPLACE(skip_condition, '''office''', '''others''') WHERE skip_condition LIKE '%''office''%';"))
        await conn.execute(text("UPDATE administrative_approval_workflows SET purchase_type = 'research' WHERE purchase_type = 'department';"))
        await conn.execute(text("UPDATE administrative_approval_workflows SET purchase_type = 'others' WHERE purchase_type = 'office';"))
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

        # Data migration: rename first PR workflow phase from "Administrative Approval"
        # to "Indent and Detailed Tech Specification" to distinguish it from the
        # standalone Administrative Approval module.
        await conn.execute(text("""
            UPDATE phase_managers
            SET phase_name = 'Indent and Detailed Tech Specification',
                description = 'Purchase indent and detailed technical specification approval'
            WHERE phase_name = 'Administrative Approval' AND phase_order = 1;
        """))

        # Create administrative_approval_workflows table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS administrative_approval_workflows (
                id SERIAL PRIMARY KEY,
                step_order INTEGER NOT NULL,
                role_id INTEGER REFERENCES role_managers(id) ON DELETE SET NULL,
                user_group VARCHAR(100),
                is_enabled BOOLEAN NOT NULL DEFAULT TRUE
            );
        """))

        # Dynamic Nominees and workflows migrations
        await conn.execute(text("ALTER TABLE budget_master ADD COLUMN IF NOT EXISTS nominee_ids JSONB;"))
        await conn.execute(text("ALTER TABLE administrative_approval_workflows ADD COLUMN IF NOT EXISTS skip_condition VARCHAR(500);"))
        await conn.execute(text("ALTER TABLE administrative_approval_workflows ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES purchase_categories(id) ON DELETE CASCADE;"))
        await conn.execute(text("ALTER TABLE administrative_approval_workflows ADD COLUMN IF NOT EXISTS procurement_id INTEGER REFERENCES procurement_managers(id) ON DELETE CASCADE;"))
        await conn.execute(text("ALTER TABLE administrative_approval_workflows ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(50);"))
        await conn.execute(text("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS committee_nominee_ids JSONB;"))

        # Create notifications table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                link VARCHAR(512),
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
            );
        """))
    print("✓ Database tables verified/created")



async def seed():
    async with SessionLocal() as db:
        print("🌱 Checking database state for seeding...")

        # Skip seeding if users already exist to preserve user data
        try:
            user_check = await db.execute(select(User).limit(1))
            has_users = user_check.scalar_one_or_none() is not None
        except Exception:
            has_users = False

        if has_users and not RESET_DEMO_DATA:
            aa_wf_check = await db.execute(select(AdministrativeApprovalWorkflow).limit(1))
            if aa_wf_check.scalar_one_or_none() is None:
                print("  Seeding default Administrative Approval workflow steps...")
                roles_res = await db.execute(select(RoleManager))
                roles = {r.value: r for r in roles_res.scalars()}
                proc_res = await db.execute(select(ProcurementManager))
                procs = proc_res.scalars().all()
                cat_res = await db.execute(select(PurchaseCategory))
                cats = cat_res.scalars().all()
                seeded_aa_count = 0
                # Global default catch-all steps (null/null/null)
                for step_order, group, role_key in [
                    (1, "HOD", "hod"), (2, "ADPD", "adpd"), (3, "Dean", "dean_pd"),
                    (4, "IA", "ia"), (5, "Director", "director"),
                ]:
                    role = roles.get(role_key)
                    db.add(AdministrativeApprovalWorkflow(
                        category_id=None, procurement_id=None, purchase_type=None,
                        step_order=step_order, user_group=group,
                        role_id=role.id if role else None
                    ))
                    seeded_aa_count += 1
                # Category-specific research steps (used by AA engine; others rows ignored)
                for proc in procs:
                    for cat in cats:
                        if cat.procurement_id != proc.id:
                            continue
                        for step_order, group, role_key in [
                            (1, "HOD", "hod"), (2, "ADPD", "adpd"), (3, "Dean", "dean_pd"),
                            (4, "IA", "ia"), (5, "Director", "director"),
                        ]:
                            role = roles.get(role_key)
                            db.add(AdministrativeApprovalWorkflow(
                                category_id=cat.id, procurement_id=proc.id,
                                purchase_type="research", step_order=step_order,
                                user_group=group, role_id=role.id if role else None
                            ))
                            seeded_aa_count += 1
                if seeded_aa_count:
                    await db.commit()
                    print(f"  Seeded {seeded_aa_count} default Administrative Approval workflow steps in already populated DB.")
            print("✓ Database is already populated. Skipping seeding to preserve user data.")
            return

        # 1. Departments and Users from CSV
        import csv
        import re

        # Delete existing transactional and budget data to prevent FK violations
        tables_to_delete = [
            "asset_logs", "asset_movements", "assets", "payments", "discrepancies",
            "stores_asset_logs", "dept_asset_logs", "delivery_items", "deliveries",
            "bill_passings", "tender_cancellations", "po_cancellations", "pr_referrals",
            "purchase_request_assignments", "purchase_request_history", "purchase_request_flows",
            "technical_evaluations", "financial_evaluations", "commercial_evaluations",
            "documents", "purchase_request_items", "purchase_requests",
            "administrative_approval_history", "administrative_approvals", "budget_master"
        ]
        for table in tables_to_delete:
            await db.execute(text(f"DELETE FROM {table};"))
        await db.execute(text("DELETE FROM users CASCADE;"))
        await db.execute(text("DELETE FROM departments CASCADE;"))
        await db.flush()

        # Parse CSVs to find unique departments
        depts_dict = {}  # department_name -> short_code
        hods_dict = {}   # department_name -> (name, email)
        
        hods_csv_path = "/app/Data_Of_Users/Hods.csv"
        if os.path.exists(hods_csv_path):
            with open(hods_csv_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    name = row["Name"].strip()
                    dept = row["Department"].strip()
                    email = row["Email"].strip().lower()
                    m = re.match(r"hod([a-zA-Z]+)@", email)
                    code = m.group(1).upper() if m else dept[:4].upper()
                    depts_dict[dept] = code
                    hods_dict[dept] = (name, email)

        faculty_csv_path = "/app/Data_Of_Users/Faculty.csv"
        faculty_list = []
        if os.path.exists(faculty_csv_path):
            with open(faculty_csv_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    name = row["Name"].strip()
                    email = row["Email"].strip().lower()
                    dept = row["Department"].strip()
                    faculty_list.append((name, email, dept))
                    if dept not in depts_dict:
                        code = "".join(w[0] for w in dept.split() if w[0].isalnum()).upper()
                        if not code:
                            code = dept[:3].upper()
                        depts_dict[dept] = code

        deans_csv_path = "/app/Data_Of_Users/Deans.csv"
        deans_list = []
        if os.path.exists(deans_csv_path):
            with open(deans_csv_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    name_key = next((k for k in row.keys() if "name" in k.lower()), "Name")
                    name = row[name_key].strip()
                    dept = row["Department"].strip()
                    email = row["Email"].strip().lower()
                    deans_list.append((name, email, dept))

        dir_reg_csv_path = "/app/Data_Of_Users/Director and Registrar.csv"
        dir_reg_list = []
        if os.path.exists(dir_reg_csv_path):
            with open(dir_reg_csv_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    name = row["Name"].strip()
                    dept = row["Department"].strip()
                    email = row["Email"].strip().lower()
                    dir_reg_list.append((name, email, dept))

        # Seed departments
        seeded_depts = {}
        for name, code in depts_dict.items():
            dept = Department(name=name, short_code=code)
            db.add(dept)
            seeded_depts[name] = dept
        
        # Ensure CSE exists
        if "Computer Science and Engineering" not in seeded_depts:
            dept = Department(name="Computer Science and Engineering", short_code="CSE")
            db.add(dept)
            seeded_depts["Computer Science and Engineering"] = dept
            
        await db.flush()
        cse = seeded_depts["Computer Science and Engineering"]

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
                ("Internal Auditor", "ia", "internal_audit"),
                ("Director", "director", "apex_approver"),
                ("Registrar", "registrar", "apex_approver"),
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
            if "registrar" not in roles:
                r = RoleManager(name="Registrar", value="registrar", group_key="apex_approver")
                db.add(r)
                await db.flush()
                roles["registrar"] = r
            if "ia" not in roles:
                r = RoleManager(name="Internal Auditor", value="ia", group_key="internal_audit")
                db.add(r)
                await db.flush()
                roles["ia"] = r

        # 3. Seed Users
        # Seed system/test accounts
        system_users_spec = [
            ("Mr.", "Administrator", "admin@nitt.edu", "System Administrator", "male", "admin", None),
            ("Mr.", "L. Superintendent", "sp.stores@nitt.edu", "Superintendent S&P", "male", "superintendent", None),
            ("Mr.", "K. DA Stores", "da.stores@nitt.edu", "Dealing Assistant", "male", "dealing_assistant", None),
            ("Mr.", "M. Consultant", "consultant.stores@nitt.edu", "Consultant S&P", "male", "consultant_sp", None),
            ("Mr.", "N. Asst Registrar", "ar.stores@nitt.edu", "Assistant Registrar", "male", "assistant_registrar", None),
            ("Mr.", "O. Dy Registrar", "dr.stores@nitt.edu", "Deputy Registrar", "male", "deputy_registrar", None),
            ("Dr.", "P. Associate Dean", "vg.pd@nitt.edu", "Associate Dean P&D", "male", "adpd", None),
            ("Prof.", "Q. Dean Budget", "dean.budget@nitt.edu", "Dean P&D (Budget)", "male", "dean_pd", None),
            ("Dr.", "A. Kumar", "faculty.cse@nitt.edu", "Assistant Professor", "male", "faculty", cse),
            ("Dr.", "B. Prasad", "faculty1.cse@nitt.edu", "Assistant Professor", "male", "faculty", cse),
            ("Dr.", "C. Singh", "faculty2.cse@nitt.edu", "Assistant Professor", "male", "faculty", cse),
            ("Prof.", "D. Rajan", "hod.cse@nitt.edu", "Head of Department", "male", "hod", cse),
            ("Prof.", "H. Dean", "dean.pd@nitt.edu", "Dean P&D", "male", "dean_pd", None),
            ("Mr.", "I. Auditor", "ia@nitt.edu", "Internal Auditor", "male", "ia", None),
        ]
        
        users = {}
        for title, name, email, desig, gender, role_val, dept in system_users_spec:
            u = User(
                title=title,
                name=name,
                email=email.lower(),
                hashed_password=DEMO_PASSWORD,
                designation=desig,
                gender=gender,
                role_id=roles[role_val].id,
                department_id=dept.id if dept else None,
                is_active=True,
                is_approved=True,
            )
            db.add(u)
            users[email.lower()] = u
        await db.flush()

        def parse_name_title(full_name: str):
            full_name = full_name.strip()
            prefixes = ["Dr. (Mrs.)", "Dr.", "Prof.", "Mr.", "Mrs.", "Ms."]
            for prefix in prefixes:
                if full_name.startswith(prefix):
                    return prefix, full_name[len(prefix):].strip()
            return "Mr.", full_name

        # Director & Registrar
        for name, email, dept_name in dir_reg_list:
            email_lower = email.lower()
            if email_lower in users:
                continue
            title, name_clean = parse_name_title(name)
            role_val = "director" if "director" in dept_name.lower() or "director" in email_lower else "registrar"
            desig = "Director" if role_val == "director" else "Registrar"
            u = User(
                title=title,
                name=name_clean,
                email=email_lower,
                hashed_password=DEMO_PASSWORD,
                designation=desig,
                gender="female" if "aghila" in name.lower() else "male",
                role_id=roles[role_val].id,
                department_id=None,
                is_active=True,
                is_approved=True,
            )
            db.add(u)
            users[email_lower] = u
        await db.flush()

        # Deans
        for name, email, dept_name in deans_list:
            email_lower = email.lower()
            if email_lower in users:
                continue
            title, name_clean = parse_name_title(name)
            u = User(
                title=title,
                name=name_clean,
                email=email_lower,
                hashed_password=DEMO_PASSWORD,
                designation=f"Dean ({dept_name})",
                gender="female" if "premalatha" in name.lower() or "uma" in name.lower() else "male",
                role_id=roles["dean_pd"].id,
                department_id=None,
                is_active=True,
                is_approved=True,
            )
            db.add(u)
            users[email_lower] = u
        await db.flush()

        # HODs
        for dept_name, (name, email) in hods_dict.items():
            email_lower = email.lower()
            if email_lower in users:
                continue
            title, name_clean = parse_name_title(name)
            dept = seeded_depts.get(dept_name)
            u = User(
                title=title,
                name=name_clean,
                email=email_lower,
                hashed_password=DEMO_PASSWORD,
                designation="Head of Department",
                gender="female" if "rajeswari" in name.lower() or "nagalakshmi" in name.lower() or "sridevi" in name.lower() or "jayalekshmi" in name.lower() else "male",
                role_id=roles["hod"].id,
                department_id=dept.id if dept else None,
                is_active=True,
                is_approved=True,
            )
            db.add(u)
            users[email_lower] = u
        await db.flush()

        # Faculty
        for name, email, dept_name in faculty_list:
            email_lower = email.lower()
            if email_lower in users:
                continue
            title, name_clean = parse_name_title(name)
            dept = seeded_depts.get(dept_name)
            
            is_hod_user = any(h[1] == email_lower for h in hods_dict.values())
            if is_hod_user:
                continue

            u = User(
                title=title,
                name=name_clean,
                email=email_lower,
                hashed_password=DEMO_PASSWORD,
                designation="Assistant Professor",
                gender="female" if "mrs" in name.lower() or "miss" in name.lower() or "female" in name.lower() or "sangeetha" in name.lower() or "janet" in name.lower() or "hemalatha" in name.lower() else "male",
                role_id=roles["faculty"].id,
                department_id=dept.id if dept else None,
                is_active=True,
                is_approved=True,
            )
            db.add(u)
            users[email_lower] = u
        await db.flush()

        # Set digital signatures
        default_sig_rel_path = "signatures/6_ae8ad3496eae4809b4a946314e0c79e1_signature.png"
        for u in users.values():
            if not u.signature_path:
                u.signature_path = default_sig_rel_path
        await db.flush()

        # Update expert nominee IDs for all departments
        all_users_res = await db.execute(select(User))
        all_seeded_users = all_users_res.scalars().all()
        for dept in seeded_depts.values():
            dept_faculties = [u for u in all_seeded_users if u.department_id == dept.id and u.role_id == roles["faculty"].id]
            if len(dept_faculties) >= 2:
                dept.expert1_id = dept_faculties[0].id
                dept.expert2_id = dept_faculties[1].id
                dept.director_faculty_id = dept_faculties[1].id
            elif len(dept_faculties) == 1:
                dept.expert1_id = dept_faculties[0].id
                dept.expert2_id = dept_faculties[0].id
                dept.director_faculty_id = dept_faculties[0].id
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
                        "properties": {},
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
                            "finance_concurrence_ref": { "type": "string", "title": "Finance Concurrence Reference" }
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
                            "justification": { "type": "string", "title": "Justification for Direct Purchase" }
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
                            "publication_date": { "type": "string", "title": "Publication Date (YYYY-MM-DD)" }
                        },
                        "required": ["tender_id"]
                    }
                elif p_item.name == "Limited Tender":
                    p_item.form_schema = {
                        "type": "object",
                        "title": "Limited Tender Details",
                        "properties": {},
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
                            "finance_concurrence_ref": { "type": "string", "title": "Finance Concurrence Reference" }
                        },
                        "required": ["manufacturer_name", "justification_type"]
                    }
                elif p_item.name == "Direct Purchase":
                    p_item.form_schema = {
                        "type": "object",
                        "title": "Direct Purchase Details",
                        "properties": {
                            "justification": { "type": "string", "title": "Justification for Direct Purchase" }
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
                ("AA", "Indent and Detailed Tech Specification", "Purchase indent and detailed technical specification approval", 1),
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
                key = {
                    "Indent and Detailed Tech Specification": "AA",
                    "Administrative Approval": "AA",  # legacy name fallback
                    "Tendering": "TD",
                    "Technical Evaluation": "TE",
                    "Financial Sanction": "FS",
                    "Purchase Order": "PO",
                }.get(p.phase_name)
                if key:
                    phases[key] = p
            # Rename the old phase name in DB if it still exists
            for p in list(phases.values()):
                if p.phase_name == "Administrative Approval" and p.phase_order == 1:
                    p.phase_name = "Indent and Detailed Tech Specification"
                    p.description = "Purchase indent and detailed technical specification approval"
                    db.add(p)
            await db.flush()

        # 8. Workflow Hierarchy
        from app.models.purchase_request import WorkFlowHierarchy
        print("  Re-seeding all workflow steps to apply updates...")
        await db.execute(text("DELETE FROM workflow_hierarchies;"))
        seeded_count = 0
        for ptype in ("research", "others"):
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

        # Ensure unique index exists to prevent duplicate workflow steps from admin API
        await db.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_hierarchy_step
            ON workflow_hierarchies (category_id, procurement_id, purchase_type, phase_id, step_order, source_of_fund_id)
            NULLS NOT DISTINCT
        """))

        # 8.5. Seed Administrative Approval Workflow
        await db.execute(text("DELETE FROM administrative_approval_workflows;"))
        print("  Seeding default Administrative Approval workflow steps...")
        seeded_aa_count = 0
        aa_step_defs = [
            (1, "HOD", "hod"), (2, "ADPD", "adpd"), (3, "Dean", "dean_pd"),
            (4, "IA", "ia"), (5, "Director", "director"),
        ]
        # Global catch-all defaults (null/null/null) — used when no category-specific override exists
        for step_order, group, role_key in aa_step_defs:
            role = roles.get(role_key)
            db.add(AdministrativeApprovalWorkflow(
                category_id=None, procurement_id=None, purchase_type=None,
                step_order=step_order, user_group=group,
                role_id=role.id if role else None
            ))
            seeded_aa_count += 1
        # Category-specific research steps (AA engine matches 'research' or null; 'others' rows unused)
        for proc in procs:
            proc_cats = categories.get(proc.id, categories)
            for cat_key in ("cat1", "cat2", "cat3"):
                cat = proc_cats.get(cat_key) if isinstance(proc_cats, dict) else None
                if not cat:
                    continue
                for step_order, group, role_key in aa_step_defs:
                    role = roles.get(role_key)
                    db.add(AdministrativeApprovalWorkflow(
                        category_id=cat.id, procurement_id=proc.id,
                        purchase_type="research", step_order=step_order,
                        user_group=group, role_id=role.id if role else None
                    ))
                    seeded_aa_count += 1
        if seeded_aa_count:
            await db.flush()
            print(f"  Seeded {seeded_aa_count} default Administrative Approval workflow steps.")

        # 9. Clear and Reseed Transactional & Budget Data
        if RESET_DEMO_DATA:
            print("🧹 Clearing previous transactional and budget data...")
            tables_to_truncate = [
                "asset_logs", "asset_movements", "assets", "payments", "discrepancies",
                "stores_asset_logs", "dept_asset_logs", "delivery_items", "deliveries",
                "bill_passings", "tender_cancellations", "po_cancellations", "pr_referrals",
                "purchase_request_assignments", "purchase_request_history", "purchase_request_flows",
                "technical_evaluations", "financial_evaluations", "commercial_evaluations",
                "documents", "purchase_request_items", "purchase_requests",
                "administrative_approval_history", "administrative_approvals", "budget_master"
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

        # Seed/update budget source of fund categories
        sf_res = await db.execute(select(Settings).where(Settings.key_name == "budget_source_of_fund_categories"))
        sf_obj = sf_res.scalar_one_or_none()
        default_sf = "CAPEX (OH-35),REVEX (OH-31),HOSTEL,NIMCET,ID,PMRF,SEED-GRANT,HEFA,STUDENT-WELFARE,R&C"
        if sf_obj:
            sf_obj.value = default_sf
        else:
            db.add(Settings(key_name="budget_source_of_fund_categories", value=default_sf))
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

        # Seed 1 temporary budget file if none exists
        temp_check = await db.execute(select(BudgetMaster).where(BudgetMaster.file_no.ilike("TEMP/%")).limit(1))
        if not temp_check.scalar_one_or_none():
            db.add(BudgetMaster(
                department_id=cse.id,
                financial_year_id=fy.id,
                source_of_fund="CAPEX",
                item_name="Smart Classroom Projector (TEMP)",
                category="equipment",
                course_code="CSE-TEMP-1",
                unit_cost=150000.0,
                quantity=1,
                total_allocation=150000.0,
                file_no="TEMP/F.No.0001/CAPEX/2026-27/CSE",
                is_revision=False,
                committed_amount=0.0,
                utilized_amount=0.0,
            ))
            await db.flush()

        faculty = users["faculty.cse@nitt.edu"]
        faculty1 = users["faculty1.cse@nitt.edu"]
        faculty2 = users["faculty2.cse@nitt.edu"]

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
