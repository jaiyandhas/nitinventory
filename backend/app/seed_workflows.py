"""Shared workflow hierarchy definitions for seed.py and admin reset."""
from app.models.purchase_request import WorkFlowHierarchy


def build_workflow_steps(roles: dict, phases: dict, categories: dict, procs: list) -> list:
    def step(cat, phase_key, order, group, user_type, role_key=None, ptype="department", proc=None):
        r = roles[role_key] if role_key else None
        return WorkFlowHierarchy(
            category_id=cat.id,
            phase_id=phases[phase_key].id,
            procurement_id=proc.id,
            step_order=order,
            user_type=user_type,
            user_group=group,
            role_id=r.id if r else None,
            purchase_type=ptype,
            is_enabled=True,
        )

    rows: list[WorkFlowHierarchy] = []

    for ptype in ("department", "office"):
        for proc in procs:
            # Resolve categories for this procurement method
            if proc.id in categories:
                proc_cats = categories[proc.id]
            else:
                proc_cats = categories

            if "cat1" in proc_cats:
                cat1 = proc_cats["cat1"]
                rows.extend([
                    step(cat1, "AA", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat1, "AA", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat1, "PO", 1, "verifier_da", "verifier", "dealing_assistant", ptype, proc),
                    step(cat1, "PO", 2, "verifier_sp", "verifier", "assistant_registrar", ptype, proc),
                    step(cat1, "PO", 3, "verifier_sp", "verifier", "deputy_registrar", ptype, proc),
                    step(cat1, "PO", 4, "faculty", "purchase_initiator", "faculty", ptype, proc),
                ])
            if "cat2" in proc_cats:
                cat2 = proc_cats["cat2"]
                rows.extend([
                    step(cat2, "AA", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat2, "AA", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat2, "AA", 3, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat2, "TD", 1, "verifier_sp", "verifier", "superintendent", ptype, proc),
                    step(cat2, "TD", 2, "verifier_da", "verifier", "dealing_assistant", ptype, proc),
                    step(cat2, "TD", 3, "verifier_sp", "verifier", "superintendent", ptype, proc),
                    step(cat2, "TD", 4, "verifier_sp", "verifier", "consultant_sp", ptype, proc),
                    step(cat2, "TD", 5, "verifier_sp", "approver", "assistant_registrar", ptype, proc),
                    step(cat2, "TE", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat2, "TE", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat2, "TE", 3, "verifier_general", "verifier", "adpd", ptype, proc),
                    step(cat2, "TE", 4, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat2, "FS", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat2, "FS", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat2, "FS", 3, "verifier_sp", "verifier", "consultant_sp", ptype, proc),
                    step(cat2, "FS", 4, "verifier_sp", "verifier", "assistant_registrar", ptype, proc),
                    step(cat2, "FS", 5, "verifier_general", "verifier", "adpd", ptype, proc),
                    step(cat2, "FS", 6, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat2, "PO", 1, "verifier_da", "verifier", "dealing_assistant", ptype, proc),
                    step(cat2, "PO", 2, "verifier_sp", "verifier", "assistant_registrar", ptype, proc),
                    step(cat2, "PO", 3, "verifier_sp", "verifier", "deputy_registrar", ptype, proc),
                    step(cat2, "PO", 4, "faculty", "purchase_initiator", "faculty", ptype, proc),
                ])
            if "cat3" in proc_cats:
                cat3 = proc_cats["cat3"]
                rows.extend([
                    step(cat3, "AA", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat3, "AA", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat3, "AA", 3, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat3, "AA", 4, "apex_approver", "approver", "director", ptype, proc),
                    step(cat3, "TD", 1, "verifier_sp", "verifier", "superintendent", ptype, proc),
                    step(cat3, "TD", 2, "verifier_da", "verifier", "dealing_assistant", ptype, proc),
                    step(cat3, "TD", 3, "verifier_sp", "verifier", "superintendent", ptype, proc),
                    step(cat3, "TD", 4, "verifier_sp", "verifier", "consultant_sp", ptype, proc),
                    step(cat3, "TD", 5, "verifier_sp", "approver", "assistant_registrar", ptype, proc),
                    step(cat3, "TE", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat3, "TE", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat3, "TE", 3, "verifier_general", "verifier", "adpd", ptype, proc),
                    step(cat3, "TE", 4, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat3, "FS", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat3, "FS", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat3, "FS", 3, "verifier_sp", "verifier", "consultant_sp", ptype, proc),
                    step(cat3, "FS", 4, "verifier_sp", "verifier", "assistant_registrar", ptype, proc),
                    step(cat3, "FS", 5, "verifier_general", "verifier", "adpd", ptype, proc),
                    step(cat3, "FS", 6, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat3, "FS", 7, "apex_approver", "approver", "director", ptype, proc),
                    step(cat3, "PO", 1, "verifier_da", "verifier", "dealing_assistant", ptype, proc),
                    step(cat3, "PO", 2, "verifier_sp", "verifier", "assistant_registrar", ptype, proc),
                    step(cat3, "PO", 3, "verifier_sp", "verifier", "deputy_registrar", ptype, proc),
                    step(cat3, "PO", 4, "faculty", "purchase_initiator", "faculty", ptype, proc),
                ])


    return rows
