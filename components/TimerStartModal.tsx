'use client';


import { useI18n } from '@/lib/i18n/provider';
import SearchableSelect from './SearchableSelect';

export type TimerMode = 'task' | 'callRecord';

interface TimerStartTask {
  Id: number;
  TaskName: string;
  ProjectName?: string;
}

interface TimerStartOrganization {
  Id: number;
  Name: string;
}

interface TimerStartProject {
  Id: number;
  ProjectName: string;
  OrganizationId: number;
}

export interface TimerStartCallFormValues {
  organizationId: string;
  projectId: string;
  taskId: string;
  callType: string;
  participants: string;
  subject: string;
  notes: string;
}

interface TimerStartModalProps {
  isOpen: boolean;
  error: string;
  timerMode: TimerMode;
  isLoadingTasks: boolean;
  isLoadingCallProjects: boolean;
  isLoadingCallTasks: boolean;
  tasks: TimerStartTask[];
  organizations: TimerStartOrganization[];
  projects: TimerStartProject[];
  callTasks: TimerStartTask[];
  selectedTaskId: number | null;
  callForm: TimerStartCallFormValues;
  startTime: string;
  isStarting: boolean;
  onClose: () => void;
  onTimerModeChange: (mode: TimerMode) => void;
  onTaskChange: (taskId: number | null) => void;
  onCallFormChange: (updates: Partial<TimerStartCallFormValues>) => void;
  onStartTimeChange: (time: string) => void;
  onStart: () => void;
}

export default function TimerStartModal({
  isOpen,
  error,
  timerMode,
  isLoadingTasks,
  isLoadingCallProjects,
  isLoadingCallTasks,
  tasks,
  organizations,
  projects,
  callTasks,
  selectedTaskId,
  callForm,
  startTime,
  isStarting,
  onClose,
  onTimerModeChange,
  onTaskChange,
  onCallFormChange,
  onStartTimeChange,
  onStart,
}: TimerStartModalProps) {
  const { t } = useI18n();

  if (!isOpen) return null;

  const callTypeOptions = [
    { value: t('lit.teams'), label: t('lit.teams') },
    { value: t('lit.phone'), label: t('lit.phone') },
    { value: t('lit.zoom'), label: t('lit.zoom') },
    { value: t('lit.meet'), label: t('lit.googleMeet') },
    { value: t('lit.other'), label: t('lit.other') },
  ];

  const canStart = timerMode === 'task'
    ? !!selectedTaskId && !!startTime
    : !!startTime;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('lit.startTimer')}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('lit.timerType')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onTimerModeChange('task')}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${timerMode === 'task'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="font-medium">{t('lit.taskHours')}</div>
                  <div className="text-xs opacity-80 mt-1">{t('lit.trackWorkTimeForATaskAndSaveItAsATimeEntry')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onTimerModeChange('callRecord')}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${timerMode === 'callRecord'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="font-medium">{t('lit.callRecord')}</div>
                  <div className="text-xs opacity-80 mt-1">{t('lit.trackALiveCallAndSaveItAsACallRecordWhenStopped')}</div>
                </button>
              </div>
            </div>

            {timerMode === 'task' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('common.task')} <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  value={selectedTaskId?.toString() || ''}
                  onChange={(value) => onTaskChange(value ? parseInt(value, 10) : null)}
                  options={tasks.map((task) => ({
                    value: task.Id,
                    label: `${task.TaskName}${task.ProjectName ? ` — ${task.ProjectName}` : ''}`,
                  }))}
                  placeholder={isLoadingTasks ? t('lit.loadingTasks') : t('lit.selectTask')}
                  emptyText={isLoadingTasks ? t('lit.loadingTasks') : t('lit.noTasksAvailable')}
                  disabled={isLoadingTasks}
                  autoSelectSingleOption
                />
                {!isLoadingTasks && tasks.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('lit.noTasksFoundInProjectsYouCanAccess')}</p>
                )}
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50/60 dark:bg-gray-900/20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.callType')}</label>
                    <SearchableSelect
                      value={callForm.callType}
                      onChange={(value) => onCallFormChange({ callType: value })}
                      options={callTypeOptions}
                      placeholder={t('lit.selectCallType2')}
                      emptyText={t('lit.noCallTypesAvailable')}
                      autoSelectSingleOption
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.organization')}</label>
                    <SearchableSelect
                      value={callForm.organizationId}
                      onChange={(value) => onCallFormChange({ organizationId: value, projectId: '', taskId: '' })}
                      options={organizations.map((organization) => ({ value: String(organization.Id), label: organization.Name }))}
                      placeholder={t('lit.selectOrganization2')}
                      emptyText={t('lit.noOrganizationsAvailable')}
                      autoSelectSingleOption
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.project')}</label>
                    <SearchableSelect
                      value={callForm.projectId}
                      onChange={(value) => onCallFormChange({ projectId: value, taskId: '' })}
                      options={projects.map((project) => ({ value: String(project.Id), label: project.ProjectName }))}
                      placeholder={callForm.organizationId && isLoadingCallProjects ? 'Loading projects...' : t('lit.selectProject')}
                      emptyText={callForm.organizationId && isLoadingCallProjects ? 'Loading projects...' : t('lit.noProjectsAvailable')}
                      disabled={!callForm.organizationId || isLoadingCallProjects}
                      autoSelectSingleOption
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.task')}</label>
                    <SearchableSelect
                      value={callForm.taskId}
                      onChange={(value) => onCallFormChange({ taskId: value })}
                      options={callTasks.map((task) => ({ value: String(task.Id), label: task.TaskName }))}
                      placeholder={callForm.projectId && isLoadingCallTasks ? 'Loading tasks...' : 'Select Task (optional)'}
                      emptyText={callForm.projectId && isLoadingCallTasks ? 'Loading tasks...' : t('lit.noTasksAvailable')}
                      disabled={!callForm.projectId || isLoadingCallTasks}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.subject')}</label>
                  <input
                    type="text"
                    value={callForm.subject}
                    onChange={(event) => onCallFormChange({ subject: event.target.value })}
                    placeholder={t('lit.meetingTopic')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.participants')}</label>
                  <input
                    type="text"
                    value={callForm.participants}
                    onChange={(event) => onCallFormChange({ participants: event.target.value })}
                    placeholder={t('lit.johnDoeJaneDoe')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.notes')}</label>
                  <textarea
                    value={callForm.notes}
                    onChange={(event) => onCallFormChange({ notes: event.target.value })}
                    rows={3}
                    placeholder={t('lit.optionalNotesToSaveWhenTheCallEnds')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('lit.startTime')} <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(event) => onStartTimeChange(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onStart}
              disabled={isStarting || !canStart}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
            >
              {isStarting ? 'Starting...' : t('lit.startTimer')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
