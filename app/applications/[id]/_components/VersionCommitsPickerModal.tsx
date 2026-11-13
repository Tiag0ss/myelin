'use client';

import { useEffect, useMemo, useState } from 'react';
import CommitMessage from '@/components/CommitMessage';
import SearchableSelect from '@/components/SearchableSelect';
import { getApiUrl } from '@/lib/api/config';
import {
  ALL_BRANCHES_VALUE,
  buildBranchSelectOptions,
  commitMatchesTextSearch,
  commitPickerBranchLabels,
  isAllBranchesFilter,
  type RemoteBranchOption,
} from '@/lib/applicationCommitBranches';
import { useI18n } from '@/lib/i18n/provider';
import { suggestCommitShasFromTasks } from '@/lib/releasePatchNotes';

export type VersionPickerCommit = {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  parents?: string[];
  branches?: string[];
  memberBranches?: string[];
};

const PAGE_SIZE = 25;

type VersionCommitsPickerModalProps = {
  isOpen: boolean;
  applicationId: string | number;
  token: string;
  hasRepositoryUrl: boolean;
  initiallySelected: VersionPickerCommit[];
  selectedTaskIds?: number[];
  onClose: () => void;
  onConfirm: (commits: VersionPickerCommit[]) => void;
};

export default function VersionCommitsPickerModal({
  isOpen,
  applicationId,
  token,
  hasRepositoryUrl,
  initiallySelected,
  selectedTaskIds = [],
  onClose,
  onConfirm,
}: VersionCommitsPickerModalProps) {
  const { t } = useI18n();
  const [pool, setPool] = useState<VersionPickerCommit[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES_VALUE);
  const [branches, setBranches] = useState<RemoteBranchOption[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [draftBySha, setDraftBySha] = useState<Map<string, VersionPickerCommit>>(new Map());

  const selectedCount = draftBySha.size;

  const branchOptions = useMemo(
    () => buildBranchSelectOptions(branches, t('lit.allBranches')),
    [branches, t]
  );

  const suggestedShas = useMemo(
    () =>
      suggestCommitShasFromTasks(
        pool,
        selectedTaskIds,
        Array.from(draftBySha.keys())
      ),
    [pool, selectedTaskIds, draftBySha]
  );

  const filteredPool = useMemo(() => {
    return pool.filter((commit) => commitMatchesTextSearch(commit, search, branchFilter));
  }, [pool, search, branchFilter]);

  const loadBranches = async (): Promise<RemoteBranchOption[]> => {
    if (!token || !applicationId || !hasRepositoryUrl) {
      setBranches([]);
      return [];
    }
    setBranchesLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/applications/${applicationId}/branches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || t('lit.failedToLoadBranches'));
      }
      const next = ((data.data?.branches || []) as RemoteBranchOption[]).filter(
        (branch) => typeof branch?.name === 'string' && branch.name.trim()
      );
      setBranches(next);
      return next;
    } catch (err: unknown) {
      setBranches([]);
      setError(err instanceof Error ? err.message : t('lit.failedToLoadBranches'));
      return [];
    } finally {
      setBranchesLoading(false);
    }
  };

  const loadPage = async (nextPage: number, append: boolean, branchOverride?: string) => {
    if (!token || !applicationId || !hasRepositoryUrl) {
      setPool([]);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const selected = (branchOverride ?? branchFilter).trim() || ALL_BRANCHES_VALUE;
      const allBranches = isAllBranchesFilter(selected);
      // Match the Commits tab: omit `branch` for all-branch history.
      // Sending branch=__all__ is treated as a literal branch name and 404s.
      const params = new URLSearchParams({
        page: String(nextPage),
        per_page: String(PAGE_SIZE),
      });
      if (!allBranches) params.set('branch', selected);

      const res = await fetch(`${getApiUrl()}/api/applications/${applicationId}/commits?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || 'Failed to load commits');
      }
      const next = ((data.data?.commits || []) as VersionPickerCommit[]).filter((c) => c?.sha);
      setPool((prev) => {
        if (!append) return next;
        const seen = new Set(prev.map((c) => c.sha.toLowerCase()));
        const merged = [...prev];
        for (const c of next) {
          const key = c.sha.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(c);
          }
        }
        return merged;
      });
      setPage(nextPage);
      setHasMore(Boolean(data.data?.hasMore));
      if (!allBranches && typeof data.data?.branch === 'string' && data.data.branch) {
        setBranchFilter(data.data.branch);
      }
    } catch (err: unknown) {
      if (!append) setPool([]);
      setHasMore(false);
      setError(err instanceof Error ? err.message : 'Failed to load commits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const initial = new Map<string, VersionPickerCommit>();
    for (const c of initiallySelected) {
      if (c?.sha) initial.set(c.sha.toLowerCase(), c);
    }
    setDraftBySha(initial);
    setSearch('');
    setBranchFilter(ALL_BRANCHES_VALUE);
    setPool([]);
    setPage(1);
    setHasMore(false);
    setError('');
    void (async () => {
      await loadBranches();
      await loadPage(1, false, ALL_BRANCHES_VALUE);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when modal opens
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBranchChange = (value: string) => {
    const next = value || ALL_BRANCHES_VALUE;
    setBranchFilter(next);
    setSearch('');
    setPool([]);
    setPage(1);
    setHasMore(false);
    void loadPage(1, false, next);
  };

  const toggleCommit = (commit: VersionPickerCommit) => {
    setDraftBySha((prev) => {
      const next = new Map(prev);
      const key = commit.sha.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.set(key, commit);
      return next;
    });
  };

  const applySuggested = () => {
    if (suggestedShas.length === 0) return;
    setDraftBySha((prev) => {
      const next = new Map(prev);
      const want = new Set(suggestedShas.map((s) => s.toLowerCase()));
      for (const c of pool) {
        const key = c.sha.toLowerCase();
        if (want.has(key) && !next.has(key)) next.set(key, c);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(draftBySha.values()));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-commits-picker-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h3
              id="version-commits-picker-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Select commits
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Latest {PAGE_SIZE} commits per page · {selectedCount} selected
              {isAllBranchesFilter(branchFilter) ? '' : ` · ${branchFilter}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {hasRepositoryUrl && (
          <div className="space-y-3 border-b border-gray-200 px-5 py-3 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[12rem] w-56">
                <SearchableSelect
                  value={branchFilter || ALL_BRANCHES_VALUE}
                  onChange={handleBranchChange}
                  options={branchOptions}
                  placeholder={branchesLoading ? 'Loading branches…' : t('lit.allBranches')}
                  emptyText={t('lit.allBranches')}
                  disabled={branchesLoading || loading}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await loadBranches();
                    await loadPage(1, false, branchFilter);
                  })();
                }}
                disabled={loading || branchesLoading}
                className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading || branchesLoading ? 'Loading…' : t('lit.refresh')}
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search commits by message, author, sha, or branch…"
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <svg
                className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!hasRepositoryUrl ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No repository URL configured for this application.
            </p>
          ) : (
            <>
              {suggestedShas.length > 0 && (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-800 dark:bg-sky-900/20">
                  <p className="text-sm text-sky-900 dark:text-sky-200">
                    {suggestedShas.length} commit{suggestedShas.length === 1 ? '' : 's'} match selected
                    tasks
                  </p>
                  <button
                    type="button"
                    onClick={applySuggested}
                    className="h-8 shrink-0 rounded-md bg-sky-600 px-2.5 text-xs font-medium text-white hover:bg-sky-700"
                  >
                    Select suggested
                  </button>
                </div>
              )}

              {error && (
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </p>
              )}

              {(loading || branchesLoading) && pool.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  Loading commits…
                </div>
              ) : filteredPool.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {pool.length === 0 ? 'No commits found' : 'No commits match your search'}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredPool.map((commit) => {
                    const checked = draftBySha.has(commit.sha.toLowerCase());
                    const branchLabels = commitPickerBranchLabels(commit, branchFilter);
                    return (
                      <label
                        key={commit.sha}
                        className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-700/60"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCommit(commit)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                              {commit.sha.slice(0, 7)}
                            </span>
                            {branchLabels.map((branchName) => (
                              <span
                                key={`${commit.sha}-${branchName}`}
                                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                                title={`Branch ${branchName}`}
                              >
                                {branchName}
                              </span>
                            ))}
                            {commit.author && (
                              <span className="truncate text-xs text-gray-400 dark:text-gray-500">
                                {commit.author}
                              </span>
                            )}
                            {commit.date && (
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {new Date(commit.date).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <CommitMessage message={commit.message} showTaskBadges token={token} />
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {hasMore && !search.trim() && (
                <button
                  type="button"
                  onClick={() => void loadPage(page + 1, true)}
                  disabled={loading}
                  className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {loading ? 'Loading…' : `Load next ${PAGE_SIZE} commits`}
                </button>
              )}
              {hasMore && search.trim() && (
                <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                  Search filters loaded commits. Clear search to load more pages.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Add selected ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}
