"""Resolve and sync technical evaluation committee members for a purchase request."""
from __future__ import annotations

from typing import Optional, Tuple, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.budget import BudgetMaster
from app.models.purchase_request import PurchaseRequest


SLOT_LABELS = {
    1: "Technical Expert 1 (HOD Nominee)",
    2: "Technical Expert 2 (HOD Nominee)",
    3: "Director Nominee",
}


async def _load_budget_file(db: AsyncSession, pr: PurchaseRequest) -> Optional[BudgetMaster]:
    await db.refresh(pr, ["items"])
    if not pr.items:
        return None
    for item in pr.items:
        if item.budget_file_id:
            result = await db.execute(select(BudgetMaster).where(BudgetMaster.id == item.budget_file_id))
            bm = result.scalar_one_or_none()
            if bm:
                return bm
    return None


async def resolve_tech_committee_ids(
    db: AsyncSession, pr: PurchaseRequest
) -> Tuple[Optional[int], Optional[int], Optional[int], Optional[int]]:
    """
    Return (initiator_id, expert1_id, expert2_id, director_faculty_id).
    Slot mapping: slot1=faculty1(HOD), slot2=faculty2(HOD), slot3=faculty3(Director).
    Fallback order per slot: PR field -> budget file -> department default.
    """
    await db.refresh(pr, ["initiator"])
    dept = None
    if pr.initiator:
        await db.refresh(pr.initiator, ["department"])
        dept = pr.initiator.department

    budget_file = await _load_budget_file(db, pr)

    expert1_id = pr.faculty1_id
    if not expert1_id and budget_file:
        expert1_id = budget_file.expert1_id
    if not expert1_id and dept:
        expert1_id = dept.expert1_id

    expert2_id = pr.faculty2_id
    if not expert2_id and budget_file:
        expert2_id = budget_file.expert2_id
    if not expert2_id and dept:
        expert2_id = dept.expert2_id

    director_faculty_id = pr.faculty3_id
    if not director_faculty_id and budget_file:
        director_faculty_id = budget_file.director_faculty_id
    if not director_faculty_id and dept:
        director_faculty_id = dept.director_faculty_id

    return pr.initiator_id, expert1_id, expert2_id, director_faculty_id


def dedupe_committee_ids(*member_ids: Optional[int]) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    for member_id in member_ids:
        if member_id is None or member_id in seen:
            continue
        seen.add(member_id)
        ordered.append(member_id)
    return ordered


def _parse_nominee_ids(raw) -> list[int]:
    if isinstance(raw, str):
        import json
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    return [x for x in (raw or []) if x is not None]


async def get_tech_committee_member_ids(
    db: AsyncSession, pr: PurchaseRequest, committee_size: Optional[int] = None
) -> List[int]:
    """
    Return deduplicated user IDs for the technical committee, respecting committee_size.

    Slot order (always): expert1 (HOD) → expert2 (HOD) → director_faculty (Director).
    committee_size controls how many slots are active:
        1 → only slot 1 (expert1)
        2 → slots 1-2 (expert1, expert2)
        3 or None → all 3 slots
    """
    _, expert1_id, expert2_id, director_faculty_id = await resolve_tech_committee_ids(db, pr)

    if pr.committee_nominee_ids is not None:
        nominees = _parse_nominee_ids(pr.committee_nominee_ids)
        if nominees:
            effective_size = committee_size or 3
            if effective_size >= 3 and director_faculty_id and director_faculty_id not in nominees:
                nominees = list(nominees)
                nominees.append(director_faculty_id)
            if committee_size:
                nominees = nominees[:committee_size]
            return dedupe_committee_ids(*nominees)

    if committee_size == 1:
        slots = [expert1_id]
    elif committee_size == 2:
        slots = [expert1_id, expert2_id]
    else:
        slots = [expert1_id, expert2_id, director_faculty_id]

    return dedupe_committee_ids(*slots)


async def is_tech_committee_configured(
    db: AsyncSession, pr: PurchaseRequest, committee_size: Optional[int] = None
) -> bool:
    """Check if committee has enough configured members for the required committee_size.

    At least committee_size members must be resolvable (≥1 required).
    """
    members = await get_tech_committee_member_ids(db, pr, committee_size)
    required = committee_size or 1
    return len(members) >= required


async def get_committee_slot_info(
    db: AsyncSession, pr: PurchaseRequest, committee_size: Optional[int] = None
) -> List[dict]:
    """
    Return ordered slot info for the committee tracker display.
    Each entry: {slot, role_label, user_id, user_name, user_designation}.
    Only returns slots up to committee_size (or all 3 if None).
    """
    from app.models.user import User

    _, expert1_id, expert2_id, director_faculty_id = await resolve_tech_committee_ids(db, pr)

    size = committee_size or 3
    raw_slots = [
        (1, expert1_id),
        (2, expert2_id),
        (3, director_faculty_id),
    ][:size]

    user_ids = [uid for _, uid in raw_slots if uid]
    users_by_id: dict[int, User] = {}
    if user_ids:
        res = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in res.scalars().all():
            users_by_id[u.id] = u

    slots = []
    for slot_num, uid in raw_slots:
        u = users_by_id.get(uid) if uid else None
        slots.append({
            "slot": slot_num,
            "role_label": SLOT_LABELS[slot_num],
            "user_id": uid,
            "user_name": u.name if u else None,
            "user_designation": u.designation if u else None,
        })
    return slots


async def sync_tech_committee_to_pr(db: AsyncSession, pr: PurchaseRequest) -> bool:
    """Persist resolved committee nominees onto the PR when fields are missing."""
    updated = False

    if pr.committee_nominee_ids is None:
        if pr.administrative_approval_id:
            from app.models.administrative_approval import AdministrativeApproval
            aa_res = await db.execute(
                select(AdministrativeApproval)
                .options(selectinload(AdministrativeApproval.nominees))
                .where(AdministrativeApproval.id == pr.administrative_approval_id)
            )
            aa = aa_res.scalar_one_or_none()
            if aa and aa.nominees:
                pr.committee_nominee_ids = [nom.nominee_id for nom in aa.nominees]
                updated = True

        if pr.committee_nominee_ids is None:
            budget_file = await _load_budget_file(db, pr)
            if budget_file and budget_file.nominee_ids:
                pr.committee_nominee_ids = list(budget_file.nominee_ids)
                updated = True

    _, expert1_id, expert2_id, director_faculty_id = await resolve_tech_committee_ids(db, pr)

    # Ensure director_faculty_id is included in committee_nominee_ids
    if pr.committee_nominee_ids is not None:
        nominees = _parse_nominee_ids(pr.committee_nominee_ids)
        if director_faculty_id and director_faculty_id not in nominees:
            nominees = list(nominees)
            nominees.append(director_faculty_id)
            pr.committee_nominee_ids = nominees
            updated = True
    else:
        resolved_list = dedupe_committee_ids(expert1_id, expert2_id, director_faculty_id)
        if resolved_list:
            pr.committee_nominee_ids = resolved_list
            updated = True

    if not pr.faculty1_id and expert1_id:
        pr.faculty1_id = expert1_id
        updated = True
    if not pr.faculty2_id and expert2_id:
        pr.faculty2_id = expert2_id
        updated = True
    if not pr.faculty3_id and director_faculty_id:
        if director_faculty_id != pr.faculty1_id and director_faculty_id != pr.faculty2_id:
            pr.faculty3_id = director_faculty_id
            updated = True
    return updated
