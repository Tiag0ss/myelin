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

export type AgentDocKind = 'skills' | 'rules';
export type AgentDocOwnerKind = 'organization' | 'application';

type DocKind = AgentDocKind;
type OwnerKind = AgentDocOwnerKind;

function tableName(owner: OwnerKind, kind: DocKind): string {
  if (owner === 'organization') {
    return kind === 'skills' ? 'OrganizationAgentSkills' : 'OrganizationAgentRules';
  }
  return kind === 'skills' ? 'ApplicationAgentSkills' : 'ApplicationAgentRules';
}

function ownerColumn(owner: OwnerKind): string {
  return owner === 'organization' ? 'OrganizationId' : 'ApplicationId';
}

export type AgentDocCreateInput = {
  name: string;
  slug?: string;
  content?: string | null;
  sortOrder?: number;
};

export type AgentDocUpdateInput = {
  name?: string;
  slug?: string;
  content?: string | null;
  sortOrder?: number;
};

export type AgentDocRecord = {
  id: number;
  ownerId: number;
  owner: OwnerKind;
  name: string;
  slug: string;
  content: string;
  sortOrder: number;
  isArchived: boolean;
};

export async function createAgentDoc(
  owner: OwnerKind,
  ownerId: number,
  kind: DocKind,
  input: AgentDocCreateInput
): Promise<AgentDocRecord> {
  const name = String(input.name || '').trim();
  if (!name) {
    throw new Error('name is required');
  }
  const slug = String(input.slug || slugifyAgentDoc(name)).trim().slice(0, 128);
  const content = input.content != null ? String(input.content) : '';
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0;

  const table = tableName(owner, kind);
  const col = ownerColumn(owner);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO ${table} (${col}, Name, Slug, Content, SortOrder, IsArchived) VALUES (?, ?, ?, ?, ?, 0)`,
    [ownerId, name, slug, content, sortOrder]
  );

  return {
    id: Number(result.insertId),
    ownerId,
    owner,
    name,
    slug,
    content,
    sortOrder,
    isArchived: false,
  };
}

export async function updateAgentDoc(
  owner: OwnerKind,
  ownerId: number,
  kind: DocKind,
  docId: number,
  input: AgentDocUpdateInput
): Promise<boolean> {
  const table = tableName(owner, kind);
  const col = ownerColumn(owner);
  const [existing] = await pool.execute<RowDataPacket[]>(
    `SELECT Id FROM ${table} WHERE Id = ? AND ${col} = ?`,
    [docId, ownerId]
  );
  if (!existing.length) return false;

  const updates: string[] = [];
  const params: unknown[] = [];
  if (input.name != null) {
    updates.push('Name = ?');
    params.push(String(input.name).trim());
  }
  if (input.slug != null) {
    updates.push('Slug = ?');
    params.push(String(input.slug).trim().slice(0, 128));
  }
  if (input.content !== undefined) {
    updates.push('Content = ?');
    params.push(input.content == null ? '' : String(input.content));
  }
  if (input.sortOrder !== undefined) {
    updates.push('SortOrder = ?');
    params.push(Number(input.sortOrder) || 0);
  }
  if (updates.length === 0) {
    throw new Error('No fields to update');
  }
  params.push(docId, ownerId);
  await pool.execute(
    `UPDATE ${table} SET ${updates.join(', ')} WHERE Id = ? AND ${col} = ?`,
    params
  );
  return true;
}

export async function deleteAgentDoc(
  owner: OwnerKind,
  ownerId: number,
  kind: DocKind,
  docId: number
): Promise<boolean> {
  const table = tableName(owner, kind);
  const col = ownerColumn(owner);
  const [result] = await pool.execute<ResultSetHeader>(
    `DELETE FROM ${table} WHERE Id = ? AND ${col} = ?`,
    [docId, ownerId]
  );
  return result.affectedRows > 0;
}

/** Soft-archive / unarchive. Returns false when the row is missing. */
export async function setAgentDocArchived(
  owner: OwnerKind,
  ownerId: number,
  kind: DocKind,
  docId: number,
  archived: boolean
): Promise<boolean> {
  const table = tableName(owner, kind);
  const col = ownerColumn(owner);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE ${table} SET IsArchived = ? WHERE Id = ? AND ${col} = ?`,
    [archived ? 1 : 0, docId, ownerId]
  );
  return result.affectedRows > 0;
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
    `SELECT Id, ${col} AS OwnerId, Name, Slug, Content, SortOrder, IsArchived, CreatedAt, UpdatedAt
     FROM ${table}
     WHERE ${col} = ?
     ORDER BY IsArchived ASC, SortOrder ASC, Id ASC`,
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

    const created = await createAgentDoc(owner, ownerId, kind, {
      name: String(req.body.name || ''),
      slug: req.body.slug != null ? String(req.body.slug) : undefined,
      content: req.body.content,
      sortOrder: req.body.sortOrder,
    });

    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        ownerId: created.ownerId,
        name: created.name,
        slug: created.slug,
        content: created.content,
        sortOrder: created.sortOrder,
      },
    });
  } catch (error) {
    logger.error('Failed to create agent doc', error);
    const message = error instanceof Error && error.message === 'name is required'
      ? 'name is required'
      : 'Failed to create agent document';
    res.status(error instanceof Error && error.message === 'name is required' ? 400 : 500).json({
      success: false,
      message,
    });
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

    try {
      const updated = await updateAgentDoc(owner, ownerId, kind, docId, {
        name: req.body.name != null ? String(req.body.name) : undefined,
        slug: req.body.slug != null ? String(req.body.slug) : undefined,
        content: req.body.content,
        sortOrder: req.body.sortOrder,
      });
      if (!updated) {
        res.status(404).json({ success: false, message: 'Not found' });
        return;
      }
      res.json({ success: true, message: 'Updated' });
    } catch (inner) {
      if (inner instanceof Error && inner.message === 'No fields to update') {
        res.status(400).json({ success: false, message: 'No fields to update' });
        return;
      }
      throw inner;
    }
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
    const deleted = await deleteAgentDoc(owner, ownerId, kind, docId);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    logger.error('Failed to delete agent doc', error);
    res.status(500).json({ success: false, message: 'Failed to delete agent document' });
  }
}

export async function archiveAgentDocHandler(
  req: AuthRequest,
  res: Response,
  owner: OwnerKind,
  kind: DocKind,
  archived: boolean
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
    const ok = await setAgentDocArchived(owner, ownerId, kind, docId, archived);
    if (!ok) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({
      success: true,
      message: archived ? 'Archived' : 'Unarchived',
      data: { id: docId, isArchived: archived },
    });
  } catch (error) {
    logger.error('Failed to archive agent doc', error);
    res.status(500).json({
      success: false,
      message: archived ? 'Failed to archive agent document' : 'Failed to unarchive agent document',
    });
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
