/** Resolve effective TSC committee member IDs for a purchase request. */
export function resolveTechCommitteeIds(pr: {
  initiator_id?: number | null;
  faculty1_id?: number | null;
  faculty2_id?: number | null;
  faculty3_id?: number | null;
  budget_file?: {
    expert1_id?: number | null;
    expert2_id?: number | null;
    director_faculty_id?: number | null;
  } | null;
  expert1_id?: number | null;
  expert2_id?: number | null;
  director_faculty_id?: number | null;
}): number[] {
  const expert1 = pr.faculty1_id ?? pr.budget_file?.expert1_id ?? pr.expert1_id;
  const expert2 = pr.faculty2_id ?? pr.budget_file?.expert2_id ?? pr.expert2_id;
  const director = pr.faculty3_id ?? pr.budget_file?.director_faculty_id ?? pr.director_faculty_id;
  const raw = [pr.initiator_id, expert1, expert2, director].filter(
    (id): id is number => id !== null && id !== undefined
  );
  return [...new Set(raw)];
}

export function resolveTechCommitteeMember(
  pr: Parameters<typeof resolveTechCommitteeIds>[0],
  slot: 'expert1' | 'expert2' | 'director'
): number | null | undefined {
  if (slot === 'expert1') {
    return pr.faculty1_id ?? pr.budget_file?.expert1_id ?? pr.expert1_id;
  }
  if (slot === 'expert2') {
    return pr.faculty2_id ?? pr.budget_file?.expert2_id ?? pr.expert2_id;
  }
  return pr.faculty3_id ?? pr.budget_file?.director_faculty_id ?? pr.director_faculty_id;
}
