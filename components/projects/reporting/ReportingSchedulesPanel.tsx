'use client';
import { useI18n } from '@/lib/i18n/provider';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';

type ScheduleForm = {
  frequency: 'weekly' | 'monthly';
  dayOfWeek: number;
  dayOfMonth: number;
  recipients: string;
  includeTaskTable: boolean;
  includeTimeEntries: boolean;
  includeBudget: boolean;
  isEnabled: boolean;
};

const emptyForm = (): ScheduleForm => ({
  frequency: 'weekly',
  dayOfWeek: 1,
  dayOfMonth: 1,
  recipients: '',
  includeTaskTable: true,
  includeTimeEntries: true,
  includeBudget: true,
  isEnabled: true,
});

export function ReportingSchedulesPanel({
projectId,
  token,
  onAlert,
}: {
  projectId: number;
  token: string;
  onAlert: (title: string, message: string) => void;
}) {
  const { t } = useI18n();

  const [schedules, setSchedules] = useState<any[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(emptyForm());
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState<number | null>(null);
  const [confirmDeleteSchedule, setConfirmDeleteSchedule] = useState<number | null>(null);

  const loadSchedules = async () => {
    setSchedulesLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/project-report-schedules/project/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setSchedules(data.schedules || []);
    } catch {
      // silently fail
    } finally {
      setSchedulesLoading(false);
    }
  };

  useEffect(() => {
    void loadSchedules();
     
  }, [projectId]);

  const openNewSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm(emptyForm());
    setScheduleError('');
    setShowScheduleModal(true);
  };

  const openEditSchedule = (s: any) => {
    setEditingSchedule(s);
    setScheduleForm({
      frequency: s.Frequency,
      dayOfWeek: s.DayOfWeek ?? 1,
      dayOfMonth: s.DayOfMonth ?? 1,
      recipients: s.Recipients || '',
      includeTaskTable: Boolean(s.IncludeTaskTable),
      includeTimeEntries: Boolean(s.IncludeTimeEntries),
      includeBudget: Boolean(s.IncludeBudget),
      isEnabled: Boolean(s.IsEnabled),
    });
    setScheduleError('');
    setShowScheduleModal(true);
  };

  const saveSchedule = async () => {
    if (!scheduleForm.recipients.trim()) {
      setScheduleError('At least one recipient email is required.');
      return;
    }
    setScheduleSaving(true);
    setScheduleError('');
    try {
      const body = {
        projectId,
        frequency: scheduleForm.frequency,
        dayOfWeek: scheduleForm.frequency === 'weekly' ? scheduleForm.dayOfWeek : null,
        dayOfMonth: scheduleForm.frequency === 'monthly' ? scheduleForm.dayOfMonth : null,
        recipients: scheduleForm.recipients,
        includeTaskTable: scheduleForm.includeTaskTable,
        includeTimeEntries: scheduleForm.includeTimeEntries,
        includeBudget: scheduleForm.includeBudget,
        isEnabled: scheduleForm.isEnabled,
      };
      const url = editingSchedule
        ? `${getApiUrl()}/api/project-report-schedules/${editingSchedule.Id}`
        : `${getApiUrl()}/api/project-report-schedules`;
      const res = await fetch(url, {
        method: editingSchedule ? 'PUT' : t('lit.post'),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t('lit.failedToSaveSchedule'));
      setShowScheduleModal(false);
      await loadSchedules();
    } catch (err: any) {
      setScheduleError(err.message);
    } finally {
      setScheduleSaving(false);
    }
  };

  const deleteSchedule = async (id: number) => {
    try {
      await fetch(`${getApiUrl()}/api/project-report-schedules/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadSchedules();
    } catch {
      // silently fail
    } finally {
      setConfirmDeleteSchedule(null);
    }
  };

  const sendNow = async (id: number) => {
    setSendingNow(id);
    try {
      const res = await fetch(`${getApiUrl()}/api/project-report-schedules/${id}/send-now`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      onAlert(t('lit.reportSent'), data.message || t('lit.reportSentSuccessfully'));
      await loadSchedules();
    } catch (err: any) {
      onAlert(t('common.error'), err.message || t('lit.failedToSendReport'));
    } finally {
      setSendingNow(null);
    }
  };

  return (
    <>
<div className="space-y-6">
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('lit.scheduledReports')}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        {t('lit.automaticallySendPdfProjectReportsViaEmailOnAWeeklyOrMonthlyBasis')}
      </p>
    </div>
    <button
      onClick={openNewSchedule}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
    >
      + New Schedule
    </button>
  </div>

  {schedulesLoading ? (
    <div className="text-gray-500 dark:text-gray-400">{t('lit.loadingSchedules')}</div>
  ) : schedules.length === 0 ? (
    <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="text-4xl mb-4">📅</div>
      <p className="text-gray-500 dark:text-gray-400">{t('lit.noScheduledReportsYet')}</p>
      <button onClick={openNewSchedule} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
        {t('lit.createFirstSchedule')}
      </button>
    </div>
  ) : (
    <div className="space-y-4">
      {schedules.map(s => (
        <div key={s.Id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  s.Frequency === 'weekly'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                }`}>
                  {s.Frequency === 'weekly' ? '📆 Weekly' : '🗓 Monthly'}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  s.IsEnabled
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {s.IsEnabled ? '✅ Enabled' : '⏸ Disabled'}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                <strong>{t('lit.sends')}</strong>{' '}
                {s.Frequency === 'weekly'
                  ? `Every ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][s.DayOfWeek ?? 1]}`
                  : `On the ${s.DayOfMonth ?? 1}${[,'st','nd','rd'][s.DayOfMonth] || 'th'} of each month`}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                <strong>{t('lit.recipients2')}</strong> {s.Recipients || '—'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Includes:{' '}
                {[s.IncludeTaskTable && 'Task table', s.IncludeTimeEntries && 'Time entries', s.IncludeBudget && 'Budget'].filter(Boolean).join(', ') || t('lit.nothingSelected')}
                {s.LastSentAt ? ` · Last sent: ${new Date(s.LastSentAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}` : ' · Never sent'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => sendNow(s.Id)}
                disabled={sendingNow === s.Id}
                className="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
                title={t('lit.sendReportNowForTesting')}
              >
                {sendingNow === s.Id ? '⏳ Sending…' : '▶ Send Now'}
              </button>
              <button
                onClick={() => openEditSchedule(s)}
                className="px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => setConfirmDeleteSchedule(s.Id)}
                className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              >
                🗑 Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )}
</div>

      {showScheduleModal && (
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
    <div className="p-6">
      <h3 className="text-lg font-bold mb-5 text-gray-900 dark:text-white">
        {editingSchedule ? t('lit.editReportSchedule') : t('lit.newReportSchedule')}
      </h3>

      {scheduleError && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
          {scheduleError}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.frequency')}</label>
          <div className="flex gap-3">
            {(['weekly', 'monthly'] as const).map(f => (
              <button
                key={f}
                onClick={() => setScheduleForm(prev => ({ ...prev, frequency: f }))}
                className={`flex-1 py-2 rounded-lg border-2 font-medium transition-colors capitalize ${
                  scheduleForm.frequency === f
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {scheduleForm.frequency === 'weekly' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.dayOfWeek')}</label>
            <select
              value={scheduleForm.dayOfWeek}
              onChange={e => setScheduleForm(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.dayOfMonth128')}</label>
            <input
              type="number"
              min={1}
              max={28}
              value={scheduleForm.dayOfMonth}
              onChange={e => setScheduleForm(prev => ({ ...prev, dayOfMonth: Math.max(1, Math.min(28, parseInt(e.target.value) || 1)) }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('lit.recipients')} <span className="text-gray-400">(comma-separated emails)</span>
          </label>
          <input
            type="text"
            value={scheduleForm.recipients}
            onChange={e => setScheduleForm(prev => ({ ...prev, recipients: e.target.value }))}
            placeholder={t('lit.managerExampleComCtoExampleCom')}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.includeInPdf')}</label>
          <div className="space-y-2">
            {[
              { key: 'includeTaskTable', label: t('lit.taskTableStatusEstimatedWorkedHours') },
              { key: 'includeTimeEntries', label: t('lit.timeEntriesLast200EntriesInPeriod') },
              { key: 'includeBudget', label: t('lit.budgetProgressBar') },
            ].map(opt => (
              <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(scheduleForm as any)[opt.key]}
                  onChange={e => setScheduleForm(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={scheduleForm.isEnabled}
            onChange={e => setScheduleForm(prev => ({ ...prev, isEnabled: e.target.checked }))}
            className="w-4 h-4 text-blue-600 rounded"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('common.enabled')}</span>
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={() => setShowScheduleModal(false)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={saveSchedule}
          disabled={scheduleSaving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {scheduleSaving ? t('lit.saving2') : (editingSchedule ? t('lit.updateSchedule') : t('lit.createSchedule'))}
        </button>
      </div>
    </div>
  </div>
</div>
      )}

      {confirmDeleteSchedule !== null && (
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
    <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">{t('lit.deleteSchedule')}</h3>
    <p className="text-gray-600 dark:text-gray-300 mb-6">{t('lit.areYouSureYouWantToDeleteThisReportScheduleThisCannotBeUndone')}</p>
    <div className="flex justify-end gap-3">
      <button
        onClick={() => setConfirmDeleteSchedule(null)}
        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        {t('common.cancel')}
      </button>
      <button
        onClick={() => deleteSchedule(confirmDeleteSchedule)}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
      >
        {t('common.delete')}
      </button>
    </div>
  </div>
</div>
      )}
    </>
  );
}
