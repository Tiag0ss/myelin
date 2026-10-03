'use client';
import { useI18n } from '@/lib/i18n/provider';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';

export function FlowMetricsPanel({ projectId, token }: { projectId: number; token: string }) {
  const { t } = useI18n();

  const [data, setData] = useState<{
    summary: {
      averageLeadTimeDays: number;
      averageCycleTimeDays: number;
      throughputLast30Days: number;
      completedInPeriod: number;
      wipCount: number;
      generatedAt: string;
    };
    cfd: Array<{ date: string; backlog: number; inProgress: number; done: number }>;
    throughputByDay: Record<string, number>;
    agingWip: Array<{ taskId: number; taskName: string; ageDays: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${getApiUrl()}/api/projects/${projectId}/flow-metrics`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(t('lit.failedToLoadFlowMetrics'));
        const json = await res.json();
        setData(json.data || null);
      } catch {
        setError(t('lit.failedToLoadFlowMetrics'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectId, token]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">{t('lit.loadingFlowMetrics')}</div>;
  if (error) return <div className="p-6 text-red-600 dark:text-red-400">{error}</div>;
  if (!data) return null;

  const maxCfd = data.cfd.reduce((max, day) => Math.max(max, day.backlog + day.inProgress + day.done), 1);
  const recentAging = data.agingWip.slice(0, 8);
  const throughputDays = Object.entries(data.throughputByDay)
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('lit.leadTime')}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{data.summary.averageLeadTimeDays.toFixed(1)}d</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('lit.cycleTime')}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{data.summary.averageCycleTimeDays.toFixed(1)}d</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('lit.throughput30d')}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{data.summary.throughputLast30Days}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('lit.completed')}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{data.summary.completedInPeriod}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('lit.agingWip')}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{data.summary.wipCount}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('lit.cumulativeFlowLast30Days')}</h3>
        <div className="space-y-2">
          {data.cfd.map((day) => {
            const backlogPct = (day.backlog / maxCfd) * 100;
            const inProgressPct = (day.inProgress / maxCfd) * 100;
            const donePct = (day.done / maxCfd) * 100;

            return (
              <div key={day.date} className="flex items-center gap-3">
                <div className="w-24 text-xs text-gray-500 dark:text-gray-400">{day.date.slice(5)}</div>
                <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden flex">
                  <div className="bg-gray-400" style={{ width: `${backlogPct}%` }} title={`Backlog: ${day.backlog}`} />
                  <div className="bg-blue-500" style={{ width: `${inProgressPct}%` }} title={`In Progress: ${day.inProgress}`} />
                  <div className="bg-green-500" style={{ width: `${donePct}%` }} title={`Done: ${day.done}`} />
                </div>
                <div className="w-20 text-right text-xs text-gray-500 dark:text-gray-400">{day.backlog + day.inProgress + day.done}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('lit.throughputByDay')}</h3>
          {throughputDays.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('lit.noCompletedTasksInTheCurrentPeriod')}</p>
          ) : (
            <div className="space-y-2">
              {throughputDays.map(([date, value]) => (
                <div key={date} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">{date}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('lit.agingWipOldestFirst')}</h3>
          {recentAging.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('lit.noItemsCurrentlyInProgress')}</p>
          ) : (
            <div className="space-y-2">
              {recentAging.map((item) => (
                <div key={item.taskId} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300" title={`Task ID: ${item.taskId}`}>{item.taskName || `Task #${item.taskId}`}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{item.ageDays} days</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

