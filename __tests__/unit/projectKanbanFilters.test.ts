import {
  buildKanbanAssigneeOptions,
  KANBAN_UNASSIGNED_ASSIGNEE_ID,
  taskMatchesKanbanAssignee,
} from '../../lib/projectKanbanFilters';

describe('projectKanbanFilters', () => {
  it('builds unique assignee options from primary and multi assignees', () => {
    expect(
      buildKanbanAssigneeOptions([
        { AssignedTo: 2, AssigneeName: 'Bob', Assignees: [{ UserId: 1, Username: 'Ada' }] },
        { AssignedTo: 1, AssigneeName: 'Ada' },
        { Assignees: [{ UserId: 2, Username: 'Bob' }] },
      ])
    ).toEqual([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Bob' },
    ]);
  });

  it('matches primary assignee, multi-assignee, unassigned, and all', () => {
    const assigned = {
      AssignedTo: 7,
      Assignees: [{ UserId: 9, Username: 'Other' }],
    };
    const multiOnly = { Assignees: [{ UserId: 9, Username: 'Other' }] };
    const unassigned = {};

    expect(taskMatchesKanbanAssignee(assigned, undefined)).toBe(true);
    expect(taskMatchesKanbanAssignee(assigned, 7)).toBe(true);
    expect(taskMatchesKanbanAssignee(assigned, 9)).toBe(true);
    expect(taskMatchesKanbanAssignee(assigned, 1)).toBe(false);

    expect(taskMatchesKanbanAssignee(multiOnly, 9)).toBe(true);
    expect(taskMatchesKanbanAssignee(multiOnly, KANBAN_UNASSIGNED_ASSIGNEE_ID)).toBe(false);

    expect(taskMatchesKanbanAssignee(unassigned, KANBAN_UNASSIGNED_ASSIGNEE_ID)).toBe(true);
    expect(taskMatchesKanbanAssignee(unassigned, 7)).toBe(false);
  });
});
