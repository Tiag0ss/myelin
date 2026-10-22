import {
  assertNonEmptyScope,
  attachTasksToSprints,
  buildEffectiveProjectIds,
  canWriteViaMcp,
  coerceAllowWrite,
  coerceBooleanFlag,
  coerceOptionalBooleanFlag,
  coerceOptionalNullableId,
  coerceProjectIds,
  coerceSprintStatus,
  coerceStrict,
  matchApplicationsByRepositoryUrl,
  mergeAgentDocs,
  resolveMatchedApplications,
  shapeTaskSprintRef,
  sprintAllowedForProject,
  type AgentDocItem,
  type MatchedApplication,
} from '../../server/modules/mcp/scopeHelpers';
import { normalizeRepositoryUrlKey, repositoryUrlsMatch } from '../../server/modules/mcp/repoUrl';

describe('normalizeRepositoryUrlKey', () => {
  it('normalizes https and strips .git / trailing slash', () => {
    expect(normalizeRepositoryUrlKey('https://GitHub.com/Org/Repo.git/')).toBe(
      'github.com/org/repo'
    );
  });

  it('normalizes git@ SSH remotes to the same key', () => {
    expect(normalizeRepositoryUrlKey('git@github.com:Org/Repo.git')).toBe('github.com/org/repo');
    expect(
      repositoryUrlsMatch('https://github.com/Org/Repo', 'git@github.com:Org/Repo.git')
    ).toBe(true);
  });

  it('returns null for empty input', () => {
    expect(normalizeRepositoryUrlKey('')).toBeNull();
    expect(normalizeRepositoryUrlKey(null)).toBeNull();
  });
});

describe('matchApplicationsByRepositoryUrl / ambiguity', () => {
  const apps: MatchedApplication[] = [
    { id: 1, name: 'A', organizationId: 10, repositoryUrl: 'https://github.com/acme/one.git' },
    { id: 2, name: 'B', organizationId: 10, repositoryUrl: 'git@github.com:acme/two.git' },
    { id: 3, name: 'C', organizationId: 11, repositoryUrl: 'https://github.com/acme/one' },
  ];

  it('returns zero matches when nothing aligns', () => {
    expect(matchApplicationsByRepositoryUrl(apps, 'https://github.com/other/x')).toEqual([]);
  });

  it('returns one match when unique', () => {
    expect(matchApplicationsByRepositoryUrl(apps, 'https://github.com/acme/two')).toEqual([
      apps[1],
    ]);
  });

  it('returns multiple matches for the same remote key', () => {
    const matched = matchApplicationsByRepositoryUrl(apps, 'git@github.com:acme/one.git');
    expect(matched.map((a) => a.id).sort()).toEqual([1, 3]);
  });

  it('resolveMatchedApplications requires applicationId when ambiguous', () => {
    const candidates = [apps[0], apps[2]];
    expect(resolveMatchedApplications(candidates)).toEqual({
      matched: [],
      ambiguous: true,
      needsDisambiguation: true,
    });
    expect(resolveMatchedApplications(candidates, 3)).toEqual({
      matched: [apps[2]],
      ambiguous: false,
      needsDisambiguation: false,
    });
  });
});

describe('buildEffectiveProjectIds / assertNonEmptyScope', () => {
  it('strict uses only file project ids', () => {
    expect(
      buildEffectiveProjectIds({
        strict: true,
        fileProjectIds: [1, 2, 2],
        applicationLinkedProjectIds: [9, 10],
      })
    ).toEqual([1, 2]);
  });

  it('non-strict unions file and application-linked ids', () => {
    expect(
      buildEffectiveProjectIds({
        strict: false,
        fileProjectIds: [1],
        applicationLinkedProjectIds: [2, 1],
      })
    ).toEqual([1, 2]);
  });

  it('errors on strict with empty projectIds', () => {
    expect(
      assertNonEmptyScope({
        strict: true,
        fileProjectIds: [],
        repositoryUrl: 'https://github.com/a/b',
        matchedApplicationCount: 1,
      })
    ).toMatch(/strict/i);
  });

  it('errors when no projectIds and no repositoryUrl', () => {
    expect(
      assertNonEmptyScope({
        strict: false,
        fileProjectIds: [],
        repositoryUrl: null,
        matchedApplicationCount: 0,
      })
    ).toMatch(/projectIds|repositoryUrl/i);
  });

  it('errors when remote given but zero app matches and no projectIds', () => {
    expect(
      assertNonEmptyScope({
        strict: false,
        fileProjectIds: [],
        repositoryUrl: 'https://github.com/a/b',
        matchedApplicationCount: 0,
      })
    ).toMatch(/No Application matched/i);
  });

  it('allows non-strict scope via matched application only', () => {
    expect(
      assertNonEmptyScope({
        strict: false,
        fileProjectIds: [],
        repositoryUrl: 'https://github.com/a/b',
        matchedApplicationCount: 1,
      })
    ).toBeNull();
  });
});

describe('canWriteViaMcp dual gate', () => {
  it('requires both server preference and client allowWrite', () => {
    expect(canWriteViaMcp({ serverMcpWritesEnabled: false, clientAllowWrite: false })).toBe(false);
    expect(canWriteViaMcp({ serverMcpWritesEnabled: true, clientAllowWrite: false })).toBe(false);
    expect(canWriteViaMcp({ serverMcpWritesEnabled: false, clientAllowWrite: true })).toBe(false);
    expect(canWriteViaMcp({ serverMcpWritesEnabled: true, clientAllowWrite: true })).toBe(true);
  });

  it('coerces allowWrite / strict defaults', () => {
    expect(coerceAllowWrite(undefined)).toBe(false);
    expect(coerceAllowWrite('true')).toBe(true);
    expect(coerceStrict(undefined)).toBe(false);
    expect(coerceStrict(1)).toBe(true);
    expect(coerceProjectIds([1, '2', 0, -1, 'x'])).toEqual([1, 2]);
  });
});

describe('mergeAgentDocs', () => {
  const org: AgentDocItem[] = [
    {
      id: 2,
      name: 'Org B',
      slug: 'b',
      content: 'ob',
      sortOrder: 2,
      scope: 'organization',
      organizationId: 1,
    },
    {
      id: 1,
      name: 'Org A',
      slug: 'a',
      content: 'oa',
      sortOrder: 1,
      scope: 'organization',
      organizationId: 1,
    },
  ];
  const app: AgentDocItem[] = [
    {
      id: 10,
      name: 'App',
      slug: 'a',
      content: 'aa',
      sortOrder: 0,
      scope: 'application',
      applicationId: 5,
    },
  ];

  it('merges organization first then application, sorted within scope', () => {
    const merged = mergeAgentDocs(org, app);
    expect(merged.map((d) => d.id)).toEqual([1, 2, 10]);
    expect(merged.map((d) => d.scope)).toEqual(['organization', 'organization', 'application']);
  });
});

/** My-tasks filter: project in effective set OR (non-strict) application in matched set */
function taskVisibleInMcpReadScope(options: {
  projectId: number | null;
  applicationId: number | null;
  effectiveProjectIds: number[];
  matchedApplicationIds: number[];
  strict: boolean;
}): boolean {
  const inProject =
    options.projectId != null && options.effectiveProjectIds.includes(options.projectId);
  if (inProject) return true;
  if (options.strict) return false;
  return (
    options.applicationId != null && options.matchedApplicationIds.includes(options.applicationId)
  );
}

describe('list_my_tasks scope filter', () => {
  it('includes tasks by effective project id', () => {
    expect(
      taskVisibleInMcpReadScope({
        projectId: 12,
        applicationId: 99,
        effectiveProjectIds: [12],
        matchedApplicationIds: [],
        strict: true,
      })
    ).toBe(true);
  });

  it('excludes other projects in strict mode even with application match', () => {
    expect(
      taskVisibleInMcpReadScope({
        projectId: 99,
        applicationId: 5,
        effectiveProjectIds: [12],
        matchedApplicationIds: [5],
        strict: true,
      })
    ).toBe(false);
  });

  it('includes by application id when not strict', () => {
    expect(
      taskVisibleInMcpReadScope({
        projectId: 99,
        applicationId: 5,
        effectiveProjectIds: [12],
        matchedApplicationIds: [5],
        strict: false,
      })
    ).toBe(true);
  });
});

describe('coerceOptionalNullableId / sprintAllowedForProject', () => {
  it('omits, clears, and parses sprint ids', () => {
    expect(coerceOptionalNullableId(undefined)).toEqual({ ok: true, value: undefined });
    expect(coerceOptionalNullableId(null)).toEqual({ ok: true, value: null });
    expect(coerceOptionalNullableId('')).toEqual({ ok: true, value: null });
    expect(coerceOptionalNullableId('null')).toEqual({ ok: true, value: null });
    expect(coerceOptionalNullableId(42)).toEqual({ ok: true, value: 42 });
    expect(coerceOptionalNullableId('7')).toEqual({ ok: true, value: 7 });
    expect(coerceOptionalNullableId(0).ok).toBe(false);
    expect(coerceOptionalNullableId('x').ok).toBe(false);
  });

  it('allows sprint only when it matches the task project in scope', () => {
    expect(sprintAllowedForProject(10, 10, [10, 11])).toBe(true);
    expect(sprintAllowedForProject(11, 10, [10, 11])).toBe(false);
    expect(sprintAllowedForProject(10, 10, [11])).toBe(false);
  });

  it('shapes nested sprint ref or null when absent', () => {
    expect(shapeTaskSprintRef({ SprintId: null })).toBeNull();
    expect(shapeTaskSprintRef({})).toBeNull();
    expect(shapeTaskSprintRef({ SprintId: 2, SprintName: 'Sprint 2', SprintStatus: 'planned' })).toEqual(
      { id: 2, name: 'Sprint 2', status: 'planned' }
    );
  });

  it('attaches tasks to sprints including empty arrays', () => {
    const map = new Map<number, Array<{ Id: number }>>([
      [1, [{ Id: 10 }]],
      [2, []],
    ]);
    expect(attachTasksToSprints([{ Id: 1 }, { Id: 2 }], map)).toEqual([
      { Id: 1, tasks: [{ Id: 10 }] },
      { Id: 2, tasks: [] },
    ]);
    expect(attachTasksToSprints([], map)).toEqual([]);
  });

  it('coerces sprint status values', () => {
    expect(coerceSprintStatus('completed')).toEqual({ ok: true, value: 'completed' });
    expect(coerceSprintStatus('PLANNED')).toEqual({ ok: true, value: 'planned' });
    expect(coerceSprintStatus('nope').ok).toBe(false);
  });

  it('coerces unscheduledWork-style boolean flags', () => {
    expect(coerceBooleanFlag(true)).toBe(1);
    expect(coerceBooleanFlag('yes')).toBe(1);
    expect(coerceBooleanFlag(false)).toBe(0);
    expect(coerceOptionalBooleanFlag(undefined)).toEqual({ ok: true, value: undefined });
    expect(coerceOptionalBooleanFlag('1')).toEqual({ ok: true, value: 1 });
  });
});
