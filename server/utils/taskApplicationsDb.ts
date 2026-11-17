import { pool, type RowDataPacket } from '../config/database';
import {
  mergeRelatedApplicationIds,
  normalizeApplicationIds,
} from './taskApplications';

export async function listTaskApplicationIds(taskId: number): Promise<number[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT ApplicationId FROM TaskApplications WHERE TaskId = ?',
    [taskId]
  );
  return normalizeApplicationIds(rows.map((row) => row.ApplicationId));
}

export async function listLinkedVersionApplicationIds(taskId: number): Promise<number[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT av.ApplicationId
     FROM ApplicationVersionTasks avt
     INNER JOIN ApplicationVersions av ON av.Id = avt.VersionId
     WHERE avt.TaskId = ?`,
    [taskId]
  );
  return normalizeApplicationIds(rows.map((row) => row.ApplicationId));
}

export async function ensureTaskApplications(
  taskId: number,
  applicationIds: number[]
): Promise<void> {
  for (const applicationId of normalizeApplicationIds(applicationIds)) {
    await pool.execute(
      `INSERT INTO TaskApplications (TaskId, ApplicationId)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM TaskApplications WHERE TaskId = ? AND ApplicationId = ?
       )`,
      [taskId, applicationId, taskId, applicationId]
    );
  }
}

export async function replaceTaskApplications(
  taskId: number,
  applicationIds: number[]
): Promise<void> {
  const ids = normalizeApplicationIds(applicationIds);
  await pool.execute('DELETE FROM TaskApplications WHERE TaskId = ?', [taskId]);
  for (const applicationId of ids) {
    await pool.execute(
      'INSERT INTO TaskApplications (TaskId, ApplicationId) VALUES (?, ?)',
      [taskId, applicationId]
    );
  }
}

/** Replace TaskApplications, always keeping apps linked via version changelog rows. */
export async function syncTaskApplicationsForSave(
  taskId: number,
  options: {
    selectedIds?: number[] | null;
    primaryApplicationId?: number | null;
  }
): Promise<number[]> {
  const linked = await listLinkedVersionApplicationIds(taskId);
  const merged = mergeRelatedApplicationIds({
    selectedIds: options.selectedIds,
    primaryApplicationId: options.primaryApplicationId,
    linkedApplicationIds: linked,
  });
  await replaceTaskApplications(taskId, merged);
  return merged;
}

export async function resolveApplicationIdForVersion(
  releaseVersionId: number | null | undefined
): Promise<number | null> {
  const versionId = Number(releaseVersionId);
  if (!Number.isFinite(versionId) || versionId <= 0) return null;
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT ApplicationId FROM ApplicationVersions WHERE Id = ? LIMIT 1',
    [versionId]
  );
  const appId = Number(rows[0]?.ApplicationId);
  return Number.isFinite(appId) && appId > 0 ? appId : null;
}
