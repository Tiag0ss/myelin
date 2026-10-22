/**
 * Shared SQL fragments for optional project / customer scope on reporting queries.
 * Effective customer for a task is COALESCE(t.CustomerId, p.CustomerId).
 * Project scope also includes global projects that have tasks for the customer.
 */

export type SqlFragment = { sql: string; params: number[] };

export function parseOptionalId(raw: unknown): number | null {
  const n = Number(raw || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Restrict projects: direct customer link, or global projects with tasks for that customer. */
export function customerProjectScopeSql(customerId: number | null): SqlFragment {
  if (!customerId) return { sql: '', params: [] };
  return {
    sql: ` AND (
      p.CustomerId = ?
      OR (
        COALESCE(p.IsGlobal, 0) = 1
        AND EXISTS (
          SELECT 1 FROM Tasks _ct
          WHERE _ct.ProjectId = p.Id AND _ct.CustomerId = ?
        )
      )
    )`,
    params: [customerId, customerId],
  };
}

/** Restrict tasks/time/allocations that join Tasks t + Projects p. */
export function customerTaskScopeSql(customerId: number | null): SqlFragment {
  if (!customerId) return { sql: '', params: [] };
  return {
    sql: ' AND COALESCE(t.CustomerId, p.CustomerId) = ?',
    params: [customerId],
  };
}

export function projectIdScopeSql(
  projectId: number | null,
  opts: { alias?: 'p' | 't'; column?: string } = {}
): SqlFragment {
  if (!projectId) return { sql: '', params: [] };
  const alias = opts.alias ?? 'p';
  const column = opts.column ?? (alias === 't' ? 'ProjectId' : 'Id');
  return { sql: ` AND ${alias}.${column} = ?`, params: [projectId] };
}
