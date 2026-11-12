import { optionalNumberArray, optionalPositiveNumber } from '@/lib/persistedFilters';
import { isUnplannedLeafTask, type UnplannedTaskLike } from '@/lib/tasks/isUnplannedTask';

export type PlanningTaskListFilters = {
  filterText: string;
  filterProject?: number;
  filterStatusIds: number[];
  filterPriority?: number;
  filterAssignee?: number;
  filterTaskType?: number;
  hideClosed: boolean;
  hideCancelled: boolean;
  /** When true, hide Unscheduled Work tasks (default on). */
  hideUnscheduled: boolean;
  unplannedOnly: boolean;
  filterTagIds: number[];
};

export const DEFAULT_PLANNING_TASK_FILTERS: PlanningTaskListFilters = {
  filterText: '',
  filterProject: undefined,
  filterStatusIds: [],
  filterPriority: undefined,
  filterAssignee: undefined,
  filterTaskType: undefined,
  hideClosed: true,
  hideCancelled: true,
  hideUnscheduled: true,
  unplannedOnly: true,
  filterTagIds: [],
};

function sameNumberIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function mergePlanningTaskFilters(
  stored: Record<string, unknown>,
  defaults: PlanningTaskListFilters
): PlanningTaskListFilters {
  const fromArray = optionalNumberArray(stored.filterStatusIds);
  const legacySingle = optionalPositiveNumber(stored.filterStatus);
  const filterStatusIds =
    fromArray.length > 0 ? fromArray : legacySingle !== undefined ? [legacySingle] : defaults.filterStatusIds;

  return {
    filterText: typeof stored.filterText === 'string' ? stored.filterText : defaults.filterText,
    filterProject: optionalPositiveNumber(stored.filterProject),
    filterStatusIds,
    filterPriority: optionalPositiveNumber(stored.filterPriority),
    filterAssignee: optionalPositiveNumber(stored.filterAssignee),
    filterTaskType: optionalPositiveNumber(stored.filterTaskType),
    hideClosed: typeof stored.hideClosed === 'boolean' ? stored.hideClosed : defaults.hideClosed,
    hideCancelled:
      typeof stored.hideCancelled === 'boolean' ? stored.hideCancelled : defaults.hideCancelled,
    hideUnscheduled:
      typeof stored.hideUnscheduled === 'boolean'
        ? stored.hideUnscheduled
        : defaults.hideUnscheduled,
    unplannedOnly:
      typeof stored.unplannedOnly === 'boolean' ? stored.unplannedOnly : defaults.unplannedOnly,
    filterTagIds: optionalNumberArray(stored.filterTagIds),
  };
}

/** How many constraints are currently applied (badge). Defaults count as active. */
export function countPlanningTaskActiveFilters(filters: PlanningTaskListFilters): number {
  return [
    filters.filterText.trim() ? 1 : 0,
    filters.filterProject !== undefined ? 1 : 0,
    filters.filterStatusIds.length > 0 ? 1 : 0,
    filters.filterPriority !== undefined ? 1 : 0,
    filters.filterAssignee !== undefined ? 1 : 0,
    filters.filterTaskType !== undefined ? 1 : 0,
    filters.filterTagIds.length > 0 ? 1 : 0,
    filters.hideClosed ? 1 : 0,
    filters.hideCancelled ? 1 : 0,
    filters.hideUnscheduled ? 1 : 0,
    filters.unplannedOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
}

/** Deviations from defaults — used to show Clear (restore defaults). */
export function countPlanningTaskFilterDeviations(
  filters: PlanningTaskListFilters,
  defaults: PlanningTaskListFilters = DEFAULT_PLANNING_TASK_FILTERS
): number {
  return [
    filters.filterText.trim() !== defaults.filterText.trim() ? 1 : 0,
    filters.filterProject !== defaults.filterProject ? 1 : 0,
    sameNumberIds(filters.filterStatusIds, defaults.filterStatusIds) ? 0 : 1,
    filters.filterPriority !== defaults.filterPriority ? 1 : 0,
    filters.filterAssignee !== defaults.filterAssignee ? 1 : 0,
    filters.filterTaskType !== defaults.filterTaskType ? 1 : 0,
    sameNumberIds(filters.filterTagIds, defaults.filterTagIds) ? 0 : 1,
    filters.hideClosed !== defaults.hideClosed ? 1 : 0,
    filters.hideCancelled !== defaults.hideCancelled ? 1 : 0,
    filters.hideUnscheduled !== defaults.hideUnscheduled ? 1 : 0,
    filters.unplannedOnly !== defaults.unplannedOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
}

export type PlanningFilterableTask = UnplannedTaskLike & {
  Id: number;
  ProjectId?: number | null;
  TaskName?: string | null;
  Description?: string | null;
  Status?: number | null;
  Priority?: number | null;
  AssignedTo?: number | null;
  TaskType?: number | null;
  StatusName?: string | null;
  PriorityName?: string | null;
  TaskTypeName?: string | null;
  AssigneeName?: string | null;
  ProjectName?: string | null;
  UnscheduledWork?: number | boolean | null;
  StatusIsClosed?: number | boolean | null;
  StatusIsCancelled?: number | boolean | null;
};

export function taskMatchesPlanningFilters(
  task: PlanningFilterableTask,
  filters: PlanningTaskListFilters,
  options: {
    allTasks: Array<Pick<UnplannedTaskLike, 'Id' | 'ParentTaskId'>>;
    tagIdsByTaskId?: Map<number, number[]>;
  }
): boolean {
  if (filters.hideClosed && Number(task.StatusIsClosed || 0) === 1) return false;
  if (filters.hideCancelled && Number(task.StatusIsCancelled || 0) === 1) return false;

  const isUnscheduled = Number(task.UnscheduledWork || 0) === 1;
  if (filters.hideUnscheduled && isUnscheduled) return false;

  // Unplanned-only and hide-unscheduled must not fight each other:
  // isUnplannedLeafTask() always excludes Unscheduled Work, so when the user
  // turns hideUnscheduled off, those tasks still need to pass unplannedOnly.
  if (filters.unplannedOnly) {
    const isUnplannedLeaf = isUnplannedLeafTask(task, options.allTasks);
    if (!isUnplannedLeaf && !(isUnscheduled && !filters.hideUnscheduled)) {
      return false;
    }
  }

  const taskProjectId =
    task.ProjectId !== null && task.ProjectId !== undefined ? Number(task.ProjectId) : undefined;
  const taskStatusId =
    task.Status !== null && task.Status !== undefined ? Number(task.Status) : undefined;
  const taskPriorityId =
    task.Priority !== null && task.Priority !== undefined ? Number(task.Priority) : undefined;
  const taskAssigneeId =
    task.AssignedTo !== null && task.AssignedTo !== undefined ? Number(task.AssignedTo) : undefined;
  const taskTypeId =
    task.TaskType !== null && task.TaskType !== undefined ? Number(task.TaskType) : undefined;

  if (filters.filterProject !== undefined && taskProjectId !== filters.filterProject) return false;
  if (
    filters.filterStatusIds.length > 0 &&
    (taskStatusId === undefined || !filters.filterStatusIds.includes(taskStatusId))
  ) {
    return false;
  }
  if (filters.filterPriority !== undefined && taskPriorityId !== filters.filterPriority) return false;
  if (filters.filterAssignee !== undefined && taskAssigneeId !== filters.filterAssignee) return false;
  if (filters.filterTaskType !== undefined && taskTypeId !== filters.filterTaskType) return false;

  if (filters.filterTagIds.length > 0) {
    const taskTagIds = options.tagIdsByTaskId?.get(task.Id) || [];
    const matchesAllTags = filters.filterTagIds.every((tagId) => taskTagIds.includes(tagId));
    if (!matchesAllTags) return false;
  }

  if (filters.filterText.trim()) {
    const search = filters.filterText.toLowerCase();
    const descriptionText = String(task.Description || '')
      .replace(/<[^>]*>/g, ' ')
      .toLowerCase();
    const matches =
      String(task.TaskName || '')
        .toLowerCase()
        .includes(search) ||
      String(task.AssigneeName || '')
        .toLowerCase()
        .includes(search) ||
      String(task.StatusName || '')
        .toLowerCase()
        .includes(search) ||
      String(task.PriorityName || '')
        .toLowerCase()
        .includes(search) ||
      String(task.TaskTypeName || '')
        .toLowerCase()
        .includes(search) ||
      String(task.ProjectName || '')
        .toLowerCase()
        .includes(search) ||
      descriptionText.includes(search) ||
      String(task.Id).includes(search);
    if (!matches) return false;
  }

  return true;
}
