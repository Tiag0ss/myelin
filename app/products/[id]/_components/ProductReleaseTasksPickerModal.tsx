'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import {
  getProductReleaseCandidateTasks,
  type ProductReleaseCandidateTask,
} from '@/lib/api/products';
import { resolvePatchNoteIssueRef } from '@/lib/releasePatchNotes';

export type ProductReleasePickerTask = ProductReleaseCandidateTask & {
  IssueKey?: string | null;
  IssueUrl?: string | null;
};

function withResolvedIssueLinks(task: ProductReleaseCandidateTask): ProductReleasePickerTask {
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
    IssueKey: ref?.key ?? null,
    IssueUrl: ref?.url ?? null,
  };
}

type Props = {
  isOpen: boolean;
  productId: number | string;
  token: string;
  projectIds?: number[];
  initiallySelectedIds: number[];
  onClose: () => void;
  onConfirm: (selectedTasks: ProductReleasePickerTask[]) => void;
};

export default function ProductReleaseTasksPickerModal({
  isOpen,
  productId,
  token,
  projectIds = [],
  initiallySelectedIds,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [draftIds, setDraftIds] = useState<Set<number>>(new Set());
  const [includeLinked, setIncludeLinked] = useState(false);
  const [listedTasks, setListedTasks] = useState<ProductReleasePickerTask[]>([]);
  const [knownTasksById, setKnownTasksById] = useState<Map<number, ProductReleasePickerTask>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setIncludeLinked(false);
    setDraftIds(new Set(initiallySelectedIds.filter((id) => Number.isFinite(id) && id > 0)));
  }, [isOpen, initiallySelectedIds]);

  const projectIdsKey = projectIds.join(',');
  const keepSelectedIdsKey = initiallySelectedIds.join(',');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError('');
      try {
        const data = await getProductReleaseCandidateTasks(token, productId, {
          projectIds: projectIdsKey
            ? projectIdsKey.split(',').map((id) => Number(id)).filter((id) => id > 0)
            : [],
          includeLinked,
          keepSelectedIds: keepSelectedIdsKey
            ? keepSelectedIdsKey.split(',').map((id) => Number(id)).filter((id) => id > 0)
            : [],
        });
        if (cancelled) return;
        const tasks = (data.data.tasks || []).map(withResolvedIssueLinks);
        setListedTasks(tasks);
        setKnownTasksById((prev) => {
          const next = new Map(prev);
          for (const task of tasks) next.set(task.Id, task);
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          setListedTasks([]);
          setLoadError(
            err instanceof Error
              ? err.message
              : t('lit.failedToSearchTasks') || 'Failed to load tasks'
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, token, productId, projectIdsKey, includeLinked, keepSelectedIdsKey, t]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listedTasks;
    return listedTasks.filter((task) => {
      return (
        String(task.TaskName || '').toLowerCase().includes(q) ||
        String(task.ProjectName || '').toLowerCase().includes(q) ||
        String(task.StatusName || '').toLowerCase().includes(q) ||
        String(task.LinkedAssociationsLabel || '').toLowerCase().includes(q) ||
        String(task.IssueKey || '').toLowerCase().includes(q) ||
        String(task.JiraIssueKey || '').toLowerCase().includes(q) ||
        String(task.ExternalIssueId || '').toLowerCase().includes(q) ||
        String(task.TicketNumber || '').toLowerCase().includes(q) ||
        String(task.Id).includes(q)
      );
    });
  }, [listedTasks, search]);

  if (!isOpen) return null;

  const toggleTask = (taskId: number) => {
    setDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const attemptConfirm = () => {
    const selected = Array.from(draftIds)
      .map((id) => knownTasksById.get(id))
      .filter((task): task is ProductReleasePickerTask => Boolean(task));
    onConfirm(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-release-tasks-picker-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h3
              id="product-release-tasks-picker-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              {t('lit.selectTasks') || 'Select tasks'}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {search.trim()
                ? `${filteredTasks.length} match${filteredTasks.length === 1 ? '' : 'es'} · ${draftIds.size} selected`
                : `${filteredTasks.length} listed · ${draftIds.size} selected`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label={t('common.close')}
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
              placeholder={
                t('lit.searchOrgTasksPlaceholder') ||
                'Search tasks by name, ticket/board, project, status, or id…'
              }
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
            {t('lit.showTasksAlreadyLinkedToVersions') ||
              'Show tasks already linked to versions'}
          </label>
          {loadError ? (
            <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('common.loading')}
            </p>
          ) : filteredTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {search.trim()
                ? t('lit.noTasksMatchYourSearch') || 'No tasks match your search'
                : t('lit.noTasksAvailableFromLinkedProjects') || 'No tasks available'}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredTasks.map((task) => {
                const checked = draftIds.has(task.Id);
                const linkedToVersion = Boolean(task.IsLinkedToVersion);
                const assocLabel =
                  task.LinkedAssociationsLabel ||
                  [task.LinkedApplicationName, task.LinkedVersionNumber ? `v${task.LinkedVersionNumber}` : null]
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
                        {task.StatusName ? (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {task.StatusName}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {task.ProjectName ? <span>{task.ProjectName}</span> : null}
                        {assocLabel ? (
                          <span className={linkedToVersion ? 'text-amber-700 dark:text-amber-300' : ''}>
                            {assocLabel}
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
            {t('common.cancel')}
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
