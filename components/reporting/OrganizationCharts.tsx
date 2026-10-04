'use client';


import { useI18n } from '@/lib/i18n/provider';
import Link from 'next/link';

export type ChartSlice = { key: string; label: string; value: number; color: string };
export type CompareRow = { key: string; label: string; current: number; previous: number };
export type NamedHours = { id?: number; name: string; hours: number };
export type SimpleBar = { key: string; label: string; value: number; color?: string };
export type TrendPoint = { date: string; green: number; amber: number; red: number };

function ChartCard({
  title,
  empty,
  children,
  hint,
}: {
  title: string;
  empty?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  const { t } = useI18n();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
      {empty ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">{t('lit.noDataForThisPeriod')}</p>
      ) : (
        children
      )}
      {hint ? <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </div>
  );
}

function Donut({ slices, centerLabel }: { slices: ChartSlice[]; centerLabel: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = 160;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-gray-100 dark:stroke-gray-700"
          strokeWidth={stroke}
        />
        {total > 0 &&
          slices.map((slice) => {
            const length = (slice.value / total) * circumference;
            const node = (
              <circle
                key={slice.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += length;
            return node;
          })}
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-gray-900 dark:fill-white"
          style={{ fontSize: 22, fontWeight: 600 }}
        >
          {total}
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          className="fill-gray-500 dark:fill-gray-400"
          style={{ fontSize: 11 }}
        >
          {centerLabel}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: slice.color }} />
            {slice.label}:{' '}
            <span className="font-medium text-gray-900 dark:text-white">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompareBars({ rows, valueSuffix = '' }: { rows: CompareRow[]; valueSuffix?: string }) {
  const { t } = useI18n();

  const max = Math.max(1, ...rows.flatMap((row) => [row.current, row.previous]));
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{row.label}</span>
            <span>
              {Number(row.current).toFixed(1)}
              {valueSuffix} / prev {Number(row.previous).toFixed(1)}
              {valueSuffix}
            </span>
          </div>
          <div className="space-y-1">
            <div className="h-3 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded bg-blue-600"
                style={{ width: `${Math.min(100, (row.current / max) * 100)}%` }}
              />
            </div>
            <div className="h-3 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded bg-gray-400 dark:bg-gray-500"
                style={{ width: `${Math.min(100, (row.previous / max) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-blue-600" /> {t('lit.thisPeriod')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-gray-400" /> {t('common.previous')}
        </span>
      </div>
    </div>
  );
}

function HBars({ rows, formatValue }: { rows: NamedHours[]; formatValue: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((row) => row.hours));
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id ?? row.name} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 items-center">
          <div>
            <div className="text-xs text-gray-700 dark:text-gray-300 truncate mb-0.5" title={row.name}>
              {row.id ? (
                <Link
                  href={`/projects/${row.id}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {row.name}
                </Link>
              ) : (
                row.name
              )}
            </div>
            <div className="h-2.5 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded bg-indigo-500"
                style={{ width: `${Math.min(100, (row.hours / max) * 100)}%` }}
              />
            </div>
          </div>
          <div className="text-xs text-right text-gray-600 dark:text-gray-400">{formatValue(row.hours)}</div>
        </div>
      ))}
    </div>
  );
}

function VBars({ rows }: { rows: SimpleBar[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="flex items-end gap-4 h-36 px-2">
      {rows.map((row) => (
        <div key={row.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{row.value}</span>
          <div
            className="w-full max-w-[3rem] rounded-t"
            style={{
              height: `${Math.max(4, (row.value / max) * 100)}%`,
              background: row.color || '#2563eb',
            }}
          />
          <span className="text-[11px] text-gray-500 dark:text-gray-400 text-center leading-tight">
            {row.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendLines({ points }: { points: TrendPoint[] }) {
  const { t } = useI18n();

  const width = 320;
  const height = 140;
  const pad = { top: 10, right: 8, bottom: 24, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map((p) => p.green + p.amber + p.red));
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const path = (key: 'green' | 'amber' | 'red') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad.left + i * step} ${y(p[key])}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
        <path d={path('green')} fill="none" stroke="#16a34a" strokeWidth="2" />
        <path d={path('amber')} fill="none" stroke="#d97706" strokeWidth="2" />
        <path d={path('red')} fill="none" stroke="#dc2626" strokeWidth="2" />
        {points.map((p, i) => (
          <text
            key={p.date}
            x={pad.left + i * step}
            y={height - 6}
            textAnchor="middle"
            className="fill-gray-500"
            style={{ fontSize: 9 }}
          >
            {p.date.slice(5)}
          </text>
        ))}
      </svg>
      <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-600" /> {t('lit.green')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-600" /> {t('lit.amber')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-600" /> {t('lit.red')}
        </span>
      </div>
    </div>
  );
}

const SERIES_COLORS = [
  '#73bf69',
  '#f2cc0c',
  '#5794f2',
  '#ff780a',
  '#f2495c',
  '#b877d9',
  '#37872d',
  '#fade2a',
  '#8ab8ff',
  '#ff9830',
  '#e02f44',
  '#8f3bb8',
];

export type VolumeTrendPoint = { date: string; tasks: number; projects: number };
export type MultiSeriesChart = {
  seriesKeys: string[];
  points: { date: string; values: Record<string, number> }[];
};

function MultiSeriesLines({
  seriesKeys,
  points,
  formatValue,
  legendMode = 'none',
  yTickFormat,
}: {
  seriesKeys: string[];
  points: { date: string; values: Record<string, number> }[];
  formatValue?: (n: number) => string;
  legendMode?: 'none' | 'sum' | 'last';
  yTickFormat?: (n: number) => string;
}) {
  const width = 400;
  const height = 200;
  const pad = { top: 12, right: 10, bottom: 28, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(
    1,
    ...points.flatMap((p) => seriesKeys.map((key) => p.values[key] || 0))
  );
  const niceMax = max <= 1 ? 1 : Math.ceil(max / 4) * 4;
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const y = (v: number) => pad.top + innerH - (v / niceMax) * innerH;
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const lastPoint = points[points.length - 1];
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => niceMax * ratio);
  const formatTick = yTickFormat || ((n: number) => String(Math.round(n)));

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-52">
        {yTicks.map((tick) => (
          <g key={`yt-${tick}`}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-gray-200 dark:stroke-gray-700"
              strokeWidth="1"
            />
            <text
              x={pad.left - 6}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-gray-500 dark:fill-gray-400"
              style={{ fontSize: 9 }}
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {seriesKeys.map((key, seriesIndex) => {
          const d = points
            .map((p, i) => {
              const x = pad.left + i * step;
              const yy = y(p.values[key] || 0);
              return `${i === 0 ? 'M' : 'L'} ${x} ${yy}`;
            })
            .join(' ');
          return (
            <path
              key={key}
              d={d}
              fill="none"
              stroke={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.date}
              x={pad.left + i * step}
              y={height - 8}
              textAnchor="middle"
              className="fill-gray-500 dark:fill-gray-400"
              style={{ fontSize: 9 }}
            >
              {p.date.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        {seriesKeys.map((key, index) => {
          let legendValue: number | null = null;
          if (legendMode === 'sum') {
            legendValue = points.reduce((sum, p) => sum + (p.values[key] || 0), 0);
          } else if (legendMode === 'last' && lastPoint) {
            legendValue = lastPoint.values[key] || 0;
          }
          return (
            <span key={key} className="inline-flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
              />
              <span className="truncate max-w-[10rem]" title={key}>
                {key}
              </span>
              {legendValue != null && formatValue ? (
                <span className="text-gray-400">({formatValue(legendValue)})</span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function VolumeTrendLines({ points }: { points: VolumeTrendPoint[] }) {
  const { t } = useI18n();
  const tasksLabel = t('lit.tasks');
  const projectsLabel = t('lit.projects');
  return (
    <MultiSeriesLines
      seriesKeys={[tasksLabel, projectsLabel]}
      points={points.map((p) => ({
        date: p.date,
        values: { [tasksLabel]: p.tasks, [projectsLabel]: p.projects },
      }))}
    />
  );
}

export type OrganizationChartsData = {
  rag?: ChartSlice[];
  hoursCompare?: CompareRow[];
  topProjects?: NamedHours[];
  throughput?: SimpleBar[];
  openVsOverdue?: SimpleBar[];
  taskHours?: ChartSlice[];
  schedule?: ChartSlice[];
  ragTrend?: TrendPoint[];
  volumeTrend?: VolumeTrendPoint[];
  tasksByStatus?: MultiSeriesChart;
  tasksByUser?: MultiSeriesChart;
  tasksByType?: MultiSeriesChart;
  hoursByUser?: MultiSeriesChart;
  completionsByUser?: NamedHours[];
  openByCustomer?: ChartSlice[];
  taskTypeMix?: ChartSlice[];
};

export function OrganizationCharts({
  charts,
  formatHours,
}: {
  charts: OrganizationChartsData | null | undefined;
  formatHours: (n: number) => string;
}) {
  const { t } = useI18n();
  if (!charts) return null;

  const rag = charts.rag || [];
  const hoursCompare = charts.hoursCompare || [];
  const topProjects = charts.topProjects || [];
  const throughput = charts.throughput || [];
  const openVsOverdue = charts.openVsOverdue || [];
  const taskHours = charts.taskHours || [];
  const schedule = charts.schedule || [];
  const ragTrend = charts.ragTrend || [];
  const volumeTrend = charts.volumeTrend || [];
  const tasksByStatus = charts.tasksByStatus;
  const tasksByUser = charts.tasksByUser;
  const tasksByType = charts.tasksByType;
  const hoursByUser = charts.hoursByUser;
  const completionsByUser = charts.completionsByUser || [];
  const openByCustomer = charts.openByCustomer || [];
  const taskTypeMix = charts.taskTypeMix || [];

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('lit.charts')}</h2>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard
          title={t('lit.tasksPerStatus')}
          empty={!tasksByStatus || tasksByStatus.seriesKeys.length === 0}
          hint={t('lit.cumulativeStockHint')}
        >
          {tasksByStatus && tasksByStatus.seriesKeys.length > 0 ? (
            <MultiSeriesLines
              seriesKeys={tasksByStatus.seriesKeys}
              points={tasksByStatus.points}
              formatValue={(n) => String(Math.round(n))}
              legendMode="last"
            />
          ) : null}
        </ChartCard>
        <ChartCard
          title={t('lit.tasksPerUser')}
          empty={!tasksByUser || tasksByUser.seriesKeys.length === 0}
          hint={t('lit.cumulativeCompletionsHint')}
        >
          {tasksByUser && tasksByUser.seriesKeys.length > 0 ? (
            <MultiSeriesLines
              seriesKeys={tasksByUser.seriesKeys}
              points={tasksByUser.points}
              formatValue={(n) => String(Math.round(n))}
              legendMode="last"
            />
          ) : null}
        </ChartCard>
        <ChartCard
          title={t('lit.tasksPerType')}
          empty={!tasksByType || tasksByType.seriesKeys.length === 0}
          hint={t('lit.cumulativeStockHint')}
        >
          {tasksByType && tasksByType.seriesKeys.length > 0 ? (
            <MultiSeriesLines
              seriesKeys={tasksByType.seriesKeys}
              points={tasksByType.points}
              formatValue={(n) => String(Math.round(n))}
              legendMode="last"
            />
          ) : null}
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title={t('lit.tasksAndProjectsEvolution')}
          empty={volumeTrend.length === 0}
          hint={t('lit.cumulativeStockHint')}
        >
          {volumeTrend.length > 0 ? <VolumeTrendLines points={volumeTrend} /> : null}
        </ChartCard>
        <ChartCard
          title={t('lit.hoursLoggedByUser')}
          empty={!hoursByUser || hoursByUser.seriesKeys.length === 0}
          hint={t('lit.hoursLoggedByUserHint')}
        >
          {hoursByUser && hoursByUser.seriesKeys.length > 0 ? (
            <MultiSeriesLines
              seriesKeys={hoursByUser.seriesKeys}
              points={hoursByUser.points}
              formatValue={formatHours}
              legendMode="last"
              yTickFormat={(n) => (n >= 10 ? String(Math.round(n)) : n.toFixed(1))}
            />
          ) : null}
        </ChartCard>
        <ChartCard title={t('lit.completedTasksByAssignee')} empty={completionsByUser.length === 0}>
          <HBars rows={completionsByUser} formatValue={(n) => String(Math.round(n))} />
        </ChartCard>
        <ChartCard title={t('lit.openTasksByCustomer')} empty={openByCustomer.every((s) => s.value === 0)}>
          <Donut slices={openByCustomer} centerLabel={t('lit.openTasks')} />
        </ChartCard>
        <ChartCard title={t('lit.tasksByType')} empty={taskTypeMix.every((s) => s.value === 0)}>
          <Donut slices={taskTypeMix} centerLabel={t('lit.tasks')} />
        </ChartCard>
        <ChartCard title={t('lit.projectHealthRag')} empty={rag.every((s) => s.value === 0)}>
          <Donut slices={rag} centerLabel={t('lit.projects')} />
        </ChartCard>
        <ChartCard
          title={t('lit.plannedVsLoggedHours')}
          empty={hoursCompare.every((r) => r.current === 0 && r.previous === 0)}
        >
          <CompareBars rows={hoursCompare} valueSuffix="h" />
        </ChartCard>
        <ChartCard title={t('lit.topProjectsByLoggedHours')} empty={topProjects.length === 0}>
          <HBars rows={topProjects} formatValue={formatHours} />
        </ChartCard>
        <ChartCard title={t('lit.throughputTasksClosed')} empty={throughput.every((r) => r.value === 0)}>
          <VBars
            rows={throughput.map((row, index) => ({
              ...row,
              color: index === 0 ? '#2563eb' : '#9ca3af',
            }))}
          />
        </ChartCard>
        <ChartCard title={t('lit.openVsOverdueTasks')} empty={openVsOverdue.every((r) => r.value === 0)}>
          <VBars rows={openVsOverdue} />
        </ChartCard>
        <ChartCard title={t('lit.leafTasksWithWithoutEstimate')} empty={taskHours.every((s) => s.value === 0)}>
          <Donut slices={taskHours} centerLabel={t('lit.tasks')} />
        </ChartCard>
        <ChartCard title={t('lit.scheduledVsUnscheduledLeafTasks')} empty={schedule.every((s) => s.value === 0)}>
          <Donut slices={schedule} centerLabel={t('lit.tasks')} />
        </ChartCard>
        <ChartCard
          title={t('lit.ragTrendHealthSnapshots')}
          empty={ragTrend.length === 0}
          hint={
            ragTrend.length === 0
              ? t('lit.ragTrendEmptyHint')
              : undefined
          }
        >
          {ragTrend.length > 0 ? <TrendLines points={ragTrend} /> : null}
        </ChartCard>
      </div>
    </section>
  );
}
