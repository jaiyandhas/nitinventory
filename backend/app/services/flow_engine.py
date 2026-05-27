"""
Flow Engine Service — Python port of PrFlowEngineService.php
Includes budget bug fix: lock on submit, deduct on PO_ISSUED.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import BackgroundTasks

from app.models.purchase_request import (
    PurchaseRequest, PurchaseRequestFlow, PurchaseRequestHistory,
    WorkFlowHierarchy, RequestStatus
)
from app.models.budget import PhaseManager
from app.models.user import User, RoleManager



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
            if step.tender_vendors_threshold is not None:
                # Tender details (commercial evaluations) count check
                await self.db.refresh(pr, ["commercial_evaluations"])
                vendor_count = len(pr.commercial_evaluations)
                if vendor_count > step.tender_vendors_threshold:
                    # Skip this step if the number of vendors exceeds the threshold
                    continue
            
            return step.step_order
            
        return None

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
        history = PurchaseRequestHistory(
            purchase_request_id=pr.id,
            current_approver_id=user.id,
            status=status,
            remarks=remarks,
            acted_at=datetime.utcnow(),
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
            # Must be initiator or one of the committee members
            allowed_ids = {pr.initiator_id, pr.faculty1_id, pr.faculty2_id, getattr(pr, "faculty3_id", None)}
            if user.id not in allowed_ids:
                raise ValueError("Only the purchase initiator or purchase committee nominees can perform technical evaluation")
            return

        # Standard role/group checking
        if step.role_id:
            await self.db.refresh(step, ["role"])

        role_value = step.role.value if (step.role_id and step.role) else None
        is_faculty = (role_value == "faculty") or (step.user_group == "faculty")
        is_initiator_acting_as_faculty = (is_faculty and pr.initiator_id == user.id)

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
        await budget_svc.lock_amount(pr)

        first_phase = await self._get_first_phase()
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
        flow = await self._get_current_flow(pr)
        if not flow:
            raise RuntimeError(f"No active flow for PR #{pr.id}")
            
        await self._validate_role(pr, acted_by, flow)

        result = await self.db.execute(select(PhaseManager).where(PhaseManager.id == flow.phase_id))
        current_phase = result.scalar_one()
        current_step = flow.step_order

        next_step = await self._get_next_step_in_phase(pr, current_phase, current_step)

        # Check if this is the committee technical evaluation step
        step_def = await self._get_step_def(pr, flow.phase_id, flow.step_order)
        is_tech_eval_step = step_def and step_def.user_type == "tech_evaluation"

        should_advance = True

        if is_tech_eval_step:
            await self.db.refresh(pr, ["history"])
            # Check if this user has already logged an approval in the database for this step
            has_approval_log = any(
                h.current_approver_id == acted_by.id
                and h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
                for h in pr.history
            )
            if not has_approval_log:
                default_status = "Technical Evaluation Completed" if pr.initiator_id == acted_by.id else "Technical Evaluation Approved"
                await self._add_history(pr, acted_by, status or default_status, remarks)
            
            # Check if all required committee members have approved
            required_ids = {uid for uid in [pr.initiator_id, pr.faculty1_id, pr.faculty2_id, pr.faculty3_id] if uid is not None}
            
            await self.db.refresh(pr, ["history"])
            approved_ids = {
                h.current_approver_id for h in pr.history 
                if h.status in ("Technical Evaluation Completed", "Technical Evaluation Approved")
            }
            
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
            else:
                if current_phase.phase_name == "Administrative Approval":
                    pr.aa_approved_at = datetime.utcnow()
                    pr.aa_approver_id = acted_by.id
                elif current_phase.phase_name == "Technical Evaluation":
                    pr.te_approved_at = datetime.utcnow()
                    # Write final TE completion entry (after all committee members have signed)
                    await self._add_history(pr, acted_by, "Technical Evaluation Phase Completed", remarks)
                elif current_phase.phase_name == "Financial Sanction":
                    pr.fs_approved_at = datetime.utcnow()

                next_phase = await self._get_next_valid_phase(pr, current_phase)
                if next_phase:
                    flow.phase_id = next_phase.id
                    flow.step_order = 1
                    pr.current_status = RequestStatus.IN_PROGRESS
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
        flow = await self._get_current_flow(pr)
        if not flow:
            raise RuntimeError(f"No active flow for PR #{pr.id}")
            
        await self._validate_role(pr, acted_by, flow)
        
        if to_step >= flow.step_order or to_step < 1:
            raise ValueError(f"Cannot send back to step {to_step} from {flow.step_order}")

        pr.current_status = RequestStatus.SENT_BACK
        flow.step_order = to_step
        flow.rejected = False
        await self._add_history(pr, acted_by, "PR Sent Back", reason)
        await self.db.flush()

        # Notify initiator
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
