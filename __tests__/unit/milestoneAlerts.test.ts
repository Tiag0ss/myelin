import {
  classifyMilestoneAlert,
  normalizeMilestoneDueDate,
  shouldAlertAssignedMilestone,
  todayDateKey,
} from '../../lib/milestoneAlerts';

describe('milestoneAlerts', () => {
  it('normalizes due dates', () => {
    expect(normalizeMilestoneDueDate('2026-11-13T00:00:00.000Z')).toBe('2026-11-13');
    expect(normalizeMilestoneDueDate('2026-11-13')).toBe('2026-11-13');
    expect(normalizeMilestoneDueDate('')).toBe('');
  });

  it('alerts assignee on due day and every overdue day while incomplete', () => {
    const today = '2026-11-13';
    const base = { AssignedTo: 7, IsCompleted: 0 };

    expect(shouldAlertAssignedMilestone({ ...base, DueDate: '2026-11-13' }, 7, today)).toBe(true);
    expect(shouldAlertAssignedMilestone({ ...base, DueDate: '2026-11-10' }, 7, today)).toBe(true);
    expect(shouldAlertAssignedMilestone({ ...base, DueDate: '2026-11-14' }, 7, today)).toBe(false);
    expect(shouldAlertAssignedMilestone({ ...base, DueDate: '2026-11-10' }, 9, today)).toBe(false);
    expect(
      shouldAlertAssignedMilestone({ ...base, DueDate: '2026-11-10', IsCompleted: 1 }, 7, today)
    ).toBe(false);
    expect(shouldAlertAssignedMilestone({ ...base, DueDate: null }, 7, today)).toBe(false);
  });

  it('classifies due today vs overdue', () => {
    expect(classifyMilestoneAlert({ DueDate: '2026-11-13', IsCompleted: 0 }, '2026-11-13')).toBe(
      'dueToday'
    );
    expect(classifyMilestoneAlert({ DueDate: '2026-11-01', IsCompleted: 0 }, '2026-11-13')).toBe(
      'overdue'
    );
    expect(classifyMilestoneAlert({ DueDate: '2026-11-20', IsCompleted: 0 }, '2026-11-13')).toBe(
      null
    );
  });

  it('builds local today key', () => {
    expect(todayDateKey(new Date('2026-11-13T15:00:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
