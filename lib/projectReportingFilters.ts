/** Client-side filters for project Reporting grids. */

export const REPORT_UNASSIGNED_USER_ID = 0;

export function normalizeReportDate(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

export function matchesSearchText(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return String(haystack || '')
    .toLowerCase()
    .includes(q);
}

export function buildUniqueUserOptions(
  rows: Array<{ UserId?: number | null; Username?: string | null }>
): Array<{ id: number; name: string }> {
  const byId = new Map<number, string>();
  for (const row of rows) {
    const id = Number(row.UserId || 0);
    const name = String(row.Username || '').trim();
    if (id > 0 && name) byId.set(id, name);
  }
  return Array.from(byId.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildUniqueStatusOptions(
  rows: Array<{ Status?: number | null; StatusName?: string | null }>
): Array<{ id: number; name: string }> {
  const byId = new Map<number, string>();
  for (const row of rows) {
    const id = Number(row.Status || 0);
    const name = String(row.StatusName || '').trim();
    if (id > 0 && name) byId.set(id, name);
  }
  return Array.from(byId.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function rowMatchesUserId(
  row: { UserId?: number | null },
  userId: number | undefined
): boolean {
  if (userId === undefined) return true;
  const id = Number(row.UserId || 0);
  if (userId === REPORT_UNASSIGNED_USER_ID) return id <= 0;
  return id === userId;
}

export function rowMatchesDateRange(
  dateValue: unknown,
  dateFrom: string,
  dateTo: string
): boolean {
  const day = normalizeReportDate(dateValue);
  if (!day) return !dateFrom.trim() && !dateTo.trim();
  const from = normalizeReportDate(dateFrom);
  const to = normalizeReportDate(dateTo);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export type SummaryTaskFilterInput = {
  TaskName?: string | null;
  Status?: number | null;
  AssignedTo?: number | null;
  Assignees?: Array<{ UserId: number }>;
};

export function taskMatchesSummaryFilters(
  task: SummaryTaskFilterInput,
  filters: {
    search: string;
    statusId?: number;
    assigneeId?: number;
  }
): boolean {
  if (!matchesSearchText(String(task.TaskName || ''), filters.search)) return false;
  if (filters.statusId !== undefined && Number(task.Status || 0) !== filters.statusId) {
    return false;
  }
  if (filters.assigneeId !== undefined) {
    const primary = Number(task.AssignedTo || 0);
    const multi = (task.Assignees || [])
      .map((entry) => Number(entry.UserId || 0))
      .filter((id) => id > 0);
    if (filters.assigneeId === REPORT_UNASSIGNED_USER_ID) {
      if (primary > 0 || multi.length > 0) return false;
    } else if (primary !== filters.assigneeId && !multi.includes(filters.assigneeId)) {
      return false;
    }
  }
  return true;
}

export function filterAllocationRows<T extends {
  TaskName?: string | null;
  Username?: string | null;
  UserId?: number | null;
  AllocationDate?: unknown;
}>(
  rows: T[],
  filters: { search: string; userId?: number; dateFrom: string; dateTo: string }
): T[] {
  return rows.filter((row) => {
    if (!rowMatchesUserId(row, filters.userId)) return false;
    if (!rowMatchesDateRange(row.AllocationDate, filters.dateFrom, filters.dateTo)) return false;
    const haystack = `${row.TaskName || ''} ${row.Username || ''}`;
    return matchesSearchText(haystack, filters.search);
  });
}

export function filterTimeEntryRows<T extends {
  TaskName?: string | null;
  Username?: string | null;
  Description?: string | null;
  UserId?: number | null;
  WorkDate?: unknown;
}>(
  rows: T[],
  filters: { search: string; userId?: number; dateFrom: string; dateTo: string }
): T[] {
  return rows.filter((row) => {
    if (!rowMatchesUserId(row, filters.userId)) return false;
    if (!rowMatchesDateRange(row.WorkDate, filters.dateFrom, filters.dateTo)) return false;
    const haystack = `${row.TaskName || ''} ${row.Username || ''} ${row.Description || ''}`;
    return matchesSearchText(haystack, filters.search);
  });
}

export function filterUserStatRows<T extends { Username?: string | null; UserId?: number | null }>(
  rows: T[],
  filters: { search: string; userId?: number }
): T[] {
  return rows.filter((row) => {
    if (!rowMatchesUserId(row, filters.userId)) return false;
    return matchesSearchText(String(row.Username || ''), filters.search);
  });
}

export function countActiveReportFilters(flags: boolean[]): number {
  return flags.reduce((count, active) => count + (active ? 1 : 0), 0);
}
