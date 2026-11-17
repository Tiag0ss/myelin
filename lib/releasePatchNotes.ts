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
  /** Org-configured task type name — used as section heading when grouping by type */
  TaskTypeName?: string | null;
  /** Ticket / board key for display, e.g. PROJ-12 or #41 */
  issueKey?: string | null;
  /** When set, the key is rendered as an HTML link in generated patch notes */
  issueUrl?: string | null;
};

export type PatchNoteIssueRefInput = {
  issueKey?: string | null;
  issueUrl?: string | null;
  JiraIssueKey?: string | null;
  ExternalIssueId?: string | null;
  TicketId?: string | number | null;
  TicketNumber?: string | number | null;
  /** Jira issue/site base (used for JiraIssueKey). */
  JiraUrl?: string | null;
  /** Jira board/projects base (preferred for ExternalIssueId). */
  JiraProjectsUrl?: string | null;
  GitHubIssueNumber?: string | number | null;
  GiteaIssueNumber?: string | number | null;
};

export type PatchNoteIssueRef = {
  key: string;
  url: string | null;
  source: 'jira' | 'external' | 'ticket' | 'github' | 'gitea' | 'direct';
};

function normalizeJiraBase(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .replace(/\/$/, '');
}

function jiraBrowseUrl(base: string, key: string): string | null {
  if (!base || !key) return null;
  return `${base}/browse/${encodeURIComponent(key)}`;
}

/**
 * Resolve display key + matching URL together so board/Jira keys never link to
 * internal tickets (and vice versa).
 * Priority: JiraIssueKey → ExternalIssueId → internal ticket → GitHub → Gitea →
 * precomputed issueKey/issueUrl (last, so stale mismatched pairs cannot win).
 */
export function resolvePatchNoteIssueRef(input: PatchNoteIssueRefInput): PatchNoteIssueRef | null {
  const jiraKey = String(input.JiraIssueKey || '').trim();
  if (jiraKey) {
    const base = normalizeJiraBase(input.JiraUrl) || normalizeJiraBase(input.JiraProjectsUrl);
    return {
      key: jiraKey,
      url: jiraBrowseUrl(base, jiraKey),
      source: 'jira',
    };
  }

  const externalKey = String(input.ExternalIssueId || '').trim();
  if (externalKey) {
    const base =
      normalizeJiraBase(input.JiraProjectsUrl) || normalizeJiraBase(input.JiraUrl);
    return {
      key: externalKey,
      url: jiraBrowseUrl(base, externalKey),
      source: 'external',
    };
  }

  const ticketId = Number(input.TicketId);
  const ticketNumber = input.TicketNumber;
  const hasTicketNumber =
    ticketNumber !== null && ticketNumber !== undefined && String(ticketNumber).trim() !== '';
  if ((Number.isFinite(ticketId) && ticketId > 0) || hasTicketNumber) {
    const n = hasTicketNumber
      ? String(ticketNumber).trim().replace(/^#/, '')
      : String(ticketId);
    return {
      key: `#${n}`,
      url: Number.isFinite(ticketId) && ticketId > 0 ? `/tickets/${ticketId}` : null,
      source: 'ticket',
    };
  }

  const gh = input.GitHubIssueNumber;
  if (gh !== null && gh !== undefined && String(gh).trim() !== '') {
    const n = String(gh).trim().replace(/^#/, '');
    if (n) return { key: `#${n}`, url: null, source: 'github' };
  }

  const gitea = input.GiteaIssueNumber;
  if (gitea !== null && gitea !== undefined && String(gitea).trim() !== '') {
    const n = String(gitea).trim().replace(/^#/, '');
    if (n) return { key: `#${n}`, url: null, source: 'gitea' };
  }

  const directKey = String(input.issueKey || '').trim();
  const directUrl = String(input.issueUrl || '').trim();
  if (directKey) {
    return { key: directKey, url: directUrl || null, source: 'direct' };
  }

  return null;
}

/** Prefer Jira → External → #TicketNumber → #GitHub/#Gitea. */
export function resolvePatchNoteIssueKey(input: PatchNoteIssueRefInput): string | null {
  return resolvePatchNoteIssueRef(input)?.key ?? null;
}

/** `[KEY] Task name` when a key exists; otherwise the task name alone. */
export function formatPatchNoteTaskLabel(task: PatchNoteTaskInput & PatchNoteIssueRefInput): string {
  const name = String(task.TaskName || '').trim();
  const key = resolvePatchNoteIssueKey(task);
  if (key && name) return `[${key}] ${name}`;
  if (key) return `[${key}]`;
  return name;
}

/** Safe HTML for one task bullet (linked key when a matching issue URL is present). */
export function formatPatchNoteTaskBulletHtml(task: PatchNoteTaskInput & PatchNoteIssueRefInput): string {
  const name = escapeHtml(String(task.TaskName || '').trim());
  const ref = resolvePatchNoteIssueRef(task);
  const key = ref?.key ?? null;
  const rawUrl = String(ref?.url || '').trim();
  const href = rawUrl && /^(https?:\/\/|mailto:|tel:|\/)/i.test(rawUrl) ? rawUrl : '';

  if (key && href) {
    const keyHtml = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">[${escapeHtml(key)}]</a>`;
    return name ? `${keyHtml} ${name}` : keyHtml;
  }
  if (key && name) return `[${escapeHtml(key)}] ${name}`;
  if (key) return `[${escapeHtml(key)}]`;
  return name;
}

/** URL matching the same source as {@link resolvePatchNoteIssueKey}. */
export function resolvePatchNoteIssueUrl(input: PatchNoteIssueRefInput): string | null {
  return resolvePatchNoteIssueRef(input)?.url ?? null;
}

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

/** Items are already escaped / trusted HTML fragments (e.g. with &lt;a&gt;). */
function bulletListHtml(items: string[]): string {
  if (items.length === 0) return '';
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

/**
 * Build patch notes HTML from selected tasks and commits.
 * - One bullet per selected task.
 * - When `groupByTaskType` is true (default when any task has TaskTypeName),
 *   group under the org-configured task type names (not hardcoded categories).
 * - Otherwise group by project when multiple projects.
 * - Commits that reference any selected task id are skipped (task name wins).
 * - Orphan commits (no selected-task overlap) contribute their cleaned subject.
 */
export function buildPatchNotesFromTasksAndCommits(options: {
  tasks: PatchNoteTaskInput[];
  commits: PatchNoteCommitInput[];
  generalProjectLabel?: string;
  /** Section title for tasks without a type / orphan commits. */
  untypedLabel?: string;
  /** Group by org TaskTypeName. Default: true when any task has a type. */
  groupByTaskType?: boolean;
  /** @deprecated Use groupByTaskType */
  groupByChangeType?: boolean;
}): string {
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const commits = Array.isArray(options.commits) ? options.commits : [];
  const generalLabel = options.generalProjectLabel || 'General';
  const untypedLabel =
    String(options.untypedLabel || '').trim() || 'Other changes';
  const hasAnyTaskType = tasks.some((t) => String(t.TaskTypeName || '').trim().length > 0);
  const groupByTaskType =
    options.groupByTaskType !== undefined
      ? options.groupByTaskType
      : options.groupByChangeType !== undefined
        ? options.groupByChangeType
        : hasAnyTaskType;

  const selectedTaskIds = new Set(
    tasks.map((t) => Number(t.Id)).filter((id) => Number.isFinite(id) && id > 0)
  );

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

  const hasOrphans = orphanSubjects.length > 0;

  if (groupByTaskType) {
    const byType = new Map<string, string[]>();
    const typeOrder: string[] = [];

    const ensureType = (typeName: string) => {
      if (!byType.has(typeName)) {
        byType.set(typeName, []);
        typeOrder.push(typeName);
      }
    };

    for (const task of tasks) {
      const label = formatPatchNoteTaskBulletHtml(task);
      if (!label) continue;
      const typeName = String(task.TaskTypeName || '').trim() || untypedLabel;
      ensureType(typeName);
      byType.get(typeName)!.push(label);
    }

    if (hasOrphans) {
      ensureType(untypedLabel);
      for (const subject of orphanSubjects) {
        byType.get(untypedLabel)!.push(escapeHtml(subject));
      }
    }

    const nonEmptyTypes = typeOrder.filter((typeName) => (byType.get(typeName) || []).length > 0);
    if (nonEmptyTypes.length === 0) return '';

    // Stable: configured types in first-seen order, then untyped last if present mid-list.
    const sortedTypes = [...nonEmptyTypes].sort((a, b) => {
      if (a === untypedLabel && b !== untypedLabel) return 1;
      if (b === untypedLabel && a !== untypedLabel) return -1;
      return 0; // keep first-seen order among real types
    });

    let html = '';
    for (const typeName of sortedTypes) {
      html += `<p><strong>${escapeHtml(typeName)}</strong></p>`;
      html += bulletListHtml(byType.get(typeName) || []);
    }
    return html;
  }

  const byProject: Record<string, string[]> = {};
  for (const task of tasks) {
    const proj = String(task.ProjectName || '').trim() || generalLabel;
    if (!byProject[proj]) byProject[proj] = [];
    const label = formatPatchNoteTaskBulletHtml(task);
    if (label) byProject[proj].push(label);
  }

  const projects = Object.keys(byProject).filter((p) => (byProject[p] || []).length > 0);
  const hasTasks = projects.length > 0;

  if (!hasTasks && !hasOrphans) return '';

  let html = '';

  if (hasTasks) {
    if (projects.length === 1) {
      html += bulletListHtml(byProject[projects[0]]);
    } else {
      for (const proj of projects.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
        html += `<p><strong>${escapeHtml(proj)}</strong></p>`;
        html += bulletListHtml(byProject[proj]);
      }
    }
  }

  if (hasOrphans) {
    if (hasTasks) {
      html += `<p><strong>${escapeHtml(untypedLabel)}</strong></p>`;
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

function stripTags(value: string): string {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Re-apply issue/ticket `<a href>` links from original HTML onto improved HTML
 * when the model dropped anchors but kept the same visible link text (e.g. `[PROJ-12]`).
 */
export function reapplyPatchNoteIssueLinks(originalHtml: string, improvedHtml: string): string {
  const original = String(originalHtml || '');
  let improved = String(improvedHtml || '');
  if (!original || !improved) return improved;

  const linkRe = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const links: Array<{ href: string; text: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(original)) !== null) {
    const href = String(match[2] || '').trim();
    const text = stripTags(match[3] || '');
    if (!href || !text) continue;
    if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(href)) continue;
    links.push({ href, text });
  }

  if (links.length === 0) return improved;

  const presentHrefs = new Set<string>();
  const presentHrefRe = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;
  while ((match = presentHrefRe.exec(improved)) !== null) {
    presentHrefs.add(String(match[2] || '').trim().toLowerCase());
  }

  for (const link of links) {
    if (presentHrefs.has(link.href.toLowerCase())) continue;

    const escapedText = link.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const textRe = new RegExp(escapedText, 'i');
    const found = textRe.exec(improved);
    if (!found || found.index == null) continue;

    // Skip if this match sits inside an existing <a>...</a>
    const before = improved.slice(0, found.index);
    const lastOpen = before.toLowerCase().lastIndexOf('<a');
    const lastClose = before.toLowerCase().lastIndexOf('</a>');
    if (lastOpen > lastClose) continue;

    const anchor = `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.text)}</a>`;
    improved =
      improved.slice(0, found.index) + anchor + improved.slice(found.index + found[0].length);
    presentHrefs.add(link.href.toLowerCase());
  }

  return improved;
}
