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
