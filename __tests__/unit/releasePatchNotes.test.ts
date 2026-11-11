import {
  buildPatchNotesFromTasksAndCommits,
  extractTaskIdsFromCommitMessage,
  normalizeCommitSha,
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

describe('buildPatchNotesFromTasksAndCommits', () => {
  it('returns empty string when both are empty', () => {
    expect(buildPatchNotesFromTasksAndCommits({ tasks: [], commits: [] })).toBe('');
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
    });

    expect(html).toContain('<p><strong>Proj A</strong></p>');
    expect(html).toContain('<p><strong>Proj B</strong></p>');
    expect(html.indexOf('Proj A')).toBeLessThan(html.indexOf('Proj B'));
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
