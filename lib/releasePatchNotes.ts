/** Collect unique Task #N references from a commit message. */
export function extractTaskIdsFromCommitMessage(message: string): number[] {
  const ids = new Set<number>();
  const re = /\bTask\s*#?\s*(\d+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(message || '')) !== null) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return Array.from(ids);
}

export type PatchNoteTaskInput = {
  Id: number;
  TaskName: string;
  ProjectName?: string | null;
};

export type PatchNoteCommitInput = {
  sha: string;
  message: string;
};

/**
 * Strip leading `Task #N` / `Task #N -` prefixes from a commit subject for display.
 */
export function stripTaskRefsFromCommitSubject(message: string): string {
  const subject = String(message || '')
    .split(/\r?\n/)[0]
    .trim();
  if (!subject) return '';

  let cleaned = subject;
  // Remove one or more leading Task #N (-|:) prefixes
  cleaned = cleaned.replace(/^(?:Task\s*#?\s*\d+\s*[-–—:]\s*)+/i, '').trim();
  cleaned = cleaned.replace(/^(?:Task\s*#?\s*\d+\s*)+/i, '').trim();
  return cleaned || subject;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bulletList(items: string[]): string {
  if (items.length === 0) return '';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

/**
 * Build patch notes HTML from selected tasks and commits.
 * - One bullet per selected task (grouped by project when multiple projects).
 * - Commits that reference any selected task id are skipped (task name wins).
 * - Orphan commits (no selected-task overlap) contribute their cleaned subject.
 */
export function buildPatchNotesFromTasksAndCommits(options: {
  tasks: PatchNoteTaskInput[];
  commits: PatchNoteCommitInput[];
  generalProjectLabel?: string;
}): string {
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const commits = Array.isArray(options.commits) ? options.commits : [];
  const generalLabel = options.generalProjectLabel || 'General';

  const selectedTaskIds = new Set(
    tasks.map((t) => Number(t.Id)).filter((id) => Number.isFinite(id) && id > 0)
  );

  const byProject: Record<string, string[]> = {};
  for (const task of tasks) {
    const proj = String(task.ProjectName || '').trim() || generalLabel;
    if (!byProject[proj]) byProject[proj] = [];
    const name = String(task.TaskName || '').trim();
    if (name) byProject[proj].push(name);
  }

  const orphanSubjects: string[] = [];
  const seenSubjects = new Set<string>();
  for (const commit of commits) {
    const message = String(commit.message || '');
    const referencedIds = extractTaskIdsFromCommitMessage(message);
    const overlapsSelected = referencedIds.some((id) => selectedTaskIds.has(id));
    if (overlapsSelected) continue;

    const subject = stripTaskRefsFromCommitSubject(message);
    if (!subject) continue;
    const key = subject.toLowerCase();
    if (seenSubjects.has(key)) continue;
    seenSubjects.add(key);
    orphanSubjects.push(subject);
  }

  const projects = Object.keys(byProject).filter((p) => (byProject[p] || []).length > 0);
  const hasTasks = projects.length > 0;
  const hasOrphans = orphanSubjects.length > 0;

  if (!hasTasks && !hasOrphans) return '';

  let html = '';

  if (hasTasks) {
    if (projects.length === 1) {
      html += bulletList(byProject[projects[0]]);
    } else {
      for (const proj of projects.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
        html += `<p><strong>${escapeHtml(proj)}</strong></p>`;
        html += bulletList(byProject[proj]);
      }
    }
  }

  if (hasOrphans) {
    if (hasTasks) {
      html += `<p><strong>Other changes</strong></p>`;
    }
    html += bulletList(orphanSubjects);
  }

  return html;
}

/**
 * Task ids mentioned in commits that are present in availableTaskIds and not already selected.
 */
export function suggestTaskIdsFromCommits(
  commits: PatchNoteCommitInput[],
  availableTaskIds: number[],
  alreadySelectedTaskIds: number[] = []
): number[] {
  const available = new Set(
    availableTaskIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  );
  const selected = new Set(
    alreadySelectedTaskIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  );
  const suggested = new Set<number>();

  for (const commit of commits || []) {
    for (const id of extractTaskIdsFromCommitMessage(commit.message || '')) {
      if (available.has(id) && !selected.has(id)) {
        suggested.add(id);
      }
    }
  }

  return Array.from(suggested).sort((a, b) => a - b);
}

/**
 * Commit SHAs whose messages reference any of the given task ids, excluding already selected SHAs.
 */
export function suggestCommitShasFromTasks(
  commits: PatchNoteCommitInput[],
  taskIds: number[],
  alreadySelectedShas: string[] = []
): string[] {
  const taskIdSet = new Set(
    taskIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  );
  if (taskIdSet.size === 0) return [];

  const selectedShas = new Set(
    alreadySelectedShas.map((s) => String(s || '').toLowerCase()).filter(Boolean)
  );
  const suggested: string[] = [];

  for (const commit of commits || []) {
    const sha = String(commit.sha || '');
    if (!sha) continue;
    if (selectedShas.has(sha.toLowerCase())) continue;
    const refs = extractTaskIdsFromCommitMessage(commit.message || '');
    if (refs.some((id) => taskIdSet.has(id))) {
      suggested.push(sha);
      selectedShas.add(sha.toLowerCase());
    }
  }

  return suggested;
}

/** Normalize a git SHA for storage (40 hex preferred; allow abbreviated 7–64). */
export function normalizeCommitSha(raw: unknown): string | null {
  const sha = String(raw || '')
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{7,64}$/.test(sha)) return null;
  return sha;
}
