"""Shared workflow hierarchy definitions for seed.py and admin reset."""
from app.models.purchase_request import WorkFlowHierarchy


def build_workflow_steps(roles: dict, phases: dict, categories: dict, procs: list) -> list:
    def step(cat, phase_key, order, group, user_type, role_key=None, ptype="department", proc=None, tender_vendors_threshold=None, tender_vendors_comparison=None, skip_condition=None, condition_field=None, condition_operator=None, condition_value=None):
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
            tender_vendors_threshold=tender_vendors_threshold,
            tender_vendors_comparison=tender_vendors_comparison,
            skip_condition=skip_condition,
            condition_field=condition_field,
            condition_operator=condition_operator,
            condition_value=condition_value,
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
                ])
            if "cat2" in proc_cats:
                cat2 = proc_cats["cat2"]
                rows.extend([
                    step(cat2, "AA", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat2, "AA", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat2, "AA", 3, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat2, "TD", 1, "verifier_sp", "da_assigner", "superintendent", ptype, proc),
                    step(cat2, "TD", 2, "verifier_da", "verifier_da", "dealing_assistant", ptype, proc),
                    step(cat2, "TD", 3, "verifier_sp", "verifier", "superintendent", ptype, proc),
                    step(cat2, "TD", 4, "verifier_sp", "verifier", "consultant_sp", ptype, proc),
                    step(cat2, "TD", 5, "verifier_sp", "approver", "assistant_registrar", ptype, proc),
                    # partial_approver: Dean reviews whether Director approval is needed.
                    # If >=3 qualified vendors (Director step condition is False) the engine
                    # auto-bypasses this step and advances straight to Technical Evaluation.
                    step(cat2, "TD", 6, "dean_approver", "partial_approver", "dean_pd", ptype, proc),
                    step(cat2, "TD", 7, "apex_approver", "approver", "director", ptype, proc, condition_field="qualified_vendor_count", condition_operator="<", condition_value=3),
                    step(cat2, "TE", 1, "faculty", "tech_evaluation", "faculty", ptype, proc),
                    step(cat2, "TE", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat2, "TE", 3, "verifier_general", "verifier", "adpd", ptype, proc),
                    step(cat2, "TE", 4, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat2, "FS", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat2, "FS", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat2, "FS", 3, "verifier_sp", "verifier", "consultant_sp", ptype, proc),
                    step(cat2, "FS", 4, "verifier_sp", "verifier", "assistant_registrar", ptype, proc),
                    step(cat2, "FS", 5, "verifier_general", "verifier", "adpd", ptype, proc),
                    step(cat2, "FS", 6, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat2, "FS", 7, "apex_approver", "approver", "director", ptype, proc, skip_condition="not pr.single_bid_justification"),
                    step(cat2, "PO", 1, "verifier_da", "verifier", "dealing_assistant", ptype, proc),
                    step(cat2, "PO", 2, "verifier_sp", "verifier", "assistant_registrar", ptype, proc),
                    step(cat2, "PO", 3, "verifier_sp", "verifier", "deputy_registrar", ptype, proc),
                ])
            if "cat3" in proc_cats:
                cat3 = proc_cats["cat3"]
                rows.extend([
                    step(cat3, "AA", 1, "faculty", "purchase_initiator", "faculty", ptype, proc),
                    step(cat3, "AA", 2, "hod", "verifier", "hod", ptype, proc),
                    step(cat3, "AA", 3, "dean_approver", "approver", "dean_pd", ptype, proc),
                    step(cat3, "AA", 4, "apex_approver", "approver", "director", ptype, proc),
                    step(cat3, "TD", 1, "verifier_sp", "da_assigner", "superintendent", ptype, proc),
                    step(cat3, "TD", 2, "verifier_da", "verifier_da", "dealing_assistant", ptype, proc),
                    step(cat3, "TD", 3, "verifier_sp", "verifier", "superintendent", ptype, proc),
                    step(cat3, "TD", 4, "verifier_sp", "verifier", "consultant_sp", ptype, proc),
                    step(cat3, "TD", 5, "verifier_sp", "approver", "assistant_registrar", ptype, proc),
                    # partial_approver: Dean reviews whether Director approval is needed.
                    step(cat3, "TD", 6, "dean_approver", "partial_approver", "dean_pd", ptype, proc),
                    step(cat3, "TD", 7, "apex_approver", "approver", "director", ptype, proc, condition_field="qualified_vendor_count", condition_operator="<", condition_value=3),
                    step(cat3, "TE", 1, "faculty", "tech_evaluation", "faculty", ptype, proc),
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
                ])


    return rows
