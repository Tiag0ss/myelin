'use client';

import { useEffect, useMemo, useState } from 'react';
import { suggestTaskIdsFromCommits } from '@/lib/releasePatchNotes';

export type VersionPickerTask = {
  Id: number;
  TaskName: string;
  ProjectName?: string | null;
  StatusName?: string | null;
};

type VersionTasksPickerModalProps = {
  isOpen: boolean;
  availableTasks: VersionPickerTask[];
  initiallySelectedIds: number[];
  commitMessages?: Array<{ sha: string; message: string }>;
  onClose: () => void;
  onConfirm: (taskIds: number[]) => void;
};

export default function VersionTasksPickerModal({
  isOpen,
  availableTasks,
  initiallySelectedIds,
  commitMessages = [],
  onClose,
  onConfirm,
}: VersionTasksPickerModalProps) {
  const [search, setSearch] = useState('');
  const [draftIds, setDraftIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setDraftIds(
      new Set(
        initiallySelectedIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset draft only when modal opens
  }, [isOpen]);

  const suggestedIds = useMemo(
    () =>
      suggestTaskIdsFromCommits(
        commitMessages,
        availableTasks.map((task) => task.Id),
        Array.from(draftIds)
      ),
    [commitMessages, availableTasks, draftIds]
  );

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableTasks;
    return availableTasks.filter((task) => {
      const name = String(task.TaskName || '').toLowerCase();
      const project = String(task.ProjectName || '').toLowerCase();
      const status = String(task.StatusName || '').toLowerCase();
      const id = String(task.Id);
      return name.includes(q) || project.includes(q) || status.includes(q) || id.includes(q);
    });
  }, [availableTasks, search]);

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
              Select tasks
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {availableTasks.length} available · {draftIds.size} selected
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

        <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-700">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks by name, project, status, or id…"
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
                Select suggested
              </button>
            </div>
          )}

          {filteredTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {availableTasks.length === 0 ? 'No tasks available' : 'No tasks match your search'}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredTasks.map((task) => {
                const checked = draftIds.has(task.Id);
                return (
                  <label
                    key={task.Id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-700/60"
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
                        {task.StatusName && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {task.StatusName}
                          </span>
                        )}
                      </div>
                      {task.ProjectName && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {task.ProjectName}
                        </p>
                      )}
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
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(Array.from(draftIds));
              onClose();
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Add selected ({draftIds.size})
          </button>
        </div>
      </div>
    </div>
  );
}
