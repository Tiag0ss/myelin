'use client';


import { useI18n } from '@/lib/i18n/provider';
import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';

interface ActivityLog {
  Id: number;
  UserId: number | null;
  Username: string | null;
  Action: string;
  EntityType: string | null;
  EntityId: number | null;
  EntityName: string | null;
  Details: string | null;
  IpAddress: string | null;
  UserAgent: string | null;
  CreatedAt: string;
}

interface ActivityStats {
  totalLogs: number;
  todayLogs: number;
  weekLogs: number;
  topActions: { Action: string; count: number }[];
  topUsers: { Username: string; count: number }[];
  recentActivity: ActivityLog[];
}

const EMPTY_FILTERS = {
  action: '',
  entityType: '',
  username: '',
  startDate: '',
  endDate: '',
};

const fieldClass =
  'w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]';

export default function ActivityLogsManagement() {
  const { t } = useI18n();

  const { token } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [modal, setModal] = useState<{
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);
  const [total, setTotal] = useState(0);

  const API_URL = getApiUrl();

  useEffect(() => {
    loadStats();
    loadLogs();
  }, [token, page, filters]);

  const loadStats = async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/activity-logs/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch {
      // Stats are optional; table load surfaces errors.
    }
  };

  const loadLogs = async () => {
    if (!token) return;

    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.username && { username: filters.username }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      });

      const res = await fetch(`${API_URL}/api/activity-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.data.logs);
        setTotal(data.data.pagination.total);
        setTotalPages(data.data.pagination.pages);
      } else {
        setError(t('lit.failedToLoadActivityLogs'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.failedToLoadActivityLogs'));
    } finally {
      setIsLoading(false);
    }
  };

  const updateFilter = <K extends keyof typeof EMPTY_FILTERS>(key: K, value: (typeof EMPTY_FILTERS)[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const handleCleanup = () => {
    setModal({
      type: 'confirm',
      title: t('lit.deleteOldLogs'),
      message: t('lit.deleteLogsOlderThan90DaysThisCannotBeUndone'),
      onConfirm: () => void runCleanup(),
    });
  };

  const runCleanup = async () => {
    try {
      const res = await fetch(`${API_URL}/api/activity-logs/cleanup`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days: 90 }),
      });

      if (res.ok) {
        const data = await res.json();
        setModal({ type: 'alert', title: t('lit.cleanupComplete'), message: data.message || t('lit.oldLogsDeleted') });
        loadLogs();
        loadStats();
      } else {
        setModal({ type: 'alert', title: t('lit.error'), message: t('lit.failedToCleanupLogs') });
      }
    } catch (err: unknown) {
      setModal({
        type: 'alert',
        title: t('lit.error'),
        message: err instanceof Error ? err.message : t('lit.failedToCleanupLogs'),
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATE')) return 'text-green-600 dark:text-green-400';
    if (action.includes('UPDATE') || action.includes('EDIT')) return 'text-blue-600 dark:text-blue-400';
    if (action.includes('DELETE')) return 'text-red-600 dark:text-red-400';
    if (action.includes('LOGIN')) return 'text-purple-600 dark:text-purple-400';
    return 'text-[var(--pm-muted)]';
  };

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-[var(--pm-muted)]">{t('lit.monitorSystemActivityAndUserActions')}</p>
        <button
          type="button"
          onClick={handleCleanup}
          className="h-9 shrink-0 rounded-lg border border-red-500/40 bg-red-600/10 px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white dark:text-red-400"
        >
          {t('lit.cleanup90Days')}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-2 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2 sm:gap-4">
          <div>
            <p className="text-[11px] text-[var(--pm-muted)]">{t('common.total')}</p>
            <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">
              {stats.totalLogs.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.today')}</p>
            <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">
              {stats.todayLogs.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.last7Days')}</p>
            <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">
              {stats.weekLogs.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('common.filters')}</h3>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-7 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-2.5 text-xs font-medium text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]"
            >
              {t('common.clear')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.action')}</label>
            <input
              type="text"
              value={filters.action}
              onChange={(e) => updateFilter('action', e.target.value)}
              placeholder={t('lit.eGCreateUpdate')}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.entityType')}</label>
            <select
              value={filters.entityType}
              onChange={(e) => updateFilter('entityType', e.target.value)}
              className={fieldClass}
            >
              <option value="">{t('lit.allTypes')}</option>
              <option value="User">{t('common.user')}</option>
              <option value="Project">{t('common.project')}</option>
              <option value="Task">{t('common.task')}</option>
              <option value="Ticket">{t('common.ticket')}</option>
              <option value="Organization">{t('common.organization')}</option>
              <option value="Customer">{t('common.customer')}</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('auth.username')}</label>
            <input
              type="text"
              value={filters.username}
              onChange={(e) => updateFilter('username', e.target.value)}
              placeholder={t('auth.username')}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('common.startDate')}</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => updateFilter('startDate', e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('common.endDate')}</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => updateFilter('endDate', e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pm-border)] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
            Entries ({total.toLocaleString()})
          </span>
          {totalPages > 1 && (
            <span className="text-[11px] text-[var(--pm-muted)]">
              Page {page} of {totalPages}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="px-3 py-8 text-center text-sm text-[var(--pm-muted)]">{t('common.loading')}</div>
        ) : logs.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-[var(--pm-muted)]">{t('lit.noActivityLogsFound')}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--pm-border)]">
                <thead className="bg-[var(--pm-panel)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      {t('lit.timestamp')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      {t('common.user')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      {t('lit.action')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      {t('lit.entity')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      {t('common.details')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      {t('lit.ip')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--pm-border)]">
                  {logs.map((log) => (
                    <tr key={log.Id} className="hover:bg-[var(--pm-panel)]">
                      <td className="whitespace-nowrap px-3 py-2 text-sm tabular-nums text-[var(--pm-text)]">
                        {formatDate(log.CreatedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--pm-text)]">
                        {log.Username || <span className="italic text-[var(--pm-muted)]">{t('chrome.themeSystem')}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm">
                        <span className={`font-medium ${getActionColor(log.Action)}`}>{log.Action}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--pm-text)]">
                        {log.EntityType ? (
                          <div>
                            <div className="font-medium">{log.EntityType}</div>
                            {log.EntityName && (
                              <div className="text-[11px] text-[var(--pm-muted)]">{log.EntityName}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--pm-muted)]">—</span>
                        )}
                      </td>
                      <td className="max-w-md truncate px-3 py-2 text-sm text-[var(--pm-text)]" title={log.Details || undefined}>
                        {log.Details || <span className="text-[var(--pm-muted)]">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--pm-muted)]">
                        {log.IpAddress || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-[var(--pm-border)] px-3 py-2">
                <div className="text-xs text-[var(--pm-muted)]">
                  {total.toLocaleString()} total
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="h-8 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-xs font-medium text-[var(--pm-text)] transition-colors hover:bg-[var(--pm-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('common.previous')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="h-8 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-xs font-medium text-[var(--pm-text)] transition-colors hover:bg-[var(--pm-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('common.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmAlertModal
        isOpen={!!modal}
        type={modal?.type || 'alert'}
        title={modal?.title || ''}
        message={modal?.message || ''}
        onClose={() => setModal(null)}
        onConfirm={() => {
          modal?.onConfirm?.();
          setModal(null);
        }}
        confirmLabel={t('common.delete')}
        confirmVariant="danger"
      />
    </div>
  );
}
