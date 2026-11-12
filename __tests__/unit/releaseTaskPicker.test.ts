import {
  buildReleaseTaskSearchClause,
  normalizeReleaseTaskSearch,
  resolveReleaseTaskPickerScope,
} from '../../server/utils/releaseTaskPicker';

describe('resolveReleaseTaskPickerScope', () => {
  it('uses associated projects when search is empty', () => {
    expect(resolveReleaseTaskPickerScope('')).toBe('associated-projects');
    expect(resolveReleaseTaskPickerScope('   ')).toBe('associated-projects');
    expect(resolveReleaseTaskPickerScope(undefined)).toBe('associated-projects');
  });

  it('uses organization search when a query is present', () => {
    expect(resolveReleaseTaskPickerScope('login')).toBe('organization-search');
    expect(resolveReleaseTaskPickerScope(' 42 ')).toBe('organization-search');
  });
});

describe('buildReleaseTaskSearchClause', () => {
  it('matches name, project, status, and cast id', () => {
    const clause = buildReleaseTaskSearchClause({
      search: 'auth',
      idCastExpr: 'CAST(t.Id AS CHAR)',
    });
    expect(clause.sql).toContain('t.TaskName LIKE ?');
    expect(clause.sql).toContain('p.ProjectName LIKE ?');
    expect(clause.sql).toContain('tsv.StatusName LIKE ?');
    expect(clause.sql).toContain('CAST(t.Id AS CHAR) LIKE ?');
    expect(clause.sql).not.toContain('t.Id = ?');
    expect(clause.params).toEqual(['%auth%', '%auth%', '%auth%', '%auth%']);
  });

  it('adds exact id match for numeric queries', () => {
    const clause = buildReleaseTaskSearchClause({
      search: '42',
      idCastExpr: 'CAST(t.Id AS CHAR)',
    });
    expect(clause.sql).toContain('OR t.Id = ?');
    expect(clause.params).toEqual(['%42%', '%42%', '%42%', '%42%', 42]);
  });

  it('normalizes blank search to no-op clause', () => {
    expect(normalizeReleaseTaskSearch('  ')).toBe('');
    const clause = buildReleaseTaskSearchClause({
      search: '   ',
      idCastExpr: 'CAST(t.Id AS CHAR)',
    });
    expect(clause.sql).toBe('1=1');
    expect(clause.params).toEqual([]);
  });
});
