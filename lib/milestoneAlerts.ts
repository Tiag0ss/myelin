/** Dashboard milestone alerts: assigned + incomplete, due today or overdue. */

export type MilestoneAlertInput = {
  DueDate?: string | null;
  IsCompleted?: number | boolean | null;
  AssignedTo?: number | null;
};

export function normalizeMilestoneDueDate(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : '';
}

export function todayDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isMilestoneIncomplete(milestone: MilestoneAlertInput): boolean {
  return Number(milestone.IsCompleted || 0) !== 1;
}

/** Alert when assigned to the user, incomplete, and due today or earlier. */
export function shouldAlertAssignedMilestone(
  milestone: MilestoneAlertInput,
  userId: number,
  today: string = todayDateKey()
): boolean {
  if (!userId || Number(milestone.AssignedTo || 0) !== Number(userId)) return false;
  if (!isMilestoneIncomplete(milestone)) return false;
  const due = normalizeMilestoneDueDate(milestone.DueDate);
  if (!due) return false;
  return due <= today;
}

export function classifyMilestoneAlert(
  milestone: MilestoneAlertInput,
  today: string = todayDateKey()
): 'dueToday' | 'overdue' | null {
  if (!isMilestoneIncomplete(milestone)) return null;
  const due = normalizeMilestoneDueDate(milestone.DueDate);
  if (!due) return null;
  if (due === today) return 'dueToday';
  if (due < today) return 'overdue';
  return null;
}
