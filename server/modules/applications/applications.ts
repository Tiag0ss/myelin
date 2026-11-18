import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../../middleware/auth';
import { dbProvider, pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from '../../config/database';
import PDFDocument from 'pdfkit';
import path from 'path';
import { promises as fs } from 'fs';
import { cachedJson, ENTITY_TTL_SECONDS } from '../../utils/cachedJson';
import { cacheKeys } from '../../services/cacheKeys';
import { invalidateByEntity } from '../../services/cacheInvalidation';
import logger from '../../utils/logger';
import {
  parseRepositoryUrl,
  resolveGitCredentials,
  listRemoteCommits,
  listRemoteBranches,
} from '../../utils/gitRemote';
import { exclusiveApplicationVcsFks } from '../../utils/vcsIntegrationHelpers';
import {
  APPLICATION_IMAGE_TYPES,
  APPLICATION_UPLOAD_DIR,
  deletePublicUploadIfOwned,
  resolveImageMime,
  uploadErrorMessage,
  writePublicUpload,
} from '../../utils/publicUploads';
import { renderPatchNotesToPdf, resolvePdfLinkBaseUrl } from '../../utils/releaseNotesPdf';
import {
  chatCompletion,
  getLlmConfig,
  llmNotConfiguredMessage,
  prepareHtmlForLlm,
} from '../../utils/llmProvider';
import {
  normalizeCommitSha,
  reapplyPatchNoteIssueLinks,
  resolvePatchNoteIssueKey,
  resolvePatchNoteIssueUrl,
} from '../../utils/releasePatchNotes';
import { ensureTaskApplications } from '../../utils/taskApplicationsDb';
import {
  buildReleaseTaskSearchClause,
  normalizeReleaseTaskSearch,
  resolveReleaseTaskPickerScope,
} from '../../utils/releaseTaskPicker';

const router = Router();

const MAX_APPLICATION_IMAGE_BYTES = 2 * 1024 * 1024;

async function userCanManageApplications(userId: number, organizationId: number): Promise<boolean> {
  const [user] = await pool.execute<RowDataPacket[]>(
    'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
    [userId]
  );
  if (!user.length) return false;
  if (user[0].isAdmin) return true;

  const roles: string[] = [];
  if (user[0].IsDeveloper) roles.push('Developer');
  if (user[0].IsSupport) roles.push('Support');
  if (user[0].IsManager) roles.push('Manager');

  if (roles.length > 0) {
    const placeholders = roles.map(() => '?').join(',');
    const [rolePerms] = await pool.execute<RowDataPacket[]>(
      `SELECT CanManageApplications FROM RolePermissions WHERE RoleName IN (${placeholders})`,
      roles
    );
    if (rolePerms.some((rp: any) => rp.CanManageApplications === 1)) return true;
  }

  const [orgPerms] = await pool.execute<RowDataPacket[]>(
    `SELECT pg.CanManageApplications FROM PermissionGroups pg
     INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
     WHERE om.UserId = ? AND pg.OrganizationId = ?`,
    [userId, organizationId]
  );
  return orgPerms.some((op: any) => op.CanManageApplications === 1);
}

function normalizeDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().split('T')[0];
}

async function isSyncTaskStatusOnVersionChangeEnabled(): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT SettingValue FROM SystemSettings WHERE SettingKey = ?`,
    ['syncTaskStatusOnVersionChange']
  );
  return String(rows[0]?.SettingValue || '').toLowerCase() === 'true';
}

/**
 * When admin flag is on and client opted in, set linked tasks' Status to the
 * TaskStatusId mapped on the version's ApplicationVersionStatusValues row.
 */
async function syncVersionLinkedTaskStatuses(
  versionId: string | number,
  applicationId: string | number,
  options: { updateTaskStatuses?: boolean } = {}
): Promise<void> {
  if (!options.updateTaskStatuses) {
    return;
  }

  const enabled = await isSyncTaskStatusOnVersionChangeEnabled();
  if (!enabled) {
    return;
  }

  const [versionRows] = await pool.execute<RowDataPacket[]>(
    `SELECT av.Status, a.OrganizationId
     FROM ApplicationVersions av
     INNER JOIN Applications a ON a.Id = av.ApplicationId
     WHERE av.Id = ? AND av.ApplicationId = ?
     LIMIT 1`,
    [versionId, applicationId]
  );

  if (!versionRows.length) {
    return;
  }

  const organizationId = versionRows[0].OrganizationId;
  const statusName = String(versionRows[0].Status || '').trim();
  if (!statusName) {
    return;
  }

  const [mapped] = await pool.execute<RowDataPacket[]>(
    `SELECT TaskStatusId
     FROM ApplicationVersionStatusValues
     WHERE OrganizationId = ? AND StatusName = ? AND TaskStatusId IS NOT NULL
     LIMIT 1`,
    [organizationId, statusName]
  );

  if (!mapped.length || mapped[0].TaskStatusId == null) {
    return;
  }

  const taskStatusId = Number(mapped[0].TaskStatusId);
  if (!Number.isFinite(taskStatusId) || taskStatusId <= 0) {
    return;
  }

  if (dbProvider === 'mssql') {
    await pool.execute(
      `UPDATE t
       SET t.Status = ?
       FROM Tasks t
       INNER JOIN ApplicationVersionTasks avt ON avt.TaskId = t.Id
       WHERE avt.VersionId = ?`,
      [taskStatusId, versionId]
    );
  } else {
    await pool.execute(
      `UPDATE Tasks t
       INNER JOIN ApplicationVersionTasks avt ON avt.TaskId = t.Id
       SET t.Status = ?
       WHERE avt.VersionId = ?`,
      [taskStatusId, versionId]
    );
  }
}

async function findTasksLinkedToOtherApplications(
  applicationId: string | number,
  taskIds: number[]
): Promise<Array<{ Id: number; TaskName: string; LinkedApplicationName: string | null; LinkedVersionNumber: string | null }>> {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => '?').join(',');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.Id, t.TaskName,
            COALESCE(la.Name, other_a.Name) as LinkedApplicationName,
            COALESCE(lav.VersionNumber, other_av.VersionNumber) as LinkedVersionNumber
     FROM Tasks t
     LEFT JOIN Applications la ON t.ApplicationId = la.Id AND t.ApplicationId <> ?
     LEFT JOIN ApplicationVersions lav ON t.ReleaseVersionId = lav.Id AND lav.ApplicationId <> ?
     LEFT JOIN ApplicationVersionTasks other_avt ON other_avt.TaskId = t.Id
       AND other_avt.VersionId IN (
         SELECT avy.Id FROM ApplicationVersions avy WHERE avy.ApplicationId <> ?
       )
     LEFT JOIN ApplicationVersions other_av ON other_av.Id = other_avt.VersionId
     LEFT JOIN Applications other_a ON other_a.Id = other_av.ApplicationId
     WHERE t.Id IN (${placeholders})
       AND (
         (t.ApplicationId IS NOT NULL AND t.ApplicationId <> ?)
         OR other_av.Id IS NOT NULL
       )`,
    [applicationId, applicationId, applicationId, ...taskIds, applicationId]
  );

  const byId = new Map<number, { Id: number; TaskName: string; LinkedApplicationName: string | null; LinkedVersionNumber: string | null }>();
  for (const row of rows) {
    const id = Number(row.Id);
    if (!Number.isFinite(id) || byId.has(id)) continue;
    byId.set(id, {
      Id: id,
      TaskName: String(row.TaskName || ''),
      LinkedApplicationName: row.LinkedApplicationName ?? null,
      LinkedVersionNumber: row.LinkedVersionNumber ?? null,
    });
  }
  return Array.from(byId.values());
}

/** Tasks whose primary ApplicationId / ReleaseVersionId belong to another application. */
async function findTasksWithForeignPrimaryApplication(
  applicationId: string | number,
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
  return rows
    .map((row) => Number(row.Id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

async function ensureApplicationCustomerAssociation(
  applicationId: string | number,
  customerId: number
): Promise<void> {
  if (dbProvider === 'mssql') {
    await pool.execute(
      `INSERT INTO ApplicationCustomers (ApplicationId, CustomerId, CreatedAt)
       SELECT ?, ?, CURRENT_TIMESTAMP
       WHERE NOT EXISTS (
         SELECT 1 FROM ApplicationCustomers WHERE ApplicationId = ? AND CustomerId = ?
       )`,
      [applicationId, customerId, applicationId, customerId]
    );
    return;
  }

  await pool.execute(
    'INSERT IGNORE INTO ApplicationCustomers (ApplicationId, CustomerId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [applicationId, customerId]
  );
}

// ─── Applications ─────────────────────────────────────────────────────────────

// GET /api/applications - list all applications visible to the current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId } = req.query;

    const listKey = organizationId
      ? cacheKeys.orgApplications(parseInt(organizationId as string))
      : `${cacheKeys.userOrganizations(userId!)}:applications`;

    const apps = await cachedJson(listKey, ENTITY_TTL_SECONDS, async () => {
    let query = `
      SELECT a.*,
             u.FirstName, u.LastName, u.Username as CreatorUsername,
             o.Name as OrganizationName,
             (
               SELECT COUNT(DISTINCT ap.ProjectId)
               FROM ApplicationProjects ap
               WHERE ap.ApplicationId = a.Id
             ) as ProjectCount,
             (
               SELECT COUNT(DISTINCT ac.CustomerId)
               FROM ApplicationCustomers ac
               WHERE ac.ApplicationId = a.Id
             ) as CustomerCount,
             (
               SELECT COUNT(DISTINCT av.Id)
               FROM ApplicationVersions av
               WHERE av.ApplicationId = a.Id
             ) as VersionCount
      FROM Applications a
      LEFT JOIN Users u ON a.CreatedBy = u.Id
      LEFT JOIN Organizations o ON a.OrganizationId = o.Id
      INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
      WHERE a.IsActive = 1
    `;
    const params: (number | string)[] = [userId!];

    if (organizationId) {
      query += ' AND a.OrganizationId = ?';
      params.push(parseInt(organizationId as string));
    }

    query += ' ORDER BY a.Name ASC';

    const [appRows] = await pool.execute<RowDataPacket[]>(query, params);

    // Load customers for each app
    for (const app of appRows) {
      const [customers] = await pool.execute<RowDataPacket[]>(
        `SELECT c.Id, c.Name FROM Customers c
         INNER JOIN ApplicationCustomers ac ON c.Id = ac.CustomerId
         WHERE ac.ApplicationId = ?`,
        [app.Id]
      );
      app.Customers = customers;
    }

    // Version numbers/names for list search (assembled in TS for MySQL + MSSQL)
    const appIds = appRows.map((app) => Number(app.Id)).filter((id) => Number.isFinite(id) && id > 0);
    const versionLabelsByAppId = new Map<number, string[]>();
    if (appIds.length > 0) {
      const placeholders = appIds.map(() => '?').join(',');
      const [versionRows] = await pool.execute<RowDataPacket[]>(
        `SELECT ApplicationId, VersionNumber, VersionName
         FROM ApplicationVersions
         WHERE ApplicationId IN (${placeholders})`,
        appIds
      );
      for (const row of versionRows) {
        const applicationId = Number(row.ApplicationId);
        if (!Number.isFinite(applicationId)) continue;
        const labels = versionLabelsByAppId.get(applicationId) || [];
        const versionNumber = String(row.VersionNumber || '').trim();
        const versionName = String(row.VersionName || '').trim();
        if (versionNumber) labels.push(versionNumber);
        if (versionName) labels.push(versionName);
        versionLabelsByAppId.set(applicationId, labels);
      }
    }
    for (const app of appRows) {
      app.VersionLabels = versionLabelsByAppId.get(Number(app.Id)) || [];
    }

    return appRows;
    });

    res.json({ success: true, applications: apps });
  } catch (error) {
    logger.error('Error fetching applications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
});

// GET /api/applications/ai/availability - checks if LLM provider is configured
router.get('/ai/availability', authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    const config = await getLlmConfig();
    return res.json({
      success: true,
      configured: config.isConfigured,
      provider: config.provider,
    });
  } catch (error: any) {
    logger.error('AI availability check error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check AI availability' });
  }
});

// GET /api/applications/:id - get application detail
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const app = await cachedJson(cacheKeys.application(id), ENTITY_TTL_SECONDS, async () => {
    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT a.*, u.FirstName, u.LastName, u.Username as CreatorUsername, o.Name as OrganizationName
       FROM Applications a
       LEFT JOIN Users u ON a.CreatedBy = u.Id
       LEFT JOIN Organizations o ON a.OrganizationId = o.Id
       INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE a.Id = ? AND a.IsActive = 1`,
      [userId, id]
    );

    if (apps.length === 0) {
      return null;
    }

    const record = apps[0];

    // Load customers
    const [customers] = await pool.execute<RowDataPacket[]>(
      `SELECT c.Id, c.Name, c.Email FROM Customers c
       INNER JOIN ApplicationCustomers ac ON c.Id = ac.CustomerId
       WHERE ac.ApplicationId = ?`,
      [id]
    );
    record.Customers = customers;

    // Load projects
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.ProjectName, p.Status, psv.StatusName, psv.ColorCode as StatusColor
       FROM Projects p
       INNER JOIN ApplicationProjects ap ON p.Id = ap.ProjectId
       LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
       WHERE ap.ApplicationId = ?`,
      [id]
    );
    record.Projects = projects;

    // Load versions
    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.*, u.FirstName, u.LastName,
              c.Name as CustomerName,
              (
                SELECT COUNT(DISTINCT avt.TaskId)
                FROM ApplicationVersionTasks avt
                WHERE avt.VersionId = av.Id
              ) as TaskCount
       FROM ApplicationVersions av
       LEFT JOIN Users u ON av.CreatedBy = u.Id
       LEFT JOIN Customers c ON c.Id = av.CustomerId
       WHERE av.ApplicationId = ?
       ORDER BY av.CreatedAt DESC`,
      [id]
    );
    record.Versions = versions;

    // Distinct products linked to this application (catalog and/or via product versions)
    const [products] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.Name, p.Description
       FROM Products p
       WHERE EXISTS (
         SELECT 1 FROM ProductApplications pa
         WHERE pa.ProductId = p.Id AND pa.ApplicationId = ?
       )
       OR EXISTS (
         SELECT 1
         FROM ProductVersionApplicationVersions pvav
         INNER JOIN ProductVersions pv ON pv.Id = pvav.ProductVersionId
         INNER JOIN ApplicationVersions av ON av.Id = pvav.ApplicationVersionId
         WHERE pv.ProductId = p.Id AND av.ApplicationId = ?
       )
       ORDER BY p.Name ASC`,
      [id, id]
    );
    record.Products = products;

    return record;
    });

    if (!app) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({ success: true, application: app });
  } catch (error) {
    logger.error('Error fetching application:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch application' });
  }
});

// GET /api/applications/:id/branches - list remote branches for application RepositoryUrl
router.get('/:id/branches', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Id, a.OrganizationId, a.RepositoryUrl,
              a.GitHubIntegrationId, a.GiteaIntegrationId, a.BitbucketIntegrationId
       FROM Applications a
       INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE a.Id = ? AND a.IsActive = 1`,
      [userId, id]
    );

    if (apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const repositoryUrl = apps[0].RepositoryUrl as string | null;
    if (!repositoryUrl) {
      return res.status(400).json({
        success: false,
        message: 'Application has no repository URL configured',
      });
    }

    const parsed = parseRepositoryUrl(repositoryUrl);
    if (!parsed) {
      return res.status(400).json({
        success: false,
        message: 'Could not parse repository URL',
      });
    }

    const creds = await resolveGitCredentials(Number(apps[0].OrganizationId), parsed, {
      githubIntegrationId: apps[0].GitHubIntegrationId,
      giteaIntegrationId: apps[0].GiteaIntegrationId,
      bitbucketIntegrationId: apps[0].BitbucketIntegrationId,
    });
    if (!creds) {
      return res.status(400).json({
        success: false,
        message: 'No matching GitHub, Gitea, or Bitbucket integration is enabled for this organization',
      });
    }

    const result = await listRemoteBranches(parsed, creds);
    res.json({
      success: true,
      data: {
        branches: result.branches,
        defaultBranch: result.defaultBranch,
        provider: result.provider,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch branches';
    logger.error('Error fetching application branches:', error);
    res.status(500).json({ success: false, message });
  }
});

// GET /api/applications/:id/commits - list remote commits for application RepositoryUrl
router.get('/:id/commits', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(String(req.query.per_page || '30'), 10) || 30));
    const branchRaw = typeof req.query.branch === 'string' ? req.query.branch.trim() : '';

    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Id, a.OrganizationId, a.RepositoryUrl,
              a.GitHubIntegrationId, a.GiteaIntegrationId, a.BitbucketIntegrationId
       FROM Applications a
       INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE a.Id = ? AND a.IsActive = 1`,
      [userId, id]
    );

    if (apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const repositoryUrl = apps[0].RepositoryUrl as string | null;
    if (!repositoryUrl) {
      return res.status(400).json({
        success: false,
        message: 'Application has no repository URL configured',
      });
    }

    const parsed = parseRepositoryUrl(repositoryUrl);
    if (!parsed) {
      return res.status(400).json({
        success: false,
        message: 'Could not parse repository URL',
      });
    }

    const creds = await resolveGitCredentials(Number(apps[0].OrganizationId), parsed, {
      githubIntegrationId: apps[0].GitHubIntegrationId,
      giteaIntegrationId: apps[0].GiteaIntegrationId,
      bitbucketIntegrationId: apps[0].BitbucketIntegrationId,
    });
    if (!creds) {
      return res.status(400).json({
        success: false,
        message: 'No matching GitHub, Gitea, or Bitbucket integration is enabled for this organization',
      });
    }

    const allBranches =
      !branchRaw ||
      branchRaw === '*' ||
      branchRaw.toLowerCase() === 'all' ||
      branchRaw === '__all__';
    const result = await listRemoteCommits(parsed, creds, {
      page,
      perPage,
      branch: allBranches ? null : branchRaw,
      allBranches,
      annotateBranches: true,
    });
    res.json({
      success: true,
      data: {
        commits: result.commits,
        provider: result.provider,
        hasMore: result.hasMore,
        page,
        perPage,
        branch: allBranches ? null : result.branch || branchRaw || null,
        allBranches,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch commits';
    logger.error('Error fetching application commits:', error);
    res.status(500).json({ success: false, message });
  }
});

// POST /api/applications - create application
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { Name, Description, RepositoryUrl, OrganizationId, CustomerIds, IsCustomerSpecific,
      GitHubIntegrationId, GiteaIntegrationId, BitbucketIntegrationId } = req.body;

    if (!Name || !OrganizationId) {
      return res.status(400).json({ success: false, message: 'Name and OrganizationId are required' });
    }

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can create applications
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanCreateApplications FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanCreateApplications === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanCreateApplications FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, OrganizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanCreateApplications === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to create applications.' });
      }
    }

    const vcsFks = exclusiveApplicationVcsFks({
      githubIntegrationId: GitHubIntegrationId,
      giteaIntegrationId: GiteaIntegrationId,
      bitbucketIntegrationId: BitbucketIntegrationId,
      repositoryUrl: RepositoryUrl,
    });

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Applications (Name, Description, RepositoryUrl, IsCustomerSpecific, OrganizationId,
         GitHubIntegrationId, GiteaIntegrationId, BitbucketIntegrationId, CreatedBy, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        Name,
        Description || null,
        RepositoryUrl || null,
        IsCustomerSpecific ? 1 : 0,
        OrganizationId,
        vcsFks.GitHubIntegrationId,
        vcsFks.GiteaIntegrationId,
        vcsFks.BitbucketIntegrationId,
        userId,
      ]
    );

    const appId = result.insertId;

    // Associate customers
    if (Array.isArray(CustomerIds) && CustomerIds.length > 0) {
      for (const customerId of CustomerIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationCustomers (ApplicationId, CustomerId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [appId, customerId]
        );
      }
    }

    await invalidateByEntity('application', { applicationId: appId, orgId: OrganizationId });

    res.status(201).json({ success: true, id: appId, message: 'Application created' });
  } catch (error) {
    logger.error('Error creating application:', error);
    res.status(500).json({ success: false, message: 'Failed to create application' });
  }
});

// PUT /api/applications/:id - update application
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { Name, Description, RepositoryUrl, CustomerIds, IsCustomerSpecific,
      GitHubIntegrationId, GiteaIntegrationId, BitbucketIntegrationId } = req.body;

    if (!Name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT OrganizationId, RepositoryUrl, GitHubIntegrationId, GiteaIntegrationId, BitbucketIntegrationId
       FROM Applications WHERE Id = ? AND IsActive = 1`,
      [id]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;
    const nextGh =
      GitHubIntegrationId !== undefined ? GitHubIntegrationId || null : apps[0].GitHubIntegrationId;
    const nextGt =
      GiteaIntegrationId !== undefined ? GiteaIntegrationId || null : apps[0].GiteaIntegrationId;
    const nextBb =
      BitbucketIntegrationId !== undefined
        ? BitbucketIntegrationId || null
        : apps[0].BitbucketIntegrationId;
    const nextRepoUrl =
      RepositoryUrl !== undefined ? RepositoryUrl : apps[0].RepositoryUrl;
    const exclusiveFks = exclusiveApplicationVcsFks({
      githubIntegrationId: nextGh,
      giteaIntegrationId: nextGt,
      bitbucketIntegrationId: nextBb,
      repositoryUrl: nextRepoUrl,
    });

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can manage applications
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanManageApplications FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanManageApplications === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanManageApplications FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanManageApplications === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage applications.' });
      }
    }

    const isCustomerSpecificValue = IsCustomerSpecific === undefined ? null : (IsCustomerSpecific ? 1 : 0);

    await pool.execute(
      `UPDATE Applications
       SET Name = ?, Description = ?, RepositoryUrl = ?,
           IsCustomerSpecific = COALESCE(?, IsCustomerSpecific),
           GitHubIntegrationId = ?,
           GiteaIntegrationId = ?,
           BitbucketIntegrationId = ?,
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [
        Name,
        Description || null,
        RepositoryUrl || null,
        isCustomerSpecificValue,
        exclusiveFks.GitHubIntegrationId,
        exclusiveFks.GiteaIntegrationId,
        exclusiveFks.BitbucketIntegrationId,
        id,
      ]
    );

    // Sync customers
    if (Array.isArray(CustomerIds)) {
      await pool.execute('DELETE FROM ApplicationCustomers WHERE ApplicationId = ?', [id]);
      for (const customerId of CustomerIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationCustomers (ApplicationId, CustomerId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [id, customerId]
        );
      }
    }

    await invalidateByEntity('application', { applicationId: id, orgId: organizationId });

    res.json({ success: true, message: 'Application updated' });
  } catch (error) {
    logger.error('Error updating application:', error);
    res.status(500).json({ success: false, message: 'Failed to update application' });
  }
});

// POST /api/applications/:id/image - upload application image (local path only)
router.post('/:id/image', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { fileName, fileData, fileSize } = req.body || {};
    const fileType = resolveImageMime(req.body?.fileType, fileName);

    if (!fileData) {
      return res.status(400).json({ success: false, message: 'fileData is required' });
    }
    if (!fileType || !APPLICATION_IMAGE_TYPES.has(fileType)) {
      return res.status(400).json({ success: false, message: 'File type not allowed. Use PNG, JPEG, WebP, or SVG.' });
    }

    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, OrganizationId, ImagePath FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );
    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = Number(apps[0].OrganizationId);
    if (!(await userCanManageApplications(userId!, organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage applications.' });
    }

    const buffer = Buffer.from(
      String(fileData).includes(',') ? String(fileData).split(',')[1] : String(fileData),
      'base64'
    );
    const size = Number(fileSize) || buffer.length;
    if (size > MAX_APPLICATION_IMAGE_BYTES) {
      return res.status(400).json({ success: false, message: 'File size exceeds 2MB limit' });
    }

    const { publicPath } = writePublicUpload({
      dir: APPLICATION_UPLOAD_DIR,
      publicPrefix: '/uploads/applications',
      fileType,
      fileName: fileName ? String(fileName) : undefined,
      fileData: String(fileData),
      namePrefix: `app-${id}`,
    });

    deletePublicUploadIfOwned(apps[0].ImagePath, APPLICATION_UPLOAD_DIR);

    await pool.execute(
      'UPDATE Applications SET ImagePath = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE Id = ?',
      [publicPath, id]
    );
    await invalidateByEntity('application', { applicationId: id, orgId: organizationId });

    res.json({ success: true, imagePath: publicPath, message: 'Application image uploaded' });
  } catch (error) {
    logger.error('Error uploading application image:', error);
    const message = uploadErrorMessage(error, 'Failed to upload application image');
    const unknownColumn =
      typeof error === 'object'
      && error !== null
      && 'message' in error
      && /Unknown column ['`]?ImagePath/i.test(String((error as { message?: string }).message));
    res.status(500).json({
      success: false,
      message: unknownColumn
        ? 'Applications.ImagePath column is missing. Restart the API so schema sync can add it, then retry.'
        : message,
    });
  }
});

// DELETE /api/applications/:id/image - remove application image
router.delete('/:id/image', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, OrganizationId, ImagePath FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );
    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = Number(apps[0].OrganizationId);
    if (!(await userCanManageApplications(userId!, organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage applications.' });
    }

    deletePublicUploadIfOwned(apps[0].ImagePath, APPLICATION_UPLOAD_DIR);
    await pool.execute(
      'UPDATE Applications SET ImagePath = NULL, UpdatedAt = CURRENT_TIMESTAMP WHERE Id = ?',
      [id]
    );
    await invalidateByEntity('application', { applicationId: id, orgId: organizationId });

    res.json({ success: true, message: 'Application image removed' });
  } catch (error) {
    logger.error('Error deleting application image:', error);
    res.status(500).json({
      success: false,
      message: uploadErrorMessage(error, 'Failed to remove application image'),
    });
  }
});

// DELETE /api/applications/:id - soft delete
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can delete applications
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanDeleteApplications FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanDeleteApplications === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanDeleteApplications FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanDeleteApplications === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to delete applications.' });
      }
    }

    await pool.execute('UPDATE Applications SET IsActive = 0 WHERE Id = ?', [id]);
    await invalidateByEntity('application', { applicationId: id, orgId: organizationId });
    res.json({ success: true, message: 'Application deleted' });
  } catch (error) {
    logger.error('Error deleting application:', error);
    res.status(500).json({ success: false, message: 'Failed to delete application' });
  }
});

// ─── Application ↔ Projects ────────────────────────────────────────────────────

// PUT /api/applications/:id/projects - set project associations
router.put('/:id/projects', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { ProjectIds } = req.body;

    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ?',
      [id]
    );

    await pool.execute('DELETE FROM ApplicationProjects WHERE ApplicationId = ?', [id]);
    if (Array.isArray(ProjectIds)) {
      for (const projectId of ProjectIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationProjects (ApplicationId, ProjectId) VALUES (?, ?)',
          [id, projectId]
        );
      }
    }

    await invalidateByEntity('application', {
      applicationId: id,
      orgId: apps[0]?.OrganizationId,
    });

    res.json({ success: true, message: 'Project associations updated' });
  } catch (error) {
    logger.error('Error updating project associations:', error);
    res.status(500).json({ success: false, message: 'Failed to update project associations' });
  }
});

// GET /api/applications/:id/tasks - release task picker
// Default: tasks from projects linked via ApplicationProjects.
// ?search=: org-wide match (ignores project↔application link).
// ?includeLinked=1: include tasks already linked to any version (with LinkedVersion*).
// Default (includeLinked off): hide tasks linked via ApplicationVersionTasks or ReleaseVersionId
// (any app), except the version being edited (excludeVersion).
router.get('/:id/tasks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { excludeVersion, search: searchRaw, includeLinked: includeLinkedRaw } = req.query;

    const appId = parseInt(Array.isArray(id) ? id[0] : id);
    if (!Number.isFinite(appId) || appId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid application id' });
    }

    const searchTerm = normalizeReleaseTaskSearch(
      Array.isArray(searchRaw) ? String(searchRaw[0] ?? '') : String(searchRaw ?? '')
    );
    const scope = resolveReleaseTaskPickerScope(searchTerm);
    const includeLinked =
      String(Array.isArray(includeLinkedRaw) ? includeLinkedRaw[0] : includeLinkedRaw || '') === '1' ||
      String(Array.isArray(includeLinkedRaw) ? includeLinkedRaw[0] : includeLinkedRaw || '').toLowerCase() ===
        'true';
    const excludeVersionId = excludeVersion
      ? parseInt(String(Array.isArray(excludeVersion) ? excludeVersion[0] : excludeVersion))
      : null;
    const validExcludeVersion =
      excludeVersionId !== null && Number.isFinite(excludeVersionId) && excludeVersionId > 0
        ? excludeVersionId
        : null;

    const fetchTasks = async (): Promise<RowDataPacket[]> => {
      const [apps] = await pool.execute<RowDataPacket[]>(
        'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
        [appId]
      );
      if (!apps.length) {
        return [];
      }
      const organizationId = apps[0].OrganizationId;

      const idCastExpr =
        dbProvider === 'mssql' ? 'CAST(t.Id AS NVARCHAR(50))' : 'CAST(t.Id AS CHAR)';

      const selectSql = `
      SELECT t.Id, t.TaskName, t.Description, t.Status, t.Priority, t.TaskType, t.ProjectId,
             t.ApplicationId, t.ReleaseVersionId,
             t.JiraIssueKey, t.ExternalIssueId, t.TicketId, t.GitHubIssueNumber, t.GiteaIssueNumber,
             tsv.StatusName, tsv.ColorCode as StatusColor,
             tpv.PriorityName, tpv.ColorCode as PriorityColor,
             ttv.TypeName as TaskTypeName,
             p.ProjectName,
             u.FirstName as AssigneeFN, u.LastName as AssigneeLN,
             tk.TicketNumber,
             la.Name as LinkedApplicationName,
             lav.VersionNumber as LinkedVersionNumber,
             lav.ApplicationId as LinkedVersionApplicationId,
             oji.JiraUrl,
             oji.JiraProjectsUrl,
             this_avt.VersionId as ThisAppLinkedVersionId,
             this_av.VersionNumber as ThisAppLinkedVersionNumber,
             other_av.Id as OtherAppLinkedVersionId,
             other_av.VersionNumber as OtherAppLinkedVersionNumber,
             other_a.Id as OtherAppLinkedApplicationId,
             other_a.Name as OtherAppLinkedApplicationName
      FROM Tasks t`;

      const joinsSql = `
      LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
      LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
      LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
      LEFT JOIN Users u ON t.AssignedTo = u.Id
      LEFT JOIN Tickets tk ON t.TicketId = tk.Id
      LEFT JOIN Applications la ON t.ApplicationId = la.Id
      LEFT JOIN ApplicationVersions lav ON t.ReleaseVersionId = lav.Id
      LEFT JOIN OrganizationJiraIntegrations oji ON oji.OrganizationId = ? AND oji.IsEnabled = 1
      LEFT JOIN ApplicationVersionTasks this_avt ON this_avt.TaskId = t.Id
        AND this_avt.VersionId IN (
          SELECT avx.Id FROM ApplicationVersions avx WHERE avx.ApplicationId = ?
        )
      LEFT JOIN ApplicationVersions this_av ON this_av.Id = this_avt.VersionId
      LEFT JOIN ApplicationVersionTasks other_avt ON other_avt.TaskId = t.Id
        AND other_avt.VersionId IN (
          SELECT avy.Id FROM ApplicationVersions avy WHERE avy.ApplicationId <> ?
        )
      LEFT JOIN ApplicationVersions other_av ON other_av.Id = other_avt.VersionId
      LEFT JOIN Applications other_a ON other_a.Id = other_av.ApplicationId`;

      // Hide any version-linked task unless includeLinked=1.
      // When editing a version, keep tasks already on that version visible.
      const exclusionSql = includeLinked
        ? '1=1'
        : `(
        t.Id NOT IN (
          SELECT avt.TaskId FROM ApplicationVersionTasks avt
          WHERE ${validExcludeVersion ? 'avt.VersionId != ?' : '1=1'}
        )
        AND (
          t.ReleaseVersionId IS NULL
          ${validExcludeVersion ? 'OR t.ReleaseVersionId = ?' : ''}
        )
      )`;

      const params: Array<string | number> = [];
      let query: string;

      const pushExclusionParams = () => {
        if (includeLinked) return;
        if (validExcludeVersion) {
          params.push(validExcludeVersion);
          params.push(validExcludeVersion);
        }
      };

      if (scope === 'organization-search') {
        const searchClause = buildReleaseTaskSearchClause({
          search: searchTerm,
          idCastExpr,
        });
        query = `
      ${selectSql}
      INNER JOIN Projects p ON t.ProjectId = p.Id AND p.OrganizationId = ?
      ${joinsSql}
      WHERE ${exclusionSql}
        AND ${searchClause.sql}
      ORDER BY p.ProjectName, t.DisplayOrder, t.Id`;
        params.push(organizationId, organizationId, appId, appId);
        pushExclusionParams();
        params.push(...searchClause.params);
      } else {
        query = `
      ${selectSql}
      INNER JOIN ApplicationProjects ap ON t.ProjectId = ap.ProjectId AND ap.ApplicationId = ?
      LEFT JOIN Projects p ON t.ProjectId = p.Id
      ${joinsSql}
      WHERE ${exclusionSql}
      ORDER BY p.ProjectName, t.DisplayOrder, t.Id`;
        params.push(appId, organizationId, appId, appId);
        pushExclusionParams();
      }

      const [taskRows] = await pool.execute<RowDataPacket[]>(query, params);

      // Deduplicate when multiple AVT joins inflate rows; prefer first row per task id.
      const byId = new Map<number, RowDataPacket>();
      for (const row of taskRows) {
        const taskId = Number(row.Id);
        if (!Number.isFinite(taskId) || byId.has(taskId)) continue;

        const linkedAppId =
          row.ApplicationId != null && Number(row.ApplicationId) > 0
            ? Number(row.ApplicationId)
            : row.OtherAppLinkedApplicationId != null
              ? Number(row.OtherAppLinkedApplicationId)
              : null;
        const linkedAppName =
          row.LinkedApplicationName || row.OtherAppLinkedApplicationName || null;
        const linkedVersionId =
          row.ReleaseVersionId != null && Number(row.ReleaseVersionId) > 0
            ? Number(row.ReleaseVersionId)
            : row.OtherAppLinkedVersionId != null
              ? Number(row.OtherAppLinkedVersionId)
              : row.ThisAppLinkedVersionId != null
                ? Number(row.ThisAppLinkedVersionId)
                : null;
        const linkedVersionNumber =
          row.LinkedVersionNumber ||
          row.OtherAppLinkedVersionNumber ||
          row.ThisAppLinkedVersionNumber ||
          null;

        const isLinkedToOtherApplication =
          (linkedAppId != null && linkedAppId !== appId) ||
          (row.OtherAppLinkedApplicationId != null &&
            Number(row.OtherAppLinkedApplicationId) !== appId);
        const isLinkedToVersion =
          isLinkedToOtherApplication ||
          (linkedVersionId != null && Number(linkedVersionId) > 0) ||
          (row.ThisAppLinkedVersionId != null && Number(row.ThisAppLinkedVersionId) > 0) ||
          (row.OtherAppLinkedVersionId != null && Number(row.OtherAppLinkedVersionId) > 0);

        byId.set(taskId, {
          ...row,
          LinkedApplicationId: linkedAppId,
          LinkedApplicationName: linkedAppName,
          LinkedVersionId: linkedVersionId,
          LinkedVersionNumber: linkedVersionNumber,
          ThisAppLinkedVersionId: row.ThisAppLinkedVersionId ?? null,
          ThisAppLinkedVersionNumber: row.ThisAppLinkedVersionNumber ?? null,
          IsLinkedToOtherApplication: isLinkedToOtherApplication ? 1 : 0,
          IsLinkedToVersion: isLinkedToVersion ? 1 : 0,
        });
      }

      return Array.from(byId.values());
    };

    // Do not cache search results (query-dependent, high cardinality).
    const cacheSuffix = [
      validExcludeVersion ? `:exclude-${validExcludeVersion}` : '',
      includeLinked ? ':include-linked' : '',
    ].join('');
    const tasks =
      scope === 'organization-search'
        ? await fetchTasks()
        : await cachedJson(
            `${cacheKeys.applicationTasks(appId)}${cacheSuffix}`,
            ENTITY_TTL_SECONDS,
            fetchTasks
          );

    res.json({ success: true, tasks });
  } catch (error) {
    logger.error('Error fetching application tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
  }
});

// ─── Versions ─────────────────────────────────────────────────────────────────

// GET /api/applications/:id/versions - list versions
router.get('/:id/versions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const versions = await cachedJson(cacheKeys.applicationVersions(id), ENTITY_TTL_SECONDS, async () => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT av.*, u.FirstName, u.LastName,
              (
                SELECT COUNT(DISTINCT avt.TaskId)
                FROM ApplicationVersionTasks avt
                WHERE avt.VersionId = av.Id
              ) as TaskCount
       FROM ApplicationVersions av
       LEFT JOIN Users u ON av.CreatedBy = u.Id
       WHERE av.ApplicationId = ?
       ORDER BY av.CreatedAt DESC`,
      [id]
    );

    return rows;
    });

    res.json({ success: true, versions });
  } catch (error) {
    logger.error('Error fetching versions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch versions' });
  }
});

// GET /api/applications/:id/versions/:versionId - get version detail with tasks and patch notes
router.get('/:id/versions/:versionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { versionId } = req.params;

    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.*, u.FirstName, u.LastName, a.Name as ApplicationName, a.OrganizationId,
              c.Name as CustomerName
       FROM ApplicationVersions av
       LEFT JOIN Users u ON av.CreatedBy = u.Id
       LEFT JOIN Applications a ON av.ApplicationId = a.Id
       LEFT JOIN Customers c ON c.Id = av.CustomerId
       WHERE av.Id = ?`,
      [versionId]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    const version = versions[0];

    // Load tasks in this version (includes changelog-only links where ApplicationId
    // / ReleaseVersionId still point at another application/version).
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, t.TaskName, t.Description, t.Status, t.Priority, t.TaskType,
              t.ApplicationId, t.ReleaseVersionId,
              t.JiraIssueKey, t.ExternalIssueId, t.TicketId, t.GitHubIssueNumber, t.GiteaIssueNumber,
              tsv.StatusName, tsv.ColorCode as StatusColor,
              tpv.PriorityName, tpv.ColorCode as PriorityColor,
              ttv.TypeName as TaskTypeName,
              p.ProjectName,
              u.FirstName as AssigneeFN, u.LastName as AssigneeLN,
              tk.TicketNumber,
              oji.JiraUrl,
              oji.JiraProjectsUrl,
              la.Name as LinkedApplicationName,
              lav.VersionNumber as LinkedVersionNumber,
              CASE
                WHEN t.ApplicationId IS NOT NULL AND t.ApplicationId <> ? THEN 1
                WHEN lav.ApplicationId IS NOT NULL AND lav.ApplicationId <> ? THEN 1
                ELSE 0
              END as IsLinkedToOtherApplication
       FROM Tasks t
       INNER JOIN ApplicationVersionTasks avt ON t.Id = avt.TaskId
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
       LEFT JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN Users u ON t.AssignedTo = u.Id
       LEFT JOIN Tickets tk ON t.TicketId = tk.Id
       LEFT JOIN Applications la ON t.ApplicationId = la.Id
       LEFT JOIN ApplicationVersions lav ON t.ReleaseVersionId = lav.Id
       LEFT JOIN OrganizationJiraIntegrations oji
         ON oji.OrganizationId = ? AND oji.IsEnabled = 1
       WHERE avt.VersionId = ?
       ORDER BY t.DisplayOrder, t.Id`,
      [version.ApplicationId, version.ApplicationId, version.OrganizationId, versionId]
    );

    version.Tasks = tasks;

    const [commits] = await pool.execute<RowDataPacket[]>(
      `SELECT CommitSha as sha, Message as message, Author as author, CommittedAt as date, Url as url
       FROM ApplicationVersionCommits
       WHERE VersionId = ?
       ORDER BY CommittedAt DESC, CommitSha ASC`,
      [versionId]
    );
    version.Commits = commits;

    const [productVersions] = await pool.execute<RowDataPacket[]>(
      `SELECT pv.Id, pv.VersionNumber, pv.VersionName, pv.Status, pv.ReleaseDate,
              p.Id as ProductId, p.Name as ProductName
       FROM ProductVersionApplicationVersions pvav
       INNER JOIN ProductVersions pv ON pv.Id = pvav.ProductVersionId
       INNER JOIN Products p ON p.Id = pv.ProductId
       WHERE pvav.ApplicationVersionId = ?
       ORDER BY p.Name ASC, pv.CreatedAt DESC, pv.Id DESC`,
      [versionId]
    );
    version.ProductVersions = productVersions;

    res.json({ success: true, version });
  } catch (error) {
    logger.error('Error fetching version:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch version' });
  }
});

// POST /api/applications/:id/versions - create version
router.post('/:id/versions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const applicationId = Array.isArray(id) ? id[0] : id;
    const {
      VersionNumber,
      VersionName,
      Status,
      ReleaseDate,
      PatchNotes,
      IsCustomerSpecific,
      CustomerId,
      updateTaskStatuses,
    } = req.body;
    const normalizedReleaseDate = normalizeDateOnly(ReleaseDate);
    const isCustomerSpecific = IsCustomerSpecific ? 1 : 0;
    const normalizedCustomerId = CustomerId === null || CustomerId === undefined || CustomerId === '' ? null : Number(CustomerId);

    if (!VersionNumber) {
      return res.status(400).json({ success: false, message: 'VersionNumber is required' });
    }

    if (isCustomerSpecific === 1 && !normalizedCustomerId) {
      return res.status(400).json({ success: false, message: 'Customer is required when version is customer-specific' });
    }

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can manage releases
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanManageReleases FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanManageReleases === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanManageReleases FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanManageReleases === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage releases.' });
      }
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ApplicationVersions (ApplicationId, VersionNumber, VersionName, Status, ReleaseDate, PatchNotes, IsCustomerSpecific, CustomerId, CreatedVia, CreatedBy, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [applicationId, VersionNumber, VersionName || null, Status || 'Planning', normalizedReleaseDate, PatchNotes || null, isCustomerSpecific, isCustomerSpecific === 1 ? normalizedCustomerId : null, userId]
    );

    if (isCustomerSpecific === 1 && normalizedCustomerId) {
      await ensureApplicationCustomerAssociation(applicationId, normalizedCustomerId);
    }

    await syncVersionLinkedTaskStatuses(result.insertId, applicationId, {
      updateTaskStatuses: Boolean(updateTaskStatuses),
    });

    await invalidateByEntity('application', { applicationId, orgId: organizationId });

    res.status(201).json({ success: true, id: result.insertId, message: 'Version created' });
  } catch (error) {
    logger.error('Error creating version:', error);
    res.status(500).json({ success: false, message: 'Failed to create version' });
  }
});

// PUT /api/applications/:id/versions/:versionId - update version
router.put('/:id/versions/:versionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id, versionId } = req.params;
    const applicationId = Array.isArray(id) ? id[0] : id;
    const normalizedVersionId = Array.isArray(versionId) ? versionId[0] : versionId;
    const {
      VersionNumber,
      VersionName,
      Status,
      ReleaseDate,
      PatchNotes,
      IsCustomerSpecific,
      CustomerId,
      updateTaskStatuses,
    } = req.body;
    const normalizedReleaseDate = normalizeDateOnly(ReleaseDate);
    const normalizedCustomerId = CustomerId === null || CustomerId === undefined || CustomerId === '' ? null : Number(CustomerId);

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [applicationId]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can manage releases
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanManageReleases FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanManageReleases === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanManageReleases FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanManageReleases === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage releases.' });
      }
    }

    // Get current version status to detect status change
    const [currentVersion] = await pool.execute<RowDataPacket[]>(
      'SELECT Status FROM ApplicationVersions WHERE Id = ?',
      [normalizedVersionId]
    );

    const previousStatus = currentVersion.length > 0 ? String(currentVersion[0].Status || '') : '';
    const nextStatus = String(Status || 'Planning');
    const statusChanged = previousStatus !== nextStatus;

    const versionIsCustomerSpecificValue = IsCustomerSpecific === undefined ? null : (IsCustomerSpecific ? 1 : 0);

    if (versionIsCustomerSpecificValue === 1 && !normalizedCustomerId) {
      return res.status(400).json({ success: false, message: 'Customer is required when version is customer-specific' });
    }

    await pool.execute(
      `UPDATE ApplicationVersions
       SET VersionNumber = ?, VersionName = ?, Status = ?, ReleaseDate = ?, PatchNotes = ?,
           IsCustomerSpecific = COALESCE(?, IsCustomerSpecific),
           CustomerId = CASE
             WHEN ? IS NULL THEN CustomerId
             WHEN ? = 1 THEN ?
             ELSE NULL
           END,
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [
        VersionNumber,
        VersionName || null,
        Status || 'Planning',
        normalizedReleaseDate,
        PatchNotes || null,
        versionIsCustomerSpecificValue,
        versionIsCustomerSpecificValue,
        versionIsCustomerSpecificValue,
        normalizedCustomerId,
        normalizedVersionId,
      ]
    );

    if (versionIsCustomerSpecificValue === 1 && normalizedCustomerId) {
      await ensureApplicationCustomerAssociation(applicationId, normalizedCustomerId);
    }

    if (statusChanged) {
      await syncVersionLinkedTaskStatuses(normalizedVersionId, applicationId, {
        updateTaskStatuses: Boolean(updateTaskStatuses),
      });
    }

    await invalidateByEntity('application', { applicationId, orgId: organizationId });

    res.json({ success: true, message: 'Version updated' });
  } catch (error) {
    logger.error('Error updating version:', error);
    res.status(500).json({ success: false, message: 'Failed to update version' });
  }
});

// DELETE /api/applications/:id/versions/:versionId - delete version
router.delete('/:id/versions/:versionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id, versionId } = req.params;

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can manage releases
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanManageReleases FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanManageReleases === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanManageReleases FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanManageReleases === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage releases.' });
      }
    }

    await pool.execute('DELETE FROM ApplicationVersionTasks WHERE VersionId = ?', [versionId]);
    await pool.execute('DELETE FROM ApplicationVersionCommits WHERE VersionId = ?', [versionId]);
    // Set ReleaseVersionId to null on tasks that reference this version
    await pool.execute('UPDATE Tasks SET ReleaseVersionId = NULL WHERE ReleaseVersionId = ?', [versionId]);
    await pool.execute('DELETE FROM ApplicationVersions WHERE Id = ?', [versionId]);
    await invalidateByEntity('application', { applicationId: id, orgId: organizationId });
    res.json({ success: true, message: 'Version deleted' });
  } catch (error) {
    logger.error('Error deleting version:', error);
    res.status(500).json({ success: false, message: 'Failed to delete version' });
  }
});

// ─── Version ↔ Tasks ──────────────────────────────────────────────────────────

// PUT /api/applications/:id/versions/:versionId/tasks - set tasks in a version
router.put('/:id/versions/:versionId/tasks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;
    const applicationId = Array.isArray(id) ? id[0] : id;
    const normalizedVersionId = Array.isArray(versionId) ? versionId[0] : versionId;
    const { TaskIds, reassignTaskIds: rawReassignTaskIds, reassignFromOtherApplications } = req.body;

    const normalizedTaskIds = Array.isArray(TaskIds)
      ? Array.from(new Set(TaskIds.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)))
      : [];

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT TaskId FROM ApplicationVersionTasks WHERE VersionId = ?',
      [normalizedVersionId]
    );
    const existingTaskIds = existingRows
      .map((row) => Number(row.TaskId))
      .filter((value) => Number.isFinite(value) && value > 0);

    const newlySelected = normalizedTaskIds.filter((taskId) => !existingTaskIds.includes(taskId));
    const conflicts =
      newlySelected.length > 0
        ? await findTasksLinkedToOtherApplications(applicationId, newlySelected)
        : [];
    const conflictIds = conflicts.map((c) => Number(c.Id)).filter((id) => Number.isFinite(id) && id > 0);

    let reassignTaskIds = Array.isArray(rawReassignTaskIds)
      ? Array.from(
          new Set(
            rawReassignTaskIds
              .map((value: any) => Number(value))
              .filter((value: number) => Number.isFinite(value) && value > 0)
          )
        )
      : [];
    // Legacy boolean: reassign every newly selected conflict.
    if (reassignFromOtherApplications && reassignTaskIds.length === 0) {
      reassignTaskIds = conflictIds.slice();
    }
    reassignTaskIds = reassignTaskIds.filter((id) => newlySelected.includes(id));

    // Conflict tasks may stay linked to this version without changing ApplicationId /
    // ReleaseVersionId. Only require an explicit decision when the client did not send
    // reassignTaskIds at all (legacy clients). Modern clients send the array (possibly empty).
    const reassignDecisionProvided =
      Array.isArray(rawReassignTaskIds) || Boolean(reassignFromOtherApplications);
    if (!reassignDecisionProvided) {
      const unresolvedConflicts = conflicts.filter((c) => !reassignTaskIds.includes(Number(c.Id)));
      if (unresolvedConflicts.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Some tasks are linked to another application',
          conflicts: unresolvedConflicts,
        });
      }
    }

    if (reassignTaskIds.length > 0) {
      const placeholders = reassignTaskIds.map(() => '?').join(',');
      if (dbProvider === 'mssql') {
        await pool.execute(
          `DELETE avt
           FROM ApplicationVersionTasks avt
           INNER JOIN ApplicationVersions av ON av.Id = avt.VersionId
           WHERE avt.TaskId IN (${placeholders}) AND av.ApplicationId <> ?`,
          [...reassignTaskIds, applicationId]
        );
      } else {
        await pool.execute(
          `DELETE avt FROM ApplicationVersionTasks avt
           INNER JOIN ApplicationVersions av ON av.Id = avt.VersionId
           WHERE avt.TaskId IN (${placeholders}) AND av.ApplicationId <> ?`,
          [...reassignTaskIds, applicationId]
        );
      }
    }

    // Always (re)link every selected task to this version for changelog purposes.
    // ApplicationId / ReleaseVersionId are updated only for claimed tasks below.
    await pool.execute('DELETE FROM ApplicationVersionTasks WHERE VersionId = ?', [normalizedVersionId]);
    for (const taskId of normalizedTaskIds) {
      await pool.execute(
        `INSERT INTO ApplicationVersionTasks (VersionId, TaskId)
         SELECT ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM ApplicationVersionTasks WHERE VersionId = ? AND TaskId = ?
         )`,
        [normalizedVersionId, taskId, normalizedVersionId, taskId]
      );
    }

    await pool.execute('UPDATE Tasks SET ReleaseVersionId = NULL WHERE ReleaseVersionId = ?', [normalizedVersionId]);

    // Claim ApplicationId/ReleaseVersionId only when this app already owns the task primary,
    // or the user explicitly reassigned. Changelog-only links (foreign primary) must survive
    // later saves such as status changes — not only the first "new task" prompt.
    const reassignIdSet = new Set(reassignTaskIds);
    const foreignPrimaryIds = await findTasksWithForeignPrimaryApplication(
      applicationId,
      normalizedTaskIds
    );
    const foreignPrimarySet = new Set(foreignPrimaryIds);
    const claimTaskIds = normalizedTaskIds.filter(
      (taskId) => reassignIdSet.has(taskId) || !foreignPrimarySet.has(taskId)
    );
    if (claimTaskIds.length > 0) {
      const placeholders = claimTaskIds.map(() => '?').join(',');
      await pool.execute(
        `UPDATE Tasks
         SET ApplicationId = ?, ReleaseVersionId = ?
         WHERE Id IN (${placeholders})`,
        [applicationId, normalizedVersionId, ...claimTaskIds]
      );
    }

    // Related applications: every task linked to this version gains this application
    const versionAppId = Number(applicationId);
    if (Number.isFinite(versionAppId) && versionAppId > 0 && normalizedTaskIds.length > 0) {
      for (const taskId of normalizedTaskIds) {
        await ensureTaskApplications(taskId, [versionAppId]);
      }
    }

    const removedTaskIds = existingTaskIds.filter((taskId) => !normalizedTaskIds.includes(taskId));
    if (removedTaskIds.length > 0) {
      const placeholders = removedTaskIds.map(() => '?').join(',');
      await pool.execute(
        `UPDATE Tasks
         SET ReleaseVersionId = NULL,
             ApplicationId = CASE WHEN ApplicationId = ? THEN NULL ELSE ApplicationId END
         WHERE Id IN (${placeholders}) AND ReleaseVersionId = ?`,
        [applicationId, ...removedTaskIds, normalizedVersionId]
      );
    }

    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ?',
      [applicationId]
    );
    await invalidateByEntity('application', {
      applicationId,
      orgId: apps[0]?.OrganizationId,
    });

    res.json({ success: true, message: 'Version tasks updated' });
  } catch (error) {
    logger.error('Error updating version tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to update version tasks' });
  }
});

// GET /api/applications/:id/version-commits/linked - SHAs already linked to versions of this app
router.get('/:id/version-commits/linked', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const appId = parseInt(Array.isArray(id) ? id[0] : id);
    if (!Number.isFinite(appId) || appId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid application id' });
    }

    const excludeVersionRaw = req.query.excludeVersion;
    const excludeVersionId = excludeVersionRaw
      ? parseInt(String(Array.isArray(excludeVersionRaw) ? excludeVersionRaw[0] : excludeVersionRaw))
      : null;
    const validExcludeVersion =
      excludeVersionId !== null && Number.isFinite(excludeVersionId) && excludeVersionId > 0
        ? excludeVersionId
        : null;

    const params: Array<string | number> = [appId];
    let excludeSql = '';
    if (validExcludeVersion) {
      excludeSql = ' AND av.Id <> ?';
      params.push(validExcludeVersion);
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT LOWER(avc.CommitSha) as sha, av.Id as versionId, av.VersionNumber as versionNumber
       FROM ApplicationVersionCommits avc
       INNER JOIN ApplicationVersions av ON av.Id = avc.VersionId
       WHERE av.ApplicationId = ?${excludeSql}`,
      params
    );

    const linked = rows.map((row) => ({
      sha: String(row.sha || '').toLowerCase(),
      versionId: Number(row.versionId),
      versionNumber: row.versionNumber != null ? String(row.versionNumber) : null,
    }));

    res.json({ success: true, linked });
  } catch (error) {
    logger.error('Error fetching linked version commits:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch linked commits' });
  }
});

// PUT /api/applications/:id/versions/:versionId/commits - set commits in a version
router.put('/:id/versions/:versionId/commits', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id, versionId } = req.params;
    const applicationId = Array.isArray(id) ? id[0] : id;
    const normalizedVersionId = Array.isArray(versionId) ? versionId[0] : versionId;
    const commitsRaw = Array.isArray(req.body?.Commits) ? req.body.Commits : [];

    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [applicationId]
    );
    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    const organizationId = apps[0].OrganizationId;

    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );
    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (!user[0].isAdmin) {
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanManageReleases FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanManageReleases === 1);
      }

      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanManageReleases FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanManageReleases === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to manage releases.',
        });
      }
    }

    const [versionRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM ApplicationVersions WHERE Id = ? AND ApplicationId = ?',
      [normalizedVersionId, applicationId]
    );
    if (!versionRows.length) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    type CommitRow = {
      sha: string;
      message: string | null;
      author: string | null;
      date: string | null;
      url: string | null;
    };
    const bySha = new Map<string, CommitRow>();
    for (const raw of commitsRaw) {
      const sha = normalizeCommitSha(raw?.sha ?? raw?.CommitSha ?? raw?.Sha);
      if (!sha) continue;
      if (bySha.has(sha)) continue;
      const message = raw?.message ?? raw?.Message ?? null;
      const author = raw?.author ?? raw?.Author ?? null;
      const dateRaw = raw?.date ?? raw?.CommittedAt ?? raw?.committedAt ?? null;
      let date: string | null = null;
      if (dateRaw != null && String(dateRaw).trim()) {
        const parsed = new Date(String(dateRaw));
        if (!Number.isNaN(parsed.getTime())) {
          date = parsed.toISOString().slice(0, 19).replace('T', ' ');
        }
      }
      const url = raw?.url ?? raw?.Url ?? null;
      bySha.set(sha, {
        sha,
        message: message != null ? String(message).slice(0, 65000) : null,
        author: author != null ? String(author).slice(0, 255) : null,
        date,
        url: url != null ? String(url).slice(0, 500) : null,
      });
    }

    await pool.execute('DELETE FROM ApplicationVersionCommits WHERE VersionId = ?', [normalizedVersionId]);
    for (const commit of bySha.values()) {
      await pool.execute(
        `INSERT INTO ApplicationVersionCommits (VersionId, CommitSha, Message, Author, CommittedAt, Url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [normalizedVersionId, commit.sha, commit.message, commit.author, commit.date, commit.url]
      );
    }

    await invalidateByEntity('application', {
      applicationId,
      orgId: organizationId,
    });

    res.json({ success: true, message: 'Version commits updated' });
  } catch (error) {
    logger.error('Error updating version commits:', error);
    res.status(500).json({ success: false, message: 'Failed to update version commits' });
  }
});

// POST /api/applications/:id/versions/improve-patch-notes - improve patch notes with AI (bullet format)
router.post('/:id/versions/improve-patch-notes', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const applicationId = Number(req.params.id);
    const patchNotes = String(req.body?.patchNotes || '').trim();
    const taskIdsRaw = Array.isArray(req.body?.taskIds) ? req.body.taskIds : [];
    const taskIds = taskIdsRaw
      .map((value: any) => Number(value))
      .filter((value: number) => Number.isFinite(value) && value > 0);
    const commitsRaw = Array.isArray(req.body?.commits) ? req.body.commits : [];
    const commitContext = commitsRaw
      .map((c: any) => ({
        sha: String(c?.sha || c?.CommitSha || '').trim(),
        message: String(c?.message || c?.Message || '').trim(),
      }))
      .filter((c: { sha: string; message: string }) => c.message.length > 0)
      .slice(0, 100);
    const splitByChangeType = Boolean(req.body?.splitByChangeType);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid application id' });
    }

    const [accessRows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Id
       FROM Applications a
       INNER JOIN OrganizationMembers om ON om.OrganizationId = a.OrganizationId
       WHERE a.Id = ? AND om.UserId = ?
       LIMIT 1`,
      [applicationId, userId]
    );

    if (!accessRows.length) {
      return res.status(404).json({ success: false, message: 'Application not found or access denied' });
    }

    const llmConfig = await getLlmConfig();
    if (!llmConfig.isConfigured) {
      return res.status(400).json({ success: false, message: llmNotConfiguredMessage(llmConfig) });
    }

    let taskContext: Array<{
      id: number;
      name: string;
      project: string;
      taskType: string | null;
      issueKey: string | null;
      issueUrl: string | null;
    }> = [];
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      const [taskRows] = await pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.TaskName, p.ProjectName, ttv.TypeName as TaskTypeName,
                t.JiraIssueKey, t.ExternalIssueId, t.TicketId, t.GitHubIssueNumber, t.GiteaIssueNumber,
                tk.TicketNumber, oji.JiraUrl, oji.JiraProjectsUrl
         FROM Tasks t
         INNER JOIN Projects p ON p.Id = t.ProjectId
         LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
         LEFT JOIN Tickets tk ON t.TicketId = tk.Id
         LEFT JOIN OrganizationJiraIntegrations oji
           ON oji.OrganizationId = p.OrganizationId AND oji.IsEnabled = 1
         WHERE p.OrganizationId = (
           SELECT OrganizationId FROM Applications WHERE Id = ? LIMIT 1
         )
           AND t.Id IN (${placeholders})
         ORDER BY p.ProjectName ASC, t.TaskName ASC`,
        [applicationId, ...taskIds]
      );

      taskContext = taskRows.map((row) => {
        const ref = {
          JiraIssueKey: row.JiraIssueKey,
          ExternalIssueId: row.ExternalIssueId,
          TicketId: row.TicketId,
          TicketNumber: row.TicketNumber,
          JiraUrl: row.JiraUrl,
          JiraProjectsUrl: row.JiraProjectsUrl,
          GitHubIssueNumber: row.GitHubIssueNumber,
          GiteaIssueNumber: row.GiteaIssueNumber,
        };
        return {
          id: Number(row.Id),
          name: String(row.TaskName || ''),
          project: String(row.ProjectName || ''),
          taskType: row.TaskTypeName ? String(row.TaskTypeName) : null,
          issueKey: resolvePatchNoteIssueKey(ref),
          issueUrl: resolvePatchNoteIssueUrl(ref),
        };
      });
    }

    const systemPrompt = [
      'You improve software release patch notes.',
      'Mandatory output format rules:',
      '- Return HTML only (no markdown, no code fences).',
      '- Keep bullet structure using <ul><li>...</li></ul>.',
      '- Use concise, clear bullet points.',
      '- Preserve factual meaning; do not invent features.',
      '- Ensure the final output still contains bullet lists.',
      '- Preserve every existing HTML hyperlink: keep <a href="...">...</a> tags (including href, target="_blank", rel="noopener noreferrer").',
      '- When a bullet mentions a ticket/board key such as [PROJ-12] or #41 that has a matching issueUrl in selectedTasks, keep or restore that key as an <a> link.',
      '- Do not strip, unwrap, or convert links to plain text.',
      '- selectedTasks.taskType values are organization-configured labels (do not assume fixed names like Feature/Bug/Improvement).',
      ...(splitByChangeType
        ? [
            '- You MUST organize all bullets under these sections in this exact order: Added, Changed, Fixed.',
            '- For each non-empty section use: <p><strong>Added</strong></p><ul><li>...</li></ul> (same pattern for Changed and Fixed).',
            '- Omit a section entirely when it has no items.',
            '- Classify each item using the bullet meaning and the org-configured selectedTasks.taskType as a hint (do not hardcode mappings from specific type names).',
            '- Do not invent items to fill a section.',
            '- Do not use other section titles.',
          ]
        : [
            '- Prefer grouping bullets under the organization-configured taskType labels from selectedTasks when grouping helps.',
            '- Use <p><strong>{taskType}</strong></p> before each bullet list, using the exact taskType string from selectedTasks.',
            '- Tasks without taskType (and orphan commits) may share one untyped group.',
          ]),
    ].join('\n');

    const userPrompt = JSON.stringify({
      currentPatchNotesHtml: prepareHtmlForLlm(patchNotes),
      selectedTasks: taskContext,
      selectedCommits: commitContext,
      splitByChangeType,
      instruction: splitByChangeType
        ? 'Improve clarity and readability while preserving meaning and all existing <a> hyperlinks. Separate every item into Added, Changed, or Fixed sections as required by the system rules. Use each selected task taskType (org-configured) only as a classification hint — do not assume fixed type names. Use selected tasks and selected commits as factual sources; prefer task titles over commit subjects when both cover the same Task # id; include orphan commit subjects that are not covered by selected tasks.'
        : 'Improve clarity and readability while preserving meaning and all existing <a> hyperlinks. Prefer grouping by the exact org-configured taskType labels from selectedTasks. Use selected tasks and selected commits as factual sources; prefer task titles over commit subjects when both cover the same Task # id; include orphan commit subjects that are not covered by selected tasks.',
    });

    let improved = '';
    try {
      const result = await chatCompletion(llmConfig, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        maxTokens: 3000,
        timeoutMs: 120_000,
      });
      improved = result.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LLM request failed.';
      return res.status(502).json({ success: false, message });
    }

    if (!improved) {
      return res.status(500).json({ success: false, message: 'AI returned empty patch notes.' });
    }

    const normalized = improved.includes('<li')
      ? improved
      : `<ul>${improved
          .split(/\n+/)
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0)
          .map((line: string) => `<li>${line.replace(/^[-•]\s*/, '')}</li>`)
          .join('')}</ul>`;

    // Models often unwrap anchors; restore issue/ticket links from the original HTML.
    const withLinks = reapplyPatchNoteIssueLinks(patchNotes, normalized);

    return res.json({ success: true, patchNotes: withLinks });
  } catch (error: any) {
    logger.error('Improve patch notes error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to improve patch notes' });
  }
});

// POST /api/applications/:id/versions/:versionId/tasks/:taskId - add task to version
// Always links via ApplicationVersionTasks. ApplicationId/ReleaseVersionId are claimed only when
// reassignFromOtherApplications is true, or the task has no other-app link.
router.post('/:id/versions/:versionId/tasks/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId, taskId } = req.params;
    const applicationId = Array.isArray(id) ? id[0] : id;
    const normalizedTaskId = Number(taskId);
    const reassignFromOtherApplications = Boolean(req.body?.reassignFromOtherApplications);

    const conflicts = await findTasksLinkedToOtherApplications(applicationId, [normalizedTaskId]);
    const hasConflict = conflicts.length > 0;

    if (reassignFromOtherApplications && hasConflict) {
      if (dbProvider === 'mssql') {
        await pool.execute(
          `DELETE avt
           FROM ApplicationVersionTasks avt
           INNER JOIN ApplicationVersions av ON av.Id = avt.VersionId
           WHERE avt.TaskId = ? AND av.ApplicationId <> ?`,
          [normalizedTaskId, applicationId]
        );
      } else {
        await pool.execute(
          `DELETE avt FROM ApplicationVersionTasks avt
           INNER JOIN ApplicationVersions av ON av.Id = avt.VersionId
           WHERE avt.TaskId = ? AND av.ApplicationId <> ?`,
          [normalizedTaskId, applicationId]
        );
      }
    }

    await pool.execute(
      `INSERT INTO ApplicationVersionTasks (VersionId, TaskId)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM ApplicationVersionTasks WHERE VersionId = ? AND TaskId = ?
       )`,
      [versionId, normalizedTaskId, versionId, normalizedTaskId]
    );

    // Changelog-only link when conflict and not reassigning: keep primary app/version as-is.
    if (!hasConflict || reassignFromOtherApplications) {
      await pool.execute(
        'UPDATE Tasks SET ApplicationId = ?, ReleaseVersionId = ? WHERE Id = ?',
        [applicationId, versionId, normalizedTaskId]
      );
    }

    const versionAppId = Number(applicationId);
    if (Number.isFinite(versionAppId) && versionAppId > 0) {
      await ensureTaskApplications(normalizedTaskId, [versionAppId]);
    }
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ?',
      [applicationId]
    );
    await invalidateByEntity('application', { applicationId, orgId: apps[0]?.OrganizationId });
    res.json({ success: true, message: 'Task added to version' });
  } catch (error) {
    logger.error('Error adding task to version:', error);
    res.status(500).json({ success: false, message: 'Failed to add task to version' });
  }
});

// DELETE /api/applications/:id/versions/:versionId/tasks/:taskId - remove task from version
router.delete('/:id/versions/:versionId/tasks/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId, taskId } = req.params;
    const applicationId = Array.isArray(id) ? id[0] : id;
    const normalizedTaskId = Number(taskId);
    await pool.execute(
      'DELETE FROM ApplicationVersionTasks WHERE VersionId = ? AND TaskId = ?',
      [versionId, normalizedTaskId]
    );
    await pool.execute(
      `UPDATE Tasks
       SET ReleaseVersionId = NULL,
           ApplicationId = CASE WHEN ApplicationId = ? THEN NULL ELSE ApplicationId END
       WHERE Id = ? AND ReleaseVersionId = ?`,
      [applicationId, normalizedTaskId, versionId]
    );
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ?',
      [applicationId]
    );
    await invalidateByEntity('application', { applicationId, orgId: apps[0]?.OrganizationId });
    res.json({ success: true, message: 'Task removed from version' });
  } catch (error) {
    logger.error('Error removing task from version:', error);
    res.status(500).json({ success: false, message: 'Failed to remove task from version' });
  }
});

// GET /api/applications/public/patch-notes/:versionId - public patch notes (no auth required)
router.get('/public/patch-notes/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;

    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.VersionNumber, av.VersionName, av.ReleaseDate, av.PatchNotes, av.Status,
              a.Name as ApplicationName, a.RepositoryUrl
       FROM ApplicationVersions av
       INNER JOIN Applications a ON av.ApplicationId = a.Id
       WHERE av.Id = ? AND av.Status = 'Released'`,
      [versionId]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found or not yet released' });
    }

    const version = versions[0];

    // Load tasks
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.TaskName, t.Description, tsv.StatusName,
              tpv.PriorityName, tpv.ColorCode as PriorityColor
       FROM Tasks t
       INNER JOIN ApplicationVersionTasks avt ON t.Id = avt.TaskId
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       WHERE avt.VersionId = ?
       ORDER BY t.DisplayOrder, t.Id`,
      [versionId]
    );

    version.Tasks = tasks;

    res.json({ success: true, version });
  } catch (error) {
    logger.error('Error fetching patch notes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patch notes' });
  }
});

// GET /api/applications/:id/versions/:versionId/pdf - download PDF for a specific version
router.get('/:id/versions/:versionId/pdf', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user?.userId;

    // Check access
    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Name FROM Applications a
       INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE a.Id = ? AND a.IsActive = 1`,
      [userId, id]
    );

    if (apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const appName = apps[0].Name;

    // Get version details
    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.VersionNumber, av.VersionName, av.ReleaseDate, av.PatchNotes, av.Status
       FROM ApplicationVersions av
       WHERE av.Id = ? AND av.ApplicationId = ?`,
      [versionId, id]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    const version = versions[0];

    // Generate PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = `${appName.replace(/[^a-z0-9]/gi, '_')}-v${version.VersionNumber}-release-notes.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    const blue = '#3b82f6';
    const darkGray = '#1f2937';
    const midGray = '#6b7280';
    const green = '#10b981';

    // Header
    doc.rect(0, 0, 595, 70).fill(blue);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
      .text('Release Notes', 40, 20);
    doc.fontSize(14).font('Helvetica')
      .text(`${appName} - Version ${version.VersionNumber}`, 40, 45);
    doc.fillColor(darkGray);

    doc.y = 90;

    // Version info
    doc.fontSize(11).fillColor(midGray);
    if (version.VersionName) {
      doc.text(`Version Name: ${version.VersionName}`, 40);
      doc.moveDown(0.3);
    }
    if (version.ReleaseDate) {
      doc.text(`Release Date: ${new Date(version.ReleaseDate).toLocaleDateString()}`, 40);
      doc.moveDown(0.3);
    }
    const statusColor = version.Status === 'Released' ? green : midGray;
    doc.fillColor(statusColor).text(`Status: ${version.Status}`, 40);
    doc.moveDown(1);

    // Patch notes
    doc.fillColor(darkGray).fontSize(12).font('Helvetica-Bold')
      .text('Patch Notes', 40);
    doc.moveDown(0.5);

    await renderPatchNotesToPdf(doc, version.PatchNotes, {
      textSize: 10,
      x: 40,
      width: 515,
      darkGray,
      midGray,
      linkBaseUrl: resolvePdfLinkBaseUrl(req),
    });

    // Footer
    doc.fontSize(7).fillColor(midGray)
      .text(
        `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`,
        40,
        780,
        { align: 'center', width: 515 }
      );

    doc.end();
  } catch (error) {
    logger.error('Error generating version PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  }
});

// POST /api/applications/release-notes/pdf - combined release notes PDF for multiple applications
router.post('/release-notes/pdf', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const startDate = String(req.body?.startDate || '').trim();
    const endDate = String(req.body?.endDate || '').trim();
    const rawIds = Array.isArray(req.body?.applicationIds) ? req.body.applicationIds : [];
    const applicationIds = [...new Set(
      rawIds
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value > 0)
    )] as number[];

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }
    if (applicationIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one application' });
    }

    const placeholders = applicationIds.map(() => '?').join(', ');
    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Id, a.Name
       FROM Applications a
       INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE a.Id IN (${placeholders}) AND a.IsActive = 1
       ORDER BY a.Name ASC`,
      [userId, ...applicationIds]
    );

    if (apps.length === 0) {
      return res.status(404).json({ success: false, message: 'No accessible applications found' });
    }
    if (apps.length !== applicationIds.length) {
      return res.status(403).json({ success: false, message: 'One or more applications are not accessible' });
    }

    const accessibleIds = apps.map((app) => Number(app.Id));
    const versionPlaceholders = accessibleIds.map(() => '?').join(', ');
    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.ApplicationId, av.VersionNumber, av.VersionName, av.ReleaseDate, av.PatchNotes, av.Status, a.Name as ApplicationName
       FROM ApplicationVersions av
       INNER JOIN Applications a ON a.Id = av.ApplicationId
       WHERE av.ApplicationId IN (${versionPlaceholders})
         AND av.Status = 'Released'
         AND av.ReleaseDate >= ?
         AND av.ReleaseDate <= ?
       ORDER BY a.Name ASC, av.ReleaseDate DESC, av.Id DESC`,
      [...accessibleIds, startDate, endDate]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'No released versions found in the specified date range' });
    }

    const versionsByApp = new Map<number, RowDataPacket[]>();
    for (const version of versions) {
      const appId = Number(version.ApplicationId);
      const list = versionsByApp.get(appId) || [];
      list.push(version);
      versionsByApp.set(appId, list);
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = `multi-app-release-notes-${startDate}-to-${endDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const blue = '#3b82f6';
    const darkGray = '#1f2937';
    const midGray = '#6b7280';
    const green = '#10b981';

    doc.rect(0, 0, 595, 80).fill(blue);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('Release Notes', 40, 20);
    doc.fontSize(12).font('Helvetica').text(`${apps.length} application(s)`, 40, 45);
    doc.fontSize(10).text(
      `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
      40,
      62
    );
    doc.fillColor(darkGray);
    doc.y = 95;
    doc.fontSize(9).fillColor(midGray).text(`${versions.length} version(s) released in this period`, 40);
    doc.moveDown(1);

    for (let appIndex = 0; appIndex < apps.length; appIndex++) {
      const app = apps[appIndex];
      const appVersions = versionsByApp.get(Number(app.Id)) || [];
      if (appVersions.length === 0) continue;

      if (doc.y > 680) {
        doc.addPage();
      }

      doc.fillColor(blue).fontSize(16).font('Helvetica-Bold').text(String(app.Name), 40);
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor(midGray).font('Helvetica').text(`${appVersions.length} version(s)`, 40);
      doc.moveDown(0.8);

      for (let i = 0; i < appVersions.length; i++) {
        const version = appVersions[i];
        if (doc.y > 700) {
          doc.addPage();
        }

        const boxY = doc.y;
        doc.rect(40, boxY, 515, 30).fill('#f3f4f6');
        doc.fillColor(darkGray).fontSize(14).font('Helvetica-Bold')
          .text(`Version ${version.VersionNumber}`, 45, boxY + 6);
        if (version.VersionName) {
          doc.fontSize(10).font('Helvetica').text(String(version.VersionName), 45, boxY + 22);
        }
        doc.y = boxY + 35;

        doc.fontSize(9).fillColor(midGray);
        if (version.ReleaseDate) {
          doc.text(`Released: ${new Date(version.ReleaseDate).toLocaleDateString()}`, 45);
          doc.moveDown(0.3);
        }
        doc.fillColor(green).text(`Status: ${version.Status}`, 45);
        doc.moveDown(0.8);

        await renderPatchNotesToPdf(doc, version.PatchNotes, {
          textSize: 9,
          x: 45,
          width: 505,
          darkGray,
          midGray,
          linkBaseUrl: resolvePdfLinkBaseUrl(req),
        });

        doc.moveDown(1.2);
        if (i < appVersions.length - 1) {
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#e5e7eb');
          doc.moveDown(0.8);
        }
      }

      if (appIndex < apps.length - 1) {
        doc.moveDown(1);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke(blue);
        doc.moveDown(1);
      }
    }

    doc.fontSize(7).fillColor(midGray).text(
      `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`,
      40,
      780,
      { align: 'center', width: 515 }
    );
    doc.end();
  } catch (error) {
    logger.error('Error generating multi-application release notes PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  }
});

// GET /api/applications/:id/pdf - download PDF for date range
router.get('/:id/pdf', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    const userId = req.user?.userId;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    // Check access
    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Name FROM Applications a
       INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE a.Id = ? AND a.IsActive = 1`,
      [userId, id]
    );

    if (apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const appName = apps[0].Name;

    // Get versions in date range
    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.VersionNumber, av.VersionName, av.ReleaseDate, av.PatchNotes, av.Status
       FROM ApplicationVersions av
       WHERE av.ApplicationId = ?
         AND av.Status = 'Released'
         AND av.ReleaseDate >= ?
         AND av.ReleaseDate <= ?
       ORDER BY av.ReleaseDate DESC`,
      [id, startDate, endDate]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'No released versions found in the specified date range' });
    }

    // Generate PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = `${appName.replace(/[^a-z0-9]/gi, '_')}-release-notes-${startDate}-to-${endDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    const blue = '#3b82f6';
    const darkGray = '#1f2937';
    const midGray = '#6b7280';
    const green = '#10b981';

    // Header
    doc.rect(0, 0, 595, 80).fill(blue);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
      .text('Release Notes', 40, 20);
    doc.fontSize(14).font('Helvetica')
      .text(appName, 40, 45);
    doc.fontSize(10)
      .text(`${new Date(startDate as string).toLocaleDateString()} - ${new Date(endDate as string).toLocaleDateString()}`, 40, 62);
    doc.fillColor(darkGray);

    doc.y = 95;

    // Summary
    doc.fontSize(9).fillColor(midGray)
      .text(`${versions.length} version(s) released in this period`, 40);
    doc.moveDown(1);

    // Each version
    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];

      if (doc.y > 700) {
        doc.addPage();
      }

      // Version header with background
      const boxY = doc.y;
      doc.rect(40, boxY, 515, 30).fill('#f3f4f6');
      doc.fillColor(darkGray).fontSize(14).font('Helvetica-Bold')
        .text(`Version ${version.VersionNumber}`, 45, boxY + 6);
      if (version.VersionName) {
        doc.fontSize(10).font('Helvetica')
          .text(version.VersionName, 45, boxY + 22);
      }
      doc.y = boxY + 35;

      // Version info
      doc.fontSize(9).fillColor(midGray);
      if (version.ReleaseDate) {
        doc.text(`Released: ${new Date(version.ReleaseDate).toLocaleDateString()}`, 45);
        doc.moveDown(0.3);
      }
      doc.fillColor(green).text(`Status: ${version.Status}`, 45);
      doc.moveDown(0.8);

      // Patch notes
      await renderPatchNotesToPdf(doc, version.PatchNotes, {
        textSize: 9,
        x: 45,
        width: 505,
        darkGray,
        midGray,
        linkBaseUrl: resolvePdfLinkBaseUrl(req),
      });

      doc.moveDown(1.5);

      // Separator line (except for last item)
      if (i < versions.length - 1) {
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#e5e7eb');
        doc.moveDown(1);
      }
    }

    // Footer
    doc.fontSize(7).fillColor(midGray)
      .text(
        `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`,
        40,
        780,
        { align: 'center', width: 515 }
      );

    doc.end();
  } catch (error) {
    logger.error('Error generating date range PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  }
});

export default router;
