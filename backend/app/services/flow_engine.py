"""
Flow Engine Service — Python port of PrFlowEngineService.php
Includes budget bug fix: lock on submit, deduct on PO_ISSUED.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from fastapi import BackgroundTasks

from app.models.purchase_request import (
    PurchaseRequest, PurchaseRequestFlow, PurchaseRequestHistory,
    WorkFlowHierarchy, RequestStatus,
    CommercialEvaluation, TechnicalEvaluation,
)
from app.models.budget import PhaseManager, BudgetMaster
from app.models.user import User, RoleManager
from app.services.tech_committee import dedupe_committee_ids, resolve_tech_committee_ids, sync_tech_committee_to_pr



class FlowEngineService:
    def __init__(self, db: AsyncSession, background_tasks: Optional[BackgroundTasks] = None):
        """Initialize the FlowEngineService with database session and background tasks."""
        self.db = db
        self.background_tasks = background_tasks

    async def _get_first_phase(self) -> PhaseManager:
        """Fetch the first active phase ordered by phase order."""
        result = await self.db.execute(
            select(PhaseManager).order_by(PhaseManager.phase_order).limit(1)
        )
        return result.scalar_one()

    async def _get_current_flow(self, pr: PurchaseRequest) -> Optional[PurchaseRequestFlow]:
        """Fetch the current workflow state flow record for a purchase request."""
        result = await self.db.execute(
            select(PurchaseRequestFlow).where(PurchaseRequestFlow.purchase_request_id == pr.id)
        )
        return result.scalar_one_or_none()

    def _wf_filters(self, pr: PurchaseRequest, phase_id: int, **extra):
        """Generate filtering clauses for matching a workflow hierarchy step schema."""
        clauses = [
            WorkFlowHierarchy.category_id == pr.category_id,
            WorkFlowHierarchy.procurement_id == pr.procurement_id,
            WorkFlowHierarchy.purchase_type == pr.purchase_type,
            WorkFlowHierarchy.phase_id == phase_id,
            WorkFlowHierarchy.is_enabled == True,
        ]
        for k, v in extra.items():
            clauses.append(getattr(WorkFlowHierarchy, k) == v)
        return and_(*clauses)

    async def _get_step_def(
        self, pr: PurchaseRequest, phase_id: int, step_order: int
    ) -> Optional[WorkFlowHierarchy]:
        """Load specific workflow step definition mapping matching parameters."""
        result = await self.db.execute(
            select(WorkFlowHierarchy).where(
                self._wf_filters(pr, phase_id, step_order=step_order)
            )
        )
        return result.scalar_one_or_none()

    async def _get_first_step(self, pr: PurchaseRequest, phase: PhaseManager) -> Optional[WorkFlowHierarchy]:
        """Helper to get the initial step (order = 1) of a given phase."""
        return await self._get_step_def(pr, phase.id, 1)

    async def _get_next_step_in_phase(self, pr: PurchaseRequest, phase: PhaseManager, current_step: int) -> Optional[int]:
        """Retrieve the sequence step order index for the next step within the active phase."""
        result = await self.db.execute(
            select(WorkFlowHierarchy).where(
                and_(
                    self._wf_filters(pr, phase.id),
                    WorkFlowHierarchy.step_order > current_step,
                )
            ).order_by(WorkFlowHierarchy.step_order)
        )
        steps = result.scalars().all()
        
        for step in steps:
            if step.condition_field:
                val = None
                if step.condition_field == "qualified_vendor_count":
                    # During Tendering (TD) phase: count qualified CommercialEvaluations
                    # (vendors shortlisted by the DA). TechnicalEvaluations don't exist yet
                    # at this stage and would always be 0, causing the Director step to
                    # incorrectly fire every time.
                    # During TE/FS phases: count qualified TechnicalEvaluations instead.
                    if phase.phase_name == "Tendering":
                        val = await self.db.scalar(
                            select(func.count()).select_from(CommercialEvaluation).where(
                                and_(
                                    CommercialEvaluation.purchase_request_id == pr.id,
                                    CommercialEvaluation.is_qualified == True,
                                )
                            )
                        )
                    else:
                        val = await self.db.scalar(
                            select(func.count()).select_from(TechnicalEvaluation).where(
                                and_(
                                    TechnicalEvaluation.purchase_request_id == pr.id,
                                    TechnicalEvaluation.is_qualified == True,
                                )
                            )
                        )
                
                if val is not None:
                    op = step.condition_operator or "<"
                    threshold = step.condition_value if step.condition_value is not None else 3
                    
                    is_met = False
                    if op == "<=":
                        is_met = (val <= threshold)
                    elif op == ">=":
                        is_met = (val >= threshold)
                    elif op == "<":
                        is_met = (val < threshold)
                    elif op == ">":
                        is_met = (val > threshold)
                    elif op == "==":
                        is_met = (val == threshold)
                    elif op == "!=":
                        is_met = (val != threshold)
                    else:
                        is_met = (val < threshold)
                    
                    if not is_met:
                        continue
            elif step.tender_vendors_threshold is not None:
                # Legacy fallback
                vendor_count = await self.db.scalar(
                    select(func.count()).select_from(CommercialEvaluation).where(
                        CommercialEvaluation.purchase_request_id == pr.id
                    )
                )
                
                op = step.tender_vendors_comparison or "<="
                is_met = False
                if op == "<=":
                    is_met = (vendor_count <= step.tender_vendors_threshold)
                elif op == ">=":
                    is_met = (vendor_count >= step.tender_vendors_threshold)
                elif op == "<":
                    is_met = (vendor_count < step.tender_vendors_threshold)
                elif op == ">":
                    is_met = (vendor_count > step.tender_vendors_threshold)
                elif op == "==":
                    is_met = (vendor_count == step.tender_vendors_threshold)
                elif op == "!=":
                    is_met = (vendor_count != step.tender_vendors_threshold)
                else:
                    is_met = (vendor_count <= step.tender_vendors_threshold)
                if not is_met:
                    continue
                    
            if step.skip_condition:
                from app.services.evaluator import safe_eval
                context = {
                    "pr": pr,
                }
                try:
                    should_skip = safe_eval(step.skip_condition, context)
                except Exception:
                    # Fail-secure: Do not skip the step if expression raises error
                    should_skip = False
                if should_skip:
                    continue

            return step.step_order
            
        return None

    async def _check_partial_approver_auto_advance(
        self, pr: PurchaseRequest, phase: PhaseManager, partial_step_order: int
    ) -> bool:
        """Return True when a partial_approver step should be automatically skipped.

        A partial_approver step guards exactly one conditional step that
        immediately follows it.  If that conditional step's condition evaluates
        to False (meaning the conditional step will be skipped anyway) the
        partial_approver has nothing to gate-keep and is auto-advanced.

        If the conditional step will fire (condition is True), the
        partial_approver must stay as the active step and the assigned user
        must manually approve — at which point they act as a standard verifier
        before the conditional step fires.
        """
        # Find the immediately next step after the partial_approver
        result = await self.db.execute(
            select(WorkFlowHierarchy).where(
                and_(
                    self._wf_filters(pr, phase.id),
                    WorkFlowHierarchy.step_order > partial_step_order,
                )
            ).order_by(WorkFlowHierarchy.step_order).limit(1)
        )
        guarded_step = result.scalar_one_or_none()

        if not guarded_step or not guarded_step.condition_field:
            # Nothing conditional follows — partial_approver must act as a verifier
            return False

        # Evaluate the guarded step's condition using the same logic as
        # _get_next_step_in_phase to keep them in sync.
        val = None
        if guarded_step.condition_field == "qualified_vendor_count":
            if phase.phase_name == "Tendering":
                val = await self.db.scalar(
                    select(func.count()).select_from(CommercialEvaluation).where(
                        and_(
                            CommercialEvaluation.purchase_request_id == pr.id,
                            CommercialEvaluation.is_qualified == True,
                        )
                    )
                )
            else:
                val = await self.db.scalar(
                    select(func.count()).select_from(TechnicalEvaluation).where(
                        and_(
                            TechnicalEvaluation.purchase_request_id == pr.id,
                            TechnicalEvaluation.is_qualified == True,
                        )
                    )
                )

        if val is None:
            return False  # Unknown field — fail-secure, require manual approval

        op = guarded_step.condition_operator or "<"
        threshold = guarded_step.condition_value if guarded_step.condition_value is not None else 3

        condition_met = False
        if op == "<=":  condition_met = (val <= threshold)
        elif op == ">=": condition_met = (val >= threshold)
        elif op == "<":  condition_met = (val < threshold)
        elif op == ">": condition_met = (val > threshold)
        elif op == "==": condition_met = (val == threshold)
        elif op == "!=": condition_met = (val != threshold)

        # Auto-advance when the guarded conditional step would NOT fire
        return not condition_met


    async def _get_next_valid_phase(self, pr: PurchaseRequest, current_phase: PhaseManager) -> Optional[PhaseManager]:

        """Next phase that has at least one enabled workflow step (skips TD/TE/FS when undefined)."""
        result = await self.db.execute(
            select(PhaseManager).where(
                PhaseManager.phase_order > current_phase.phase_order
            ).order_by(PhaseManager.phase_order)
        )
        phases = result.scalars().all()
        for phase in phases:
            check = await self.db.execute(
                select(WorkFlowHierarchy).where(self._wf_filters(pr, phase.id)).limit(1)
            )
            if check.scalar_one_or_none():
                return phase
        return None

    async def _add_history(self, pr: PurchaseRequest, user: User, status: str, remarks: Optional[str] = None):
        """Append an entry tracking history actions into the purchase request timeline."""
        import os
        import uuid
        import shutil
        from app.core.config import settings

        # Freeze user details
        frozen_actor_name = f"{user.title} {user.name}" if user.title else user.name
        frozen_designation = user.designation
        
        # Load department if not loaded
        await self.db.refresh(user, ["department"])
        frozen_department = user.department.name if user.department else None

        # Snapshot signature image
        frozen_sig_path = None
        if user.signature_path:
            src_abs = os.path.join(settings.STORAGE_PATH, user.signature_path)
            if os.path.exists(src_abs):
                dest_dir = os.path.join(settings.STORAGE_PATH, "signatures", "snapshots")
                os.makedirs(dest_dir, exist_ok=True)
                ext = os.path.splitext(user.signature_path)[1].lower() or ".png"
                filename = f"{uuid.uuid4().hex}{ext}"
                dest_rel = os.path.join("signatures", "snapshots", filename)
                dest_abs = os.path.join(settings.STORAGE_PATH, dest_rel)
                try:
                    shutil.copy2(src_abs, dest_abs)
                    frozen_sig_path = dest_rel
                except Exception:
                    pass

        history = PurchaseRequestHistory(
            purchase_request_id=pr.id,
            current_approver_id=user.id,
            status=status,
            remarks=remarks,
            acted_at=datetime.utcnow(),
            frozen_actor_name=frozen_actor_name,
            frozen_title=user.title,
            frozen_designation=frozen_designation,
            frozen_department=frozen_department,
            frozen_signature_path=frozen_sig_path,
        )
        self.db.add(history)

    async def _validate_role(self, pr: PurchaseRequest, user: User, flow: PurchaseRequestFlow):
        """Validate if the given user is authorized to act on the current workflow step of the PR."""
        if not user.is_approved:
            raise ValueError("Your account is pending administrator approval.")
        # Admin can do anything
        await self.db.refresh(user, ["role"])
        if user.role.group_key == "admin":
            return
            
        step = await self._get_step_def(pr, flow.phase_id, flow.step_order)
        if not step:
            raise ValueError("Workflow step not found")
            
        # Check by user_id if specific user step
        if step.user_type == "user" and step.user_id:
            if user.id != step.user_id:
                user_res = await self.db.execute(select(User).where(User.id == step.user_id))
                expected_user = user_res.scalar_one_or_none()
                expected_name = expected_user.name if expected_user else f"ID {step.user_id}"
                raise ValueError(f"Action requires user {expected_name}, but user is {user.name}")
            return

        # Special functional tag validations
        if step.user_type == "purchase_initiator":
            if pr.initiator_id != user.id:
                await self.db.refresh(pr, ["initiator"])
                if not (user.role.group_key == "hod" and pr.initiator.department_id == user.department_id):
                    raise ValueError("Only the purchase initiator can perform this step")
            return
            
        elif step.user_type == "da_assigner":
            if step.role_id:
                await self.db.refresh(step, ["role"])
                if user.role_id != step.role_id:
                    raise ValueError(f"Action requires role {step.role.name}")
            else:
                group = user.role.group_key if user.role else None
                if group not in ["superintendent", "verifier_sp"]:
                    raise ValueError("Only the Superintendent S&P can perform this step")
            return
            
        elif step.user_type == "verifier_da":
            from app.models.purchase_request import PurchaseRequestAssignment, AssignmentStatus
            assignment_result = await self.db.execute(
                select(PurchaseRequestAssignment).where(
                    and_(
                        PurchaseRequestAssignment.purchase_request_id == pr.id,
                        PurchaseRequestAssignment.assigned_da_id == user.id
                    )
                )
            )
            assignment = assignment_result.scalar_one_or_none()
            if not assignment:
                # Check if a DIFFERENT DA is already assigned
                any_assignment_result = await self.db.execute(
                    select(PurchaseRequestAssignment).where(
                        PurchaseRequestAssignment.purchase_request_id == pr.id
                    )
                )
                any_assignment = any_assignment_result.scalar_one_or_none()
                if any_assignment:
                    raise ValueError("User is not the assigned Dealing Assistant for this PR")
                # Auto-assign this DA
                auto_assignment = PurchaseRequestAssignment(
                    purchase_request_id=pr.id,
                    assigned_by_id=user.id,
                    assigned_da_id=user.id,
                    status=AssignmentStatus.PENDING,
                )
                self.db.add(auto_assignment)
                await self.db.flush()
            return
            
        elif step.user_type == "tech_evaluation":
            from app.services.tech_committee import is_tech_committee_configured, get_tech_committee_member_ids
            await sync_tech_committee_to_pr(self.db, pr)
            if not await is_tech_committee_configured(self.db, pr):
                raise ValueError(
                    "The technical evaluation committee is not fully configured. "
                    "Ensure Expert 1, Expert 2, and Director nominee are assigned on the budget file."
                )
            committee_ids = await get_tech_committee_member_ids(self.db, pr)

            # Must be one of the committee members (advance is allowed after signing via /technical-eval)
            if user.id not in committee_ids:
                raise ValueError("Only the department purchase committee nominees can perform technical evaluation")
            return

        # Standard role/group checking
        if step.role_id:
            await self.db.refresh(step, ["role"])

        role_value = step.role.value if (step.role_id and step.role) else None
        is_faculty = (role_value == "faculty") or (step.user_group == "faculty")
        is_initiator_acting_as_faculty = (is_faculty and pr.initiator_id == user.id)

        # Enforce that only the Superintendent who assigned the DA can perform subsequent steps
        if step.role_id:
            # IMPORTANT: do not access pr.flow here.
            # In some API flows (especially list/get queries), PurchaseRequest.flow may be lazy-loaded,
            # and touching it can trigger async IO outside the awaited context.
            if step.role and step.role.value == "superintendent" and flow.step_order > 1:
                await self.db.refresh(pr, ["assignments"])
                if pr.assignments:
                    latest_assignment = pr.assignments[-1]
                    if latest_assignment.assigned_by_id != user.id:
                        await self.db.refresh(latest_assignment, ["assigned_by"])
                        assigner_name = latest_assignment.assigned_by.name if latest_assignment.assigned_by else f"ID {latest_assignment.assigned_by_id}"
                        raise ValueError(f"Only the Superintendent who assigned the Dealing Assistant ({assigner_name}) can perform this action")

        # Check by role_id first
        if step.role_id:
            if user.role_id != step.role_id and not is_initiator_acting_as_faculty:
                raise ValueError(f"Action requires role {step.role.name}, but user has {user.role.name if user.role else 'None'}")
        else:
            group = user.role.group_key if user.role else None
            expected = step.user_group
            if expected != group and not is_initiator_acting_as_faculty:
                raise ValueError(f"Action requires role {expected}, but user has {group}")

        is_hod = (role_value == "hod") or (step.user_group == "hod")
        if is_hod:
            await self.db.refresh(pr, ["initiator"])
            if pr.initiator.department_id != user.department_id:
                raise ValueError("Only the HOD of the initiator's department can perform this step")

    async def initialize(self, pr: PurchaseRequest, initiator: User) -> None:
        """Called when PR is first submitted. Locks budget and creates flow step 1."""
        from app.services.budget_service import BudgetService
        budget_svc = BudgetService(self.db)

        # If PR is linked to an Administrative Approval, release the AA's commitment first
        if pr.administrative_approval_id:
            from app.models.administrative_approval import AdministrativeApproval
            # Fetch AA
            aa_res = await self.db.execute(
                select(AdministrativeApproval).where(AdministrativeApproval.id == pr.administrative_approval_id)
            )
            aa = aa_res.scalar_one_or_none()
            if aa and aa.status == "Administrative Approval Granted":
                # Release AA's commitment
                bm_res = await self.db.execute(
                    select(BudgetMaster).where(BudgetMaster.id == aa.budget_file_id).with_for_update()
                )
                bm = bm_res.scalar_one_or_none()
                if bm:
                    bm.committed_amount = max(0.0, bm.committed_amount - aa.total_cost)
                    await self.db.flush()

        await budget_svc.lock_amount(pr)

        await sync_tech_committee_to_pr(self.db, pr)

        first_phase = await self._get_first_phase()
        # Note: All PRs must go through the "Indent and Detailed Tech Specification" phase,
        # regardless of whether they are linked to an administrative approval.
        # The AA provides the budget commitment context, but the PR still needs its own
        # indent & tech spec verification workflow.
        first_step = await self._get_first_step(pr, first_phase)

        if not first_step:
            raise RuntimeError(f"No workflow step 1 found for PR #{pr.id}")

        flow = PurchaseRequestFlow(
            purchase_request_id=pr.id,
            phase_id=first_phase.id,
            step_order=1,
            rejected=False,
        )
        self.db.add(flow)
        await self.db.flush()

        # Auto-advance if initiator is first step group (FACULTY)
        if first_step.role_id:
            await self.db.refresh(first_step, ["role"])
        role_value = first_step.role.value if (first_step.role_id and first_step.role) else None
        is_first_faculty = (
            first_step.user_group == "faculty"
            or (role_value == "faculty")
            or first_step.user_type == "purchase_initiator"
        )
        if is_first_faculty:
            await self.advance(
                pr,
                initiator,
                remarks="Auto-advanced (PI is first assignee)",
                status="PR Submitted",
                db_flush=False,
            )
        else:
            await self._add_history(pr, initiator, "PR Submitted")

    async def advance(self, pr: PurchaseRequest, acted_by: User, remarks: Optional[str] = None,
                       status: Optional[str] = None, db_flush: bool = True) -> PurchaseRequest:
        """Advance the purchase request to the next workflow step or phase, sending email notifications and updating status."""
        if pr.current_status == RequestStatus.BUDGET_FILE_ALLOCATION:
            raise ValueError("This request is currently paused waiting for Budget File Allocation.")

        flow = await self._get_current_flow(pr)
        if not flow:
            raise RuntimeError(f"No active flow for PR #{pr.id}")
            
        await self._validate_role(pr, acted_by, flow)

        result = await self.db.execute(select(PhaseManager).where(PhaseManager.id == flow.phase_id))
        current_phase = result.scalar_one()

        if current_phase.phase_name == "Purchase Order" and not acted_by.signature_path:
            raise ValueError("You must upload a digital signature in your Profile to approve Purchase Order steps.")
        current_step = flow.step_order
        next_step = await self._get_next_step_in_phase(pr, current_phase, current_step)

        # Check if this is the committee technical evaluation step
        step_def = await self._get_step_def(pr, flow.phase_id, flow.step_order)
        is_tech_eval_step = step_def and step_def.user_type == "tech_evaluation"

        should_advance = True

        if is_tech_eval_step:
            await self.db.refresh(pr, ["history"])
            # Check if this user has already logged an approval in the database for this step
            since = pr.te_initiated_at or pr.created_at or datetime.min
            has_approval_log = any(
                h.current_approver_id == acted_by.id
                and h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
                and (h.acted_at is None or h.acted_at >= since)
                for h in pr.history
            )
            
            from app.services.tech_committee import is_tech_committee_configured, get_tech_committee_member_ids
            await sync_tech_committee_to_pr(self.db, pr)
            if not await is_tech_committee_configured(self.db, pr):
                if has_approval_log:
                    raise ValueError("You have already signed/approved this technical evaluation round.")
                default_status = "Technical Evaluation Completed" if pr.initiator_id == acted_by.id else "Technical Evaluation Approved"
                await self._add_history(pr, acted_by, status or default_status, remarks)
                should_advance = False
                flow.step_order = current_step
                pr.current_status = RequestStatus.IN_PROGRESS
            else:
                required_ids = set(await get_tech_committee_member_ids(self.db, pr))
                await self.db.refresh(pr, ["history"])
                approved_ids = {
                    h.current_approver_id for h in pr.history
                    if h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
                    and (h.acted_at is None or h.acted_at >= since)
                }
                if has_approval_log:
                    if not required_ids.issubset(approved_ids):
                        raise ValueError("You have already signed/approved this technical evaluation round.")
                else:
                    default_status = "Technical Evaluation Completed" if pr.initiator_id == acted_by.id else "Technical Evaluation Approved"
                    await self._add_history(pr, acted_by, status or default_status, remarks)
                    approved_ids.add(acted_by.id)

                if not required_ids.issubset(approved_ids):
                    should_advance = False
                    flow.step_order = current_step
                    pr.current_status = RequestStatus.IN_PROGRESS

        if should_advance:
            if next_step is not None:
                flow.step_order = next_step
                pr.current_status = RequestStatus.IN_PROGRESS
                if not is_tech_eval_step:
                    await self._add_history(pr, acted_by, status or "Forwarded", remarks)

                # ── PARTIAL APPROVER AUTO-ADVANCE ──────────────────────────────
                # If we just landed on a partial_approver step and the conditional
                # step it guards will NOT fire, skip it immediately.
                new_step_def = await self._get_step_def(pr, current_phase.id, next_step)

                if new_step_def and new_step_def.user_type == "partial_approver":
                    should_skip = await self._check_partial_approver_auto_advance(
                        pr, current_phase, next_step
                    )
                    if should_skip:
                        await self._add_history(
                            pr, acted_by,
                            "Auto-forwarded — partial approver bypassed (conditional step not applicable)",
                            None,
                        )
                        # Advance from the partial_approver position; the
                        # conditional step immediately after it will also be
                        # skipped by _get_next_step_in_phase (condition false).
                        next_after = await self._get_next_step_in_phase(
                            pr, current_phase, next_step
                        )
                        if next_after is not None:
                            flow.step_order = next_after
                        else:
                            # All remaining steps in this phase are skipped —
                            # move to the next valid phase.
                            next_phase = await self._get_next_valid_phase(pr, current_phase)
                            if next_phase:
                                flow.phase_id = next_phase.id
                                flow.step_order = 1
                                pr.current_status = RequestStatus.IN_PROGRESS
                                if next_phase.phase_name == "Technical Evaluation":
                                    pr.te_initiated_at = datetime.utcnow()
                                    await sync_tech_committee_to_pr(self.db, pr)
                                await self._add_history(
                                    pr, acted_by,
                                    "Forwarded to next phase (partial approver auto-advanced)",
                                    None,
                                )
                # ── END PARTIAL APPROVER ────────────────────────────────────────

            else:
                if current_phase.phase_name in ("Indent and Detailed Tech Specification", "Administrative Approval"):
                    pr.aa_approved_at = datetime.utcnow()
                    pr.aa_approver_id = acted_by.id
                elif current_phase.phase_name == "Technical Evaluation":
                    pr.te_approved_at = datetime.utcnow()
                    # Write final TE completion entry (after all committee members have signed)
                    await self._add_history(pr, acted_by, "Technical Evaluation Phase Completed", remarks)
                elif current_phase.phase_name == "Financial Sanction":
                    pr.fs_approved_at = datetime.utcnow()

                is_budget_file_number_required = False

                next_phase = await self._get_next_valid_phase(pr, current_phase)
                if next_phase:
                    flow.phase_id = next_phase.id
                    flow.step_order = 1
                    if is_budget_file_number_required:
                        pr.current_status = RequestStatus.BUDGET_FILE_ALLOCATION
                        await self._add_history(pr, acted_by, "Awaiting Budget File Allocation", remarks)
                    else:
                        pr.current_status = RequestStatus.IN_PROGRESS
                        if next_phase.phase_name == "Technical Evaluation":
                            pr.te_initiated_at = datetime.utcnow()
                            await sync_tech_committee_to_pr(self.db, pr)
                        if not is_tech_eval_step:
                            await self._add_history(pr, acted_by, status or "Forwarded to next phase", remarks)
                else:
                    # Workflow complete — final PO step is faculty goods receipt
                    completed_step = await self._get_step_def(pr, current_phase.id, current_step)
                    phase_name = current_phase.phase_name or ""
                    is_po_completion = (phase_name == "Purchase Order")
                    
                    role_value = None
                    if completed_step and completed_step.role_id:
                        await self.db.refresh(completed_step, ["role"])
                        role_value = completed_step.role.value if completed_step.role else None

                    is_faculty_receipt = (
                        is_po_completion
                        and completed_step is not None
                        and (
                            completed_step.user_group == "faculty"
                            or role_value == "faculty"
                            or completed_step.user_type == "purchase_initiator"
                        )
                    )
                    if is_faculty_receipt and pr.initiator_id != acted_by.id:
                        raise ValueError("Only the PR initiator can confirm receipt of goods")

                    pr.current_status = RequestStatus.PO_ISSUED
                    pr.po_approved_at = datetime.utcnow()
                    await self._add_history(
                        pr,
                        acted_by,
                        status or ("Goods received — PO Issued" if is_faculty_receipt else "PO Issued"),
                        remarks,
                    )
                    await self.db.delete(flow)

                    from app.services.budget_service import BudgetService
                    budget_svc = BudgetService(self.db)
                    await budget_svc.deduct_amount(pr)

                    if is_po_completion:
                        from app.services.grn_service import GrnService
                        grn_svc = GrnService(self.db)
                        await grn_svc.create_delivery(pr)

        if db_flush:
            await self.db.flush()

        # Email notifications: notify next approvers or notify initiator on completion
        from app.services.email_service import EmailService
        email_svc = EmailService(self.background_tasks)
        if pr.current_status == RequestStatus.PO_ISSUED:
            await self.db.refresh(pr, ["initiator"])
            if pr.initiator and pr.initiator.email:
                email_svc.notify_next_approver(pr.id, pr.icr_number, "PO Issued (Complete)", pr.initiator.email)
        else:
            # Query the user group for the new step
            from sqlalchemy.orm import selectinload
            new_step_result = await self.db.execute(
                select(WorkFlowHierarchy).options(
                    selectinload(WorkFlowHierarchy.role),
                    selectinload(WorkFlowHierarchy.user)
                ).where(
                    self._wf_filters(pr, flow.phase_id, step_order=flow.step_order)
                )
            )
            new_step = new_step_result.scalar_one_or_none()
            if new_step:
                if new_step.user_type == "user" and new_step.user_id:
                    user_res = await self.db.execute(select(User.email).where(User.id == new_step.user_id))
                    email = user_res.scalar_one_or_none()
                    next_emails = [email] if email else []
                    label = new_step.user.name if new_step.user else "User"
                else:
                    next_emails = await self.get_next_approvers_emails(pr, new_step.user_group)
                    label = new_step.role.name if (new_step.role and new_step.role.name) else (new_step.user_group or "User")
                for email in next_emails:
                    email_svc.notify_next_approver(pr.id, pr.icr_number, label, email)

        return pr

    async def get_next_approvers_emails(self, pr: PurchaseRequest, group_key: str) -> list[str]:
        """Fetch the email addresses of users belonging to the expected workflow group_key for notifications."""
        if group_key == "faculty":
            await self.db.refresh(pr, ["initiator"])
            return [pr.initiator.email] if pr.initiator and pr.initiator.email else []
        elif group_key == "hod":
            await self.db.refresh(pr, ["initiator"])
            if not pr.initiator or not pr.initiator.department_id:
                return []
            from app.models.user import RoleManager
            result = await self.db.execute(
                select(User.email)
                .join(RoleManager, User.role_id == RoleManager.id)
                .where(
                    and_(
                        User.department_id == pr.initiator.department_id,
                        RoleManager.group_key == "hod"
                    )
                )
            )
            return list(result.scalars().all())
        else:
            from app.models.user import RoleManager
            result = await self.db.execute(
                select(User.email)
                .join(RoleManager, User.role_id == RoleManager.id)
                .where(RoleManager.group_key == group_key)
            )
            return list(result.scalars().all())

    async def reject(self, pr: PurchaseRequest, rejected_by: User, reason: str) -> bool:
        """Reject the purchase request, unlocking its budget and notifying the initiator."""
        if pr.current_status == RequestStatus.BUDGET_FILE_ALLOCATION:
            raise ValueError("This request is currently paused waiting for Budget File Allocation.")

        flow = await self._get_current_flow(pr)
        if not flow:
            raise RuntimeError(f"No active flow to reject for PR #{pr.id}")
            
        await self._validate_role(pr, rejected_by, flow)

        flow.rejected = True
        pr.current_status = RequestStatus.REJECTED
        await self._add_history(pr, rejected_by, f"PR Rejected by {rejected_by.name}", reason)

        # Release locked budget so available_amount is restored
        from app.services.budget_service import BudgetService
        budget_svc = BudgetService(self.db)
        await budget_svc.unlock_amount(pr)

        await self.db.flush()

        # Notify initiator
        await self.db.refresh(pr, ["initiator"])
        if pr.initiator and pr.initiator.email:
            from app.services.email_service import EmailService
            email_svc = EmailService(self.background_tasks)
            email_svc.notify_rejection(pr.id, pr.icr_number, rejected_by.name, reason, pr.initiator.email)

        return True

    async def send_back(self, pr: PurchaseRequest, acted_by: User, to_step: int, reason: str) -> None:
        """Send the purchase request back to a previous workflow step within the current phase."""
        if pr.current_status == RequestStatus.BUDGET_FILE_ALLOCATION:
            raise ValueError("This request is currently paused waiting for Budget File Allocation.")

        flow = await self._get_current_flow(pr)
        if not flow:
            raise RuntimeError(f"No active flow for PR #{pr.id}")
            
        await self._validate_role(pr, acted_by, flow)
        
        if to_step >= flow.step_order or to_step < 1:
            raise ValueError(f"Cannot send back to step {to_step} from {flow.step_order}")
        pr.current_status = RequestStatus.SENT_BACK
        flow.step_order = to_step
        flow.rejected = False

        # Reset approvals round if sending back to step 1 of Technical Evaluation
        result_phase = await self.db.execute(select(PhaseManager).where(PhaseManager.id == flow.phase_id))
        phase = result_phase.scalar_one()
        if phase.phase_name == "Technical Evaluation" and to_step == 1:
            pr.te_initiated_at = datetime.utcnow()

        # Void history entries for steps reset by the send-back
        phase_name = phase.phase_name
        if phase_name == "Technical Evaluation":
            t_phase_start = pr.te_initiated_at
        elif phase_name == "Financial Sanction":
            t_phase_start = pr.fs_initiated_at
        elif phase_name == "Purchase Order":
            t_phase_start = pr.po_initiated_at
        else:
            t_phase_start = pr.created_at

        if not t_phase_start:
            t_phase_start = pr.created_at or datetime.min

        t_cutoff = t_phase_start
        if to_step > 1:
            prev_step_def = await self._get_step_def(pr, flow.phase_id, to_step - 1)
            if prev_step_def:
                from sqlalchemy.orm import selectinload
                await self.db.refresh(pr, ["history"])
                sorted_hist = sorted(pr.history, key=lambda x: x.acted_at or datetime.min, reverse=True)
                
                prev_hist_entry = None
                for h in sorted_hist:
                    if h.acted_at and h.acted_at < t_phase_start:
                        continue
                    if "Voided" in (h.status or ""):
                        continue
                    
                    if h.current_approver_id:
                        user_res = await self.db.execute(
                            select(User)
                            .options(selectinload(User.role))
                            .where(User.id == h.current_approver_id)
                        )
                        u = user_res.scalar_one_or_none()
                        if u:
                            matches = False
                            if prev_step_def.user_type == "user" and prev_step_def.user_id:
                                matches = (u.id == prev_step_def.user_id)
                            elif prev_step_def.user_type == "purchase_initiator":
                                matches = (u.id == pr.initiator_id)
                            elif prev_step_def.user_type == "tech_evaluation":
                                matches = (h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved"))
                            elif prev_step_def.role_id:
                                matches = (u.role_id == prev_step_def.role_id)
                            elif prev_step_def.user_group:
                                matches = (u.role and u.role.group_key == prev_step_def.user_group)
                                
                            if matches:
                                prev_hist_entry = h
                                break
                if prev_hist_entry and prev_hist_entry.acted_at:
                    t_cutoff = prev_hist_entry.acted_at

        # Void all history entries created after or at t_cutoff in this round
        await self.db.refresh(pr, ["history"])
        for h in pr.history:
            if h.acted_at:
                is_after_cutoff = (h.acted_at >= t_cutoff) if to_step == 1 else (h.acted_at > t_cutoff)
                if is_after_cutoff:
                    if "Voided" not in (h.status or ""):
                        h.status = f"{h.status} (Voided)"

        await self._add_history(pr, acted_by, "PR Sent Back", reason)
        await self.db.flush()        # Notify initiator
        await self.db.refresh(pr, ["initiator"])
        if pr.initiator and pr.initiator.email:
            from app.services.email_service import EmailService
            email_svc = EmailService(self.background_tasks)
            email_svc.notify_send_back(pr.id, pr.icr_number, acted_by.name, reason, pr.initiator.email)

    async def get_send_back_candidates(self, pr: PurchaseRequest) -> list:
        """Get the list of prior workflow steps in the current phase that this purchase request can be sent back to."""
        flow = await self._get_current_flow(pr)
        if not flow:
            return []
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(WorkFlowHierarchy)
            .options(selectinload(WorkFlowHierarchy.role))
            .where(
                and_(
                    self._wf_filters(pr, flow.phase_id),
                    WorkFlowHierarchy.step_order < flow.step_order,
                )
            ).order_by(WorkFlowHierarchy.step_order)
        )
        return result.scalars().all()

    async def force_advance(self, pr: PurchaseRequest, acted_by: User, remarks: str) -> PurchaseRequest:
        """Bypass standard checks and force advance the PR to the next step or phase."""
        flow = await self._get_current_flow(pr)
        if not flow:
            raise ValueError(f"No active flow for PR #{pr.id}")
            
        result = await self.db.execute(select(PhaseManager).where(PhaseManager.id == flow.phase_id))
        current_phase = result.scalar_one()

        current_step = flow.step_order
        next_step = await self._get_next_step_in_phase(pr, current_phase, current_step)

        hist_status = "Force Advanced by Admin"

        if next_step is not None:
            flow.step_order = next_step
            pr.current_status = RequestStatus.IN_PROGRESS
            await self._add_history(pr, acted_by, hist_status, remarks)
        else:
            if current_phase.phase_name in ("Indent and Detailed Tech Specification", "Administrative Approval"):
                pr.aa_approved_at = datetime.utcnow()
                pr.aa_approver_id = acted_by.id
            elif current_phase.phase_name == "Technical Evaluation":
                pr.te_approved_at = datetime.utcnow()
            elif current_phase.phase_name == "Financial Sanction":
                pr.fs_approved_at = datetime.utcnow()

            next_phase = await self._get_next_valid_phase(pr, current_phase)
            if next_phase:
                flow.phase_id = next_phase.id
                flow.step_order = 1
                pr.current_status = RequestStatus.IN_PROGRESS
                if next_phase.phase_name == "Technical Evaluation":
                    pr.te_initiated_at = datetime.utcnow()
                await self._add_history(pr, acted_by, f"{hist_status} to {next_phase.phase_name}", remarks)
            else:
                pr.current_status = RequestStatus.PO_ISSUED
                pr.po_approved_at = datetime.utcnow()
                await self._add_history(pr, acted_by, "Force Completed by Admin", remarks)
                await self.db.delete(flow)

                from app.services.grn_service import GrnService
                grn_svc = GrnService(self.db)
                await grn_svc.create_delivery(pr)

                from app.services.budget_service import BudgetService
                budget_svc = BudgetService(self.db)
                await budget_svc.deduct_amount(pr)

        await self.db.flush()
        return pr
