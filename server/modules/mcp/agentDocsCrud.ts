import { Response } from 'express';
import { z } from 'zod';
import { pool, ResultSetHeader, RowDataPacket } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import logger from '../../utils/logger';
import { slugifyAgentDoc } from './slugify';

export const agentDocBodySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(128).optional(),
  content: z.string().max(16_777_215).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
});

export const agentDocUpdateSchema = agentDocBodySchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'At least one field is required' }
);

type DocKind = 'skills' | 'rules';
type OwnerKind = 'organization' | 'application';

function tableName(owner: OwnerKind, kind: DocKind): string {
  if (owner === 'organization') {
    return kind === 'skills' ? 'OrganizationAgentSkills' : 'OrganizationAgentRules';
  }
  return kind === 'skills' ? 'ApplicationAgentSkills' : 'ApplicationAgentRules';
}

function ownerColumn(owner: OwnerKind): string {
  return owner === 'organization' ? 'OrganizationId' : 'ApplicationId';
}

async function userIsOrgMember(userId: number, organizationId: number): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
    [organizationId, userId]
  );
  return rows.length > 0;
}

async function resolveApplicationOrg(applicationId: number): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT OrganizationId FROM Applications WHERE Id = ?',
    [applicationId]
  );
  if (!rows.length) return null;
  return Number(rows[0].OrganizationId);
}

/** Simplified permission: admin, or CanManageApplications / CanManageOrganizations via roles. */
export async function userCanManageAgentDocs(
  userId: number,
  owner: OwnerKind,
  ownerId: number
): Promise<boolean> {
  const [userRows] = await pool.execute<RowDataPacket[]>(
    'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
    [userId]
  );
  if (!userRows.length) return false;
  if (userRows[0].isAdmin) return true;

  let organizationId = ownerId;
  if (owner === 'application') {
    const orgId = await resolveApplicationOrg(ownerId);
    if (orgId == null) return false;
    organizationId = orgId;
  }

  if (!(await userIsOrgMember(userId, organizationId))) return false;

  const roles: string[] = [];
  if (userRows[0].IsDeveloper) roles.push('Developer');
  if (userRows[0].IsSupport) roles.push('Support');
  if (userRows[0].IsManager) roles.push('Manager');
  if (roles.length === 0) return false;

  const permCol = owner === 'application' ? 'CanManageApplications' : 'CanManageOrganizations';
  const placeholders = roles.map(() => '?').join(',');
  const [rolePerms] = await pool.execute<RowDataPacket[]>(
    `SELECT ${permCol} FROM RolePermissions WHERE RoleName IN (${placeholders})`,
    roles
  );
  if (rolePerms.some((rp) => Number(rp[permCol]) === 1)) return true;

  const [orgPerms] = await pool.execute<RowDataPacket[]>(
    `SELECT pg.${permCol} AS Perm
     FROM PermissionGroups pg
     INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
     WHERE om.UserId = ? AND pg.OrganizationId = ?`,
    [userId, organizationId]
  );
  return orgPerms.some((op) => Number(op.Perm) === 1);
}

export async function listAgentDocs(
  owner: OwnerKind,
  ownerId: number,
  kind: DocKind
): Promise<RowDataPacket[]> {
  const table = tableName(owner, kind);
  const col = ownerColumn(owner);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, ${col} AS OwnerId, Name, Slug, Content, SortOrder, CreatedAt, UpdatedAt
     FROM ${table}
     WHERE ${col} = ?
     ORDER BY SortOrder ASC, Id ASC`,
    [ownerId]
  );
  return rows;
}

export async function createAgentDocHandler(
  req: AuthRequest,
  res: Response,
  owner: OwnerKind,
  kind: DocKind
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const ownerId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(ownerId) || ownerId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid id' });
      return;
    }
    if (!(await userCanManageAgentDocs(userId, owner, ownerId))) {
      res.status(403).json({ success: false, message: 'Permission denied' });
      return;
    }

    const name = String(req.body.name || '').trim();
    const slug = String(req.body.slug || slugifyAgentDoc(name)).trim().slice(0, 128);
    const content = req.body.content != null ? String(req.body.content) : '';
    const sortOrder = Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0;

    const table = tableName(owner, kind);
    const col = ownerColumn(owner);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ${table} (${col}, Name, Slug, Content, SortOrder) VALUES (?, ?, ?, ?, ?)`,
      [ownerId, name, slug, content, sortOrder]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        ownerId,
        name,
        slug,
        content,
        sortOrder,
      },
    });
  } catch (error) {
    logger.error('Failed to create agent doc', error);
    res.status(500).json({ success: false, message: 'Failed to create agent document' });
  }
}

export async function updateAgentDocHandler(
  req: AuthRequest,
  res: Response,
  owner: OwnerKind,
  kind: DocKind
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const ownerId = parseInt(String(req.params.id), 10);
    const docId = parseInt(String(req.params.docId), 10);
    if (!Number.isFinite(ownerId) || !Number.isFinite(docId)) {
      res.status(400).json({ success: false, message: 'Invalid id' });
      return;
    }
    if (!(await userCanManageAgentDocs(userId, owner, ownerId))) {
      res.status(403).json({ success: false, message: 'Permission denied' });
      return;
    }

    const table = tableName(owner, kind);
    const col = ownerColumn(owner);
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM ${table} WHERE Id = ? AND ${col} = ?`,
      [docId, ownerId]
    );
    if (!existing.length) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    if (req.body.name != null) {
      updates.push('Name = ?');
      params.push(String(req.body.name).trim());
    }
    if (req.body.slug != null) {
      updates.push('Slug = ?');
      params.push(String(req.body.slug).trim().slice(0, 128));
    }
    if (req.body.content !== undefined) {
      updates.push('Content = ?');
      params.push(req.body.content == null ? '' : String(req.body.content));
    }
    if (req.body.sortOrder !== undefined) {
      updates.push('SortOrder = ?');
      params.push(Number(req.body.sortOrder) || 0);
    }
    if (updates.length === 0) {
      res.status(400).json({ success: false, message: 'No fields to update' });
      return;
    }
    params.push(docId, ownerId);
    await pool.execute(
      `UPDATE ${table} SET ${updates.join(', ')} WHERE Id = ? AND ${col} = ?`,
      params
    );
    res.json({ success: true, message: 'Updated' });
  } catch (error) {
    logger.error('Failed to update agent doc', error);
    res.status(500).json({ success: false, message: 'Failed to update agent document' });
  }
}

export async function deleteAgentDocHandler(
  req: AuthRequest,
  res: Response,
  owner: OwnerKind,
  kind: DocKind
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const ownerId = parseInt(String(req.params.id), 10);
    const docId = parseInt(String(req.params.docId), 10);
    if (!Number.isFinite(ownerId) || !Number.isFinite(docId)) {
      res.status(400).json({ success: false, message: 'Invalid id' });
      return;
    }
    if (!(await userCanManageAgentDocs(userId, owner, ownerId))) {
      res.status(403).json({ success: false, message: 'Permission denied' });
      return;
    }
    const table = tableName(owner, kind);
    const col = ownerColumn(owner);
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM ${table} WHERE Id = ? AND ${col} = ?`,
      [docId, ownerId]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    logger.error('Failed to delete agent doc', error);
    res.status(500).json({ success: false, message: 'Failed to delete agent document' });
  }
}

export async function listAgentDocsHandler(
  req: AuthRequest,
  res: Response,
  owner: OwnerKind,
  kind: DocKind
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const ownerId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(ownerId)) {
      res.status(400).json({ success: false, message: 'Invalid id' });
      return;
    }

    if (owner === 'organization') {
      if (!(await userIsOrgMember(userId, ownerId)) && !req.user?.isAdmin) {
        res.status(403).json({ success: false, message: 'Permission denied' });
        return;
      }
    } else {
      const orgId = await resolveApplicationOrg(ownerId);
      if (orgId == null) {
        res.status(404).json({ success: false, message: 'Application not found' });
        return;
      }
      if (!(await userIsOrgMember(userId, orgId)) && !req.user?.isAdmin) {
        res.status(403).json({ success: false, message: 'Permission denied' });
        return;
      }
    }

    const rows = await listAgentDocs(owner, ownerId, kind);
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Failed to list agent docs', error);
    res.status(500).json({ success: false, message: 'Failed to list agent documents' });
  }
}
