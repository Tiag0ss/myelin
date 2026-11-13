import {
  ALL_BRANCHES_VALUE,
  buildBranchSelectOptions,
  commitMatchesTextSearch,
  commitPickerBranchLabels,
  isAllBranchesFilter,
  tipBranchLabels,
} from '../../lib/applicationCommitBranches';

describe('applicationCommitBranches', () => {
  it('builds branch select options with All branches first and default labels', () => {
    expect(
      buildBranchSelectOptions(
        [
          { name: 'main', isDefault: true },
          { name: 'feature/x' },
        ],
        'All branches'
      )
    ).toEqual([
      { value: ALL_BRANCHES_VALUE, label: 'All branches' },
      { value: 'main', label: 'main (default)' },
      { value: 'feature/x', label: 'feature/x' },
    ]);
  });

  it('treats sentinel and aliases as all-branches filter', () => {
    expect(isAllBranchesFilter(ALL_BRANCHES_VALUE)).toBe(true);
    expect(isAllBranchesFilter('all')).toBe(true);
    expect(isAllBranchesFilter('*')).toBe(true);
    expect(isAllBranchesFilter('')).toBe(true);
    expect(isAllBranchesFilter('main')).toBe(false);
  });

  it('dedupes tip branch labels', () => {
    expect(tipBranchLabels([' main ', 'main', '', 'develop'])).toEqual(['main', 'develop']);
  });

  it('matches text search against sha, message, author, and branch tips', () => {
    const commit = {
      sha: 'abcdef123',
      message: 'Fix login timeout',
      author: 'Ada',
      branches: ['release/1.2'],
    };
    expect(commitMatchesTextSearch(commit, '')).toBe(true);
    expect(commitMatchesTextSearch(commit, 'abcdef')).toBe(true);
    expect(commitMatchesTextSearch(commit, 'timeout')).toBe(true);
    expect(commitMatchesTextSearch(commit, 'ada')).toBe(true);
    expect(commitMatchesTextSearch(commit, 'release/1')).toBe(true);
    expect(commitMatchesTextSearch(commit, 'missing')).toBe(false);
  });

  it('shows membership branches on every commit, and the active filter when scoped', () => {
    const commit = {
      branches: [],
      memberBranches: ['main', 'develop'],
    };
    expect(commitPickerBranchLabels(commit, ALL_BRANCHES_VALUE)).toEqual(['main', 'develop']);
    expect(commitPickerBranchLabels(commit, 'release/1.2')).toEqual([
      'release/1.2',
      'main',
      'develop',
    ]);
    expect(commitPickerBranchLabels({ branches: ['tip-only'] }, ALL_BRANCHES_VALUE)).toEqual([
      'tip-only',
    ]);
  });
});
