'use client';

import { useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { useI18n } from '@/lib/i18n/provider';
import {
  resolvePatchNoteIssueRef,
  suggestTaskIdsFromCommits,
} from '@/lib/releasePatchNotes';

export type VersionPickerTask = {
  Id: number;
  TaskName: string;
  ProjectName?: string | null;
  StatusName?: string | null;
  TaskType?: number | null;
  TaskTypeName?: string | null;
  JiraIssueKey?: string | null;
  ExternalIssueId?: string | null;
  TicketId?: number | null;
  TicketNumber?: string | number | null;
  GitHubIssueNumber?: string | number | null;
  GiteaIssueNumber?: string | number | null;
  JiraUrl?: string | null;
  JiraProjectsUrl?: string | null;
  IssueKey?: string | null;
  IssueUrl?: string | null;
  LinkedApplicationName?: string | null;
  LinkedVersionNumber?: string | null;
  ThisAppLinkedVersionId?: number | null;
  ThisAppLinkedVersionNumber?: string | null;
  IsLinkedToOtherApplication?: boolean | number;
  IsLinkedToVersion?: boolean | number;
};

type VersionTasksPickerModalProps = {
  isOpen: boolean;
  applicationId: string | number;
  token: string;
  excludeVersionId?: number | null;
  availableTasks: VersionPickerTask[];
  initiallySelectedIds: number[];
  commitMessages?: Array<{ sha: string; message: string }>;
  onClose: () => void;
  onConfirm: (taskIds: number[], selectedTasks: VersionPickerTask[]) => void;
};

function mapApiTask(task: VersionPickerTask): VersionPickerTask {
  const ref = resolvePatchNoteIssueRef({
    JiraIssueKey: task.JiraIssueKey,
    ExternalIssueId: task.ExternalIssueId,
    TicketId: task.TicketId,
    TicketNumber: task.TicketNumber,
    JiraUrl: task.JiraUrl,
    JiraProjectsUrl: task.JiraProjectsUrl,
    GitHubIssueNumber: task.GitHubIssueNumber,
    GiteaIssueNumber: task.GiteaIssueNumber,
  });
  return {
    ...task,
    Id: Number(task.Id),
    TaskName: String(task.TaskName || ''),
    ProjectName: task.ProjectName ?? null,
    StatusName: task.StatusName ?? null,
    TaskType: task.TaskType ?? null,
    TaskTypeName: task.TaskTypeName ?? null,
    IssueKey: ref?.key ?? null,
    IssueUrl: ref?.url ?? null,
    LinkedApplicationName: task.LinkedApplicationName ?? null,
    LinkedVersionNumber: task.LinkedVersionNumber ?? null,
    ThisAppLinkedVersionId: task.ThisAppLinkedVersionId ?? null,
    ThisAppLinkedVersionNumber: task.ThisAppLinkedVersionNumber ?? null,
    IsLinkedToOtherApplication: Boolean(task.IsLinkedToOtherApplication),
    IsLinkedToVersion: Boolean(
      task.IsLinkedToVersion ||
        task.IsLinkedToOtherApplication ||
        task.ThisAppLinkedVersionId ||
        task.LinkedVersionNumber
    ),
  };
}

export default function VersionTasksPickerModal({
  isOpen,
  applicationId,
  token,
  excludeVersionId = null,
  availableTasks,
  initiallySelectedIds,
  commitMessages = [],
  onClose,
  onConfirm,
}: VersionTasksPickerModalProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [draftIds, setDraftIds] = useState<Set<number>>(new Set());
  const [searchResults, setSearchResults] = useState<VersionPickerTask[] | null>(null);
  const [knownTasksById, setKnownTasksById] = useState<Map<number, VersionPickerTask>>(new Map());
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [includeLinked, setIncludeLinked] = useState(false);
  const [listedDefault, setListedDefault] = useState<VersionPickerTask[]>([]);
  const [loadingDefault, setLoadingDefault] = useState(false);

  const fetchTasks = async (opts: { search?: string; includeLinked: boolean }) => {
    const params = new URLSearchParams();
    if (opts.search?.trim()) params.set('search', opts.search.trim());
    if (opts.includeLinked) params.set('includeLinked', '1');
    if (excludeVersionId && excludeVersionId > 0) {
      params.set('excludeVersion', String(excludeVersionId));
    }
    const res = await fetch(
      `${getApiUrl()}/api/applications/${applicationId}/tasks?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    const tasks = Array.isArray(data.tasks) ? data.tasks.map(mapApiTask) : [];
    return tasks as VersionPickerTask[];
  };

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setSearchResults(null);
    setSearchError('');
    setIsSearching(false);
    setIncludeLinked(false);
    const initial = new Map<number, VersionPickerTask>();
    for (const task of availableTasks) {
      const mapped = mapApiTask(task);
      initial.set(mapped.Id, mapped);
    }
    setKnownTasksById(initial);
    setListedDefault(availableTasks.map(mapApiTask));
    setDraftIds(
      new Set(
        initiallySelectedIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setKnownTasksById((prev) => {
      const next = new Map(prev);
      for (const task of availableTasks) {
        const mapped = mapApiTask(task);
        next.set(mapped.Id, mapped);
      }
      return next;
    });
  }, [isOpen, availableTasks]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const load = async () => {
      setLoadingDefault(true);
      try {
        const tasks = await fetchTasks({ includeLinked });
        if (cancelled) return;
        setListedDefault(tasks);
        setKnownTasksById((prev) => {
          const next = new Map(prev);
          for (const task of tasks) next.set(task.Id, task);
          return next;
        });
      } catch {
        if (!cancelled && includeLinked) {
          setSearchError(t('lit.failedToLoadTasks') || 'Failed to load tasks');
        }
      } finally {
        if (!cancelled) setLoadingDefault(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, includeLinked, applicationId, token, excludeVersionId]);

  useEffect(() => {
    if (!isOpen) return;

    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      setSearchError('');
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');
      try {
        const mapped = await fetchTasks({ search: q, includeLinked });
        if (cancelled) return;
        setSearchResults(mapped);
        setKnownTasksById((prev) => {
          const next = new Map(prev);
          for (const task of mapped) next.set(task.Id, task);
          return next;
        });
      } catch {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(t('lit.failedToSearchTasks') || 'Failed to search tasks');
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, search, applicationId, token, excludeVersionId, includeLinked]);

  const listedTasks = search.trim() ? searchResults ?? [] : listedDefault;

  const suggestedIds = useMemo(
    () =>
      suggestTaskIdsFromCommits(
        commitMessages,
        listedTasks.map((task) => task.Id),
        Array.from(draftIds)
      ),
    [commitMessages, listedTasks, draftIds]
  );

  if (!isOpen) return null;

  const toggleTask = (taskId: number) => {
    setDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const applySuggested = () => {
    if (suggestedIds.length === 0) return;
    setDraftIds((prev) => {
      const next = new Set(prev);
      for (const id of suggestedIds) next.add(id);
      return next;
    });
  };

  const attemptConfirm = () => {
    const taskIds = Array.from(draftIds);
    const selectedTasks = taskIds
      .map((id) => knownTasksById.get(id))
      .filter((task): task is VersionPickerTask => Boolean(task));
    onConfirm(taskIds, selectedTasks);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-tasks-picker-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h3
              id="version-tasks-picker-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              {t('lit.selectTasks') || 'Select tasks'}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {search.trim()
                ? `${isSearching ? 'Searching…' : `${listedTasks.length} match${listedTasks.length === 1 ? '' : 'es'}`} · ${draftIds.size} selected`
                : `${listedTasks.length} listed · ${draftIds.size} selected`}
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

        <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-700 space-y-3">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('lit.searchOrgTasksPlaceholder') || 'Search all org tasks by name, project, status, or id…'}
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
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeLinked}
              onChange={(e) => setIncludeLinked(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('lit.showTasksAlreadyLinkedToVersions') || 'Show tasks already linked to versions'}
          </label>
          {searchError ? (
            <p className="text-xs text-red-600 dark:text-red-400">{searchError}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {suggestedIds.length > 0 && (
            <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                {suggestedIds.length} task{suggestedIds.length === 1 ? '' : 's'} mentioned in selected
                commits
              </p>
              <button
                type="button"
                onClick={applySuggested}
                className="h-8 shrink-0 rounded-md bg-amber-600 px-2.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                {t('lit.selectSuggested') || 'Select suggested'}
              </button>
            </div>
          )}

          {(isSearching && search.trim()) || loadingDefault ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('lit.loading') || 'Loading…'}
            </p>
          ) : listedTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {search.trim()
                ? t('lit.noTasksMatchYourSearch') || 'No tasks match your search'
                : t('lit.noTasksAvailableFromLinkedProjects') ||
                  'No tasks available from linked projects'}
            </p>
          ) : (
            <div className="space-y-1">
              {listedTasks.map((task) => {
                const checked = draftIds.has(task.Id);
                const versionLabel = task.LinkedVersionNumber
                  ? `v${task.LinkedVersionNumber}`
                  : task.ThisAppLinkedVersionNumber
                    ? `v${task.ThisAppLinkedVersionNumber}`
                    : null;
                const linkedToVersion = Boolean(
                  task.IsLinkedToVersion ||
                    task.IsLinkedToOtherApplication ||
                    versionLabel ||
                    task.ThisAppLinkedVersionId
                );
                const assocLabel = [task.LinkedApplicationName, versionLabel]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <label
                    key={task.Id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-700/60 ${
                      linkedToVersion ? 'ring-1 ring-amber-300/80 dark:ring-amber-700/60' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTask(task.Id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {task.TaskName}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">#{task.Id}</span>
                        {task.IssueKey ? (
                          task.IssueUrl ? (
                            <a
                              href={task.IssueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {task.IssueKey}
                            </a>
                          ) : (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {task.IssueKey}
                            </span>
                          )
                        ) : null}
                        {task.StatusName && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {task.StatusName}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {task.ProjectName ? <span>{task.ProjectName}</span> : null}
                        {assocLabel ? (
                          <span
                            className={
                              linkedToVersion ? 'text-amber-700 dark:text-amber-300' : ''
                            }
                          >
                            {assocLabel}
                          </span>
                        ) : versionLabel ? (
                          <span className="text-amber-700 dark:text-amber-300">
                            {t('lit.linkedToVersion') || 'Linked'}: {versionLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            type="button"
            onClick={attemptConfirm}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {(t('lit.addSelected') || 'Add selected') + ` (${draftIds.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
