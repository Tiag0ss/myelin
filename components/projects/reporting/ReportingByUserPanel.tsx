'use client';
import { useI18n } from '@/lib/i18n/provider';

import { useMemo, useState } from 'react';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import { SearchableSelect } from '@/components/projects/ProjectInlineFields';
import {
  buildUniqueUserOptions,
  countActiveReportFilters,
  filterUserStatRows,
} from '@/lib/projectReportingFilters';

type HoursFmt = (hours: number) => string;

export function ReportingByUserPanel({
  projectId,
  userStats,
  isLoading,
  decimalHoursToHMS,
}: {
  projectId: number;
  userStats: any[];
  isLoading: boolean;
  decimalHoursToHMS: HoursFmt;
}) {
  const { t } = useI18n();

  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<number | undefined>(undefined);

  const userOptions = useMemo(() => buildUniqueUserOptions(userStats), [userStats]);
  const filteredStats = useMemo(
    () => filterUserStatRows(userStats, { search, userId }),
    [userStats, search, userId]
  );
  const activeFilterCount = countActiveReportFilters([
    Boolean(search.trim()),
    userId !== undefined,
  ]);
  const filtersActive = activeFilterCount > 0;

  const clearFilters = () => {
    setSearch('');
    setUserId(undefined);
  };

  const toggleUserExpand = (id: number) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <CollapsibleFilterPanel
        activeCount={activeFilterCount}
        onClear={filtersActive ? clearFilters : undefined}
        headerExtra={
          <span className="text-xs text-gray-400">
            {filteredStats.length} / {userStats.length}
          </span>
        }
        className="mb-0"
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('lit.allUsers')}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <SearchableSelect
            value={userId}
            onChange={setUserId}
            options={userOptions.map((user) => ({ id: user.id, label: user.name }))}
            placeholder={t('lit.allUsers')}
            className="w-full"
          />
        </div>
      </CollapsibleFilterPanel>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
            {t('lit.loadingUserStatistics')}
          </div>
        ) : userStats.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
            {t('lit.noUserDataAvailableForThisProject')}
          </div>
        ) : filteredStats.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
            {t('lit.noTasksMatchTheCurrentFilters')}
          </div>
        ) : (
          filteredStats.map((user) => {
            const efficiency =
              user.TotalAllocated > 0
                ? Math.round((user.TotalWorked / user.TotalAllocated) * 100)
                : 0;

            return (
              <div key={user.UserId} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                        {user.Username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{user.Username}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {user.TasksWorked} task{user.TasksWorked !== 1 ? 's' : ''} worked
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleUserExpand(user.UserId)}
                      className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <svg
                        className={`w-5 h-5 transition-transform ${expandedUsers.has(user.UserId) ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {decimalHoursToHMS(user.TotalAllocated)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t('lit.allocated')}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {decimalHoursToHMS(user.TotalWorked)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t('lit.worked')}</div>
                    </div>
                  </div>

                  {user.TotalAllocated > 0 && (
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-gray-500 dark:text-gray-400">{t('lit.progress')}</span>
                        <span
                          className={`font-medium ${efficiency > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}
                        >
                          {efficiency}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            efficiency > 100
                              ? 'bg-red-500'
                              : efficiency > 80
                                ? 'bg-green-500'
                                : 'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(100, efficiency)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {expandedUsers.has(user.UserId) && (
                  <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/50">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      {t('lit.recentTimeEntries')}
                    </h4>
                    {user.TimeEntries.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('lit.noTimeEntriesRecorded')}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {user.TimeEntries.slice(0, 10).map((entry: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-gray-900 dark:text-white">{entry.TaskName}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(entry.WorkDate).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="font-medium text-green-600 dark:text-green-400 ml-2">
                              {decimalHoursToHMS(parseFloat(entry.Hours))}
                            </div>
                          </div>
                        ))}
                        {user.TimeEntries.length > 10 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2">
                            +{user.TimeEntries.length - 10} more entries
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {!isLoading && filteredStats.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('lit.userSummary')}</h2>
          </div>
          <div className="overflow-x-auto p-2 pt-0">
            <table
              data-grid-key={`project-reporting-by-user-${projectId}`}
              className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
            >
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {t('common.user')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {t('lit.allocated')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {t('lit.worked')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {t('lit.difference')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {t('lit.efficiency')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredStats.map((user) => {
                  const diff = user.TotalWorked - user.TotalAllocated;
                  const efficiency =
                    user.TotalAllocated > 0
                      ? Math.round((user.TotalWorked / user.TotalAllocated) * 100)
                      : 0;

                  return (
                    <tr key={user.UserId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {user.Username}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-blue-600 dark:text-blue-400">
                        {decimalHoursToHMS(user.TotalAllocated)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400">
                        {decimalHoursToHMS(user.TotalWorked)}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-medium ${
                          diff > 0
                            ? 'text-red-600 dark:text-red-400'
                            : diff < 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {diff > 0 ? '+' : ''}
                        {decimalHoursToHMS(diff)}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-medium ${
                          efficiency > 100
                            ? 'text-red-600 dark:text-red-400'
                            : efficiency > 80
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {efficiency}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">
                    {t('common.total')}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-blue-600 dark:text-blue-400">
                    {decimalHoursToHMS(filteredStats.reduce((sum, u) => sum + u.TotalAllocated, 0))}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-green-600 dark:text-green-400">
                    {decimalHoursToHMS(filteredStats.reduce((sum, u) => sum + u.TotalWorked, 0))}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-gray-600 dark:text-gray-400">
                    {decimalHoursToHMS(
                      filteredStats.reduce((sum, u) => sum + u.TotalWorked, 0) -
                        filteredStats.reduce((sum, u) => sum + u.TotalAllocated, 0)
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-gray-600 dark:text-gray-400">
                    {filteredStats.reduce((sum, u) => sum + u.TotalAllocated, 0) > 0
                      ? Math.round(
                          (filteredStats.reduce((sum, u) => sum + u.TotalWorked, 0) /
                            filteredStats.reduce((sum, u) => sum + u.TotalAllocated, 0)) *
                            100
                        )
                      : 0}
                    %
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
