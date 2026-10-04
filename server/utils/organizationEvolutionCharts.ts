/** Pure helpers to shape org overview evolution series (Grafana-style stock/flow charts). */

function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function enumerateDays(from: string, to: string): string[] {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(formatDateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Monday (ISO week start) for a YYYY-MM-DD date. */
export function weekStartMonday(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  const mondayBased = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayBased);
  return formatDateOnly(date);
}

export function enumerateWeeks(from: string, to: string): string[] {
  const start = weekStartMonday(from);
  const end = weekStartMonday(to);
  const weeks: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(endDate.getTime()) || cursor > endDate) {
    return [];
  }
  while (cursor <= endDate) {
    weeks.push(formatDateOnly(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

/** Roll daily metric rows up to ISO weeks (Monday keys). */
export function aggregateRowsByWeek(rows: DailyMetricRow[]): DailyMetricRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const week = weekStartMonday(row.date);
    const key = `${week}\0${row.metric}`;
    totals.set(key, (totals.get(key) || 0) + row.value);
  }
  return [...totals.entries()].map(([key, value]) => {
    const [date, metric] = key.split('\0');
    return { date, metric, value };
  });
}

export function buildCumulativeSeries(
  days: string[],
  dailyCounts: Map<string, number>,
  baseline: number
): { date: string; value: number }[] {
  let running = baseline;
  return days.map((date) => {
    running += dailyCounts.get(date) || 0;
    return { date, value: running };
  });
}

export type DailyMetricRow = { date: string; metric: string; value: number };

export type MultiSeriesPoint = {
  date: string;
  values: Record<string, number>;
};

/** Pick top metrics by total, then build a dense day × metric matrix (0-filled). */
export function buildMultiSeriesDaily(
  days: string[],
  rows: DailyMetricRow[],
  topN = 5
): { seriesKeys: string[]; points: MultiSeriesPoint[] } {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.metric, (totals.get(row.metric) || 0) + row.value);
  }
  const seriesKeys = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key]) => key);

  const keySet = new Set(seriesKeys);
  const byDate = new Map<string, Record<string, number>>();
  for (const day of days) {
    const values: Record<string, number> = {};
    for (const key of seriesKeys) values[key] = 0;
    byDate.set(day, values);
  }
  for (const row of rows) {
    if (!keySet.has(row.metric)) continue;
    const bucket = byDate.get(row.date);
    if (!bucket) continue;
    bucket[row.metric] = (bucket[row.metric] || 0) + row.value;
  }

  return {
    seriesKeys,
    points: days.map((date) => ({ date, values: byDate.get(date) || {} })),
  };
}

export function buildCumulativeMultiSeries(
  days: string[],
  rows: DailyMetricRow[],
  baselines: Map<string, number>,
  topN = 10
): { seriesKeys: string[]; points: MultiSeriesPoint[] } {
  const periodTotals = new Map<string, number>();
  for (const row of rows) {
    periodTotals.set(row.metric, (periodTotals.get(row.metric) || 0) + row.value);
  }
  const allMetrics = new Set<string>([...baselines.keys(), ...periodTotals.keys()]);
  const seriesKeys = [...allMetrics]
    .map((metric) => ({
      metric,
      total: (baselines.get(metric) || 0) + (periodTotals.get(metric) || 0),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, topN)
    .map((entry) => entry.metric);

  const keySet = new Set(seriesKeys);
  const byDate = new Map<string, Record<string, number>>();
  for (const day of days) {
    const values: Record<string, number> = {};
    for (const key of seriesKeys) values[key] = 0;
    byDate.set(day, values);
  }
  for (const row of rows) {
    if (!keySet.has(row.metric)) continue;
    const bucket = byDate.get(row.date);
    if (!bucket) continue;
    bucket[row.metric] = (bucket[row.metric] || 0) + row.value;
  }

  const running: Record<string, number> = {};
  for (const key of seriesKeys) {
    running[key] = baselines.get(key) || 0;
  }
  const points = days.map((date) => {
    const dayValues = byDate.get(date) || {};
    const values: Record<string, number> = {};
    for (const key of seriesKeys) {
      running[key] += dayValues[key] || 0;
      values[key] = running[key];
    }
    return { date, values };
  });
  return { seriesKeys, points };
}
