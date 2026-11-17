/**
 * Related applications for a task (TaskApplications), kept in sync with
 * primary ApplicationId and ApplicationVersionTasks links.
 */

export function normalizeApplicationIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id) && id > 0);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

export function mergeRelatedApplicationIds(parts: {
  selectedIds?: number[] | null;
  primaryApplicationId?: number | null;
  linkedApplicationIds?: number[] | null;
}): number[] {
  const out = new Set<number>();
  for (const list of [parts.selectedIds, parts.linkedApplicationIds]) {
    for (const id of list || []) {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) out.add(n);
    }
  }
  const primary = Number(parts.primaryApplicationId);
  if (Number.isFinite(primary) && primary > 0) out.add(primary);
  return Array.from(out).sort((a, b) => a - b);
}
