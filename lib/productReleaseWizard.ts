/**
 * Pure helpers for the product release wizard (task checkbox defaults, payload expansion).
 */

export type WizardTaskAppInput = {
  taskId: number;
  /** Primary Tasks.ApplicationId */
  primaryApplicationId?: number | null;
  /** Related TaskApplications ids */
  relatedApplicationIds?: number[];
};

/**
 * Default checked catalog apps for a newly added task.
 * 1) task apps ∩ catalog
 * 2) else projectCatalogApplicationIds (project ∩ catalog)
 * 3) else []
 */
export function defaultApplicationIdsForTask(
  task: WizardTaskAppInput,
  catalogApplicationIds: number[],
  projectCatalogApplicationIds: number[] = []
): number[] {
  const catalog = new Set(
    catalogApplicationIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
  );
  const taskApps = new Set<number>();
  const primary = Number(task.primaryApplicationId);
  if (Number.isInteger(primary) && primary > 0) taskApps.add(primary);
  for (const raw of task.relatedApplicationIds || []) {
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) taskApps.add(id);
  }

  const fromTask = [...taskApps].filter((id) => catalog.has(id));
  if (fromTask.length > 0) return fromTask.sort((a, b) => a - b);

  const fromProject = projectCatalogApplicationIds
    .map(Number)
    .filter((id) => catalog.has(id));
  return [...new Set(fromProject)].sort((a, b) => a - b);
}

/**
 * Invert task→apps checkboxes into per-application taskIds lists.
 * Same taskId may appear under multiple applications.
 */
export function expandTasksToApplicationTaskIds(
  tasks: Array<{ taskId: number; applicationIds: number[] }>,
  includedApplicationIds: number[]
): Map<number, number[]> {
  const included = new Set(
    includedApplicationIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
  );
  const result = new Map<number, number[]>();
  for (const appId of included) {
    result.set(appId, []);
  }
  for (const task of tasks) {
    const taskId = Number(task.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) continue;
    const apps = Array.isArray(task.applicationIds) ? task.applicationIds : [];
    for (const raw of apps) {
      const appId = Number(raw);
      if (!included.has(appId)) continue;
      const list = result.get(appId) || [];
      if (!list.includes(taskId)) list.push(taskId);
      result.set(appId, list);
    }
  }
  return result;
}

export function serializeWizardProjectIds(projectIds: number[] | undefined | null): string | null {
  if (!Array.isArray(projectIds) || projectIds.length === 0) return null;
  const ids = [
    ...new Set(
      projectIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    ),
  ].sort((a, b) => a - b);
  if (ids.length === 0) return null;
  const joined = ids.join(',');
  return joined.length <= 500 ? joined : joined.slice(0, 500).replace(/,\d*$/, '') || null;
}

export function parseWizardProjectIds(raw: string | null | undefined): number[] {
  if (!raw || !String(raw).trim()) return [];
  return [
    ...new Set(
      String(raw)
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ].sort((a, b) => a - b);
}

/**
 * Merge seeded tasks from linked application versions into a task→apps map.
 * Returns Map<taskId, Set<applicationId>>.
 */
export function mergeSeededTasksFromVersions(
  seeds: Array<{ taskId: number; applicationId: number }>
): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const seed of seeds) {
    const taskId = Number(seed.taskId);
    const applicationId = Number(seed.applicationId);
    if (!Number.isInteger(taskId) || taskId <= 0) continue;
    if (!Number.isInteger(applicationId) || applicationId <= 0) continue;
    if (!map.has(taskId)) map.set(taskId, new Set());
    map.get(taskId)!.add(applicationId);
  }
  return map;
}
