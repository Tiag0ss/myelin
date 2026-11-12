/**
 * Release task picker scoping:
 * - default browse → tasks from projects linked via ApplicationProjects
 * - search → ignore project↔application link; match org tasks by search params
 */

export type ReleaseTaskPickerScope = 'associated-projects' | 'organization-search';

export function resolveReleaseTaskPickerScope(search: string | null | undefined): ReleaseTaskPickerScope {
  return String(search ?? '').trim() ? 'organization-search' : 'associated-projects';
}

export function normalizeReleaseTaskSearch(search: string | null | undefined): string {
  return String(search ?? '').trim();
}

/** Build LIKE / exact-id predicates for release task search (parameterized placeholders only). */
export function buildReleaseTaskSearchClause(options: {
  search: string;
  idCastExpr: string;
}): { sql: string; params: Array<string | number> } {
  const term = normalizeReleaseTaskSearch(options.search);
  if (!term) {
    return { sql: '1=1', params: [] };
  }

  const like = `%${term}%`;
  const params: Array<string | number> = [like, like, like, like];
  let sql = `(
    t.TaskName LIKE ?
    OR p.ProjectName LIKE ?
    OR tsv.StatusName LIKE ?
    OR ${options.idCastExpr} LIKE ?
  )`;

  const asId = Number(term);
  if (Number.isFinite(asId) && asId > 0 && String(Math.trunc(asId)) === term) {
    sql = `(${sql} OR t.Id = ?)`;
    params.push(Math.trunc(asId));
  }

  return { sql, params };
}
