import { pool, RowDataPacket } from '../../config/database';
import {
  AgentDocItem,
  assertNonEmptyScope,
  buildEffectiveProjectIds,
  coerceAllowWrite,
  coerceProjectIds,
  coerceStrict,
  matchApplicationsByRepositoryUrl,
  MatchedApplication,
  McpScopeInput,
  mergeAgentDocs,
  resolveMatchedApplications,
} from './scopeHelpers';

export type ResolvedMcpScope = {
  strict: boolean;
  allowWrite: boolean;
  serverMcpWritesEnabled: boolean;
  canWrite: boolean;
  fileProjectIds: number[];
  effectiveProjectIds: number[];
  matchedApplications: MatchedApplication[];
  candidateApplications: MatchedApplication[];
  needsDisambiguation: boolean;
  organizationIds: number[];
  error?: string;
};

async function loadAccessibleApplications(userId: number): Promise<MatchedApplication[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT a.Id, a.Name, a.OrganizationId, a.RepositoryUrl
     FROM Applications a
     INNER JOIN OrganizationMembers om ON om.OrganizationId = a.OrganizationId AND om.UserId = ?
     WHERE a.IsActive = 1`,
    [userId]
  );
  return rows.map((r) => ({
    id: Number(r.Id),
    name: String(r.Name || ''),
    organizationId: Number(r.OrganizationId),
    repositoryUrl: r.RepositoryUrl != null ? String(r.RepositoryUrl) : null,
  }));
}

async function filterAccessibleProjectIds(userId: number, projectIds: number[]): Promise<number[]> {
  if (projectIds.length === 0) return [];
  const placeholders = projectIds.map(() => '?').join(',');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.Id
     FROM Projects p
     INNER JOIN OrganizationMembers om ON om.OrganizationId = p.OrganizationId AND om.UserId = ?
     WHERE p.Id IN (${placeholders})`,
    [userId, ...projectIds]
  );
  return rows.map((r) => Number(r.Id));
}

async function loadApplicationLinkedProjectIds(applicationIds: number[]): Promise<number[]> {
  if (applicationIds.length === 0) return [];
  const placeholders = applicationIds.map(() => '?').join(',');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT ProjectId FROM ApplicationProjects WHERE ApplicationId IN (${placeholders})`,
    applicationIds
  );
  return rows.map((r) => Number(r.ProjectId));
}

export async function getUserMcpWritesEnabled(userId: number): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT McpWritesEnabled FROM Users WHERE Id = ?',
    [userId]
  );
  if (!rows.length) return false;
  return Number(rows[0].McpWritesEnabled) === 1;
}

export async function resolveMcpScope(
  userId: number,
  input: McpScopeInput
): Promise<ResolvedMcpScope> {
  const strict = coerceStrict(input.strict);
  const clientAllowWrite = coerceAllowWrite(input.allowWrite);
  const fileProjectIdsRaw = coerceProjectIds(input.projectIds);
  const serverMcpWritesEnabled = await getUserMcpWritesEnabled(userId);

  const accessibleApps = await loadAccessibleApplications(userId);
  const candidates = matchApplicationsByRepositoryUrl(accessibleApps, input.repositoryUrl ?? null);
  const { matched, needsDisambiguation } = resolveMatchedApplications(
    candidates,
    input.applicationId ?? null
  );

  const emptyError = assertNonEmptyScope({
    strict,
    fileProjectIds: fileProjectIdsRaw,
    repositoryUrl: input.repositoryUrl,
    matchedApplicationCount: needsDisambiguation ? 0 : matched.length,
  });

  if (needsDisambiguation) {
    return {
      strict,
      allowWrite: clientAllowWrite,
      serverMcpWritesEnabled,
      canWrite: false,
      fileProjectIds: await filterAccessibleProjectIds(userId, fileProjectIdsRaw),
      effectiveProjectIds: [],
      matchedApplications: [],
      candidateApplications: candidates,
      needsDisambiguation: true,
      organizationIds: [...new Set(candidates.map((c) => c.organizationId))],
      error: 'Multiple Applications match repositoryUrl; pass applicationId to disambiguate',
    };
  }

  const fileProjectIds = await filterAccessibleProjectIds(userId, fileProjectIdsRaw);
  const linkedIds = strict
    ? []
    : await loadApplicationLinkedProjectIds(matched.map((m) => m.id));
  const linkedAccessible = await filterAccessibleProjectIds(userId, linkedIds);
  const effectiveProjectIds = buildEffectiveProjectIds({
    strict,
    fileProjectIds,
    applicationLinkedProjectIds: linkedAccessible,
  });

  const organizationIds = [
    ...new Set([
      ...matched.map((m) => m.organizationId),
      ...(
        await (async () => {
          if (effectiveProjectIds.length === 0) return [] as number[];
          const ph = effectiveProjectIds.map(() => '?').join(',');
          const [orgRows] = await pool.execute<RowDataPacket[]>(
            `SELECT DISTINCT OrganizationId FROM Projects WHERE Id IN (${ph})`,
            effectiveProjectIds
          );
          return orgRows.map((r) => Number(r.OrganizationId));
        })()
      ),
    ]),
  ];

  const scopeError =
    emptyError ||
    (effectiveProjectIds.length === 0 &&
    (strict || matched.length === 0) &&
    fileProjectIds.length === 0
      ? 'Resolved MCP scope is empty'
      : undefined);

  // Non-strict with matched apps can still list tasks by ApplicationId even if no projects
  const hasAppDirectScope = !strict && matched.length > 0;
  const finalError =
    scopeError && !hasAppDirectScope
      ? scopeError
      : effectiveProjectIds.length === 0 && !hasAppDirectScope
        ? 'Resolved MCP scope is empty'
        : undefined;

  return {
    strict,
    allowWrite: clientAllowWrite,
    serverMcpWritesEnabled,
    canWrite: serverMcpWritesEnabled && clientAllowWrite,
    fileProjectIds,
    effectiveProjectIds,
    matchedApplications: matched,
    candidateApplications: candidates,
    needsDisambiguation: false,
    organizationIds,
    error: finalError,
  };
}

export async function loadMergedAgentDocs(
  organizationIds: number[],
  applicationIds: number[],
  kind: 'skills' | 'rules'
): Promise<AgentDocItem[]> {
  const orgTable = kind === 'skills' ? 'OrganizationAgentSkills' : 'OrganizationAgentRules';
  const appTable = kind === 'skills' ? 'ApplicationAgentSkills' : 'ApplicationAgentRules';
  const orgDocs: AgentDocItem[] = [];
  const appDocs: AgentDocItem[] = [];

  if (organizationIds.length > 0) {
    const ph = organizationIds.map(() => '?').join(',');
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, OrganizationId, Name, Slug, Content, SortOrder
       FROM ${orgTable}
       WHERE OrganizationId IN (${ph})
       ORDER BY SortOrder ASC, Id ASC`,
      organizationIds
    );
    for (const r of rows) {
      orgDocs.push({
        id: Number(r.Id),
        name: String(r.Name || ''),
        slug: String(r.Slug || ''),
        content: r.Content != null ? String(r.Content) : '',
        sortOrder: Number(r.SortOrder) || 0,
        scope: 'organization',
        organizationId: Number(r.OrganizationId),
      });
    }
  }

  if (applicationIds.length > 0) {
    const ph = applicationIds.map(() => '?').join(',');
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, ApplicationId, Name, Slug, Content, SortOrder
       FROM ${appTable}
       WHERE ApplicationId IN (${ph})
       ORDER BY SortOrder ASC, Id ASC`,
      applicationIds
    );
    for (const r of rows) {
      appDocs.push({
        id: Number(r.Id),
        name: String(r.Name || ''),
        slug: String(r.Slug || ''),
        content: r.Content != null ? String(r.Content) : '',
        sortOrder: Number(r.SortOrder) || 0,
        scope: 'application',
        applicationId: Number(r.ApplicationId),
      });
    }
  }

  return mergeAgentDocs(orgDocs, appDocs);
}
