import { dbProvider, pool, ResultSetHeader, RowDataPacket } from '../../config/database';
import logger from '../../utils/logger';
import { invalidateByEntity } from '../../services/cacheInvalidation';
import { canWriteViaMcp, coerceAllowWrite, coerceProjectIds, coerceStrict } from './scopeHelpers';
import { loadMergedAgentDocs, resolveMcpScope } from './scopeService';

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

  const limitSql =
    dbProvider === 'mssql'
      ? 'ORDER BY t.Id DESC OFFSET 0 ROWS FETCH NEXT 200 ROWS ONLY'
      : 'ORDER BY t.Id DESC LIMIT 200';

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.Id, t.TaskName, t.ProjectId, t.ApplicationId, t.Status, t.Priority, t.TaskType, t.AssignedTo,
            t.DueDate, t.EstimatedHours, p.ProjectName, p.OrganizationId,
            tsv.StatusName, tpv.PriorityName, ttv.TypeName AS TaskTypeName
     FROM Tasks t
     INNER JOIN Projects p ON p.Id = t.ProjectId
     LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
     LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
     LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
     WHERE ${conditions.join(' AND ')}
     ${limitSql}`,
    params
  );

  logger.info('MCP tool list_my_tasks', { userId: ctx.userId, count: rows.length });
  return textResult({ success: true, data: rows });
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
            tsv.StatusName, tpv.PriorityName, ttv.TypeName AS TaskTypeName
     FROM Tasks t
     INNER JOIN Projects p ON p.Id = t.ProjectId
     LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
     LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
     LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
     WHERE t.Id = ? AND ${assign.sql} AND (${scopeParts.join(' OR ')})`,
    params
  );
  if (!rows.length) {
    return textResult({ success: false, message: 'Task not found in your MCP scope' }, true);
  }
  return textResult({ success: true, data: rows[0] });
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

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, TaskType, AssignedTo, ApplicationId, CreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [projectId, taskName, description, statusId, priorityId, taskTypeId, ctx.userId, appId, ctx.userId]
  );

  await pool.execute(
    `INSERT IGNORE INTO TaskAssignees (TaskId, UserId, AssignedBy) VALUES (?, ?, ?)`,
    [result.insertId, ctx.userId, ctx.userId]
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

  const updates: string[] = [];
  const params: unknown[] = [];
  if (args.taskName != null) {
    updates.push('TaskName = ?');
    params.push(String(args.taskName).trim());
  }
  if (args.description !== undefined) {
    updates.push('Description = ?');
    params.push(args.description == null ? null : String(args.description));
  }
  if (args.status != null) {
    updates.push('Status = ?');
    params.push(parseInt(String(args.status), 10));
  }
  if (args.priority != null) {
    updates.push('Priority = ?');
    params.push(parseInt(String(args.priority), 10));
  }
  if (args.taskType != null) {
    updates.push('TaskType = ?');
    params.push(parseInt(String(args.taskType), 10));
  }
  if (updates.length === 0) {
    return textResult({ success: false, message: 'No fields to update' }, true);
  }
  params.push(taskId);
  await pool.execute(`UPDATE Tasks SET ${updates.join(', ')} WHERE Id = ?`, params);

  try {
    await invalidateByEntity('task', { taskId });
  } catch {
    /* optional */
  }

  logger.info('MCP tool update_task', { userId: ctx.userId, taskId, ok: true });
  return textResult({ success: true, data: { id: taskId, updated: true } });
}
