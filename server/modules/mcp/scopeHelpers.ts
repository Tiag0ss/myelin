import { normalizeRepositoryUrlKey, repositoryUrlsMatch } from './repoUrl';

export type McpScopeInput = {
  repositoryUrl?: string | null;
  projectIds?: number[] | null;
  strict?: boolean | null;
  allowWrite?: boolean | null;
  /** When multiple apps match, client must pick one. */
  applicationId?: number | null;
};

export type MatchedApplication = {
  id: number;
  name: string;
  organizationId: number;
  repositoryUrl: string | null;
};

export type AgentDocItem = {
  id: number;
  name: string;
  slug: string;
  content: string;
  sortOrder: number;
  scope: 'organization' | 'application';
  organizationId?: number;
  applicationId?: number;
};

export function coerceProjectIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((v) => (typeof v === 'number' ? v : parseInt(String(v), 10)))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(ids)];
}

export function coerceStrict(raw: unknown): boolean {
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
  return false;
}

export function coerceAllowWrite(raw: unknown): boolean {
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
  return false;
}

/** Coerce UI/MCP boolean-ish values to 0/1 DB flags (UnscheduledWork, etc.). */
export function coerceBooleanFlag(raw: unknown): 0 | 1 {
  if (raw === true || raw === 1 || raw === '1') return 1;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === 'on') return 1;
  }
  return 0;
}

/**
 * Optional boolean flag for MCP updates.
 * - `undefined` → omit (no change)
 * - otherwise → 0 or 1
 */
export function coerceOptionalBooleanFlag(
  raw: unknown
): { ok: true; value: 0 | 1 | undefined } {
  if (raw === undefined) return { ok: true, value: undefined };
  return { ok: true, value: coerceBooleanFlag(raw) };
}

/**
 * Optional nullable id for MCP args (e.g. sprintId).
 * - `undefined` / missing → omit (no change)
 * - `null` / `''` / `'null'` → clear (null)
 * - positive int → set
 * - invalid → `{ ok: false }`
 */
export function coerceOptionalNullableId(
  raw: unknown
): { ok: true; value: number | null | undefined } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === '' || raw === 'null') return { ok: true, value: null };
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: 'Invalid id (expected positive integer, null, or omit)' };
  }
  return { ok: true, value: Math.trunc(n) };
}

/** Sprint must belong to the task's project and that project must be in MCP scope. */
export function sprintAllowedForProject(
  sprintProjectId: number,
  taskProjectId: number,
  effectiveProjectIds: number[]
): boolean {
  return (
    sprintProjectId === taskProjectId &&
    effectiveProjectIds.includes(taskProjectId) &&
    effectiveProjectIds.includes(sprintProjectId)
  );
}

export type McpSprintRef = {
  id: number;
  name: string | null;
  status: string | null;
};

/** Nested sprint on task payloads; `null` when the task has no sprint (or sprints unused). */
export function shapeTaskSprintRef(row: {
  SprintId?: unknown;
  SprintName?: unknown;
  SprintStatus?: unknown;
}): McpSprintRef | null {
  if (row.SprintId == null || row.SprintId === '') return null;
  const id = Number(row.SprintId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    name: row.SprintName != null ? String(row.SprintName) : null,
    status: row.SprintStatus != null ? String(row.SprintStatus) : null,
  };
}

/** Attach `tasks` arrays to sprint rows (empty array when none). */
export function attachTasksToSprints<TSprint extends { Id?: unknown; id?: unknown }, TTask>(
  sprints: TSprint[],
  tasksBySprintId: Map<number, TTask[]>
): Array<TSprint & { tasks: TTask[] }> {
  return sprints.map((sprint) => {
    const rawId = (sprint as { Id?: unknown }).Id ?? (sprint as { id?: unknown }).id;
    const id = Number(rawId);
    return {
      ...sprint,
      tasks: Number.isFinite(id) ? tasksBySprintId.get(id) || [] : [],
    };
  });
}

export const MCP_SPRINT_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const;
export type McpSprintStatus = (typeof MCP_SPRINT_STATUSES)[number];

export function coerceSprintStatus(
  raw: unknown
): { ok: true; value: McpSprintStatus } | { ok: false; message: string } {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if ((MCP_SPRINT_STATUSES as readonly string[]).includes(value)) {
    return { ok: true, value: value as McpSprintStatus };
  }
  return {
    ok: false,
    message: `Invalid sprint status (expected ${MCP_SPRINT_STATUSES.join('|')})`,
  };
}

/** Filter applications whose RepositoryUrl matches the client remote. */
export function matchApplicationsByRepositoryUrl(
  apps: MatchedApplication[],
  repositoryUrl: string | null | undefined
): MatchedApplication[] {
  const key = normalizeRepositoryUrlKey(repositoryUrl);
  if (!key) return [];
  return apps.filter((a) => repositoryUrlsMatch(a.repositoryUrl, repositoryUrl));
}

export function resolveMatchedApplications(
  candidates: MatchedApplication[],
  applicationId?: number | null
): { matched: MatchedApplication[]; ambiguous: boolean; needsDisambiguation: boolean } {
  if (candidates.length === 0) {
    return { matched: [], ambiguous: false, needsDisambiguation: false };
  }
  if (candidates.length === 1) {
    return { matched: candidates, ambiguous: false, needsDisambiguation: false };
  }
  if (applicationId != null && applicationId > 0) {
    const picked = candidates.filter((c) => c.id === applicationId);
    return {
      matched: picked,
      ambiguous: picked.length === 0,
      needsDisambiguation: picked.length === 0,
    };
  }
  return { matched: [], ambiguous: true, needsDisambiguation: true };
}

/**
 * Build effective project id set.
 * - strict: only file projectIds
 * - not strict: file projectIds ∪ application-linked project ids
 */
export function buildEffectiveProjectIds(options: {
  strict: boolean;
  fileProjectIds: number[];
  applicationLinkedProjectIds: number[];
}): number[] {
  const file = [...new Set(options.fileProjectIds.filter((n) => n > 0))];
  if (options.strict) return file;
  const linked = options.applicationLinkedProjectIds.filter((n) => n > 0);
  return [...new Set([...file, ...linked])];
}

export function assertNonEmptyScope(options: {
  strict: boolean;
  fileProjectIds: number[];
  repositoryUrl?: string | null;
  matchedApplicationCount: number;
}): string | null {
  const hasFile = options.fileProjectIds.length > 0;
  const hasRepo =
    !options.strict &&
    !!normalizeRepositoryUrlKey(options.repositoryUrl) &&
    options.matchedApplicationCount > 0;
  if (options.strict && !hasFile) {
    return 'strict mode requires non-empty projectIds';
  }
  if (!hasFile && !hasRepo && !normalizeRepositoryUrlKey(options.repositoryUrl)) {
    return 'Provide projectIds and/or repositoryUrl';
  }
  if (!hasFile && !options.strict && normalizeRepositoryUrlKey(options.repositoryUrl) && options.matchedApplicationCount === 0) {
    return 'No Application matched repositoryUrl and no projectIds provided';
  }
  if (!hasFile && !hasRepo) {
    return 'Resolved MCP scope is empty';
  }
  return null;
}

/** Merge org docs first, then application docs (same slug allowed). */
export function mergeAgentDocs(orgDocs: AgentDocItem[], appDocs: AgentDocItem[]): AgentDocItem[] {
  const orgSorted = [...orgDocs].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const appSorted = [...appDocs].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  return [...orgSorted, ...appSorted];
}

export function canWriteViaMcp(options: {
  serverMcpWritesEnabled: boolean;
  clientAllowWrite: boolean;
}): boolean {
  return options.serverMcpWritesEnabled === true && options.clientAllowWrite === true;
}

export { normalizeRepositoryUrlKey, repositoryUrlsMatch };
