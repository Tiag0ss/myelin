import { optionalNumberArray, optionalPositiveNumber } from '@/lib/persistedFilters';

export type ProjectTaskListFilters = {
  filterText: string;
  filterStatus?: number;
  filterPriority?: number;
  filterAssignee?: number;
  filterTaskType?: number;
  hideClosed: boolean;
  hideCancelled: boolean;
  unplannedOnly: boolean;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  filterTagIds: number[];
};

export const DEFAULT_PROJECT_TASK_FILTERS: ProjectTaskListFilters = {
  filterText: '',
  filterStatus: undefined,
  filterPriority: undefined,
  filterAssignee: undefined,
  filterTaskType: undefined,
  hideClosed: true,
  hideCancelled: true,
  unplannedOnly: false,
  sortField: 'displayOrder',
  sortDirection: 'asc',
  filterTagIds: [],
};

export function mergeProjectTaskFilters(
  stored: Record<string, unknown>,
  defaults: ProjectTaskListFilters
): ProjectTaskListFilters {
  const sortDirection = stored.sortDirection === 'desc' ? 'desc' : stored.sortDirection === 'asc' ? 'asc' : defaults.sortDirection;
  return {
    filterText: typeof stored.filterText === 'string' ? stored.filterText : defaults.filterText,
    filterStatus: optionalPositiveNumber(stored.filterStatus),
    filterPriority: optionalPositiveNumber(stored.filterPriority),
    filterAssignee: optionalPositiveNumber(stored.filterAssignee),
    filterTaskType: optionalPositiveNumber(stored.filterTaskType),
    hideClosed: typeof stored.hideClosed === 'boolean' ? stored.hideClosed : defaults.hideClosed,
    hideCancelled: typeof stored.hideCancelled === 'boolean' ? stored.hideCancelled : defaults.hideCancelled,
    unplannedOnly: typeof stored.unplannedOnly === 'boolean' ? stored.unplannedOnly : defaults.unplannedOnly,
    sortField: typeof stored.sortField === 'string' && stored.sortField ? stored.sortField : defaults.sortField,
    sortDirection,
    filterTagIds: optionalNumberArray(stored.filterTagIds),
  };
}

/** Count filters that differ from defaults (for Clear / badge — not for list matching). */
export function countProjectTaskFilterDeviations(
  filters: ProjectTaskListFilters,
  defaults: ProjectTaskListFilters = DEFAULT_PROJECT_TASK_FILTERS
): number {
  const sameTagIds =
    filters.filterTagIds.length === defaults.filterTagIds.length &&
    filters.filterTagIds.every((id, index) => id === defaults.filterTagIds[index]);

  return [
    filters.filterText.trim() !== defaults.filterText.trim() ? 1 : 0,
    filters.filterStatus !== defaults.filterStatus ? 1 : 0,
    filters.filterPriority !== defaults.filterPriority ? 1 : 0,
    filters.filterAssignee !== defaults.filterAssignee ? 1 : 0,
    filters.filterTaskType !== defaults.filterTaskType ? 1 : 0,
    sameTagIds ? 0 : 1,
    filters.hideClosed !== defaults.hideClosed ? 1 : 0,
    filters.hideCancelled !== defaults.hideCancelled ? 1 : 0,
    filters.unplannedOnly !== defaults.unplannedOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
}
