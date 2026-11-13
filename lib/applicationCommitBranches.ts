/** Sentinel for “all branches” in application commit UIs (must not be sent as `branch=`). */
export const ALL_BRANCHES_VALUE = '__all__';

export type RemoteBranchOption = {
  name: string;
  isDefault?: boolean;
};

/** Unique trimmed tip-branch labels for a commit. */
export function tipBranchLabels(branches?: string[] | null): string[] {
  return Array.from(
    new Set((branches || []).map((name) => String(name || '').trim()).filter(Boolean))
  );
}

export function buildBranchSelectOptions(
  branches: RemoteBranchOption[],
  allLabel: string
): Array<{ value: string; label: string }> {
  return [
    { value: ALL_BRANCHES_VALUE, label: allLabel },
    ...branches.map((branch) => ({
      value: branch.name,
      label: branch.isDefault ? `${branch.name} (default)` : branch.name,
    })),
  ];
}

export function isAllBranchesFilter(value: string | null | undefined): boolean {
  const selected = String(value || '').trim() || ALL_BRANCHES_VALUE;
  return (
    selected === ALL_BRANCHES_VALUE ||
    selected === '*' ||
    selected.toLowerCase() === 'all'
  );
}

export function commitPickerBranchLabels(
  commit: {
    branches?: string[] | null;
    memberBranches?: string[] | null;
  },
  branchFilter: string
): string[] {
  if (!isAllBranchesFilter(branchFilter)) {
    return tipBranchLabels([
      branchFilter,
      ...(commit.memberBranches || []),
      ...(commit.branches || []),
    ]);
  }
  const members = tipBranchLabels(commit.memberBranches);
  if (members.length > 0) return members;
  return tipBranchLabels(commit.branches);
}

export function commitMatchesTextSearch(
  commit: {
    sha: string;
    message: string;
    author?: string | null;
    branches?: string[] | null;
    memberBranches?: string[] | null;
  },
  query: string,
  branchFilter: string = ALL_BRANCHES_VALUE
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (commit.sha.toLowerCase().includes(q)) return true;
  if ((commit.message || '').toLowerCase().includes(q)) return true;
  if ((commit.author || '').toLowerCase().includes(q)) return true;
  return commitPickerBranchLabels(commit, branchFilter).some((branch) =>
    branch.toLowerCase().includes(q)
  );
}
