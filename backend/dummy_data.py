"""
IRIS Dummy Data Runner — seeds fresh budget files and creates/advances PRs
for all procurement methods (GeM, CPPP, Limited Tender, Proprietary Purchase)
across all 3 purchase amount categories.

Usage (inside container):
    python dummy_data.py
"""

import sys
import time
import asyncio
import requests

BASE_URL = "http://localhost:8000"
PASSWORD = "password"

# ── role → login email map ────────────────────────────────────────────────────
ROLE_EMAIL = {
    "Faculty":             "faculty.cse@nitt.edu",
    "HOD":                 "hod.cse@nitt.edu",
    "Dean P&D":            "dean.pd@nitt.edu",
    "Director":            "director@nitt.edu",
    "Superintendent":      "sp.stores@nitt.edu",
    "Dealing Assistant":   "da.stores@nitt.edu",
    "Consultant S&P":      "consultant.stores@nitt.edu",
    "Assistant Registrar": "ar.stores@nitt.edu",
    "Deputy Registrar":    "dr.stores@nitt.edu",
    "Associate Dean P&D":  "vg.pd@nitt.edu",
}

# ── form_data filled for each procurement method ──────────────────────────────
FORM_DATA = {
    "GeM": {
        "gem_link": "https://gem.gov.in/bid/GEM/2026-27/B/12345678",
        "gem_nac_attached": False,
    },
    "CPPP": {
        "tender_id": "2026_NITT_CSE_001",
        "publication_date": "2026-05-01",
    },
    "Limited Tender": {
        "invited_vendors": "Vendor Alpha Pvt. Ltd., Vendor Beta Corp., Vendor Gamma Solutions",
    },
    "Proprietary Purchase": {
        "manufacturer_name": "Keysight Technologies India Pvt. Ltd.",
        "manufacturer_address": "No. 4, Commercial Street, Bengaluru - 560001",
        "justification_type": "sole_manufacturer",
        "finance_concurrence_ref": "FC/2026-27/NIT/0042",
    },
}

# ── budget seeding spec ───────────────────────────────────────────────────────
BUDGET_ITEMS = [
    # (file_no, item_name, exp_cat, cat, course, unit_cost, qty)
    # Category 1 (<=1,00,000)
    ("NITT/CSE/2026-27/DUMMY/GEM-CAT1",  "GeM Consumables (Cat1)",        "OPEX", "consumables", "CSE-D-001", 40_000,    1),
    ("NITT/CSE/2026-27/DUMMY/CPPP-CAT1", "CPPP Software License (Cat1)",  "OPEX", "software",    "CSE-D-002", 80_000,    1),
    ("NITT/CSE/2026-27/DUMMY/LT-CAT1",   "LT Lab Equipment (Cat1)",       "OPEX", "equipment",   "CSE-D-003", 90_000,    1),
    ("NITT/CSE/2026-27/DUMMY/PAC-CAT1",  "PAC Proprietary Tool (Cat1)",   "OPEX", "instrument",  "CSE-D-004", 70_000,    1),
    # Category 2 (1,00,001 - 10,00,000)
    ("NITT/CSE/2026-27/DUMMY/GEM-CAT2",  "GeM Server Node (Cat2)",        "CAPEX","computer",    "CSE-D-005", 500_000,   1),
    ("NITT/CSE/2026-27/DUMMY/CPPP-CAT2", "CPPP Network Switch (Cat2)",    "CAPEX","equipment",   "CSE-D-006", 750_000,   1),
    ("NITT/CSE/2026-27/DUMMY/LT-CAT2",   "LT Workstations (Cat2)",        "CAPEX","computer",    "CSE-D-007", 200_000,   4),
    ("NITT/CSE/2026-27/DUMMY/PAC-CAT2",  "PAC Oscilloscope (Cat2)",       "CAPEX","instrument",  "CSE-D-008", 300_000,   2),
    # Category 3 (10,00,001 - 30,00,000)
    ("NITT/CSE/2026-27/DUMMY/GEM-CAT3",  "GeM HPC Node (Cat3)",           "CAPEX","computer",    "CSE-D-009", 1_200_000, 2),
    ("NITT/CSE/2026-27/DUMMY/CPPP-CAT3", "CPPP GPU Cluster (Cat3)",       "CAPEX","computer",    "CSE-D-010", 2_500_000, 1),
    ("NITT/CSE/2026-27/DUMMY/LT-CAT3",   "LT Research Instruments (Cat3)","CAPEX","instrument",  "CSE-D-011", 1_500_000, 1),
    ("NITT/CSE/2026-27/DUMMY/PAC-CAT3",  "PAC Mass Spectrometer (Cat3)",  "CAPEX","instrument",  "CSE-D-012", 2_000_000, 1),
]

PROC_PER_DUMMY = {
    "GEM":  "GeM",
    "CPPP": "CPPP",
    "LT":   "Limited Tender",
    "PAC":  "Proprietary Purchase",
}


# ── DB seeding ────────────────────────────────────────────────────────────────

async def seed_budget_files() -> dict[str, int]:
    """Insert fresh budget files; returns original_file_no -> id map."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.config import settings
    from app.models.budget import BudgetMaster, FinancialYear
    from app.models.user import Department

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    file_id_map: dict[str, int] = {}
    async with Session() as db:
        fy_res = await db.execute(select(FinancialYear).where(FinancialYear.is_active == True))
        fy = fy_res.scalar_one()

        dept_res = await db.execute(select(Department).where(Department.short_code == "CSE"))
        cse = dept_res.scalar_one()

        import time as _t
        run_suffix = str(int(_t.time()))[-6:]

        for file_no, item_name, exp_cat, cat, course, unit, qty in BUDGET_ITEMS:
            unique_file_no = f"{file_no}-{run_suffix}"
            bm = BudgetMaster(
                department_id=cse.id,
                financial_year_id=fy.id,
                expenditure_category=exp_cat,
                item_name=item_name,
                category=cat,
                course_code=course,
                unit_cost=float(unit),
                quantity=int(qty),
                total_cost=float(unit * qty),
                file_no=unique_file_no,
                is_revision=False,
            )
            db.add(bm)
            await db.flush()
            file_id_map[file_no] = bm.id  # key by ORIGINAL name

        await db.commit()
    await engine.dispose()
    print(f"  Seeded {len(file_id_map)} budget files")
    return file_id_map


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def safe_json(r: requests.Response) -> dict | list:
    try:
        return r.json()
    except Exception:
        return {}


def login(session: requests.Session, email: str) -> bool:
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": email, "password": PASSWORD})
    if r.status_code != 200:
        print(f"  LOGIN FAIL {email}: {r.text[:120]}")
        return False
    return True


def get_proc_id(session: requests.Session, name: str) -> int | None:
    r = session.get(f"{BASE_URL}/api/budget/procurement-methods")
    if r.status_code != 200:
        return None
    for p in r.json():
        if p["name"] == name:
            return p["id"]
    return None


def create_pr(session: requests.Session, budget_id: int, mop_id: int,
              proc_name: str) -> dict | None:
    payload = {
        "selected_file_ids": [budget_id],
        "mop": mop_id,
        "emd": 2,
        "performance_security": 3,
        "delivery_location": "CSE Department, NIT Tiruchirappalli",
        "delivery_mode": "Door delivery",
        "basis_of_estimate": "Market survey and vendor quotations",
        "purchase_type": "department",
        "exemption": False,
        "is_quantity_split": False,
        "is_item_split": False,
        "is_service_center_south": False,
        "training_required": False,
        "form_data": FORM_DATA.get(proc_name, {}),
        "items": [{
            "budget_file_id": budget_id,
            "requirement_type": "Research",
            "availability": "No",
            "tech_specs_text": (
                f"Standard technical specifications for {proc_name} procurement. "
                "Detailed specifications as per department requirements and GFR 2017."
            ),
            "site_readiness": True,
            "installation_required": False,
            "quantity": 1,
            "justification_for_procurement": (
                "This item is essential for ongoing research activities and laboratory "
                "operations. The existing equipment has reached end-of-life and requires "
                "replacement to maintain departmental productivity."
            ),
            "previous_file_no_reference": "N/A",
            "present_stock": "None",
        }],
    }
    r = session.post(f"{BASE_URL}/api/pr/", json=payload)
    if r.status_code != 200:
        print(f"  CREATE PR FAIL ({proc_name}): {r.text[:300]}")
        return None
    return r.json()


# ── advance loop ──────────────────────────────────────────────────────────────

def advance_loop(session: requests.Session, pr_id: int, label: str,
                 max_steps: int = 120) -> str:
    """Drive a PR from its current state to po_issued. Returns final status."""
    admin = requests.Session()
    if not login(admin, "admin@nitt.edu"):
        return "error"

    for step in range(1, max_steps + 1):
        # Periodic re-auth to avoid session expiry
        if step % 25 == 0:
            login(admin, "admin@nitt.edu")

        raw = admin.get(f"{BASE_URL}/api/pr/{pr_id}")
        if raw.status_code == 401:
            login(admin, "admin@nitt.edu")
            raw = admin.get(f"{BASE_URL}/api/pr/{pr_id}")

        pr = safe_json(raw)
        if not pr or not isinstance(pr, dict):
            time.sleep(0.2)
            pr = safe_json(admin.get(f"{BASE_URL}/api/pr/{pr_id}"))
            if not pr or not isinstance(pr, dict):
                print(f"  [{label}] Empty/invalid PR at step {step} (HTTP {raw.status_code})")
                return "unknown"

        status = pr.get("current_status")
        flow   = pr.get("flow")

        if status in ("po_issued", "rejected", "cancelled", "completed"):
            print(f"  [{label}] Terminal: {status} after {step - 1} advances")
            return status

        if not flow:
            print(f"  [{label}] No active flow at step {step} — status={status}")
            return status or "unknown"

        phase     = flow.get("phase_name")
        order     = flow.get("step_order")
        role_name = flow.get("expected_role_name") or ""

        # Resolve actor email
        if role_name == "Faculty" or flow.get("expected_group") == "faculty":
            email = pr.get("initiator", {}).get("email") or "faculty.cse@nitt.edu"
        else:
            email = ROLE_EMAIL.get(role_name)

        if not email:
            print(f"  [{label}] No email for role '{role_name}' at {phase}/{order}")
            return "error"

        # ─────────────────────────────────────────────────────────────────
        # TD1 — Superintendent assigns DA
        # assign-da internally advances TD1→TD2, so NO separate /advance
        # ─────────────────────────────────────────────────────────────────
        if phase == "Tendering" and order == 1 and role_name == "Superintendent":
            sp = requests.Session()
            login(sp, "sp.stores@nitt.edu")
            assignments = pr.get("assignments", [])
            if not any(a.get("assigned_da_id") for a in assignments):
                das = safe_json(sp.get(f"{BASE_URL}/api/pr/dealing-assistants"))
                if isinstance(das, list):
                    da_id = next((d["id"] for d in das
                                  if d["email"] == "da.stores@nitt.edu"), None)
                    if da_id:
                        r = sp.post(f"{BASE_URL}/api/pr/{pr_id}/assign-da",
                                    json={"da_id": da_id})
                        if r.status_code != 200:
                            print(f"  [{label}] ASSIGN-DA FAIL: {r.text[:200]}")
                            return "error"
                        print(f"  [{label}] Step {step}: SP assigned DA (TD1 auto-advanced)")
                    else:
                        print(f"  [{label}] DA user not found — cannot assign")
                        return "error"
            else:
                print(f"  [{label}] Step {step}: DA already assigned")
            time.sleep(0.05)
            continue

        # ─────────────────────────────────────────────────────────────────
        # TD2 — DA registers tender details + financial bids
        # ─────────────────────────────────────────────────────────────────
        if phase == "Tendering" and order == 2 and role_name == "Dealing Assistant":
            if not pr.get("tender_reference_number"):
                da = requests.Session()
                login(da, "da.stores@nitt.edu")
                pr_amount = pr.get("amount") or 500_000
                da.post(f"{BASE_URL}/api/pr/{pr_id}/tender-details", json={
                    "tender_reference_number": f"TND/CSE/{pr_id}/2026-27",
                    "date_of_tender": "2026-05-15",
                    "vendors": [
                        {"name": "Alpha Technologies Pvt. Ltd."},
                        {"name": "Beta Engineering Solutions"},
                        {"name": "Gamma Systems Corp."},
                    ],
                    "remarks": "Tender published per applicable procurement method.",
                })
                da.post(f"{BASE_URL}/api/pr/{pr_id}/financial-bids", json={
                    "vendors": [
                        {"name": "Alpha Technologies Pvt. Ltd.",
                         "quoted_amount": round(pr_amount * 0.92, 2),
                         "remarks": "L1 — lowest bidder, all taxes inclusive"},
                        {"name": "Beta Engineering Solutions",
                         "quoted_amount": round(pr_amount * 1.05, 2),
                         "remarks": "L2 — second lowest"},
                        {"name": "Gamma Systems Corp.",
                         "quoted_amount": round(pr_amount * 1.18, 2),
                         "remarks": "L3 — highest bidder"},
                    ],
                    "remarks": "Financial bids opened 2026-05-22 before evaluation committee.",
                })

        # ─────────────────────────────────────────────────────────────────
        # Technical Evaluation step 1 — multi-member sequential signing
        # Order: [HOD, initiator, expert1(faculty1), expert2(faculty2), director(faculty3)]
        # ONLY fire on order==1 (the committee evaluation step_type)
        # ─────────────────────────────────────────────────────────────────
        if phase == "Technical Evaluation" and order == 1:
            init_email     = pr.get("initiator", {}).get("email") or "faculty.cse@nitt.edu"
            f1_email       = (pr.get("faculty1") or {}).get("email") or init_email
            f2_email       = (pr.get("faculty2") or {}).get("email") or "faculty2.cse@nitt.edu"
            f3_email       = (pr.get("faculty3") or {}).get("email") or "faculty1.cse@nitt.edu"

            # Remove duplicates while preserving order
            seen_te: set[str] = set()
            unique_signers: list[str] = []
            for em in [init_email, f1_email, f2_email, f3_email]:
                if em not in seen_te:
                    unique_signers.append(em)
                    seen_te.add(em)

            # IMPORTANT: do NOT call /technical-eval before signing—it adds a history
            # entry marking that user as signed, disrupting the turn-based order.
            # Instead, sign each committee member in order via /advance.
            # The initiator's advance call (order index 1) will be their "Completed" entry.
            # Vendor evaluations are submitted AFTER all advances complete.

            # Have each signer advance in turn (HOD first)
            for signer_email in unique_signers:
                signer = requests.Session()
                login(signer, signer_email)
                r = signer.post(f"{BASE_URL}/api/pr/{pr_id}/advance",
                                json={"remarks": f"Technical evaluation signed by {signer_email}."})
                if r.status_code != 200:
                    detail = str(safe_json(r).get("detail", r.text[:150]))
                    if "already" in detail.lower() or "completed" in detail.lower():
                        print(f"  [{label}] TE: {signer_email} already signed — ok")
                        continue
                    print(f"  [{label}] TE SIGN FAIL {signer_email}: {detail}")
                    return "error"
                print(f"  [{label}] TE signed: {signer_email}")
                time.sleep(0.05)

            # Award L1 bid if any financial evaluations exist
            svc = requests.Session()
            login(svc, init_email)
            pr2 = safe_json(svc.get(f"{BASE_URL}/api/pr/{pr_id}"))
            if isinstance(pr2, dict):
                fe = pr2.get("financial_evaluations", [])
                l1 = next((x for x in fe if x["vendor_name"] == "Alpha Technologies Pvt. Ltd."), None)
                if l1:
                    svc.post(f"{BASE_URL}/api/pr/{pr_id}/award-bid",
                             json={"vendor_id": l1["id"],
                                   "remarks": "L1 vendor awarded — Alpha Technologies at lowest price."})
            continue  # Re-read flow to see if TE is done and FS started

        # ─────────────────────────────────────────────────────────────────
        # FS — seed financial bids if missing
        # ─────────────────────────────────────────────────────────────────
        if phase == "Financial Sanction" and not pr.get("financial_evaluations"):
            fac = requests.Session()
            login(fac, pr.get("initiator", {}).get("email") or "faculty.cse@nitt.edu")
            pr_amount = pr.get("amount") or 500_000
            fac.post(f"{BASE_URL}/api/pr/{pr_id}/financial-bids", json={
                "vendors": [
                    {"name": "Alpha Technologies Pvt. Ltd.",
                     "quoted_amount": round(pr_amount * 0.92, 2),
                     "remarks": "L1 bid registered for financial sanction."},
                ],
                "remarks": "Financial sanction bids registered.",
            })

        # ─────────────────────────────────────────────────────────────────
        # HOD at AA — nominate committee members
        # ─────────────────────────────────────────────────────────────────
        actor = requests.Session()
        if not login(actor, email):
            return "error"

        payload: dict = {"remarks": f"Approved and forwarded — {phase} step {order}"}

        if role_name == "HOD" and phase == "Administrative Approval":
            fac_res = actor.get(f"{BASE_URL}/api/budget/department-faculty")
            if fac_res.status_code == 200:
                facs = fac_res.json()
                if len(facs) >= 3:
                    payload["faculty1_id"] = facs[0]["id"]
                    payload["faculty2_id"] = facs[1]["id"]
                    payload["faculty3_id"] = facs[2]["id"]
                    print(f"  [{label}] HOD nominated: {facs[0]['name']}, "
                          f"{facs[1]['name']}, {facs[2]['name']}")
                else:
                    print(f"  [{label}] Only {len(facs)} faculty — nomination incomplete")

        ar = actor.post(f"{BASE_URL}/api/pr/{pr_id}/advance", json=payload)
        if ar.status_code != 200:
            print(f"  [{label}] ADVANCE FAIL {email} @ {phase}/{order}: {ar.text[:300]}")
            return "error"
        # Check if advance response itself reports a terminal state
        ar_data = safe_json(ar)
        final_status = ar_data.get("status", "")
        if final_status in ("po_issued", "rejected", "cancelled", "completed"):
            print(f"  [{label}] Terminal from advance response: {final_status}")
            return final_status
        print(f"  [{label}] Step {step}: {email} -> {phase} #{order}")
        time.sleep(0.05)

    print(f"  [{label}] Exceeded {max_steps} steps")
    return "timeout"


# ── per-test runner ───────────────────────────────────────────────────────────

def run_test(file_no: str, budget_id: int, proc_name: str,
             initiator_email: str = "faculty.cse@nitt.edu") -> tuple[str, str]:
    label = f"{proc_name} | {file_no.split('/DUMMY/')[1]}"
    print(f"\n{'─'*65}")
    print(f"  TEST: {label}")
    print(f"{'─'*65}")

    s = requests.Session()
    if not login(s, initiator_email):
        return label, "login_fail"

    mop_id = get_proc_id(s, proc_name)
    if not mop_id:
        print(f"  [{label}] Procurement method not found: {proc_name}")
        return label, "mop_not_found"

    pr = create_pr(s, budget_id, mop_id, proc_name)
    if not pr:
        return label, "create_fail"

    pr_id = pr["id"]
    print(f"  [{label}] Created PR #{pr_id} ({pr.get('icr_number','—')}), "
          f"amount=Rs.{pr.get('amount', 0):,.0f}")

    status = advance_loop(s, pr_id, label)
    return label, status


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("  IRIS Dummy Data Runner — All Procurement Methods")
    print("=" * 65)

    print("\n[1] Seeding fresh budget files...")
    file_id_map = asyncio.run(seed_budget_files())

    results: list[tuple[str, str]] = []

    for file_no, item_name, *_ in BUDGET_ITEMS:
        key = file_no.split("/DUMMY/")[1].split("-CAT")[0]
        proc_name = PROC_PER_DUMMY.get(key)
        if not proc_name:
            print(f"  Unknown key '{key}' — skipping")
            continue

        budget_id = file_id_map.get(file_no)
        if not budget_id:
            print(f"  No budget ID for {file_no} — skipping")
            continue

        label, status = run_test(file_no, budget_id, proc_name)
        results.append((label, status))

    print(f"\n{'='*65}")
    print("  SUMMARY")
    print(f"{'='*65}")
    pass_count = fail_count = 0
    for label, status in results:
        icon = "+" if status == "po_issued" else "x"
        print(f"  [{icon}] {label}: {status.upper()}")
        if status == "po_issued":
            pass_count += 1
        else:
            fail_count += 1

    print(f"\n  PASSED: {pass_count}/{len(results)}")
    print(f"  FAILED: {fail_count}/{len(results)}")
    sys.exit(0 if fail_count == 0 else 1)


if __name__ == "__main__":
    main()
