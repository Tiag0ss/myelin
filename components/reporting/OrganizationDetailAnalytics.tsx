'use client';

import { useI18n } from '@/lib/i18n/provider';

export type OrganizationDetailAnalyticsData = {
  customers: { total: number };
  users: { total: number; admins: number; regular: number };
  projects: { total: number; active: number; completed: number };
  tasks: { total: number; completed: number; inProgress: number; overdue: number; unplanned: number };
  tickets: {
    total: number;
    open: number;
    inProgress: number;
    waitingResponse: number;
    resolved: number;
    closed: number;
    unresolvedCount: number;
  };
  hours: {
    totalEstimated: number;
    totalWorked: number;
    thisWeek: number;
    thisPeriod: number;
    totalEstimatedHobby: number;
    totalWorkedHobby: number;
    thisWeekHobby: number;
    thisPeriodHobby: number;
  };
  topProjects: { id: number; name: string; hours: number }[];
  topUsers: { id: number; name: string; hours: number }[];
};

const GRID = 'grid grid-cols-2 lg:grid-cols-4 gap-3';

function StatCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string | number;
  accent: string;
  hint?: string;
}) {
  return (
    <div
      title={label}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border-l-4 ${accent} min-h-[5.5rem]`}
    >
      <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
        {label}
      </p>
      <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">{hint}</p> : null}
    </div>
  );
}

function RankList({
  title,
  emptyLabel,
  rows,
  formatHours,
  valueClassName,
}: {
  title: string;
  emptyLabel: string;
  rows: { id: number; name: string; hours: number }[];
  formatHours: (n: number) => string;
  valueClassName: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{row.name}</p>
              </div>
              <span className={`text-sm font-bold shrink-0 tabular-nums ${valueClassName}`}>
                {formatHours(row.hours)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrganizationDetailAnalytics({
  data,
  formatHours,
  showTickets,
  periodLabel,
}: {
  data: OrganizationDetailAnalyticsData;
  formatHours: (n: number) => string;
  showTickets: boolean;
  periodLabel: string;
}) {
  const { t } = useI18n();
  const hours = data.hours;
  const showHobby =
    hours.totalEstimatedHobby > 0 ||
    hours.totalWorkedHobby > 0 ||
    hours.thisWeekHobby > 0 ||
    hours.thisPeriodHobby > 0;
  const progressPct =
    hours.totalEstimated > 0 ? Math.round((hours.totalWorked / hours.totalEstimated) * 100) : 0;

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('lit.analytics')}</h2>
        <div className={GRID}>
          <StatCard label={t('nav.customers')} value={data.customers.total} accent="border-teal-500" />
          <StatCard
            label={t('nav.users')}
            value={data.users.total}
            accent="border-cyan-500"
            hint={`${data.users.admins} ${t('lit.admin')} · ${data.users.regular} ${t('lit.regular')}`}
          />
          <StatCard
            label={t('lit.activeProjects')}
            value={data.projects.active}
            accent="border-blue-500"
            hint={t('lit.ofTotal', { total: data.projects.total })}
          />
          {showTickets ? (
            <StatCard
              label={t('nav.tickets')}
              value={data.tickets.total}
              accent="border-indigo-500"
              hint={`${data.tickets.unresolvedCount} ${t('lit.unresolved')}`}
            />
          ) : (
            <StatCard
              label={t('lit.totalTasks')}
              value={data.tasks.total}
              accent="border-slate-500"
              hint={`${data.tasks.completed} ${t('lit.completed').toLowerCase()}`}
            />
          )}
        </div>
      </div>

      {showTickets && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('lit.ticketsOverview')}
          </h3>
          <div className={GRID}>
            <StatCard label={t('common.open')} value={data.tickets.open} accent="border-blue-500" />
            <StatCard
              label={t('lit.inProgress3')}
              value={data.tickets.inProgress}
              accent="border-yellow-500"
            />
            <StatCard
              label={t('lit.waitingResponse')}
              value={data.tickets.waitingResponse}
              accent="border-orange-500"
            />
            <StatCard label={t('lit.resolved2')} value={data.tickets.resolved} accent="border-green-500" />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('lit.hoursOverview')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{periodLabel}</p>
        </div>
        <div className={GRID}>
          <StatCard
            label={t('lit.totalEstimated2')}
            value={formatHours(hours.totalEstimated)}
            accent="border-purple-500"
            hint={showHobby ? `+ ${formatHours(hours.totalEstimatedHobby)} ${t('lit.hobby')}` : undefined}
          />
          <StatCard
            label={t('lit.totalWorked')}
            value={formatHours(hours.totalWorked)}
            accent="border-green-500"
            hint={showHobby ? `+ ${formatHours(hours.totalWorkedHobby)} ${t('lit.hobby')}` : undefined}
          />
          <StatCard
            label={t('lit.thisWeek')}
            value={formatHours(hours.thisWeek)}
            accent="border-blue-500"
            hint={showHobby ? `+ ${formatHours(hours.thisWeekHobby)} ${t('lit.hobby')}` : undefined}
          />
          <StatCard
            label={t('lit.thisPeriod')}
            value={formatHours(hours.thisPeriod)}
            accent="border-orange-500"
            hint={showHobby ? `+ ${formatHours(hours.thisPeriodHobby)} ${t('lit.hobby')}` : undefined}
          />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('lit.globalProgress')}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
              {formatHours(hours.totalWorked)} / {formatHours(hours.totalEstimated)}
              {hours.totalEstimated > 0 ? ` (${progressPct}%)` : ''}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${
                hours.totalEstimated > 0 && hours.totalWorked > hours.totalEstimated
                  ? 'bg-red-500'
                  : 'bg-gradient-to-r from-blue-500 to-purple-500'
              }`}
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <RankList
          title={t('lit.topProjectsPeriod', { period: periodLabel })}
          emptyLabel={t('lit.noHoursLoggedInSelectedPeriod')}
          rows={data.topProjects}
          formatHours={formatHours}
          valueClassName="text-blue-600 dark:text-blue-400"
        />
        <RankList
          title={t('lit.topContributorsPeriod', { period: periodLabel })}
          emptyLabel={t('lit.noHoursLoggedInSelectedPeriod')}
          rows={data.topUsers}
          formatHours={formatHours}
          valueClassName="text-green-600 dark:text-green-400"
        />
      </div>
    </section>
  );
}
