import { pool, dbProvider, RowDataPacket, ResultSetHeader } from '../../config/database';
import { ensureTaskApplications } from '../../utils/taskApplicationsDb';
import { buildPatchNotesFromTasksAndCommits } from '../../utils/releasePatchNotes';
import {
  buildWizardProductPatchNotes,
  validateProductVersionAppLinks,
  type ProductAppVersionNoteSource,
} from '../../utils/productPatchNotes';
import {
  parseWizardProjectIds,
  serializeWizardProjectIds,
} from '../../../lib/productReleaseWizard';
import { invalidateByEntity } from '../../services/cacheInvalidation';

export type WizardApplicationInput = {
  applicationId: number;
  mode: 'create' | 'link';
  versionNumber?: string | null;
  versionName?: string | null;
  applicationVersionId?: number | null;
  /** When linking, rebuild and replace ApplicationVersions.PatchNotes from taskIds. */
  recreatePatchNotes?: boolean;
  taskIds: number[];
};

export type WizardPayload = {
  VersionNumber: string;
  VersionName?: string | null;
  Status?: string | null;
  ReleaseDate?: string | null;
  PatchNotes?: string | null;
  IsCustomerSpecific?: boolean | number;
  CustomerId?: number | null;
  projectIds?: number[];
  applications: WizardApplicationInput[];
};

function normalizeDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
}

async function findTasksWithForeignPrimaryApplication(
  applicationId: number,
  taskIds: number[]
): Promise<number[]> {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => '?').join(',');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.Id
     FROM Tasks t
     LEFT JOIN ApplicationVersions lav ON lav.Id = t.ReleaseVersionId
     WHERE t.Id IN (${placeholders})
       AND (
         (t.ApplicationId IS NOT NULL AND t.ApplicationId <> ?)
         OR (lav.Id IS NOT NULL AND lav.ApplicationId <> ?)
       )`,
    [...taskIds, applicationId, applicationId]
  );
  return rows.map((row) => Number(row.Id)).filter((id) => Number.isFinite(id) && id > 0);
}

async function assignTasksToApplicationVersion(
  applicationId: number,
  versionId: number,
  taskIds: number[]
): Promise<void> {
  const normalizedTaskIds = [
    ...new Set(taskIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  ];

  const [existingRows] = await pool.execute<RowDataPacket[]>(
    'SELECT TaskId FROM ApplicationVersionTasks WHERE VersionId = ?',
    [versionId]
  );
  const existingTaskIds = existingRows
    .map((row) => Number(row.TaskId))
    .filter((id) => Number.isFinite(id) && id > 0);

  await pool.execute('DELETE FROM ApplicationVersionTasks WHERE VersionId = ?', [versionId]);
  for (const taskId of normalizedTaskIds) {
    await pool.execute(
      `INSERT INTO ApplicationVersionTasks (VersionId, TaskId)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM ApplicationVersionTasks WHERE VersionId = ? AND TaskId = ?
       )`,
      [versionId, taskId, versionId, taskId]
    );
  }

  await pool.execute('UPDATE Tasks SET ReleaseVersionId = NULL WHERE ReleaseVersionId = ?', [versionId]);

  const foreignPrimaryIds = await findTasksWithForeignPrimaryApplication(
    applicationId,
    normalizedTaskIds
  );
  const foreignPrimarySet = new Set(foreignPrimaryIds);
  const claimTaskIds = normalizedTaskIds.filter((taskId) => !foreignPrimarySet.has(taskId));
  if (claimTaskIds.length > 0) {
    const placeholders = claimTaskIds.map(() => '?').join(',');
    await pool.execute(
      `UPDATE Tasks
       SET ApplicationId = ?, ReleaseVersionId = ?
       WHERE Id IN (${placeholders})`,
      [applicationId, versionId, ...claimTaskIds]
    );
  }

  for (const taskId of normalizedTaskIds) {
    await ensureTaskApplications(taskId, [applicationId]);
  }

  const removedTaskIds = existingTaskIds.filter((taskId) => !normalizedTaskIds.includes(taskId));
  if (removedTaskIds.length > 0) {
    const placeholders = removedTaskIds.map(() => '?').join(',');
    await pool.execute(
      `UPDATE Tasks
       SET ReleaseVersionId = NULL,
           ApplicationId = CASE WHEN ApplicationId = ? THEN NULL ELSE ApplicationId END
       WHERE Id IN (${placeholders}) AND ReleaseVersionId = ?`,
      [applicationId, ...removedTaskIds, versionId]
    );
  }
}

async function loadTaskPatchNoteInputs(taskIds: number[]): Promise<
  Array<{
    Id: number;
    TaskName: string;
    ProjectName?: string | null;
    TaskTypeName?: string | null;
    JiraIssueKey?: string | null;
    ExternalIssueId?: string | null;
    TicketId?: number | null;
    TicketNumber?: string | number | null;
    JiraUrl?: string | null;
    JiraProjectsUrl?: string | null;
    GitHubIssueNumber?: string | number | null;
    GiteaIssueNumber?: string | number | null;
  }>
> {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => '?').join(',');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.Id, t.TaskName, p.ProjectName, ttv.TypeName as TaskTypeName,
            t.JiraIssueKey, t.ExternalIssueId, t.TicketId, t.GitHubIssueNumber, t.GiteaIssueNumber,
            tk.TicketNumber, oji.JiraUrl, oji.JiraProjectsUrl
     FROM Tasks t
     LEFT JOIN Projects p ON p.Id = t.ProjectId
     LEFT JOIN TaskTypeValues ttv ON ttv.Id = t.TaskType
     LEFT JOIN Tickets tk ON t.TicketId = tk.Id
     LEFT JOIN OrganizationJiraIntegrations oji
       ON oji.OrganizationId = p.OrganizationId AND oji.IsEnabled = 1
     WHERE t.Id IN (${placeholders})`,
    taskIds
  );
  const byId = new Map(rows.map((row) => [Number(row.Id), row]));
  return taskIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((row) => ({
      Id: Number(row!.Id),
      TaskName: String(row!.TaskName || ''),
      ProjectName: row!.ProjectName ?? null,
      TaskTypeName: row!.TaskTypeName ?? null,
      JiraIssueKey: row!.JiraIssueKey ?? null,
      ExternalIssueId: row!.ExternalIssueId ?? null,
      TicketId: row!.TicketId != null ? Number(row!.TicketId) : null,
      TicketNumber: row!.TicketNumber ?? null,
      JiraUrl: row!.JiraUrl ?? null,
      JiraProjectsUrl: row!.JiraProjectsUrl ?? null,
      GitHubIssueNumber: row!.GitHubIssueNumber ?? null,
      GiteaIssueNumber: row!.GiteaIssueNumber ?? null,
    }));
}

function collectWizardTaskIds(payload: WizardPayload): number[] {
  const ids = new Set<number>();
  for (const app of payload.applications || []) {
    for (const taskId of app.taskIds || []) {
      const id = Number(taskId);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
  }
  return [...ids];
}

async function insertProductVersionAppLinkIfMissing(
  productVersionId: number,
  applicationVersionId: number
): Promise<void> {
  if (dbProvider === 'mssql') {
    await pool.execute(
      `INSERT INTO ProductVersionApplicationVersions (ProductVersionId, ApplicationVersionId, CreatedAt)
       SELECT ?, ?, CURRENT_TIMESTAMP
       WHERE NOT EXISTS (
         SELECT 1 FROM ProductVersionApplicationVersions WHERE ProductVersionId = ? AND ApplicationVersionId = ?
       )`,
      [productVersionId, applicationVersionId, productVersionId, applicationVersionId]
    );
    return;
  }
  await pool.execute(
    'INSERT IGNORE INTO ProductVersionApplicationVersions (ProductVersionId, ApplicationVersionId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [productVersionId, applicationVersionId]
  );
}

async function resolveApplicationVersionsForWizard(
  productId: number,
  organizationId: number,
  userId: number,
  payload: WizardPayload,
  sharedMeta: {
    status: string;
    releaseDate: string | null;
    isCustomerSpecific: number;
    customerId: number | null;
  }
): Promise<{
  links: Array<{ applicationId: number; applicationVersionId: number }>;
  sources: ProductAppVersionNoteSource[];
  touchedApplicationIds: number[];
}> {
  const [catalogRows] = await pool.execute<RowDataPacket[]>(
    'SELECT ApplicationId FROM ProductApplications WHERE ProductId = ?',
    [productId]
  );
  const catalogApplicationIds = new Set(catalogRows.map((row) => Number(row.ApplicationId)));

  const links: Array<{ applicationId: number; applicationVersionId: number }> = [];
  const sources: ProductAppVersionNoteSource[] = [];
  const touchedApplicationIds: number[] = [];

  for (const app of payload.applications) {
    const applicationId = Number(app.applicationId);
    if (!catalogApplicationIds.has(applicationId)) {
      throw Object.assign(new Error('Application is not in the product catalog'), { status: 400 });
    }

    const [appRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, Name, OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [applicationId]
    );
    if (!appRows.length || Number(appRows[0].OrganizationId) !== organizationId) {
      throw Object.assign(new Error('Application not found in organization'), { status: 400 });
    }
    const applicationName = String(appRows[0].Name || '');
    touchedApplicationIds.push(applicationId);

    let applicationVersionId: number;
    let versionNumber: string;
    let versionName: string | null = null;
    let patchNotes: string | null = null;

    if (app.mode === 'create') {
      versionNumber = String(app.versionNumber || '').trim();
      versionName = app.versionName ? String(app.versionName).trim() || null : null;
      const taskInputs = await loadTaskPatchNoteInputs(app.taskIds || []);
      patchNotes = buildPatchNotesFromTasksAndCommits({
        tasks: taskInputs,
        commits: [],
      }) || null;

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO ApplicationVersions
          (ApplicationId, VersionNumber, VersionName, Status, ReleaseDate, PatchNotes,
           IsCustomerSpecific, CustomerId, CreatedVia, CreatedBy, CreatedAt, UpdatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'product_wizard', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          applicationId,
          versionNumber,
          versionName,
          sharedMeta.status,
          sharedMeta.releaseDate,
          patchNotes,
          sharedMeta.isCustomerSpecific,
          sharedMeta.isCustomerSpecific === 1 ? sharedMeta.customerId : null,
          userId,
        ]
      );
      applicationVersionId = Number(result.insertId);
    } else {
      applicationVersionId = Number(app.applicationVersionId);
      const [avRows] = await pool.execute<RowDataPacket[]>(
        `SELECT av.Id, av.ApplicationId, av.VersionNumber, av.VersionName, av.PatchNotes
         FROM ApplicationVersions av
         WHERE av.Id = ?`,
        [applicationVersionId]
      );
      if (!avRows.length || Number(avRows[0].ApplicationId) !== applicationId) {
        throw Object.assign(
          new Error('Application version does not belong to the selected application'),
          { status: 400 }
        );
      }
      versionNumber = String(avRows[0].VersionNumber || '');
      versionName = avRows[0].VersionName ?? null;
      patchNotes = avRows[0].PatchNotes ?? null;
    }

    await assignTasksToApplicationVersion(applicationId, applicationVersionId, app.taskIds || []);

    if (app.mode === 'link' && Boolean(app.recreatePatchNotes)) {
      const taskInputs = await loadTaskPatchNoteInputs(app.taskIds || []);
      patchNotes =
        buildPatchNotesFromTasksAndCommits({
          tasks: taskInputs,
          commits: [],
        }) || null;
      await pool.execute(
        `UPDATE ApplicationVersions
         SET PatchNotes = ?, UpdatedAt = CURRENT_TIMESTAMP
         WHERE Id = ? AND ApplicationId = ?`,
        [patchNotes, applicationVersionId, applicationId]
      );
    }

    links.push({ applicationId, applicationVersionId });
    sources.push({
      applicationId,
      applicationName,
      applicationVersionId,
      versionNumber,
      versionName,
      patchNotes,
    });
  }

  const validation = validateProductVersionAppLinks(links, { catalogApplicationIds });
  if (!validation.ok) {
    throw Object.assign(new Error(validation.message), { status: 400 });
  }

  return { links, sources, touchedApplicationIds };
}

export async function runProductReleaseWizardCreate(options: {
  productId: number;
  organizationId: number;
  userId: number;
  payload: WizardPayload;
}): Promise<{ productVersionId: number }> {
  const { productId, organizationId, userId, payload } = options;
  const isCustomerSpecific = payload.IsCustomerSpecific ? 1 : 0;
  const customerId =
    payload.CustomerId === null || payload.CustomerId === undefined
      ? null
      : Number(payload.CustomerId);
  if (isCustomerSpecific === 1 && !(customerId && customerId > 0)) {
    throw Object.assign(new Error('Customer is required when version is customer-specific'), {
      status: 400,
    });
  }

  const status = String(payload.Status || 'Planning');
  const releaseDate = normalizeDateOnly(payload.ReleaseDate);
  const wizardProjectIds = serializeWizardProjectIds(payload.projectIds);

  const { links, sources, touchedApplicationIds } = await resolveApplicationVersionsForWizard(
    productId,
    organizationId,
    userId,
    payload,
    {
      status,
      releaseDate,
      isCustomerSpecific,
      customerId: customerId && customerId > 0 ? customerId : null,
    }
  );

  const wizardTaskInputs = await loadTaskPatchNoteInputs(collectWizardTaskIds(payload));
  const patchNotes =
    String(payload.PatchNotes || '').trim() ||
    buildWizardProductPatchNotes(sources, { tasks: wizardTaskInputs }) ||
    null;

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO ProductVersions
      (ProductId, VersionNumber, VersionName, Status, ReleaseDate, PatchNotes,
       IsCustomerSpecific, CustomerId, CreatedVia, WizardProjectIds, CreatedBy, CreatedAt, UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'product_wizard', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      productId,
      payload.VersionNumber,
      payload.VersionName || null,
      status,
      releaseDate,
      patchNotes,
      isCustomerSpecific,
      isCustomerSpecific === 1 ? customerId : null,
      wizardProjectIds,
      userId,
    ]
  );

  const productVersionId = Number(result.insertId);
  for (const link of links) {
    await insertProductVersionAppLinkIfMissing(productVersionId, link.applicationVersionId);
  }

  for (const applicationId of touchedApplicationIds) {
    await invalidateByEntity('application', { applicationId, orgId: organizationId });
  }
  await invalidateByEntity('task', { orgId: organizationId });

  return { productVersionId };
}

export async function runProductReleaseWizardUpdate(options: {
  productId: number;
  productVersionId: number;
  organizationId: number;
  userId: number;
  payload: WizardPayload;
}): Promise<void> {
  const { productId, productVersionId, organizationId, userId, payload } = options;
  const isCustomerSpecific = payload.IsCustomerSpecific ? 1 : 0;
  const customerId =
    payload.CustomerId === null || payload.CustomerId === undefined
      ? null
      : Number(payload.CustomerId);
  if (isCustomerSpecific === 1 && !(customerId && customerId > 0)) {
    throw Object.assign(new Error('Customer is required when version is customer-specific'), {
      status: 400,
    });
  }

  const status = String(payload.Status || 'Planning');
  const releaseDate = normalizeDateOnly(payload.ReleaseDate);
  const wizardProjectIds = serializeWizardProjectIds(payload.projectIds);

  const { links, sources, touchedApplicationIds } = await resolveApplicationVersionsForWizard(
    productId,
    organizationId,
    userId,
    payload,
    {
      status,
      releaseDate,
      isCustomerSpecific,
      customerId: customerId && customerId > 0 ? customerId : null,
    }
  );

  const wizardTaskInputs = await loadTaskPatchNoteInputs(collectWizardTaskIds(payload));
  const patchNotes =
    String(payload.PatchNotes || '').trim() ||
    buildWizardProductPatchNotes(sources, { tasks: wizardTaskInputs }) ||
    null;

  await pool.execute(
    `UPDATE ProductVersions
     SET VersionNumber = ?, VersionName = ?, Status = ?, ReleaseDate = ?, PatchNotes = ?,
         IsCustomerSpecific = ?, CustomerId = ?, CreatedVia = 'product_wizard',
         WizardProjectIds = ?, UpdatedAt = CURRENT_TIMESTAMP
     WHERE Id = ? AND ProductId = ?`,
    [
      payload.VersionNumber,
      payload.VersionName || null,
      status,
      releaseDate,
      patchNotes,
      isCustomerSpecific,
      isCustomerSpecific === 1 ? customerId : null,
      wizardProjectIds,
      productVersionId,
      productId,
    ]
  );

  await pool.execute(
    'DELETE FROM ProductVersionApplicationVersions WHERE ProductVersionId = ?',
    [productVersionId]
  );
  for (const link of links) {
    await insertProductVersionAppLinkIfMissing(productVersionId, link.applicationVersionId);
  }

  for (const applicationId of touchedApplicationIds) {
    await invalidateByEntity('application', { applicationId, orgId: organizationId });
  }
  await invalidateByEntity('task', { orgId: organizationId });
}

export async function loadProductReleaseWizardState(options: {
  productId: number;
  productVersionId: number;
}): Promise<{
  version: Record<string, unknown>;
  projectIds: number[];
  applications: Array<{
    applicationId: number;
    included: boolean;
    mode: 'link';
    applicationVersionId: number | null;
    versionNumber: string | null;
    versionName: string | null;
    taskIds: number[];
  }>;
  tasks: Array<{
    taskId: number;
    applicationIds: number[];
    TaskName: string;
    ProjectId: number | null;
    ProjectName: string | null;
    ApplicationId: number | null;
    relatedApplicationIds: number[];
    TaskTypeName: string | null;
    JiraIssueKey: string | null;
    ExternalIssueId: string | null;
    TicketId: number | null;
    TicketNumber: string | number | null;
    GitHubIssueNumber: string | number | null;
    GiteaIssueNumber: string | number | null;
    JiraUrl: string | null;
    JiraProjectsUrl: string | null;
  }>;
} | null> {
  const { productId, productVersionId } = options;

  const [versions] = await pool.execute<RowDataPacket[]>(
    `SELECT pv.*
     FROM ProductVersions pv
     WHERE pv.Id = ? AND pv.ProductId = ?`,
    [productVersionId, productId]
  );
  if (!versions.length) return null;
  const version = versions[0];

  const [catalogRows] = await pool.execute<RowDataPacket[]>(
    `SELECT pa.ApplicationId, a.Name as ApplicationName
     FROM ProductApplications pa
     INNER JOIN Applications a ON a.Id = pa.ApplicationId
     WHERE pa.ProductId = ?
     ORDER BY a.Name ASC`,
    [productId]
  );

  const [linkRows] = await pool.execute<RowDataPacket[]>(
    `SELECT pvav.ApplicationVersionId, av.ApplicationId, av.VersionNumber, av.VersionName
     FROM ProductVersionApplicationVersions pvav
     INNER JOIN ApplicationVersions av ON av.Id = pvav.ApplicationVersionId
     WHERE pvav.ProductVersionId = ?`,
    [productVersionId]
  );

  const linkByApp = new Map<number, RowDataPacket>();
  for (const row of linkRows) {
    linkByApp.set(Number(row.ApplicationId), row);
  }

  const applications = catalogRows.map((row) => {
    const applicationId = Number(row.ApplicationId);
    const linked = linkByApp.get(applicationId);
    return {
      applicationId,
      included: Boolean(linked),
      mode: 'link' as const,
      applicationVersionId: linked ? Number(linked.ApplicationVersionId) : null,
      versionNumber: linked ? String(linked.VersionNumber || '') : null,
      versionName: linked?.VersionName ?? null,
      taskIds: [] as number[],
    };
  });

  const linkedVersionIds = linkRows.map((row) => Number(row.ApplicationVersionId));
  const taskAppMap = new Map<
    number,
    {
      taskId: number;
      applicationIds: Set<number>;
      TaskName: string;
      ProjectId: number | null;
      ProjectName: string | null;
      ApplicationId: number | null;
      relatedApplicationIds: Set<number>;
      TaskTypeName: string | null;
      JiraIssueKey: string | null;
      ExternalIssueId: string | null;
      TicketId: number | null;
      TicketNumber: string | number | null;
      GitHubIssueNumber: string | number | null;
      GiteaIssueNumber: string | number | null;
      JiraUrl: string | null;
      JiraProjectsUrl: string | null;
    }
  >();

  if (linkedVersionIds.length > 0) {
    const placeholders = linkedVersionIds.map(() => '?').join(',');
    const [taskRows] = await pool.execute<RowDataPacket[]>(
      `SELECT avt.TaskId, avt.VersionId, av.ApplicationId,
              t.TaskName, t.ProjectId, t.ApplicationId as PrimaryApplicationId,
              p.ProjectName, ttv.TypeName as TaskTypeName,
              t.JiraIssueKey, t.ExternalIssueId, t.TicketId, t.GitHubIssueNumber, t.GiteaIssueNumber,
              tk.TicketNumber, oji.JiraUrl, oji.JiraProjectsUrl
       FROM ApplicationVersionTasks avt
       INNER JOIN ApplicationVersions av ON av.Id = avt.VersionId
       INNER JOIN Tasks t ON t.Id = avt.TaskId
       LEFT JOIN Projects p ON p.Id = t.ProjectId
       LEFT JOIN TaskTypeValues ttv ON ttv.Id = t.TaskType
       LEFT JOIN Tickets tk ON t.TicketId = tk.Id
       LEFT JOIN OrganizationJiraIntegrations oji
         ON oji.OrganizationId = p.OrganizationId AND oji.IsEnabled = 1
       WHERE avt.VersionId IN (${placeholders})`,
      linkedVersionIds
    );

    for (const row of taskRows) {
      const taskId = Number(row.TaskId);
      const applicationId = Number(row.ApplicationId);
      if (!taskAppMap.has(taskId)) {
        taskAppMap.set(taskId, {
          taskId,
          applicationIds: new Set(),
          TaskName: String(row.TaskName || ''),
          ProjectId: row.ProjectId != null ? Number(row.ProjectId) : null,
          ProjectName: row.ProjectName ?? null,
          ApplicationId:
            row.PrimaryApplicationId != null ? Number(row.PrimaryApplicationId) : null,
          relatedApplicationIds: new Set(),
          TaskTypeName: row.TaskTypeName ?? null,
          JiraIssueKey: row.JiraIssueKey ?? null,
          ExternalIssueId: row.ExternalIssueId ?? null,
          TicketId: row.TicketId != null ? Number(row.TicketId) : null,
          TicketNumber: row.TicketNumber ?? null,
          GitHubIssueNumber: row.GitHubIssueNumber ?? null,
          GiteaIssueNumber: row.GiteaIssueNumber ?? null,
          JiraUrl: row.JiraUrl ?? null,
          JiraProjectsUrl: row.JiraProjectsUrl ?? null,
        });
      }
      taskAppMap.get(taskId)!.applicationIds.add(applicationId);
    }

    const taskIds = [...taskAppMap.keys()];
    if (taskIds.length > 0) {
      const taskPlaceholders = taskIds.map(() => '?').join(',');
      const [relatedRows] = await pool.execute<RowDataPacket[]>(
        `SELECT TaskId, ApplicationId FROM TaskApplications WHERE TaskId IN (${taskPlaceholders})`,
        taskIds
      );
      for (const row of relatedRows) {
        const entry = taskAppMap.get(Number(row.TaskId));
        if (entry) entry.relatedApplicationIds.add(Number(row.ApplicationId));
      }
    }

    for (const app of applications) {
      if (!app.applicationVersionId) continue;
      app.taskIds = [...taskAppMap.values()]
        .filter((t) => t.applicationIds.has(app.applicationId))
        .map((t) => t.taskId);
    }
  }

  return {
    version: version as Record<string, unknown>,
    projectIds: parseWizardProjectIds(version.WizardProjectIds),
    applications,
    tasks: [...taskAppMap.values()].map((t) => ({
      taskId: t.taskId,
      applicationIds: [...t.applicationIds].sort((a, b) => a - b),
      TaskName: t.TaskName,
      ProjectId: t.ProjectId,
      ProjectName: t.ProjectName,
      ApplicationId: t.ApplicationId,
      relatedApplicationIds: [...t.relatedApplicationIds].sort((a, b) => a - b),
      TaskTypeName: t.TaskTypeName,
      JiraIssueKey: t.JiraIssueKey,
      ExternalIssueId: t.ExternalIssueId,
      TicketId: t.TicketId,
      TicketNumber: t.TicketNumber,
      GitHubIssueNumber: t.GitHubIssueNumber,
      GiteaIssueNumber: t.GiteaIssueNumber,
      JiraUrl: t.JiraUrl,
      JiraProjectsUrl: t.JiraProjectsUrl,
    })),
  };
}
