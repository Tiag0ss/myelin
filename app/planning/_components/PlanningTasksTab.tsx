'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import { SearchableSelect } from '@/components/projects/ProjectInlineFields';
import { useAuth } from '@/contexts/AuthContext';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { getApiUrl } from '@/lib/api/config';
import type { Project } from '@/lib/api/projects';
import type { Task } from '@/lib/api/tasks';
import type { User } from '@/lib/api/users';
import { useI18n } from '@/lib/i18n/provider';
import {
  DEFAULT_PLANNING_TASK_FILTERS,
  countPlanningTaskActiveFilters,
  countPlanningTaskFilterDeviations,
  mergePlanningTaskFilters,
  taskMatchesPlanningFilters,
} from '@/lib/planning/planningTaskFilters';

type PlanningTasksTabProps = {
  tasks: Task[];
  projects: Project[];
  users: User[];
  token: string;
  isActive: boolean;
  onOpenTask: (task: Task) => void;
  onFilteredCountChange?: (count: number) => void;
};

function buildUniqueOptions(
  tasks: Task[],
  pickId: (task: Task) => number | null | undefined,
  pickLabel: (task: Task) => string | null | undefined
): Array<{ id: number; name: string }> {
  const map = new Map<number, string>();
  for (const task of tasks) {
    const id = pickId(task);
    if (id === null || id === undefined || !Number.isFinite(Number(id)) || Number(id) <= 0) continue;
    const label = String(pickLabel(task) || '').trim();
    if (!label) continue;
    if (!map.has(Number(id))) map.set(Number(id), label);
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function ExternalOpenIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function JiraMarkIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
    </svg>
  );
}

function resolveJiraBrowseUrl(task: Task): { key: string; url: string | null } | null {
  const key = String(task.JiraIssueKey || task.ExternalTicketId || task.ExternalIssueId || '').trim();
  if (!key) return null;
  const base = String(task.JiraUrl || '')
    .trim()
    .replace(/\/$/, '');
  return {
    key,
    url: base ? `${base}/browse/${encodeURIComponent(key)}` : null,
  };
}

function resolveGitHubIssueUrl(project: Project | undefined, issueNumber: number): string | null {
  if (!project?.GitHubOwner || !project?.GitHubRepo) return null;
  return `https://github.com/${project.GitHubOwner}/${project.GitHubRepo}/issues/${issueNumber}`;
}

function resolveGiteaIssueUrl(project: Project | undefined, issueNumber: number): string | null {
  if (!project?.GiteaOwner || !project?.GiteaRepo) return null;
  const appRepo = (project.Applications || []).find(
    (app) =>
      Boolean(app.GiteaIntegrationId) || /gitea/i.test(String(app.RepositoryUrl || ''))
  );
  const repoUrl = String(appRepo?.RepositoryUrl || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\.git$/i, '');
  if (!repoUrl) return null;
  return `${repoUrl}/issues/${issueNumber}`;
}

function resolveInternalTicketId(task: Task): number | null {
  const id = Number(task.TicketIdRef ?? task.TicketId ?? 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export default function PlanningTasksTab({
  tasks,
  projects,
  users,
  token,
  isActive,
  onOpenTask,
  onFilteredCountChange,
}: PlanningTasksTabProps) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [taskFilters, setTaskFilters, resetTaskFilters] = usePersistedFilters(
    'planning-tasks-v3',
    DEFAULT_PLANNING_TASK_FILTERS,
    { userId: user?.id, merge: mergePlanningTaskFilters }
  );
  const [taskTagMap, setTaskTagMap] = useState<Map<number, Array<{ id: number; name: string }>>>(
    new Map()
  );
  const [tagFilterOptions, setTagFilterOptions] = useState<
    Array<{ value: number; label: string; subtitle?: string }>
  >([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);

  const {
    filterText,
    filterProject,
    filterStatusIds,
    filterPriority,
    filterAssignee,
    filterTaskType,
    hideClosed,
    hideCancelled,
    hideUnscheduled,
    unplannedOnly,
    filterTagIds,
  } = taskFilters;

  useEffect(() => {
    if (!isActive || !token || projects.length === 0 || tagsLoaded) return;

    let cancelled = false;
    const loadTags = async () => {
      try {
        const orgIds = [
          ...new Set(projects.map((project) => Number(project.OrganizationId)).filter((id) => id > 0)),
        ];
        const [usageResults, projectTagResults] = await Promise.all([
          Promise.all(
            orgIds.map(async (orgId) => {
              try {
                const res = await fetch(`${getApiUrl()}/api/tags/organization/${orgId}/usage`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return [] as Array<{ value: number; label: string; subtitle?: string }>;
                const data = await res.json();
                return (data.tags || []).map(
                  (tag: { Id: number; Name: string; TaskCount?: number }) => ({
                    value: Number(tag.Id),
                    label: String(tag.Name || ''),
                    subtitle:
                      tag.TaskCount !== undefined
                        ? `${Number(tag.TaskCount || 0)} task${Number(tag.TaskCount || 0) !== 1 ? 's' : ''}`
                        : undefined,
                  })
                );
              } catch {
                return [] as Array<{ value: number; label: string; subtitle?: string }>;
              }
            })
          ),
          Promise.all(
            projects.map(async (project) => {
              try {
                const res = await fetch(`${getApiUrl()}/api/tags/project/${project.Id}/tasks`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                  return [] as Array<{ TaskId: number; TagId: number; TagName: string }>;
                }
                const data = await res.json();
                return Array.isArray(data.taskTags) ? data.taskTags : [];
              } catch {
                return [] as Array<{ TaskId: number; TagId: number; TagName: string }>;
              }
            })
          ),
        ]);

        if (cancelled) return;

        const optionMap = new Map<number, { value: number; label: string; subtitle?: string }>();
        for (const options of usageResults) {
          for (const option of options) {
            if (!optionMap.has(option.value)) optionMap.set(option.value, option);
          }
        }
        setTagFilterOptions(
          Array.from(optionMap.values()).sort((a, b) => a.label.localeCompare(b.label))
        );

        const nextTagMap = new Map<number, Array<{ id: number; name: string }>>();
        for (const projectRows of projectTagResults) {
          for (const relation of projectRows) {
            const taskId = Number(relation.TaskId);
            const tagId = Number(relation.TagId);
            if (!Number.isFinite(taskId) || taskId <= 0 || !Number.isFinite(tagId) || tagId <= 0) {
              continue;
            }
            const existing = nextTagMap.get(taskId) || [];
            existing.push({
              id: tagId,
              name: String(relation.TagName || ''),
            });
            nextTagMap.set(taskId, existing);
          }
        }
        setTaskTagMap(nextTagMap);
        setTagsLoaded(true);
      } catch {
        if (!cancelled) setTagsLoaded(true);
      }
    };

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [isActive, token, projects, tagsLoaded]);

  const tagIdsByTaskId = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const [taskId, tags] of taskTagMap.entries()) {
      map.set(
        taskId,
        tags.map((tag) => tag.id)
      );
    }
    return map;
  }, [taskTagMap]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) =>
        taskMatchesPlanningFilters(task, taskFilters, {
          allTasks: tasks,
          tagIdsByTaskId,
        })
      )
      .sort((a, b) => {
        const projectCmp = String(a.ProjectName || '').localeCompare(String(b.ProjectName || ''));
        if (projectCmp !== 0) return projectCmp;
        return String(a.TaskName || '').localeCompare(String(b.TaskName || ''));
      });
  }, [tasks, taskFilters, tagIdsByTaskId]);

  useEffect(() => {
    onFilteredCountChange?.(filteredTasks.length);
  }, [filteredTasks.length, onFilteredCountChange]);

  const activeFilterCount = countPlanningTaskActiveFilters(taskFilters);
  const filterDeviationCount = countPlanningTaskFilterDeviations(taskFilters);
  const canClearFilters = filterDeviationCount > 0;

  const statusOptions = useMemo(
    () => buildUniqueOptions(tasks, (task) => task.Status, (task) => task.StatusName),
    [tasks]
  );
  const priorityOptions = useMemo(
    () => buildUniqueOptions(tasks, (task) => task.Priority, (task) => task.PriorityName),
    [tasks]
  );
  const typeOptions = useMemo(
    () => buildUniqueOptions(tasks, (task) => task.TaskType, (task) => task.TaskTypeName),
    [tasks]
  );
  const assigneeOptions = useMemo(() => {
    const fromTasks = buildUniqueOptions(
      tasks,
      (task) => task.AssignedTo,
      (task) => task.AssigneeName
    );
    if (fromTasks.length > 0) return fromTasks;
    return users
      .map((entry) => ({
        id: entry.Id,
        name: entry.Username || `${entry.FirstName || ''} ${entry.LastName || ''}`.trim() || `#${entry.Id}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, users]);

  const dateLocale = locale === 'pt' ? 'pt-PT' : locale === 'es' ? 'es-ES' : locale === 'fr' ? 'fr-FR' : 'en-GB';

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—';
    const key = String(value).slice(0, 10);
    const parsed = new Date(`${key}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return key;
    return parsed.toLocaleDateString(dateLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <CollapsibleFilterPanel
        title={t('lit.taskFilters')}
        activeCount={activeFilterCount}
        onClear={canClearFilters ? resetTaskFilters : undefined}
        className="shrink-0"
        headerExtra={
          <span className="text-xs text-gray-400">
            {filteredTasks.length} / {tasks.length}
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <div className="xl:col-span-2">
            <input
              type="text"
              value={filterText}
              onChange={(e) => setTaskFilters({ filterText: e.target.value })}
              placeholder={t('lit.searchTaskDescriptionAssignee')}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <SearchableSelect
              value={filterProject}
              onChange={(value) => setTaskFilters({ filterProject: value })}
              options={projects.map((project) => ({ id: project.Id, label: project.ProjectName }))}
              placeholder={t('lit.allProjects')}
              className="w-full"
            />
          </div>
          <div>
            <SearchableSelect
              value={filterTaskType}
              onChange={(value) => setTaskFilters({ filterTaskType: value })}
              options={typeOptions.map((entry) => ({ id: entry.id, label: entry.name }))}
              placeholder={t('lit.allTaskTypes')}
              className="w-full"
            />
          </div>
          <div>
            <SearchableMultiSelect
              values={filterStatusIds}
              onChange={(values) =>
                setTaskFilters({ filterStatusIds: values.map((value) => Number(value)) })
              }
              options={statusOptions.map((entry) => ({ value: entry.id, label: entry.name }))}
              placeholder={t('lit.allStatuses')}
            />
          </div>
          <div>
            <SearchableSelect
              value={filterPriority}
              onChange={(value) => setTaskFilters({ filterPriority: value })}
              options={priorityOptions.map((entry) => ({ id: entry.id, label: entry.name }))}
              placeholder={t('lit.allPriorities')}
              className="w-full"
            />
          </div>
          <div>
            <SearchableSelect
              value={filterAssignee}
              onChange={(value) => setTaskFilters({ filterAssignee: value })}
              options={assigneeOptions.map((entry) => ({ id: entry.id, label: entry.name }))}
              placeholder={t('lit.allAssignees')}
              className="w-full"
            />
          </div>
          <div>
            <SearchableMultiSelect
              values={filterTagIds}
              onChange={(values) => setTaskFilters({ filterTagIds: values.map((value) => Number(value)) })}
              options={tagFilterOptions}
              placeholder={t('lit.allTags')}
            />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={hideClosed}
                onChange={(e) => setTaskFilters({ hideClosed: e.target.checked })}
                className="rounded"
              />
              {t('lit.hideClosedTasks')}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={hideCancelled}
                onChange={(e) => setTaskFilters({ hideCancelled: e.target.checked })}
                className="rounded"
              />
              {t('lit.hideCancelledTasks')}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={hideUnscheduled}
                onChange={(e) => setTaskFilters({ hideUnscheduled: e.target.checked })}
                className="rounded"
              />
              {t('lit.hideUnscheduledWork')}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={unplannedOnly}
                onChange={(e) => setTaskFilters({ unplannedOnly: e.target.checked })}
                className="rounded"
              />
              {t('lit.unplannedOnly')}
            </label>
          </div>
          {canClearFilters && (
            <button
              type="button"
              onClick={resetTaskFilters}
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              {t('lit.clearFilters')}
            </button>
          )}
        </div>
      </CollapsibleFilterPanel>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
        <div className="min-h-0 flex-1 overflow-auto [&_.global-grid-controls]:sticky [&_.global-grid-controls]:top-0 [&_.global-grid-controls]:z-30 [&_.global-grid-controls]:border-b [&_.global-grid-controls]:border-gray-200 [&_.global-grid-controls]:bg-white [&_.global-grid-controls]:px-2 [&_.global-grid-controls]:py-1 dark:[&_.global-grid-controls]:border-gray-700 dark:[&_.global-grid-controls]:bg-gray-800">
          {/* Keep <table> mounted across filter changes so GlobalGridEnhancer stays stable. */}
          <table className="min-w-full text-sm" data-grid-key="planning-all-tasks-v2">
            <thead className="sticky top-[2.75rem] z-20 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:bg-gray-900 dark:text-gray-400 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
              <tr>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900">{t('common.task')}</th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900">{t('common.project')}</th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900" data-default-hidden="true">
                  {t('lit.taskType')}
                </th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900">{t('lit.status')}</th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900">{t('lit.priority')}</th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900">{t('lit.assignee')}</th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900">{t('lit.planned')}</th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900">{t('lit.dueDate')}</th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900" data-default-hidden="true">
                  {t('lit.estimated')}
                </th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900" data-default-hidden="true">
                  {t('lit.jira')}
                </th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900" data-default-hidden="true">
                  {t('lit.ticket')}
                </th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900" data-default-hidden="true">
                  {t('lit.github')}
                </th>
                <th className="bg-gray-50 px-4 py-3 font-semibold dark:bg-gray-900" data-default-hidden="true">
                  {t('lit.gitea')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredTasks.map((task) => {
                const project = projects.find((entry) => Number(entry.Id) === Number(task.ProjectId));
                const plannedStart = formatDate(task.PlannedStartDate);
                const plannedEnd = formatDate(task.PlannedEndDate);
                const plannedLabel =
                  task.PlannedStartDate || task.PlannedEndDate
                    ? `${plannedStart} → ${plannedEnd}`
                    : '—';
                const jiraRef = resolveJiraBrowseUrl(task);
                const ticketLabel = task.TicketNumber || null;
                const ticketId = resolveInternalTicketId(task);
                const gitHubIssue =
                  task.GitHubIssueNumber !== null && task.GitHubIssueNumber !== undefined
                    ? Number(task.GitHubIssueNumber)
                    : null;
                const giteaIssue =
                  task.GiteaIssueNumber !== null && task.GiteaIssueNumber !== undefined
                    ? Number(task.GiteaIssueNumber)
                    : null;
                const gitHubUrl =
                  gitHubIssue && Number.isFinite(gitHubIssue)
                    ? resolveGitHubIssueUrl(project, gitHubIssue)
                    : null;
                const giteaUrl =
                  giteaIssue && Number.isFinite(giteaIssue)
                    ? resolveGiteaIssueUrl(project, giteaIssue)
                    : null;
                return (
                  <tr
                    key={task.Id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40"
                    onClick={() => onOpenTask(task)}
                  >
                    <td className="max-w-[280px] px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <div className="truncate" title={task.TaskName}>
                        {task.TaskName}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        <span>#{task.Id}</span>
                        {Number(task.UnscheduledWork || 0) === 1 && (
                          <span className="uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            {t('lit.unscheduled')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="max-w-[180px] truncate px-4 py-3 text-gray-600 dark:text-gray-300"
                      title={task.ProjectName || undefined}
                    >
                      {task.ProjectName || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {task.TaskTypeName || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {task.StatusName || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {task.PriorityName || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {task.AssigneeName || t('lit.unassigned')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
                      {plannedLabel}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
                      {formatDate(task.DueDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {task.EstimatedHours !== null && task.EstimatedHours !== undefined
                        ? Number(task.EstimatedHours).toFixed(2)
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {jiraRef ? (
                        <div className="inline-flex max-w-[160px] items-center gap-1.5">
                          <JiraMarkIcon className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                          <span
                            className="truncate text-xs font-medium text-gray-800 dark:text-gray-200"
                            title={jiraRef.key}
                          >
                            {jiraRef.key}
                          </span>
                          {jiraRef.url && (
                            <a
                              href={jiraRef.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                              title={t('lit.openInJira', { key: jiraRef.key })}
                              aria-label={t('lit.openInJira', { key: jiraRef.key })}
                            >
                              <ExternalOpenIcon />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ticketLabel ? (
                        <div className="inline-flex max-w-[160px] items-center gap-1.5">
                          <span
                            className="truncate text-xs font-medium text-gray-800 dark:text-gray-200"
                            title={ticketLabel}
                          >
                            {ticketLabel}
                          </span>
                          {ticketId && (
                            <a
                              href={`/tickets/${ticketId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                              title={t('lit.openTicket')}
                              aria-label={t('lit.openTicket')}
                            >
                              <ExternalOpenIcon />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {gitHubIssue && Number.isFinite(gitHubIssue) ? (
                        <div className="inline-flex max-w-[160px] items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
                            #{gitHubIssue}
                          </span>
                          {gitHubUrl && (
                            <a
                              href={gitHubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                              title={t('lit.viewOnGithub')}
                              aria-label={t('lit.viewOnGithub')}
                            >
                              <ExternalOpenIcon />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {giteaIssue && Number.isFinite(giteaIssue) ? (
                        <div className="inline-flex max-w-[160px] items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
                            #{giteaIssue}
                          </span>
                          {giteaUrl && (
                            <a
                              href={giteaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                              title={`${t('lit.gitea')} #${giteaIssue}`}
                              aria-label={`${t('lit.gitea')} #${giteaIssue}`}
                            >
                              <ExternalOpenIcon />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredTasks.length === 0 && (
          <div className="border-t border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {t('lit.noTasksFound')}
            {canClearFilters && (
              <button
                type="button"
                onClick={resetTaskFilters}
                className="mx-auto mt-2 block text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                {t('lit.clearFilters')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
