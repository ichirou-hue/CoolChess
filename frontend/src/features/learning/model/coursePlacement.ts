const coursePlacementKey = 'coolchess.coursePlacement.v1';

export type CoursePlacement = {
  experience: 'beginner' | 'occasional' | 'regular';
  reviewRules: boolean | null;
};

export function readCoursePlacement(): CoursePlacement | null {
  if (typeof window === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(coursePlacementKey) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const placement = value as Partial<CoursePlacement>;
    if (!['beginner', 'occasional', 'regular'].includes(placement.experience ?? '')) return null;
    if (placement.reviewRules !== null && typeof placement.reviewRules !== 'boolean') return null;
    return placement as CoursePlacement;
  } catch {
    return null;
  }
}

export function saveCoursePlacement(placement: CoursePlacement) {
  localStorage.setItem(coursePlacementKey, JSON.stringify(placement));
}
