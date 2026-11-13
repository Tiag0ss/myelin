'use client';
import { useI18n } from '@/lib/i18n/provider';

import { useMemo, useState } from 'react';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import { SearchableSelect } from '@/components/projects/ProjectInlineFields';
import { stripHtml } from '@/lib/stripHtml';
import {
  buildUniqueUserOptions,
  countActiveReportFilters,
  filterTimeEntryRows,
  REPORT_UNASSIGNED_USER_ID,
} from '@/lib/projectReportingFilters';

type HoursFmt = (hours: number) => string;

export function ReportingTimeEntriesPanel({
  projectId,
  timeEntries,
  isLoading,
  totalWorkedHours,
  decimalHoursToHMS,
}: {
  projectId: number;
  timeEntries: any[];
  isLoading: boolean;
  totalWorkedHours: number;
  decimalHoursToHMS: HoursFmt;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const userOptions = useMemo(() => buildUniqueUserOptions(timeEntries), [timeEntries]);
  const filtered = useMemo(
    () => filterTimeEntryRows(timeEntries, { search, userId, dateFrom, dateTo }),
    [timeEntries, search, userId, dateFrom, dateTo]
  );
  const filteredTotal = useMemo(
    () => filtered.reduce((sum, row) => sum + parseFloat(String(row.Hours || 0)), 0),
    [filtered]
  );
  const activeFilterCount = countActiveReportFilters([
    Boolean(search.trim()),
    userId !== undefined,
    Boolean(dateFrom),
    Boolean(dateTo),
  ]);
  const filtersActive = activeFilterCount > 0;

  const clearFilters = () => {
    setSearch('');
    setUserId(undefined);
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('lit.recordedTimeEntries')}</h2>
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('lit.totalWorked')}</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {decimalHoursToHMS(filtersActive ? filteredTotal : totalWorkedHours)}
            </div>
          </div>
        </div>

        <CollapsibleFilterPanel
          activeCount={activeFilterCount}
          onClear={filtersActive ? clearFilters : undefined}
          headerExtra={
            <span className="text-xs text-gray-400">
              {filtered.length} / {timeEntries.length}
            </span>
          }
          className="mb-0"
        >
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('lit.searchTasks2')}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <SearchableSelect
              value={userId}
              onChange={setUserId}
              options={[
                { id: REPORT_UNASSIGNED_USER_ID, label: t('lit.unassigned') },
                ...userOptions.map((user) => ({ id: user.id, label: user.name })),
              ]}
              placeholder={t('lit.allUsers')}
              className="w-full"
            />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              aria-label={t('lit.from')}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              aria-label={t('lit.to')}
            />
          </div>
        </CollapsibleFilterPanel>

        {isLoading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('lit.loadingTimeEntries')}</div>
        ) : timeEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('lit.noTimeEntriesFound')}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('lit.noTasksMatchTheCurrentFilters')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table
              data-grid-key={`project-reporting-time-entries-${projectId}`}
              className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
            >
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.task')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.user')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.date')}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('lit.time')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.description')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.hours')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map((entry: any, idx: number) => {
                  const date = new Date(entry.WorkDate);
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                  const dateStr = date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {entry.TaskName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {entry.Username || t('lit.unknown')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {dayName}, {dateStr}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                        {entry.StartTime || '-'} - {entry.EndTime || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {stripHtml(entry.Description) || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                        {decimalHoursToHMS(parseFloat(entry.Hours))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100 text-right"
                  >
                    {t('lit.total2')}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-right text-gray-900 dark:text-gray-100">
                    {decimalHoursToHMS(filteredTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
