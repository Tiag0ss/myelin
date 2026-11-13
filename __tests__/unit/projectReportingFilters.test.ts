import {
  buildUniqueStatusOptions,
  buildUniqueUserOptions,
  countActiveReportFilters,
  filterAllocationRows,
  filterTimeEntryRows,
  filterUserStatRows,
  matchesSearchText,
  normalizeReportDate,
  REPORT_UNASSIGNED_USER_ID,
  taskMatchesSummaryFilters,
} from '../../lib/projectReportingFilters';

describe('projectReportingFilters', () => {
  it('normalizes report dates to YYYY-MM-DD', () => {
    expect(normalizeReportDate('2026-03-12T10:00:00.000Z')).toBe('2026-03-12');
    expect(normalizeReportDate('2026-03-12')).toBe('2026-03-12');
    expect(normalizeReportDate('')).toBe('');
  });

  it('matches search text case-insensitively', () => {
    expect(matchesSearchText('Login timeout', 'TIME')).toBe(true);
    expect(matchesSearchText('Login timeout', 'missing')).toBe(false);
    expect(matchesSearchText('Login timeout', '')).toBe(true);
  });

  it('builds unique user and status options', () => {
    expect(
      buildUniqueUserOptions([
        { UserId: 2, Username: 'Bob' },
        { UserId: 1, Username: 'Ada' },
        { UserId: 2, Username: 'Bob' },
      ])
    ).toEqual([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Bob' },
    ]);
    expect(
      buildUniqueStatusOptions([
        { Status: 3, StatusName: 'Done' },
        { Status: 1, StatusName: 'To Do' },
      ])
    ).toEqual([
      { id: 3, name: 'Done' },
      { id: 1, name: 'To Do' },
    ]);
  });

  it('filters summary tasks by search, status, and assignee', () => {
    const task = {
      TaskName: 'Fix login',
      Status: 2,
      AssignedTo: 7,
      Assignees: [{ UserId: 9 }],
    };
    expect(taskMatchesSummaryFilters(task, { search: 'login' })).toBe(true);
    expect(taskMatchesSummaryFilters(task, { search: '', statusId: 2 })).toBe(true);
    expect(taskMatchesSummaryFilters(task, { search: '', statusId: 1 })).toBe(false);
    expect(taskMatchesSummaryFilters(task, { search: '', assigneeId: 9 })).toBe(true);
    expect(taskMatchesSummaryFilters(task, { search: '', assigneeId: REPORT_UNASSIGNED_USER_ID })).toBe(
      false
    );
    expect(
      taskMatchesSummaryFilters(
        { TaskName: 'Orphan', Status: 1 },
        { search: '', assigneeId: REPORT_UNASSIGNED_USER_ID }
      )
    ).toBe(true);
  });

  it('filters allocation, time entry, and user rows', () => {
    const allocations = [
      { TaskName: 'A', Username: 'Ada', UserId: 1, AllocationDate: '2026-01-10' },
      { TaskName: 'B', Username: 'Bob', UserId: 2, AllocationDate: '2026-02-10' },
    ];
    expect(
      filterAllocationRows(allocations, {
        search: 'bob',
        userId: undefined,
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
      })
    ).toHaveLength(1);

    const entries = [
      {
        TaskName: 'A',
        Username: 'Ada',
        Description: 'standup',
        UserId: 1,
        WorkDate: '2026-01-10',
      },
    ];
    expect(
      filterTimeEntryRows(entries, {
        search: 'stand',
        userId: 1,
        dateFrom: '',
        dateTo: '',
      })
    ).toHaveLength(1);

    expect(
      filterUserStatRows(
        [
          { UserId: 1, Username: 'Ada' },
          { UserId: 2, Username: 'Bob' },
        ],
        { search: 'ad', userId: undefined }
      )
    ).toEqual([{ UserId: 1, Username: 'Ada' }]);
  });

  it('counts active report filters', () => {
    expect(countActiveReportFilters([false, false])).toBe(0);
    expect(countActiveReportFilters([true, false, true])).toBe(2);
  });
});
