import {
  DEFAULT_PLANNING_TASK_FILTERS,
  countPlanningTaskActiveFilters,
  countPlanningTaskFilterDeviations,
  taskMatchesPlanningFilters,
} from '../../lib/planning/planningTaskFilters';

const unplannedTask = {
  Id: 1,
  ParentTaskId: null,
  ProjectId: 10,
  TaskName: 'Ship release',
  Description: 'Prepare notes',
  Status: 2,
  Priority: 3,
  AssignedTo: 7,
  TaskType: 4,
  StatusName: 'In Progress',
  PriorityName: 'High',
  TaskTypeName: 'Story',
  AssigneeName: 'alice',
  ProjectName: 'Myelin',
  PlannedStartDate: null,
  PlannedEndDate: null,
  UnscheduledWork: 0,
  StatusIsClosed: 0,
  StatusIsCancelled: 0,
};

const plannedTask = {
  ...unplannedTask,
  Id: 10,
  TaskName: 'Already planned',
  PlannedStartDate: '2026-11-01',
  PlannedEndDate: '2026-11-05',
};

describe('countPlanningTaskActiveFilters', () => {
  it('counts the four default constraints as active', () => {
    expect(countPlanningTaskActiveFilters(DEFAULT_PLANNING_TASK_FILTERS)).toBe(4);
  });

  it('adds extra constraints on top of defaults', () => {
    expect(
      countPlanningTaskActiveFilters({
        ...DEFAULT_PLANNING_TASK_FILTERS,
        filterText: 'api',
      })
    ).toBe(5);
  });
});

describe('countPlanningTaskFilterDeviations', () => {
  it('returns 0 for defaults', () => {
    expect(countPlanningTaskFilterDeviations(DEFAULT_PLANNING_TASK_FILTERS)).toBe(0);
  });

  it('counts unchecked default hide toggles so Clear can restore them', () => {
    expect(
      countPlanningTaskFilterDeviations({
        ...DEFAULT_PLANNING_TASK_FILTERS,
        hideClosed: false,
        hideCancelled: false,
        hideUnscheduled: false,
      })
    ).toBe(3);
  });
});

describe('taskMatchesPlanningFilters', () => {
  it('hides closed, cancelled, and unscheduled by default', () => {
    const closed = { ...unplannedTask, Id: 2, StatusIsClosed: 1 };
    const cancelled = { ...unplannedTask, Id: 3, StatusIsCancelled: 1 };
    const unscheduled = { ...unplannedTask, Id: 4, UnscheduledWork: 1 };
    const all = [unplannedTask, closed, cancelled, unscheduled];

    expect(
      taskMatchesPlanningFilters(unplannedTask, DEFAULT_PLANNING_TASK_FILTERS, { allTasks: all })
    ).toBe(true);
    expect(taskMatchesPlanningFilters(closed, DEFAULT_PLANNING_TASK_FILTERS, { allTasks: all })).toBe(
      false
    );
    expect(
      taskMatchesPlanningFilters(cancelled, DEFAULT_PLANNING_TASK_FILTERS, { allTasks: all })
    ).toBe(false);
    expect(
      taskMatchesPlanningFilters(unscheduled, DEFAULT_PLANNING_TASK_FILTERS, { allTasks: all })
    ).toBe(false);
  });

  it('hides planned tasks when unplannedOnly is on', () => {
    expect(
      taskMatchesPlanningFilters(plannedTask, DEFAULT_PLANNING_TASK_FILTERS, {
        allTasks: [plannedTask, unplannedTask],
      })
    ).toBe(false);
  });

  it('shows unscheduled when hideUnscheduled is off even with unplannedOnly on', () => {
    const unscheduled = { ...unplannedTask, Id: 4, UnscheduledWork: 1 };
    expect(
      taskMatchesPlanningFilters(
        unscheduled,
        { ...DEFAULT_PLANNING_TASK_FILTERS, hideUnscheduled: false },
        { allTasks: [unscheduled, unplannedTask] }
      )
    ).toBe(true);
  });

  it('keeps planned tasks hidden when only hideUnscheduled is turned off', () => {
    expect(
      taskMatchesPlanningFilters(
        plannedTask,
        { ...DEFAULT_PLANNING_TASK_FILTERS, hideUnscheduled: false },
        { allTasks: [plannedTask, unplannedTask] }
      )
    ).toBe(false);
  });

  it('filters by project and search text', () => {
    const other = {
      ...unplannedTask,
      Id: 5,
      ProjectId: 99,
      ProjectName: 'Other',
      TaskName: 'Docs',
    };
    expect(
      taskMatchesPlanningFilters(
        other,
        { ...DEFAULT_PLANNING_TASK_FILTERS, filterProject: 10 },
        { allTasks: [unplannedTask, other] }
      )
    ).toBe(false);
    expect(
      taskMatchesPlanningFilters(
        other,
        { ...DEFAULT_PLANNING_TASK_FILTERS, filterText: 'docs' },
        { allTasks: [unplannedTask, other] }
      )
    ).toBe(true);
  });

  it('filters by multiple statuses', () => {
    const other = { ...unplannedTask, Id: 6, Status: 9, StatusName: 'Review' };
    expect(
      taskMatchesPlanningFilters(
        unplannedTask,
        { ...DEFAULT_PLANNING_TASK_FILTERS, filterStatusIds: [2, 9] },
        { allTasks: [unplannedTask, other] }
      )
    ).toBe(true);
    expect(
      taskMatchesPlanningFilters(
        other,
        { ...DEFAULT_PLANNING_TASK_FILTERS, filterStatusIds: [2, 9] },
        { allTasks: [unplannedTask, other] }
      )
    ).toBe(true);
    expect(
      taskMatchesPlanningFilters(
        other,
        { ...DEFAULT_PLANNING_TASK_FILTERS, filterStatusIds: [2] },
        { allTasks: [unplannedTask, other] }
      )
    ).toBe(false);
  });
});
