"""Resolve and sync technical evaluation committee members for a purchase request."""
from __future__ import annotations

from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import BudgetMaster
from app.models.purchase_request import PurchaseRequest


async def _load_budget_file(db: AsyncSession, pr: PurchaseRequest) -> Optional[BudgetMaster]:
    await db.refresh(pr, ["items"])
    if not pr.items:
        return None
    budget_file_id = pr.items[0].budget_file_id
    if not budget_file_id:
        return None
    result = await db.execute(select(BudgetMaster).where(BudgetMaster.id == budget_file_id))
    return result.scalar_one_or_none()


async def resolve_tech_committee_ids(
    db: AsyncSession, pr: PurchaseRequest
) -> Tuple[Optional[int], Optional[int], Optional[int], Optional[int]]:
    """
    Return (initiator_id, expert1_id, expert2_id, director_faculty_id).
    Fallback order for each expert slot: PR field -> budget file -> department default.
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


async def sync_tech_committee_to_pr(db: AsyncSession, pr: PurchaseRequest) -> bool:
    """Persist resolved committee nominees onto the PR when fields are missing."""
    _, expert1_id, expert2_id, director_faculty_id = await resolve_tech_committee_ids(db, pr)
    updated = False
    if not pr.faculty1_id and expert1_id:
        pr.faculty1_id = expert1_id
        updated = True
    if not pr.faculty2_id and expert2_id:
        pr.faculty2_id = expert2_id
        updated = True
    if not pr.faculty3_id and director_faculty_id:
        pr.faculty3_id = director_faculty_id
        updated = True
    return updated
