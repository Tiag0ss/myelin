import { dbProvider, pool, ResultSetHeader, RowDataPacket } from '../../config/database';
import logger from '../../utils/logger';
import { invalidateByEntity } from '../../services/cacheInvalidation';
import { logActivity } from '../admin/activityLogs';
import { recordTaskHistory } from '../projects/taskHistory';
import {
  attachTasksToSprints,
  canWriteViaMcp,
  coerceAllowWrite,
  coerceBooleanFlag,
  coerceOptionalBooleanFlag,
  coerceOptionalNullableId,
  coerceProjectIds,
  coerceSprintStatus,
  coerceStrict,
  shapeTaskSprintRef,
  sprintAllowedForProject,
} from './scopeHelpers';
import { loadMergedAgentDocs, resolveMcpScope } from './scopeService';

async function usernameForUserId(userId: number): Promise<string | null> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT Username FROM Users WHERE Id = ?',
      [userId]
    );
    return rows[0]?.Username != null ? String(rows[0].Username) : null;
  } catch {
    return null;
  }
}

function historyStr(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function mapTaskRowWithSprint(row: RowDataPacket) {
  const sprint = shapeTaskSprintRef(row);
  const { SprintName: _n, SprintStatus: _s, ...rest } = row as RowDataPacket & {
    SprintName?: unknown;
    SprintStatus?: unknown;
  };
  return { ...rest, sprint };
}

export type McpToolContext = {
  userId: number;
  isCustomerUser: boolean;
};

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

function parseCommonArgs(args: Record<string, unknown>) {
  return {
    repositoryUrl: args.repositoryUrl != null ? String(args.repositoryUrl) : null,
    projectIds: coerceProjectIds(args.projectIds),
    strict: coerceStrict(args.strict),
    allowWrite: coerceAllowWrite(args.allowWrite),
    applicationId:
      args.applicationId != null ? parseInt(String(args.applicationId), 10) || null : null,
  };
}

async function requireInternal(ctx: McpToolContext) {
  if (ctx.isCustomerUser) {
    throw new Error('MCP is not available for customer portal users');
  }
}

export async function toolResolveContext(ctx: McpToolContext, args: Record<string, unknown>) {
  await requireInternal(ctx);
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  logger.info('MCP tool resolve_context', {
    userId: ctx.userId,
    ok: !scope.error && !scope.needsDisambiguation,
  });
  if (scope.error && !scope.needsDisambiguation) {
    return textResult({ success: false, message: scope.error, scope }, true);
  }
  return textResult({
    success: true,
    scope: {
      strict: scope.strict,
      allowWrite: scope.allowWrite,
      serverMcpWritesEnabled: scope.serverMcpWritesEnabled,
      canWrite: scope.canWrite,
      fileProjectIds: scope.fileProjectIds,
      effectiveProjectIds: scope.effectiveProjectIds,
      organizationIds: scope.organizationIds,
      matchedApplications: scope.matchedApplications,
      candidateApplications: scope.candidateApplications,
      needsDisambiguation: scope.needsDisambiguation,
      error: scope.error,
    },
  });
}

export async function toolListDocs(
  ctx: McpToolContext,
  args: Record<string, unknown>,
  kind: 'skills' | 'rules'
) {
  await requireInternal(ctx);
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (scope.needsDisambiguation) {
    return textResult(
      {
        success: false,
        message: scope.error,
        candidates: scope.candidateApplications,
      },
      true
    );
  }
  if (scope.error && scope.matchedApplications.length === 0 && scope.organizationIds.length === 0) {
    return textResult({ success: false, message: scope.error }, true);
  }
  const docs = await loadMergedAgentDocs(
    scope.organizationIds,
    scope.matchedApplications.map((a) => a.id),
    kind
  );
  return textResult({ success: true, data: docs });
}

export async function toolGetDoc(
  ctx: McpToolContext,
  args: Record<string, unknown>,
  kind: 'skills' | 'rules'
) {
  await requireInternal(ctx);
  const id = parseInt(String(args.id ?? ''), 10);
  const slug = args.slug != null ? String(args.slug) : null;
  if (!Number.isFinite(id) && !slug) {
    return textResult({ success: false, message: 'id or slug required' }, true);
  }
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (scope.needsDisambiguation) {
    return textResult({ success: false, message: scope.error, candidates: scope.candidateApplications }, true);
  }
  const docs = await loadMergedAgentDocs(
    scope.organizationIds,
    scope.matchedApplications.map((a) => a.id),
    kind
  );
  const found = docs.find((d) => (Number.isFinite(id) && d.id === id) || (slug && d.slug === slug));
  if (!found) {
    return textResult({ success: false, message: 'Document not found in scope' }, true);
  }
  return textResult({ success: true, data: found });
}

function myTaskAssignmentClause(userId: number): { sql: string; params: number[] } {
  return {
    sql: `(t.AssignedTo = ? OR EXISTS (SELECT 1 FROM TaskAssignees tas WHERE tas.TaskId = t.Id AND tas.UserId = ?))`,
    params: [userId, userId],
  };
}

export async function toolListMyTasks(ctx: McpToolContext, args: Record<string, unknown>) {
  await requireInternal(ctx);
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (scope.needsDisambiguation) {
    return textResult({ success: false, message: scope.error, candidates: scope.candidateApplications }, true);
  }
  if (scope.error) {
    return textResult({ success: false, message: scope.error }, true);
  }

  const assign = myTaskAssignmentClause(ctx.userId);
  const conditions: string[] = [assign.sql];
  const params: unknown[] = [...assign.params];

  const projectIds = scope.effectiveProjectIds;
  const appIds = scope.strict ? [] : scope.matchedApplications.map((a) => a.id);

  if (projectIds.length === 0 && appIds.length === 0) {
    return textResult({ success: false, message: 'Resolved MCP scope is empty' }, true);
  }

  const scopeParts: string[] = [];
  if (projectIds.length > 0) {
    scopeParts.push(`t.ProjectId IN (${projectIds.map(() => '?').join(',')})`);
    params.push(...projectIds);
  }
  if (appIds.length > 0) {
    scopeParts.push(`t.ApplicationId IN (${appIds.map(() => '?').join(',')})`);
    params.push(...appIds);
  }
  conditions.push(`(${scopeParts.join(' OR ')})`);

  if (args.projectId != null) {
    const pid = parseInt(String(args.projectId), 10);
    if (!projectIds.includes(pid) && !(appIds.length > 0)) {
      return textResult({ success: false, message: 'projectId not in effective scope' }, true);
    }
    conditions.push('t.ProjectId = ?');
    params.push(pid);
  }

  if (args.sprintId != null && args.sprintId !== '') {
    const sid = parseInt(String(args.sprintId), 10);
    if (!Number.isFinite(sid) || sid <= 0) {
      return textResult({ success: false, message: 'Invalid sprintId' }, true);
    }
    conditions.push('t.SprintId = ?');
    params.push(sid);
  }

  const limitSql =
    dbProvider === 'mssql'
      ? 'ORDER BY t.Id DESC OFFSET 0 ROWS FETCH NEXT 200 ROWS ONLY'
      : 'ORDER BY t.Id DESC LIMIT 200';

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.Id, t.TaskName, t.Description, t.ProjectId, t.ApplicationId, t.Status, t.Priority, t.TaskType,
            t.AssignedTo, t.DueDate, t.EstimatedHours, t.SprintId, t.UnscheduledWork,
            p.ProjectName, p.OrganizationId,
            tsv.StatusName, tpv.PriorityName, ttv.TypeName AS TaskTypeName,
            sp.Name AS SprintName, sp.Status AS SprintStatus
     FROM Tasks t
     INNER JOIN Projects p ON p.Id = t.ProjectId
     LEFT JOIN Sprints sp ON t.SprintId = sp.Id
     LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
     LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
     LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
     WHERE ${conditions.join(' AND ')}
     ${limitSql}`,
    params
  );

  const data = rows.map(mapTaskRowWithSprint);
  logger.info('MCP tool list_my_tasks', { userId: ctx.userId, count: data.length });
  return textResult({ success: true, data });
}

export async function toolGetTask(ctx: McpToolContext, args: Record<string, unknown>) {
  await requireInternal(ctx);
  const taskId = parseInt(String(args.taskId ?? ''), 10);
  if (!Number.isFinite(taskId)) {
    return textResult({ success: false, message: 'taskId required' }, true);
  }
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (scope.error && !scope.needsDisambiguation) {
    return textResult({ success: false, message: scope.error }, true);
  }
  if (scope.needsDisambiguation) {
    return textResult({ success: false, message: scope.error }, true);
  }

  const assign = myTaskAssignmentClause(ctx.userId);
  const projectIds = scope.effectiveProjectIds;
  const appIds = scope.strict ? [] : scope.matchedApplications.map((a) => a.id);
  const scopeParts: string[] = [];
  const params: unknown[] = [taskId, ...assign.params];
  if (projectIds.length > 0) {
    scopeParts.push(`t.ProjectId IN (${projectIds.map(() => '?').join(',')})`);
    params.push(...projectIds);
  }
  if (appIds.length > 0) {
    scopeParts.push(`t.ApplicationId IN (${appIds.map(() => '?').join(',')})`);
    params.push(...appIds);
  }
  if (scopeParts.length === 0) {
    return textResult({ success: false, message: 'Resolved MCP scope is empty' }, true);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.*, p.ProjectName, p.OrganizationId,
            tsv.StatusName, tpv.PriorityName, ttv.TypeName AS TaskTypeName,
            sp.Name AS SprintName, sp.Status AS SprintStatus
     FROM Tasks t
     INNER JOIN Projects p ON p.Id = t.ProjectId
     LEFT JOIN Sprints sp ON t.SprintId = sp.Id
     LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
     LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
     LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
     WHERE t.Id = ? AND ${assign.sql} AND (${scopeParts.join(' OR ')})`,
    params
  );
  if (!rows.length) {
    return textResult({ success: false, message: 'Task not found in your MCP scope' }, true);
  }
  return textResult({ success: true, data: mapTaskRowWithSprint(rows[0]) });
}

const SPRINT_LIST_SELECT = `SELECT s.Id, s.ProjectId, s.Name, s.Goal, s.StartDate, s.EndDate, s.Status, s.Velocity,
            p.ProjectName, p.OrganizationId,
            COALESCE((SELECT COUNT(*) FROM Tasks t WHERE t.SprintId = s.Id), 0) AS TotalTasks,
            COALESCE((
              SELECT SUM(CASE WHEN tsv.IsClosed = 1 THEN 1 ELSE 0 END)
              FROM Tasks t
              LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
              WHERE t.SprintId = s.Id
            ), 0) AS CompletedTasks
     FROM Sprints s
     INNER JOIN Projects p ON p.Id = s.ProjectId`;

async function loadTasksGroupedBySprintId(sprintIds: number[]): Promise<Map<number, RowDataPacket[]>> {
  const bySprint = new Map<number, RowDataPacket[]>();
  for (const id of sprintIds) bySprint.set(id, []);
  if (sprintIds.length === 0) return bySprint;

  const [taskRows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.Id, t.TaskName, t.Description, t.ProjectId, t.ApplicationId, t.Status, t.Priority, t.TaskType,
            t.AssignedTo, t.DueDate, t.EstimatedHours, t.SprintId, t.UnscheduledWork,
            tsv.StatusName, tpv.PriorityName, ttv.TypeName AS TaskTypeName
     FROM Tasks t
     LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
     LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
     LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
     WHERE t.SprintId IN (${sprintIds.map(() => '?').join(',')})
     ORDER BY t.Id ASC`,
    sprintIds
  );

  for (const row of taskRows) {
    const sid = Number(row.SprintId);
    const list = bySprint.get(sid);
    if (list) list.push(row);
  }
  return bySprint;
}

export async function toolListSprints(ctx: McpToolContext, args: Record<string, unknown>) {
  await requireInternal(ctx);
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (scope.needsDisambiguation) {
    return textResult(
      { success: false, message: scope.error, candidates: scope.candidateApplications },
      true
    );
  }
  if (scope.effectiveProjectIds.length === 0) {
    return textResult({ success: false, message: scope.error || 'No effective projects' }, true);
  }

  let projectIds = scope.effectiveProjectIds;
  if (args.projectId != null) {
    const pid = parseInt(String(args.projectId), 10);
    if (!Number.isFinite(pid) || !projectIds.includes(pid)) {
      return textResult({ success: false, message: 'projectId not in effective MCP scope' }, true);
    }
    projectIds = [pid];
  }

  const conditions: string[] = [
    `s.ProjectId IN (${projectIds.map(() => '?').join(',')})`,
  ];
  const params: unknown[] = [...projectIds];

  if (args.status != null && String(args.status).trim() !== '') {
    conditions.push('s.Status = ?');
    params.push(String(args.status).trim());
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `${SPRINT_LIST_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.StartDate ASC, s.Id ASC`,
    params
  );

  // No sprints in the project is valid — return empty list (not an error).
  const sprintIds = rows.map((r) => Number(r.Id)).filter((id) => Number.isFinite(id) && id > 0);
  const tasksBySprint = await loadTasksGroupedBySprintId(sprintIds);
  const data = attachTasksToSprints(rows, tasksBySprint);

  logger.info('MCP tool list_sprints', { userId: ctx.userId, count: data.length });
  return textResult({ success: true, data });
}

export async function toolGetSprint(ctx: McpToolContext, args: Record<string, unknown>) {
  await requireInternal(ctx);
  const sprintId = parseInt(String(args.sprintId ?? ''), 10);
  if (!Number.isFinite(sprintId) || sprintId <= 0) {
    return textResult({ success: false, message: 'sprintId required' }, true);
  }
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (scope.needsDisambiguation) {
    return textResult(
      { success: false, message: scope.error, candidates: scope.candidateApplications },
      true
    );
  }
  if (scope.effectiveProjectIds.length === 0) {
    return textResult({ success: false, message: scope.error || 'No effective projects' }, true);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `${SPRINT_LIST_SELECT}
     WHERE s.Id = ? AND s.ProjectId IN (${scope.effectiveProjectIds.map(() => '?').join(',')})`,
    [sprintId, ...scope.effectiveProjectIds]
  );
  if (!rows.length) {
    return textResult({ success: false, message: 'Sprint not found in MCP scope' }, true);
  }

  const tasksBySprint = await loadTasksGroupedBySprintId([sprintId]);
  const [data] = attachTasksToSprints(rows, tasksBySprint);
  return textResult({ success: true, data });
}

export async function toolUpdateSprint(ctx: McpToolContext, args: Record<string, unknown>) {
  await requireInternal(ctx);
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (
    !canWriteViaMcp({
      serverMcpWritesEnabled: scope.serverMcpWritesEnabled,
      clientAllowWrite: scope.allowWrite,
    })
  ) {
    return textResult(
      {
        success: false,
        message:
          'MCP writes disabled. Enable Profile → Allow MCP task writes and set allowWrite true in myelin.mcp.json',
      },
      true
    );
  }
  if (scope.error || scope.needsDisambiguation) {
    return textResult({ success: false, message: scope.error || 'Ambiguous application' }, true);
  }

  const sprintId = parseInt(String(args.sprintId ?? ''), 10);
  if (!Number.isFinite(sprintId) || sprintId <= 0) {
    return textResult({ success: false, message: 'sprintId required' }, true);
  }

  const [existing] = await pool.execute<RowDataPacket[]>(
    `SELECT s.Id, s.ProjectId, s.Name, s.Goal, s.StartDate, s.EndDate, s.Status, s.Velocity, p.OrganizationId
     FROM Sprints s
     INNER JOIN Projects p ON p.Id = s.ProjectId
     WHERE s.Id = ? AND s.ProjectId IN (${scope.effectiveProjectIds.map(() => '?').join(',')})`,
    [sprintId, ...scope.effectiveProjectIds]
  );
  if (!existing.length) {
    return textResult({ success: false, message: 'Sprint not found in MCP scope' }, true);
  }

  const row = existing[0];
  const projectId = Number(row.ProjectId);
  let name = row.Name != null ? String(row.Name) : '';
  let goal: string | null = row.Goal != null ? String(row.Goal) : null;
  let startDate: string | null = row.StartDate != null ? String(row.StartDate).slice(0, 10) : null;
  let endDate: string | null = row.EndDate != null ? String(row.EndDate).slice(0, 10) : null;
  let status = String(row.Status || 'planned');
  let velocity: number | null =
    row.Velocity != null && Number.isFinite(Number(row.Velocity)) ? Number(row.Velocity) : null;

  if (args.name != null) name = String(args.name).trim();
  if (args.goal !== undefined) {
    const g = args.goal == null ? '' : String(args.goal);
    goal = g.trim() === '' ? null : g;
  }
  if (args.startDate !== undefined) {
    const d = args.startDate == null ? '' : String(args.startDate).trim();
    startDate = d === '' ? null : d.slice(0, 10);
  }
  if (args.endDate !== undefined) {
    const d = args.endDate == null ? '' : String(args.endDate).trim();
    endDate = d === '' ? null : d.slice(0, 10);
  }
  if (args.velocity !== undefined) {
    if (args.velocity == null || args.velocity === '') velocity = null;
    else {
      const v = Number(args.velocity);
      if (!Number.isFinite(v)) {
        return textResult({ success: false, message: 'Invalid velocity' }, true);
      }
      velocity = v;
    }
  }
  if (args.status != null) {
    const parsed = coerceSprintStatus(args.status);
    if (!parsed.ok) return textResult({ success: false, message: parsed.message }, true);
    status = parsed.value;
  }

  if (!name) {
    return textResult({ success: false, message: 'Sprint name is required' }, true);
  }

  if (status === 'active') {
    const [activeCheck] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM Sprints WHERE ProjectId = ? AND Status = 'active' AND Id != ?`,
      [projectId, sprintId]
    );
    if (activeCheck.length > 0) {
      return textResult(
        { success: false, message: 'A project can only have one active sprint at a time' },
        true
      );
    }
  }

  await pool.execute(
    `UPDATE Sprints SET Name = ?, Goal = ?, StartDate = ?, EndDate = ?, Status = ?, Velocity = ?
     WHERE Id = ?`,
    [name, goal, startDate, endDate, status, velocity, sprintId]
  );

  try {
    await invalidateByEntity('sprint', {
      projectId,
      orgId: row.OrganizationId,
    });
  } catch {
    /* optional redis */
  }

  logger.info('MCP tool sprint_update', { userId: ctx.userId, sprintId, status });
  return textResult({
    success: true,
    data: { id: sprintId, projectId, name, status, startDate, endDate, goal, velocity },
  });
}

async function resolveSprintIdForProject(
  sprintRaw: unknown,
  projectId: number,
  effectiveProjectIds: number[]
): Promise<{ ok: true; sprintId: number | null | undefined } | { ok: false; message: string }> {
  const parsed = coerceOptionalNullableId(sprintRaw);
  if (!parsed.ok) return parsed;
  if (parsed.value === undefined) return { ok: true, sprintId: undefined };
  if (parsed.value === null) return { ok: true, sprintId: null };

  const [sprints] = await pool.execute<RowDataPacket[]>(
    'SELECT Id, ProjectId FROM Sprints WHERE Id = ?',
    [parsed.value]
  );
  if (!sprints.length) {
    return { ok: false, message: 'Sprint not found' };
  }
  const sprintProjectId = Number(sprints[0].ProjectId);
  if (!sprintAllowedForProject(sprintProjectId, projectId, effectiveProjectIds)) {
    return {
      ok: false,
      message: 'Sprint is not in the task project / MCP scope',
    };
  }
  return { ok: true, sprintId: parsed.value };
}

export async function toolListProjectMeta(ctx: McpToolContext, args: Record<string, unknown>) {
  await requireInternal(ctx);
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (scope.needsDisambiguation) {
    return textResult({ success: false, message: scope.error, candidates: scope.candidateApplications }, true);
  }
  if (scope.effectiveProjectIds.length === 0) {
    return textResult({ success: false, message: scope.error || 'No effective projects' }, true);
  }

  const meta = [];
  for (const projectId of scope.effectiveProjectIds.slice(0, 20)) {
    const [projects] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, ProjectName, OrganizationId FROM Projects WHERE Id = ?',
      [projectId]
    );
    if (!projects.length) continue;
    const organizationId = Number(projects[0].OrganizationId);
    const [statuses] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, StatusName AS Name, ColorCode AS Color, SortOrder AS DisplayOrder
       FROM TaskStatusValues
       WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC`,
      [organizationId]
    );
    const [priorities] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, PriorityName AS Name, ColorCode AS Color, SortOrder AS DisplayOrder
       FROM TaskPriorityValues
       WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC`,
      [organizationId]
    );
    const [types] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, TypeName AS Name, ColorCode AS Color, SortOrder AS DisplayOrder
       FROM TaskTypeValues
       WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC`,
      [organizationId]
    );
    meta.push({
      projectId,
      projectName: projects[0].ProjectName,
      organizationId,
      statuses,
      priorities,
      taskTypes: types,
    });
  }
  return textResult({ success: true, data: meta });
}

export async function toolCreateTask(ctx: McpToolContext, args: Record<string, unknown>) {
  await requireInternal(ctx);
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (!canWriteViaMcp({
    serverMcpWritesEnabled: scope.serverMcpWritesEnabled,
    clientAllowWrite: scope.allowWrite,
  })) {
    logger.info('MCP create_task denied', { userId: ctx.userId });
    return textResult(
      {
        success: false,
        message:
          'MCP writes disabled. Enable Profile → Allow MCP task writes and set allowWrite true in myelin.mcp.json',
      },
      true
    );
  }
  if (scope.error || scope.needsDisambiguation) {
    return textResult({ success: false, message: scope.error || 'Ambiguous application' }, true);
  }

  const projectId = parseInt(String(args.projectId ?? ''), 10);
  const taskName = String(args.taskName ?? '').trim();
  if (!Number.isFinite(projectId) || !taskName) {
    return textResult({ success: false, message: 'projectId and taskName are required' }, true);
  }
  if (!scope.effectiveProjectIds.includes(projectId)) {
    return textResult({ success: false, message: 'projectId not in effective MCP scope' }, true);
  }

  const [projects] = await pool.execute<RowDataPacket[]>(
    'SELECT Id, OrganizationId FROM Projects WHERE Id = ?',
    [projectId]
  );
  if (!projects.length) {
    return textResult({ success: false, message: 'Project not found' }, true);
  }
  const organizationId = Number(projects[0].OrganizationId);

  let statusId =
    args.status != null ? parseInt(String(args.status), 10) : NaN;
  let priorityId =
    args.priority != null ? parseInt(String(args.priority), 10) : NaN;
  let taskTypeId =
    args.taskType != null ? parseInt(String(args.taskType), 10) : NaN;

  if (!Number.isFinite(statusId)) {
    const [st] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM TaskStatusValues
       WHERE OrganizationId = ?
       ORDER BY COALESCE(IsDefault, 0) DESC, SortOrder ASC, Id ASC`,
      [organizationId]
    );
    statusId = st[0] ? Number(st[0].Id) : NaN;
  }
  if (!Number.isFinite(priorityId)) {
    const [pr] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM TaskPriorityValues
       WHERE OrganizationId = ?
       ORDER BY COALESCE(IsDefault, 0) DESC, SortOrder ASC, Id ASC`,
      [organizationId]
    );
    priorityId = pr[0] ? Number(pr[0].Id) : NaN;
  }
  if (!Number.isFinite(taskTypeId)) {
    const [tt] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM TaskTypeValues
       WHERE OrganizationId = ?
       ORDER BY COALESCE(IsDefault, 0) DESC, SortOrder ASC, Id ASC`,
      [organizationId]
    );
    taskTypeId = tt[0] ? Number(tt[0].Id) : NaN;
  }
  if (!Number.isFinite(statusId) || !Number.isFinite(priorityId) || !Number.isFinite(taskTypeId)) {
    return textResult(
      {
        success: false,
        message: 'Could not resolve status/priority/taskType; call list_project_meta',
      },
      true
    );
  }

  const description = args.description != null ? String(args.description) : null;
  const applicationId =
    args.applicationId != null
      ? parseInt(String(args.applicationId), 10)
      : scope.matchedApplications[0]?.id ?? null;
  const appId =
    applicationId && Number.isFinite(applicationId) ? applicationId : null;

  const sprintResolved = await resolveSprintIdForProject(
    args.sprintId,
    projectId,
    scope.effectiveProjectIds
  );
  if (!sprintResolved.ok) {
    return textResult({ success: false, message: sprintResolved.message }, true);
  }
  const sprintId = sprintResolved.sprintId === undefined ? null : sprintResolved.sprintId;
  const unscheduledWork =
    args.unscheduledWork !== undefined ? coerceBooleanFlag(args.unscheduledWork) : 0;

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, TaskType, AssignedTo, ApplicationId, CreatedBy, SprintId, UnscheduledWork)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      taskName,
      description,
      statusId,
      priorityId,
      taskTypeId,
      ctx.userId,
      appId,
      ctx.userId,
      sprintId,
      unscheduledWork,
    ]
  );

  await pool.execute(
    `INSERT IGNORE INTO TaskAssignees (TaskId, UserId, AssignedBy) VALUES (?, ?, ?)`,
    [result.insertId, ctx.userId, ctx.userId]
  );

  await recordTaskHistory(result.insertId, ctx.userId, 'created', undefined, undefined, undefined);
  const username = await usernameForUserId(ctx.userId);
  await logActivity(
    ctx.userId,
    username,
    'TASK_CREATE',
    'Task',
    result.insertId,
    taskName,
    `Created task via MCP: ${taskName} in project ID ${projectId}`
  );

  try {
    await invalidateByEntity('task', { projectId });
  } catch {
    /* optional redis */
  }

  logger.info('MCP tool create_task', { userId: ctx.userId, taskId: result.insertId });
  return textResult({
    success: true,
    data: {
      id: result.insertId,
      projectId,
      taskName,
      status: statusId,
      priority: priorityId,
      taskType: taskTypeId,
      assignedTo: ctx.userId,
      sprintId,
      unscheduledWork,
    },
  });
}

export async function toolUpdateTask(ctx: McpToolContext, args: Record<string, unknown>) {
  await requireInternal(ctx);
  const common = parseCommonArgs(args);
  const scope = await resolveMcpScope(ctx.userId, common);
  if (!canWriteViaMcp({
    serverMcpWritesEnabled: scope.serverMcpWritesEnabled,
    clientAllowWrite: scope.allowWrite,
  })) {
    return textResult(
      {
        success: false,
        message:
          'MCP writes disabled. Enable Profile → Allow MCP task writes and set allowWrite true in myelin.mcp.json',
      },
      true
    );
  }

  const taskId = parseInt(String(args.taskId ?? ''), 10);
  if (!Number.isFinite(taskId)) {
    return textResult({ success: false, message: 'taskId required' }, true);
  }

  // Must be in read scope (my task)
  const getResult = await toolGetTask(ctx, { ...args, taskId });
  if (getResult.isError) return getResult;

  let oldTask: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(getResult.content[0]?.text || '{}') as {
      data?: Record<string, unknown>;
    };
    oldTask = parsed.data || {};
  } catch {
    oldTask = {};
  }
  const taskProjectId = Number(oldTask.ProjectId);
  if (!Number.isFinite(taskProjectId)) {
    return textResult({ success: false, message: 'Could not resolve task project' }, true);
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  const changes: Array<{ field: string; oldVal: string | null; newVal: string | null }> = [];

  if (args.taskName != null) {
    const next = String(args.taskName).trim();
    const prev = historyStr(oldTask.TaskName) || '';
    if (next !== prev) {
      updates.push('TaskName = ?');
      params.push(next);
      changes.push({ field: 'TaskName', oldVal: prev, newVal: next });
    }
  }
  if (args.description !== undefined) {
    const next = args.description == null ? null : String(args.description);
    const prev = historyStr(oldTask.Description);
    if ((next || null) !== (prev || null)) {
      updates.push('Description = ?');
      params.push(next);
      changes.push({ field: 'Description', oldVal: prev, newVal: next });
    }
  }
  if (args.status != null) {
    const next = parseInt(String(args.status), 10);
    const prev = Number(oldTask.Status);
    if (Number.isFinite(next) && next !== prev) {
      updates.push('Status = ?');
      params.push(next);
      changes.push({
        field: 'Status',
        oldVal: historyStr(oldTask.Status),
        newVal: String(next),
      });
    }
  }
  if (args.priority != null) {
    const next = parseInt(String(args.priority), 10);
    const prev = Number(oldTask.Priority);
    if (Number.isFinite(next) && next !== prev) {
      updates.push('Priority = ?');
      params.push(next);
      changes.push({
        field: 'Priority',
        oldVal: historyStr(oldTask.Priority),
        newVal: String(next),
      });
    }
  }
  if (args.taskType != null) {
    const next = parseInt(String(args.taskType), 10);
    const prev = Number(oldTask.TaskType);
    if (Number.isFinite(next) && next !== prev) {
      updates.push('TaskType = ?');
      params.push(next);
      changes.push({
        field: 'TaskType',
        oldVal: historyStr(oldTask.TaskType),
        newVal: String(next),
      });
    }
  }
  if (args.sprintId !== undefined) {
    const sprintResolved = await resolveSprintIdForProject(
      args.sprintId,
      taskProjectId,
      scope.effectiveProjectIds
    );
    if (!sprintResolved.ok) {
      return textResult({ success: false, message: sprintResolved.message }, true);
    }
    if (sprintResolved.sprintId !== undefined) {
      const next = sprintResolved.sprintId;
      const prevRaw = oldTask.SprintId;
      const prev = prevRaw == null || prevRaw === '' ? null : Number(prevRaw);
      const prevNorm = prev != null && Number.isFinite(prev) ? prev : null;
      if (next !== prevNorm) {
        updates.push('SprintId = ?');
        params.push(next);
        changes.push({
          field: 'SprintId',
          oldVal: prevNorm == null ? null : String(prevNorm),
          newVal: next == null ? null : String(next),
        });
      }
    }
  }
  if (args.unscheduledWork !== undefined) {
    const next = coerceOptionalBooleanFlag(args.unscheduledWork).value!;
    const prev = coerceBooleanFlag(oldTask.UnscheduledWork);
    if (next !== prev) {
      updates.push('UnscheduledWork = ?');
      params.push(next);
      changes.push({
        field: 'UnscheduledWork',
        oldVal: prev === 1 ? 'Yes' : 'No',
        newVal: next === 1 ? 'Yes' : 'No',
      });
      // Match UI API: unscheduled tasks cannot keep planned dates.
      if (next === 1) {
        updates.push('PlannedStartDate = ?');
        params.push(null);
        updates.push('PlannedEndDate = ?');
        params.push(null);
      }
    }
  }
  if (updates.length === 0) {
    return textResult({ success: false, message: 'No fields to update' }, true);
  }
  params.push(taskId);
  await pool.execute(`UPDATE Tasks SET ${updates.join(', ')} WHERE Id = ?`, params);

  for (const change of changes) {
    await recordTaskHistory(
      taskId,
      ctx.userId,
      'updated',
      change.field,
      change.oldVal ?? undefined,
      change.newVal ?? undefined
    );
  }

  if (changes.length > 0) {
    const username = await usernameForUserId(ctx.userId);
    const displayName = historyStr(args.taskName) || historyStr(oldTask.TaskName) || `Task ${taskId}`;
    await logActivity(
      ctx.userId,
      username,
      'TASK_UPDATE',
      'Task',
      taskId,
      displayName,
      `Updated task via MCP: ${displayName} (Changed: ${changes.map((c) => c.field).join(', ')})`
    );
  }

  try {
    await invalidateByEntity('task', { taskId });
  } catch {
    /* optional */
  }

  logger.info('MCP tool update_task', { userId: ctx.userId, taskId, ok: true });
  return textResult({ success: true, data: { id: taskId, updated: true, changes: changes.map((c) => c.field) } });
}
