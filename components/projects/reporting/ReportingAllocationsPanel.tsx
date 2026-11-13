'use client';
import { useI18n } from '@/lib/i18n/provider';

import { useMemo, useState } from 'react';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import { SearchableSelect } from '@/components/projects/ProjectInlineFields';
import {
  buildUniqueUserOptions,
  countActiveReportFilters,
  filterAllocationRows,
  REPORT_UNASSIGNED_USER_ID,
} from '@/lib/projectReportingFilters';

type HoursFmt = (hours: number) => string;

export function ReportingAllocationsPanel({
  projectId,
  allocations,
  isLoading,
  totalAllocatedHours,
  decimalHoursToHMS,
}: {
  projectId: number;
  allocations: any[];
  isLoading: boolean;
  totalAllocatedHours: number;
  decimalHoursToHMS: HoursFmt;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const userOptions = useMemo(() => buildUniqueUserOptions(allocations), [allocations]);
  const filtered = useMemo(
    () => filterAllocationRows(allocations, { search, userId, dateFrom, dateTo }),
    [allocations, search, userId, dateFrom, dateTo]
  );
  const filteredTotal = useMemo(
    () => filtered.reduce((sum, row) => sum + parseFloat(String(row.AllocatedHours || 0)), 0),
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('lit.plannedAllocations')}</h2>
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('lit.totalAllocated')}</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {decimalHoursToHMS(filtersActive ? filteredTotal : totalAllocatedHours)}
            </div>
          </div>
        </div>

        <CollapsibleFilterPanel
          activeCount={activeFilterCount}
          onClear={filtersActive ? clearFilters : undefined}
          headerExtra={
            <span className="text-xs text-gray-400">
              {filtered.length} / {allocations.length}
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
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('lit.loadingAllocations')}</div>
        ) : allocations.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('lit.noAllocationsFound')}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('lit.noTasksMatchTheCurrentFilters')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table
              data-grid-key={`project-reporting-allocations-${projectId}`}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('lit.slice')}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('lit.time')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('common.hours')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map((allocation: any, idx: number) => {
                  const date = new Date(allocation.AllocationDate);
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                  const dateStr = date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const headerId = Number(allocation.TaskAllocationHeaderId || 0);
                  const splitOrder =
                    allocation.SplitOrder === null || allocation.SplitOrder === undefined
                      ? null
                      : Number(allocation.SplitOrder);

                  return (
                    <tr
                      key={`${allocation.TaskId}-${allocation.UserId}-${allocation.AllocationDate}-${headerId}-${idx}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {allocation.TaskName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {allocation.Username || t('lit.unknown')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {dayName}, {dateStr}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {headerId > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium">
                            H#{headerId}
                            {splitOrder !== null ? ` · S${splitOrder}` : ''}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                        {allocation.StartTime || '-'} - {allocation.EndTime || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                        {decimalHoursToHMS(parseFloat(allocation.AllocatedHours))}
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
