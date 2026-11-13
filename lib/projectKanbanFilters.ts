/** Sentinel for “Unassigned” in project Kanban assignee filter. */
export const KANBAN_UNASSIGNED_ASSIGNEE_ID = 0;

export type KanbanAssigneeTask = {
  AssignedTo?: number | null;
  AssigneeName?: string | null;
  Assignees?: Array<{ UserId: number; Username?: string | null }>;
};

export function buildKanbanAssigneeOptions(
  tasks: KanbanAssigneeTask[]
): Array<{ id: number; name: string }> {
  const byId = new Map<number, string>();
  for (const task of tasks) {
    const primaryId = Number(task.AssignedTo || 0);
    const primaryName = String(task.AssigneeName || '').trim();
    if (primaryId > 0 && primaryName) {
      byId.set(primaryId, primaryName);
    }
    for (const assignee of task.Assignees || []) {
      const id = Number(assignee.UserId || 0);
      const name = String(assignee.Username || '').trim();
      if (id > 0 && name) byId.set(id, name);
    }
  }
  return Array.from(byId.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function taskMatchesKanbanAssignee(
  task: KanbanAssigneeTask,
  filterAssignee: number | undefined
): boolean {
  if (filterAssignee === undefined) return true;

  const hasPrimary = Number(task.AssignedTo || 0) > 0;
  const multiIds = (task.Assignees || [])
    .map((assignee) => Number(assignee.UserId || 0))
    .filter((id) => id > 0);

  if (filterAssignee === KANBAN_UNASSIGNED_ASSIGNEE_ID) {
    return !hasPrimary && multiIds.length === 0;
  }

  if (Number(task.AssignedTo) === filterAssignee) return true;
  return multiIds.includes(filterAssignee);
}
