"""
E2E workflow tests for IRIS — run against http://localhost:8000 after seed.
Usage: python -m app.e2e_test
"""
import sys
import time
import requests

BASE_URL = "http://localhost:8000"
PASSWORD = "password"

ROLE_EMAIL = {
    "Faculty": "faculty.cse@nitt.edu",
    "HOD": "hod.cse@nitt.edu",
    "Dean P&D": "dean.pd@nitt.edu",
    "Director": "director@nitt.edu",
    "Superintendent": "sp.stores@nitt.edu",
    "Dealing Assistant": "da.stores@nitt.edu",
    "Consultant S&P": "consultant.stores@nitt.edu",
    "Assistant Registrar": "ar.stores@nitt.edu",
    "Deputy Registrar": "dr.stores@nitt.edu",
    "Associate Dean P&D": "vg.pd@nitt.edu",
}


def login(session: requests.Session, email: str) -> bool:
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": PASSWORD})
    if r.status_code != 200:
        print(f"  LOGIN FAIL {email}: {r.text}")
        return False
    return True


def pick_budget(session: requests.Session, min_cost: float, max_cost: float) -> int | None:
    files = session.get(f"{BASE_URL}/api/budget/files").json()
    for f in files:
        if min_cost <= f["total_cost"] <= max_cost:
            if f.get("available_amount", 0) >= f.get("unit_cost", 0):
                return f["id"]
    return None


def create_pr(session: requests.Session, budget_id: int, mop_id: int) -> dict | None:
    payload = {
        "selected_file_ids": [budget_id],
        "mop": mop_id,
        "emd": 2,
        "performance_security": 3,
        "delivery_location": "CSE Lab",
        "delivery_mode": "Door delivery",
        "basis_of_estimate": "Market survey",
        "items": [{
            "budget_file_id": budget_id,
            "requirement_type": "Research",
            "availability": "No",
            "tech_specs_text": "Demo specs",
            "site_readiness": True,
            "installation_required": False,
        }],
    }
    r = session.post(f"{BASE_URL}/api/pr/", json=payload)
    if r.status_code != 200:
        print(f"  CREATE PR FAIL: {r.text}")
        return None
    return r.json()


def advance_loop(session: requests.Session, pr_id: int, label: str, max_steps: int = 80) -> bool:
    admin = requests.Session()
    if not login(admin, "admin@nitt.edu"):
        return False

    for step in range(1, max_steps + 1):
        pr = admin.get(f"{BASE_URL}/api/pr/{pr_id}").json()
        status = pr.get("current_status")
        flow = pr.get("flow")

        if status in ("po_issued", "rejected", "cancelled", "completed"):
            print(f"  [{label}] Terminal status: {status} after {step - 1} advances")
            return status == "po_issued"

        if not flow:
            print(f"  [{label}] No active flow at step {step}")
            return False

        phase = flow.get("phase_name")
        order = flow.get("step_order")
        role_name = flow.get("expected_role_name") or ""
        if role_name == "Faculty" or flow.get("expected_group") == "faculty":
            email = pr.get("initiator", {}).get("email")
        else:
            email = ROLE_EMAIL.get(role_name)
        if not email:
            print(f"  [{label}] No email for role '{role_name}' at {phase} step {order}")
            return False

        # Tendering: Superintendent assigns DA then advances once (do not advance again below)
        if phase == "Tendering" and order == 1 and role_name == "Superintendent":
            sp = requests.Session()
            login(sp, "sp.stores@nitt.edu")
            if not any(a.get("assigned_da_id") for a in pr.get("assignments", [])):
                das = sp.get(f"{BASE_URL}/api/pr/dealing-assistants").json()
                da_id = next(d["id"] for d in das if d["email"] == "da.stores@nitt.edu")
                sp.post(f"{BASE_URL}/api/pr/{pr_id}/assign-da", json={"da_id": da_id})
            ar = sp.post(f"{BASE_URL}/api/pr/{pr_id}/advance", json={"remarks": "DA assigned; forwarded to Dealing Assistant"})
            if ar.status_code != 200:
                print(f"  [{label}] SUPERINTENDENT TD1 FAIL: {ar.text}")
                return False
            print(f"  [{label}] Step {step}: sp.stores@nitt.edu assigned DA and advanced (Tendering #1)")
            time.sleep(0.05)
            continue

        if phase == "Tendering" and order == 2 and role_name == "Dealing Assistant":
            if not pr.get("tender_reference_number"):
                da = requests.Session()
                login(da, "da.stores@nitt.edu")
                da.post(f"{BASE_URL}/api/pr/{pr_id}/tender-details", json={
                    "tender_reference_number": f"TND-{pr_id}",
                    "date_of_tender": "2026-05-20",
                    "vendors": [{"name": "Vendor A"}, {"name": "Vendor B"}],
                    "remarks": "Tender registered",
                })
                da.post(f"{BASE_URL}/api/pr/{pr_id}/financial-bids", json={
                    "vendors": [
                        {"name": "Vendor A", "quoted_amount": 4.5, "remarks": "L1"},
                        {"name": "Vendor B", "quoted_amount": 6.0, "remarks": "L2"},
                    ],
                    "remarks": "Bids",
                })

        if phase == "Technical Evaluation" and role_name == "Faculty" and not pr.get("technical_evaluations"):
            fac = requests.Session()
            login(fac, "faculty.cse@nitt.edu")
            fac.post(f"{BASE_URL}/api/pr/{pr_id}/technical-eval", json={
                "vendors": [
                    {"name": "Vendor A", "is_qualified": True, "remarks": "OK"},
                    {"name": "Vendor B", "is_qualified": False, "remarks": "No"},
                ],
            })
            fe = fac.get(f"{BASE_URL}/api/pr/{pr_id}").json().get("financial_evaluations", [])
            va = next((x for x in fe if x["vendor_name"] == "Vendor A"), None)
            if va:
                fac.post(f"{BASE_URL}/api/pr/{pr_id}/award-bid", json={"vendor_id": va["id"], "remarks": "Award L1"})

        if phase == "Financial Sanction" and role_name == "Faculty" and not pr.get("financial_evaluations"):
            fac = requests.Session()
            login(fac, "faculty.cse@nitt.edu")
            fac.post(f"{BASE_URL}/api/pr/{pr_id}/financial-bids", json={
                "vendors": [{"name": "Vendor A", "quoted_amount": 450000, "remarks": "Sanction bid"}],
                "remarks": "FS bids",
            })

        actor = requests.Session()
        if not login(actor, email):
            return False

        payload = {"remarks": f"Approved at {phase} step {order}"}
        if role_name == "HOD" and phase == "Administrative Approval":
            fac_res = actor.get(f"{BASE_URL}/api/budget/department-faculty")
            if fac_res.status_code == 200:
                facs = fac_res.json()
                if len(facs) >= 3:
                    payload["faculty1_id"] = facs[0]["id"]
                    payload["faculty2_id"] = facs[1]["id"]
                    payload["faculty3_id"] = facs[2]["id"]
                    print(f"  [{label}] HOD assigned nominees: {facs[0]['name']} (ID {facs[0]['id']}), {facs[1]['name']} (ID {facs[1]['id']}), and {facs[2]['name']} (ID {facs[2]['id']})")
                else:
                    print(f"  [{label}] ERROR: insufficient faculty members for HOD committee: {facs}")
            else:
                print(f"  [{label}] ERROR: department-faculty request failed: {fac_res.text}")

        ar = actor.post(f"{BASE_URL}/api/pr/{pr_id}/advance", json=payload)
        if ar.status_code != 200:
            print(f"  [{label}] ADVANCE FAIL {email} @ {phase}/{order}: {ar.text}")
            return False
        print(f"  [{label}] Step {step}: {email} advanced ({phase} #{order})")
        time.sleep(0.05)

    print(f"  [{label}] Exceeded max steps")
    return False


def run_category(name: str, budget_min: float, budget_max: float) -> bool:
    print(f"\n{'='*60}\nCATEGORY TEST: {name}\n{'='*60}")
    s = requests.Session()
    if not login(s, "faculty.cse@nitt.edu"):
        return False

    bid = pick_budget(s, budget_min, budget_max)
    if not bid:
        print("  No budget file in range")
        return False

    procs = s.get(f"{BASE_URL}/api/budget/procurement-methods").json()
    mop = next(p["id"] for p in procs if p["name"] == "GeM")

    pr = create_pr(s, bid, mop)
    if not pr:
        return False
    pr_id = pr["id"]
    print(f"  Created PR #{pr_id} ({pr.get('icr_number')})")

    ok = advance_loop(s, pr_id, name)
    if ok:
        inv = requests.Session()
        login(inv, "admin@nitt.edu")
        d = inv.get(f"{BASE_URL}/api/inventory/deliveries").json()
        has_delivery = any(delivery.get("po_id") == pr_id for delivery in d) if isinstance(d, list) else False
        print(f"  GRN delivery created: {has_delivery}")
    return ok


def run_category_hod(name: str, budget_min: float, budget_max: float) -> bool:
    print(f"\n{'='*60}\nCATEGORY HOD TEST: {name}\n{'='*60}")
    s = requests.Session()
    if not login(s, "hod.cse@nitt.edu"):
        return False

    bid = pick_budget(s, budget_min, budget_max)
    if not bid:
        print("  No budget file in range")
        return False

    procs = s.get(f"{BASE_URL}/api/budget/procurement-methods").json()
    mop = next(p["id"] for p in procs if p["name"] == "GeM")

    pr = create_pr(s, bid, mop)
    if not pr:
        return False
    pr_id = pr["id"]
    print(f"  Created PR #{pr_id} ({pr.get('icr_number')})")

    ok = advance_loop(s, pr_id, name)
    if ok:
        inv = requests.Session()
        login(inv, "admin@nitt.edu")
        d = inv.get(f"{BASE_URL}/api/inventory/deliveries").json()
        has_delivery = any(delivery.get("po_id") == pr_id for delivery in d) if isinstance(d, list) else False
        print(f"  GRN delivery created: {has_delivery}")
    return ok


def main():
    print("IRIS E2E — workflow categories (password=password)")
    results = {
        "Category 1 (Direct ≤1L)": run_category("Category 1", 1, 100_000),
        "Category 1 HOD Initiator": run_category_hod("Category 1 HOD", 1, 100_000),
        "Category 2 (1L–10L)": run_category("Category 2", 100_001, 1_000_000),
        "Category 3 (>10L)": run_category("Category 3", 1_000_001, 3_000_000),
    }
    print(f"\n{'='*60}\nSUMMARY\n{'='*60}")
    all_ok = True
    for name, ok in results.items():
        status = "PASS" if ok else "FAIL"
        print(f"  {name}: {status}")
        if not ok:
            all_ok = False
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
