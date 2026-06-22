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
    PurchaseRequestItem,
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
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(PurchaseRequestFlow)
            .options(selectinload(PurchaseRequestFlow.phase))
            .where(PurchaseRequestFlow.purchase_request_id == pr.id)
        )
        return result.scalar_one_or_none()

    async def resolve_sof_id(self, pr: PurchaseRequest, phase_id: Optional[int] = None) -> Optional[int]:
        """Resolve the SourceOfFund.id for this PR by looking at the budget file attached to its items.

        Returns the SourceOfFund.id if fund-specific workflow rows exist for this PR's SOF
        in the given phase (or across all phases when phase_id is None); otherwise returns None
        so that the default (source_of_fund_id IS NULL) rows are used.

        Always pass phase_id when resolving for a specific phase — this prevents a PR whose SOF
        has rows in phase A from incorrectly activating SOF-mode in phase B where no such rows exist.
        """
        from app.models.budget import SourceOfFund
        # Grab the source_of_fund string from the first budget file linked to this PR's items
        item_res = await self.db.execute(
            select(PurchaseRequestItem).where(
                PurchaseRequestItem.purchase_request_id == pr.id
            ).limit(1)
        )
        item = item_res.scalar_one_or_none()
        if not item:
            return None
        bm_res = await self.db.execute(
            select(BudgetMaster).where(BudgetMaster.id == item.budget_file_id)
        )
        bm = bm_res.scalar_one_or_none()
        if not bm or not bm.source_of_fund:
            return None
        sof_res = await self.db.execute(
            select(SourceOfFund.id).where(SourceOfFund.name == bm.source_of_fund)
        )
        sof_id = sof_res.scalar_one_or_none()
        if sof_id is None and bm.source_of_fund:
            # Fallback: prefix match for cases where budget_master stores a short form
            # (e.g. "CAPEX") but source_of_funds uses the canonical name ("CAPEX (OH-35)").
            sof_res2 = await self.db.execute(
                select(SourceOfFund.id)
                .where(SourceOfFund.name.istartswith(bm.source_of_fund + " "))
                .limit(1)
            )
            sof_id = sof_res2.scalar_one_or_none()
        if sof_id is None:
            return None
        # Only return sof_id if fund-specific workflow rows actually exist for this phase
        fund_check_clauses = [
            WorkFlowHierarchy.category_id == pr.category_id,
            WorkFlowHierarchy.procurement_id == pr.procurement_id,
            WorkFlowHierarchy.purchase_type == pr.purchase_type,
            WorkFlowHierarchy.is_enabled == True,
            WorkFlowHierarchy.source_of_fund_id == sof_id,
        ]
        if phase_id is not None:
            fund_check_clauses.append(WorkFlowHierarchy.phase_id == phase_id)
        fund_check = await self.db.execute(
            select(WorkFlowHierarchy).where(and_(*fund_check_clauses)).limit(1)
        )
        return sof_id if fund_check.scalar_one_or_none() else None

    async def realign_pr_flow(self, pr: PurchaseRequest) -> None:
        """Dynamic alignment of PurchaseRequestFlow based on history and active WorkFlowHierarchy."""
        if pr.current_status in (RequestStatus.COMPLETED, RequestStatus.PO_ISSUED, RequestStatus.REJECTED, RequestStatus.CANCELLED, RequestStatus.SENT_BACK):
            return

        flow = await self._get_current_flow(pr)
        if not flow:
            return

        sof_id = await self.resolve_sof_id(pr, phase_id=flow.phase_id)
        # Get active steps for this phase
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(WorkFlowHierarchy)
            .options(selectinload(WorkFlowHierarchy.role), selectinload(WorkFlowHierarchy.user))
            .where(
                self._wf_filters(pr, flow.phase_id, sof_id=sof_id)
            ).order_by(WorkFlowHierarchy.step_order)
        )
        steps = result.scalars().all()
        if not steps:
            return

        # Deduplicate by step_order: two rows with the same step_order would each
        # count as a separate required approval in the matching loop below, causing
        # the flow to loop forever if one role never appears in history.
        seen_orders: set = set()
        deduped = []
        for s in steps:
            if s.step_order not in seen_orders:
                seen_orders.add(s.step_order)
                deduped.append(s)
        steps = deduped

        # Fetch PR history
        from app.models.purchase_request import PurchaseRequestHistory
        history_res = await self.db.execute(
            select(PurchaseRequestHistory)
            .options(selectinload(PurchaseRequestHistory.current_approver).selectinload(User.role))
            .where(PurchaseRequestHistory.purchase_request_id == pr.id)
        )
        pr_history = history_res.scalars().all()

        approved_indices = set()
        te_signed_user_ids = set()
        sorted_history = sorted(pr_history, key=lambda x: x.acted_at)
        for h in sorted_history:
            status_lower = h.status.lower() if h.status else ""
            if "sent back" in status_lower or "returned" in status_lower:
                approved_indices = set()
                te_signed_user_ids = set()
                continue
            # Phase transitions reset approved state — history from prior phases must not
            # pollute the current phase's step matching (e.g. indent PI auto-submit should
            # not count as the tendering PI step being completed).
            if "next phase" in status_lower or "technical evaluation phase completed" in status_lower:
                approved_indices = set()
                te_signed_user_ids = set()
                continue
            if "rejected" in status_lower or "voided" in status_lower:
                continue

            # Record technical evaluation signatures.
            h_status = h.status.strip() if h.status else ""
            is_te_signature = h_status.lower() in ("technical evaluation completed", "technical evaluation approved")
            if is_te_signature and h.current_approver_id:
                te_signed_user_ids.add(h.current_approver_id)
                # Check if this tech_evaluation step is now fully approved.
                from app.services.tech_committee import is_tech_committee_configured, get_tech_committee_member_ids
                await sync_tech_committee_to_pr(self.db, pr)
                if await is_tech_committee_configured(self.db, pr):
                    required_ids = set(await get_tech_committee_member_ids(self.db, pr))
                    if required_ids and required_ids.issubset(te_signed_user_ids):
                        # Find the tech_evaluation step and add it to approved_indices
                        for idx in range(len(steps)):
                            if steps[idx].user_type == "tech_evaluation":
                                # SPECIAL RULE: If the flow is currently at this tech_evaluation step,
                                # we do NOT mark it as approved here, because we want the normal advance
                                # logic to handle the transition (so the user is validated against the TE step).
                                if flow.step_order == steps[idx].step_order:
                                    continue
                                approved_indices.add(idx)
                continue  # Skip matching TE signatures as standard single-user approvals

            if h.current_approver:
                role_val = h.current_approver.role.value if h.current_approver.role else None
                group_key = h.current_approver.role.group_key if h.current_approver.role else None
                
                found_idx = -1
                for idx in range(len(steps)):
                    if idx in approved_indices:
                        continue
                    if steps[idx].user_type == "tech_evaluation":
                        continue
                    step_role = steps[idx].role.value if steps[idx].role else None
                    step_group = steps[idx].user_group.lower() if steps[idx].user_group else ""
                    if (role_val and step_role and role_val.lower() == step_role.lower()) or \
                       (group_key and step_group and group_key.lower() == step_group.lower()):
                        found_idx = idx
                        break
                if found_idx != -1:
                    approved_indices.add(found_idx)

        expected_step_idx = len(steps)
        for idx in range(len(steps)):
            if idx not in approved_indices:
                expected_step_idx = idx
                break
        
        if expected_step_idx < len(steps):
            expected_step_order = steps[expected_step_idx].step_order
        else:
            current_phase = flow.phase
            if not current_phase:
                await self.db.refresh(flow, ["phase"])
                current_phase = flow.phase
            next_phase = await self._get_next_valid_phase(pr, current_phase)
            if next_phase:
                next_sof_id = await self.resolve_sof_id(pr, phase_id=next_phase.id)
                flow.phase_id = next_phase.id
                first_step = await self._get_first_step(pr, next_phase, next_sof_id)
                expected_step_order = first_step.step_order if first_step else 1
            else:
                pr.current_status = RequestStatus.PO_ISSUED
                expected_step_order = flow.step_order

        if flow.step_order != expected_step_order:
            flow.step_order = expected_step_order
            await self.db.commit()

    def _wf_filters(self, pr: PurchaseRequest, phase_id: int, sof_id: Optional[int] = None, **extra):
        """Generate filtering clauses for matching a workflow hierarchy step schema.

        When sof_id is provided, filter by that specific source_of_fund_id.
        When sof_id is None (default/fallback), filter for rows where source_of_fund_id IS NULL.
        """
        clauses = [
            WorkFlowHierarchy.category_id == pr.category_id,
            WorkFlowHierarchy.procurement_id == pr.procurement_id,
            WorkFlowHierarchy.purchase_type == pr.purchase_type,
            WorkFlowHierarchy.phase_id == phase_id,
            WorkFlowHierarchy.is_enabled == True,
            WorkFlowHierarchy.source_of_fund_id == sof_id,
        ]
        for k, v in extra.items():
            clauses.append(getattr(WorkFlowHierarchy, k) == v)
        return and_(*clauses)

    async def _get_step_def(
        self, pr: PurchaseRequest, phase_id: int, step_order: int,
        sof_id: Optional[int] = None,
    ) -> Optional[WorkFlowHierarchy]:
        """Load specific workflow step definition mapping matching parameters.

        sof_id should be pre-resolved via resolve_sof_id(); when None, the default
        (source_of_fund_id IS NULL) row is used.
        """
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(WorkFlowHierarchy)
            .options(selectinload(WorkFlowHierarchy.role), selectinload(WorkFlowHierarchy.user))
            .where(
                self._wf_filters(pr, phase_id, sof_id=sof_id, step_order=step_order)
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_first_step(self, pr: PurchaseRequest, phase: PhaseManager, sof_id: Optional[int] = None) -> Optional[WorkFlowHierarchy]:
        """Helper to get the lowest step_order step of a given phase."""
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(WorkFlowHierarchy)
            .options(selectinload(WorkFlowHierarchy.role), selectinload(WorkFlowHierarchy.user))
            .where(self._wf_filters(pr, phase.id, sof_id=sof_id))
            .order_by(WorkFlowHierarchy.step_order)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_next_step_in_phase(self, pr: PurchaseRequest, phase: PhaseManager, current_step: int, sof_id: Optional[int] = None) -> Optional[int]:
        """Retrieve the sequence step order index for the next step within the active phase."""
        result = await self.db.execute(
            select(WorkFlowHierarchy).where(
                and_(
                    self._wf_filters(pr, phase.id, sof_id=sof_id),
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
        sof_id = await self.resolve_sof_id(pr, phase_id=phase.id)
        result = await self.db.execute(
            select(WorkFlowHierarchy).where(
                and_(
                    self._wf_filters(pr, phase.id, sof_id=sof_id),
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


    async def _get_prev_valid_phase(self, pr: PurchaseRequest, current_phase: PhaseManager) -> Optional[PhaseManager]:
        """Previous phase that has at least one enabled workflow step for this PR."""
        result = await self.db.execute(
            select(PhaseManager).where(
                PhaseManager.phase_order < current_phase.phase_order
            ).order_by(PhaseManager.phase_order.desc())
        )
        phases = result.scalars().all()
        for phase in phases:
            sof_id = await self.resolve_sof_id(pr, phase_id=phase.id)
            check = await self.db.execute(
                select(WorkFlowHierarchy).where(self._wf_filters(pr, phase.id, sof_id=sof_id)).limit(1)
            )
            if check.scalar_one_or_none():
                return phase
        return None

    async def _get_next_valid_phase(self, pr: PurchaseRequest, current_phase: PhaseManager) -> Optional[PhaseManager]:
        """Next phase that has at least one enabled workflow step (skips TD/TE/FS when undefined).

        Resolves SOF per-phase so a PR whose SOF has rows only in certain phases does not
        accidentally skip phases that only have generic (sof_id=NULL) rows.
        """
        result = await self.db.execute(
            select(PhaseManager).where(
                PhaseManager.phase_order > current_phase.phase_order
            ).order_by(PhaseManager.phase_order)
        )
        phases = result.scalars().all()
        for phase in phases:
            sof_id = await self.resolve_sof_id(pr, phase_id=phase.id)
            check = await self.db.execute(
                select(WorkFlowHierarchy).where(self._wf_filters(pr, phase.id, sof_id=sof_id)).limit(1)
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

        sof_id = await self.resolve_sof_id(pr, phase_id=flow.phase_id)
        step = await self._get_step_def(pr, flow.phase_id, flow.step_order, sof_id=sof_id)
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
                    "The technical evaluation committee is not configured. "
                    "At least one HOD-nominated Expert (Expert 1) must be assigned."
                )
            committee_ids = await get_tech_committee_member_ids(self.db, pr)

            since = pr.te_initiated_at or pr.created_at or datetime.min
            await self.db.refresh(pr, ["history"])
            approved_ids = {
                h.current_approver_id for h in pr.history
                if h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
                and (h.acted_at is None or h.acted_at >= since)
            }
            all_committee_signed = len(committee_ids) > 0 and set(committee_ids).issubset(approved_ids)

            if all_committee_signed:
                if user.id != pr.initiator_id:
                    raise ValueError(
                        "All committee members have submitted. Waiting for purchase initiator to confirm final vendor qualifications."
                    )
                return

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
        sof_id = await self.resolve_sof_id(pr, phase_id=first_phase.id)
        first_step = await self._get_first_step(pr, first_phase, sof_id=sof_id)

        if not first_step:
            raise RuntimeError(f"No workflow steps found for PR #{pr.id} in first phase")

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
            
        await self.realign_pr_flow(pr)
        await self._validate_role(pr, acted_by, flow)

        result = await self.db.execute(select(PhaseManager).where(PhaseManager.id == flow.phase_id))
        current_phase = result.scalar_one()

        if current_phase.phase_name == "Purchase Order" and not acted_by.signature_path:
            raise ValueError("You must upload a digital signature in your Profile to approve Purchase Order steps.")
        current_step = flow.step_order
        sof_id = await self.resolve_sof_id(pr, phase_id=flow.phase_id)
        next_step = await self._get_next_step_in_phase(pr, current_phase, current_step, sof_id=sof_id)

        # Check if this is the committee technical evaluation step
        step_def = await self._get_step_def(pr, flow.phase_id, flow.step_order, sof_id=sof_id)
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
                    if not required_ids.issubset(approved_ids) or pr.initiator_id not in approved_ids:
                        raise ValueError("You have already signed/approved this technical evaluation round.")
                else:
                    default_status = "Technical Evaluation Completed" if pr.initiator_id == acted_by.id else "Technical Evaluation Approved"
                    await self._add_history(pr, acted_by, status or default_status, remarks)
                    approved_ids.add(acted_by.id)

                all_committee_signed = required_ids.issubset(approved_ids)
                initiator_signed = pr.initiator_id in approved_ids
                if not all_committee_signed or not initiator_signed:
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
                new_step_def = await self._get_step_def(pr, current_phase.id, next_step, sof_id=sof_id)

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
                            pr, current_phase, next_step, sof_id=sof_id
                        )
                        if next_after is not None:
                            flow.step_order = next_after
                        else:
                            # All remaining steps in this phase are skipped —
                            # move to the next valid phase.
                            next_phase = await self._get_next_valid_phase(pr, current_phase)
                            if next_phase:
                                next_sof_id = await self.resolve_sof_id(pr, phase_id=next_phase.id)
                                first_in_next = await self._get_first_step(pr, next_phase, next_sof_id)
                                flow.phase_id = next_phase.id
                                flow.step_order = first_in_next.step_order if first_in_next else 1
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
                    next_sof_id = await self.resolve_sof_id(pr, phase_id=next_phase.id)
                    first_in_next = await self._get_first_step(pr, next_phase, next_sof_id)
                    flow.phase_id = next_phase.id
                    flow.step_order = first_in_next.step_order if first_in_next else 1
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
                    completed_step = await self._get_step_def(pr, current_phase.id, current_step, sof_id=sof_id)
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
                    self._wf_filters(pr, flow.phase_id, sof_id=sof_id, step_order=flow.step_order)
                ).limit(1)
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
        """Reset the PR to the first step of the current phase.

        If the PR is at the first phase, performs a terminal rejection:
        budget is unlocked and the PR is permanently closed.
        """
        if pr.current_status == RequestStatus.BUDGET_FILE_ALLOCATION:
            raise ValueError("This request is currently paused waiting for Budget File Allocation.")

        flow = await self._get_current_flow(pr)
        if not flow:
            raise RuntimeError(f"No active flow to reject for PR #{pr.id}")

        await self._validate_role(pr, rejected_by, flow)

        result = await self.db.execute(select(PhaseManager).where(PhaseManager.id == flow.phase_id))
        current_phase = result.scalar_one()

        # Check if this is the first phase — if so, terminal rejection
        first_phase = await self._get_first_phase()
        if current_phase.id == first_phase.id:
            flow.rejected = True
            pr.current_status = RequestStatus.REJECTED
            await self._add_history(pr, rejected_by, f"PR Rejected by {rejected_by.name}", reason)
            from app.services.budget_service import BudgetService
            budget_svc = BudgetService(self.db)
            await budget_svc.unlock_amount(pr)
            await self.db.flush()
            await self.db.refresh(pr, ["initiator"])
            if pr.initiator and pr.initiator.email:
                from app.services.email_service import EmailService
                email_svc = EmailService(self.background_tasks)
                email_svc.notify_rejection(pr.id, pr.icr_number, rejected_by.name, reason, pr.initiator.email)
            return True

        # Reset to the first step of the current phase
        sof_id = await self.resolve_sof_id(pr, phase_id=current_phase.id)
        first_step = await self._get_first_step(pr, current_phase, sof_id)

        # Void all history from when the current phase started
        phase_name = current_phase.phase_name
        if phase_name == "Technical Evaluation":
            t_cutoff = pr.te_initiated_at or pr.aa_approved_at or pr.created_at
        elif phase_name == "Financial Sanction":
            t_cutoff = pr.fs_initiated_at or pr.te_approved_at or pr.created_at
        elif phase_name == "Purchase Order":
            t_cutoff = pr.po_initiated_at or pr.fs_approved_at or pr.created_at
        elif phase_name == "Tendering":
            t_cutoff = pr.aa_approved_at or pr.created_at
        else:
            t_cutoff = pr.created_at

        if not t_cutoff:
            t_cutoff = datetime.min

        await self.db.refresh(pr, ["history"])
        for h in pr.history:
            if h.acted_at and h.acted_at > t_cutoff:
                if "Voided" not in (h.status or ""):
                    h.status = f"{h.status} (Voided)"

        # Reset the current phase's timestamps so the next round starts fresh
        if phase_name == "Technical Evaluation":
            pr.te_approved_at = None
            pr.te_initiated_at = datetime.utcnow()
        elif phase_name == "Financial Sanction":
            pr.fs_approved_at = None
            pr.fs_initiated_at = datetime.utcnow()
        elif phase_name == "Purchase Order":
            pr.po_approved_at = None

        flow.phase_id = current_phase.id
        flow.step_order = first_step.step_order if first_step else 1
        flow.rejected = False
        pr.current_status = RequestStatus.SENT_BACK

        await self._add_history(pr, rejected_by, f"Returned to start of {phase_name}", reason)
        await self.db.flush()

        await self.db.refresh(pr, ["initiator"])
        if pr.initiator and pr.initiator.email:
            from app.services.email_service import EmailService
            email_svc = EmailService(self.background_tasks)
            email_svc.notify_send_back(pr.id, pr.icr_number, rejected_by.name, reason, pr.initiator.email)

        return True

    async def send_back(self, pr: PurchaseRequest, acted_by: User, reason: str) -> None:
        """Send the purchase request back to the immediately previous step in the current phase."""
        if pr.current_status == RequestStatus.BUDGET_FILE_ALLOCATION:
            raise ValueError("This request is currently paused waiting for Budget File Allocation.")

        flow = await self._get_current_flow(pr)
        if not flow:
            raise RuntimeError(f"No active flow for PR #{pr.id}")

        await self.realign_pr_flow(pr)
        await self._validate_role(pr, acted_by, flow)

        sof_id = await self.resolve_sof_id(pr, phase_id=flow.phase_id)
        prev_step_res = await self.db.execute(
            select(WorkFlowHierarchy).where(
                and_(
                    self._wf_filters(pr, flow.phase_id, sof_id=sof_id),
                    WorkFlowHierarchy.step_order < flow.step_order,
                )
            ).order_by(WorkFlowHierarchy.step_order.desc()).limit(1)
        )
        prev_step_def = prev_step_res.scalar_one_or_none()
        if not prev_step_def:
            raise ValueError("There is no previous step in this phase to send back to.")
        to_step = prev_step_def.step_order
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
        sof_id = await self.resolve_sof_id(pr, phase_id=flow.phase_id)
        result = await self.db.execute(
            select(WorkFlowHierarchy)
            .options(selectinload(WorkFlowHierarchy.role))
            .where(
                and_(
                    self._wf_filters(pr, flow.phase_id, sof_id=sof_id),
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
        sof_id = await self.resolve_sof_id(pr, phase_id=flow.phase_id)
        next_step = await self._get_next_step_in_phase(pr, current_phase, current_step, sof_id=sof_id)

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
                first_in_next = await self._get_first_step(pr, next_phase, sof_id)
                flow.phase_id = next_phase.id
                flow.step_order = first_in_next.step_order if first_in_next else 1
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
