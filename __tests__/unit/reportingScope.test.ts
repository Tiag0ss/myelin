import {
  customerProjectScopeSql,
  customerTaskScopeSql,
  parseOptionalId,
  projectIdScopeSql,
} from '@/server/utils/reportingScope';

describe('reportingScope', () => {
  it('parseOptionalId accepts positive integers only', () => {
    expect(parseOptionalId(12)).toBe(12);
    expect(parseOptionalId('7')).toBe(7);
    expect(parseOptionalId(0)).toBeNull();
    expect(parseOptionalId('')).toBeNull();
    expect(parseOptionalId(undefined)).toBeNull();
  });

  it('customerTaskScopeSql is empty without customer', () => {
    expect(customerTaskScopeSql(null)).toEqual({ sql: '', params: [] });
  });

  it('customerTaskScopeSql filters effective customer', () => {
    const frag = customerTaskScopeSql(42);
    expect(frag.sql).toContain('COALESCE(t.CustomerId, p.CustomerId) = ?');
    expect(frag.params).toEqual([42]);
  });

  it('customerProjectScopeSql includes global projects with matching tasks', () => {
    const frag = customerProjectScopeSql(9);
    expect(frag.sql).toContain('p.CustomerId = ?');
    expect(frag.sql).toContain('IsGlobal');
    expect(frag.params).toEqual([9, 9]);
  });

  it('projectIdScopeSql supports project and task aliases', () => {
    expect(projectIdScopeSql(null)).toEqual({ sql: '', params: [] });
    expect(projectIdScopeSql(3)).toEqual({ sql: ' AND p.Id = ?', params: [3] });
    expect(projectIdScopeSql(3, { alias: 't', column: 'ProjectId' })).toEqual({
      sql: ' AND t.ProjectId = ?',
      params: [3],
    });
  });
});
