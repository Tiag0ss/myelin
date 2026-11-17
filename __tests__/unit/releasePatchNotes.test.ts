import {
  buildPatchNotesFromTasksAndCommits,
  extractTaskIdsFromCommitMessage,
  formatPatchNoteTaskBulletHtml,
  formatPatchNoteTaskLabel,
  normalizeCommitSha,
  reapplyPatchNoteIssueLinks,
  resolvePatchNoteIssueKey,
  resolvePatchNoteIssueRef,
  resolvePatchNoteIssueUrl,
  stripTaskRefsFromCommitSubject,
  suggestCommitShasFromTasks,
  suggestTaskIdsFromCommits,
} from '../../lib/releasePatchNotes';

describe('extractTaskIdsFromCommitMessage', () => {
  it('extracts unique Task # ids', () => {
    expect(extractTaskIdsFromCommitMessage('Task #12 - Fix login\nAlso Task #12 and Task 34')).toEqual([
      12, 34,
    ]);
  });
});

describe('stripTaskRefsFromCommitSubject', () => {
  it('strips leading Task #N - prefix', () => {
    expect(stripTaskRefsFromCommitSubject('Task #12 - Fix login')).toBe('Fix login');
  });

  it('keeps subject when no task prefix', () => {
    expect(stripTaskRefsFromCommitSubject('Bump deps')).toBe('Bump deps');
  });
});

describe('resolvePatchNoteIssueKey / formatPatchNoteTaskLabel', () => {
  it('prefers Jira over ticket number', () => {
    expect(
      resolvePatchNoteIssueKey({
        JiraIssueKey: 'PROJ-12',
        TicketNumber: 41,
      })
    ).toBe('PROJ-12');
  });

  it('formats ticket number as #N', () => {
    expect(resolvePatchNoteIssueKey({ TicketNumber: 41 })).toBe('#41');
    expect(formatPatchNoteTaskLabel({ Id: 1, TaskName: 'Fix login', issueKey: '#41' })).toBe(
      '[#41] Fix login'
    );
  });

  it('returns task name only when no key', () => {
    expect(formatPatchNoteTaskLabel({ Id: 1, TaskName: 'Fix login' })).toBe('Fix login');
  });
});

describe('resolvePatchNoteIssueRef (paired key + url)', () => {
  it('links Jira key to Jira browse even when TicketId is set', () => {
    expect(
      resolvePatchNoteIssueRef({
        JiraIssueKey: 'PROJ-12',
        TicketId: 41,
        TicketNumber: 99,
        JiraUrl: 'https://jira.example',
      })
    ).toEqual({
      key: 'PROJ-12',
      url: 'https://jira.example/browse/PROJ-12',
      source: 'jira',
    });
  });

  it('links ExternalIssueId to board base (JiraProjectsUrl)', () => {
    expect(
      resolvePatchNoteIssueRef({
        ExternalIssueId: 'BOARD-7',
        TicketId: 41,
        JiraUrl: 'https://tickets.example',
        JiraProjectsUrl: 'https://board.example',
      })
    ).toEqual({
      key: 'BOARD-7',
      url: 'https://board.example/browse/BOARD-7',
      source: 'external',
    });
  });

  it('links internal ticket to /tickets/:id', () => {
    expect(
      resolvePatchNoteIssueRef({
        TicketId: 41,
        TicketNumber: 99,
      })
    ).toEqual({
      key: '#99',
      url: '/tickets/41',
      source: 'ticket',
    });
  });

  it('does not prefer a stale issueUrl over raw Jira fields', () => {
    expect(
      resolvePatchNoteIssueUrl({
        issueKey: 'PROJ-12',
        issueUrl: '/tickets/41',
        JiraIssueKey: 'PROJ-12',
        TicketId: 41,
        JiraUrl: 'https://jira.example',
      })
    ).toBe('https://jira.example/browse/PROJ-12');
  });
});

describe('reapplyPatchNoteIssueLinks', () => {
  it('restores dropped anchors when link text remains', () => {
    const original =
      '<ul><li><a href="https://jira.example/browse/PROJ-12" target="_blank" rel="noopener noreferrer">[PROJ-12]</a> Fix login</li></ul>';
    const improved = '<ul><li>[PROJ-12] Fix authentication flow</li></ul>';
    const result = reapplyPatchNoteIssueLinks(original, improved);
    expect(result).toContain('href="https://jira.example/browse/PROJ-12"');
    expect(result).toContain('[PROJ-12]</a> Fix authentication flow');
  });

  it('does not duplicate when href already present', () => {
    const original =
      '<ul><li><a href="https://jira.example/browse/PROJ-12">[PROJ-12]</a> Fix login</li></ul>';
    const improved =
      '<ul><li><a href="https://jira.example/browse/PROJ-12">[PROJ-12]</a> Fix login better</li></ul>';
    expect(reapplyPatchNoteIssueLinks(original, improved)).toBe(improved);
  });
});

describe('buildPatchNotesFromTasksAndCommits', () => {
  it('returns empty string when both are empty', () => {
    expect(buildPatchNotesFromTasksAndCommits({ tasks: [], commits: [] })).toBe('');
  });

  it('prefixes task bullets with issue key when present', () => {
    const html = buildPatchNotesFromTasksAndCommits({
      tasks: [{ Id: 12, TaskName: 'Fix login', ProjectName: 'App', issueKey: 'PROJ-12' }],
      commits: [],
    });
    expect(html).toContain('<li>[PROJ-12] Fix login</li>');
  });

  it('wraps issue key in an anchor when issueUrl is present', () => {
    expect(
      formatPatchNoteTaskBulletHtml({
        Id: 12,
        TaskName: 'Fix login',
        issueKey: 'PROJ-12',
        issueUrl: 'https://jira.example/browse/PROJ-12',
      })
    ).toContain(
      '<a href="https://jira.example/browse/PROJ-12" target="_blank" rel="noopener noreferrer">[PROJ-12]</a> Fix login'
    );

    const html = buildPatchNotesFromTasksAndCommits({
      tasks: [
        {
          Id: 12,
          TaskName: 'Fix login',
          ProjectName: 'App',
          issueKey: 'PROJ-12',
          issueUrl: 'https://jira.example/browse/PROJ-12',
        },
      ],
      commits: [],
    });
    expect(html).toContain('href="https://jira.example/browse/PROJ-12"');
    expect(html).toContain('[PROJ-12]</a> Fix login');
  });

  it('dedupes commit that references a selected task (task name wins)', () => {
    const html = buildPatchNotesFromTasksAndCommits({
      tasks: [{ Id: 12, TaskName: 'Fix login', ProjectName: 'App' }],
      commits: [{ sha: 'abc1234', message: 'Task #12 - Fix login' }],
    });

    expect(html).toContain('<li>Fix login</li>');
    expect(html).not.toContain('Other changes');
    expect(html.match(/<li>/g)?.length).toBe(1);
  });

  it('includes orphan commits without task id', () => {
    const html = buildPatchNotesFromTasksAndCommits({
      tasks: [],
      commits: [{ sha: 'def5678', message: 'Hotfix production config' }],
    });

    expect(html).toContain('<li>Hotfix production config</li>');
    expect(html).not.toContain('Other changes');
  });

  it('includes commit referencing a task not in selection as orphan subject', () => {
    const html = buildPatchNotesFromTasksAndCommits({
      tasks: [{ Id: 1, TaskName: 'Selected task', ProjectName: 'App' }],
      commits: [{ sha: 'aaa1111', message: 'Task #99 - Unlinked work' }],
    });

    expect(html).toContain('<li>Selected task</li>');
    expect(html).toContain('Other changes');
    expect(html).toContain('<li>Unlinked work</li>');
  });

  it('groups tasks by project when multiple projects', () => {
    const html = buildPatchNotesFromTasksAndCommits({
      tasks: [
        { Id: 1, TaskName: 'Alpha', ProjectName: 'Proj B' },
        { Id: 2, TaskName: 'Beta', ProjectName: 'Proj A' },
      ],
      commits: [],
      groupByTaskType: false,
    });

    expect(html).toContain('<p><strong>Proj A</strong></p>');
    expect(html).toContain('<p><strong>Proj B</strong></p>');
    expect(html.indexOf('Proj A')).toBeLessThan(html.indexOf('Proj B'));
  });

  it('groups by org-configured TaskTypeName when present', () => {
    const html = buildPatchNotesFromTasksAndCommits({
      tasks: [
        { Id: 1, TaskName: 'New dashboard', ProjectName: 'App', TaskTypeName: 'Nova Funcionalidade' },
        { Id: 2, TaskName: 'Tweak copy', ProjectName: 'App', TaskTypeName: 'Melhoria' },
        { Id: 3, TaskName: 'Fix crash', ProjectName: 'App', TaskTypeName: 'Defeito' },
        { Id: 4, TaskName: 'No type task', ProjectName: 'App' },
      ],
      commits: [{ sha: 'abc', message: 'Misc tooling' }],
      untypedLabel: 'Outros',
    });

    expect(html).toContain('<p><strong>Nova Funcionalidade</strong></p>');
    expect(html).toContain('<p><strong>Melhoria</strong></p>');
    expect(html).toContain('<p><strong>Defeito</strong></p>');
    expect(html).toContain('<p><strong>Outros</strong></p>');
    expect(html).not.toContain('<p><strong>Added</strong></p>');
    expect(html).not.toContain('<p><strong>Fixed</strong></p>');
    expect(html).toContain('New dashboard');
    expect(html).toContain('Fix crash');
    expect(html).toContain('No type task');
    expect(html).toContain('Misc tooling');
  });
});

describe('suggestTaskIdsFromCommits', () => {
  it('suggests available task ids from commits excluding already selected', () => {
    const suggested = suggestTaskIdsFromCommits(
      [
        { sha: 'a', message: 'Task #10 - one' },
        { sha: 'b', message: 'Task #20 and Task #10' },
        { sha: 'c', message: 'Task #99 - missing' },
      ],
      [10, 20, 30],
      [10]
    );
    expect(suggested).toEqual([20]);
  });
});

describe('suggestCommitShasFromTasks', () => {
  it('suggests commits that reference selected tasks', () => {
    const suggested = suggestCommitShasFromTasks(
      [
        { sha: 'aaa', message: 'Task #5 - work' },
        { sha: 'bbb', message: 'no task' },
        { sha: 'ccc', message: 'Task #5 again' },
      ],
      [5],
      ['aaa']
    );
    expect(suggested).toEqual(['ccc']);
  });
});

describe('normalizeCommitSha', () => {
  it('accepts hex shas of length 7–64', () => {
    expect(normalizeCommitSha('Abc1234')).toBe('abc1234');
    expect(normalizeCommitSha('not-a-sha')).toBeNull();
    expect(normalizeCommitSha('abc')).toBeNull();
  });
});
