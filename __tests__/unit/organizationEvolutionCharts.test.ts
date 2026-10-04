import {
  aggregateRowsByWeek,
  buildCumulativeMultiSeries,
  buildCumulativeSeries,
  buildMultiSeriesDaily,
  enumerateDays,
  enumerateWeeks,
  weekStartMonday,
} from '@/server/utils/organizationEvolutionCharts';

describe('organizationEvolutionCharts', () => {
  it('enumerateDays returns inclusive date range', () => {
    expect(enumerateDays('2026-01-01', '2026-01-03')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('enumerateDays returns empty for invalid range', () => {
    expect(enumerateDays('2026-01-03', '2026-01-01')).toEqual([]);
  });

  it('buildCumulativeSeries applies baseline and daily increments', () => {
    const days = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const daily = new Map([
      ['2026-01-01', 2],
      ['2026-01-03', 1],
    ]);
    expect(buildCumulativeSeries(days, daily, 10)).toEqual([
      { date: '2026-01-01', value: 12 },
      { date: '2026-01-02', value: 12 },
      { date: '2026-01-03', value: 13 },
    ]);
  });

  it('buildMultiSeriesDaily keeps top metrics and zero-fills gaps', () => {
    const days = ['2026-01-01', '2026-01-02'];
    const rows = [
      { date: '2026-01-01', metric: 'A', value: 5 },
      { date: '2026-01-01', metric: 'B', value: 1 },
      { date: '2026-01-02', metric: 'A', value: 2 },
      { date: '2026-01-02', metric: 'C', value: 10 },
    ];
    const { seriesKeys, points } = buildMultiSeriesDaily(days, rows, 2);
    expect(seriesKeys).toEqual(['C', 'A']);
    expect(points[0].values).toEqual({ C: 0, A: 5 });
    expect(points[1].values).toEqual({ C: 10, A: 2 });
  });

  it('weekStartMonday and enumerateWeeks bucket by ISO weeks', () => {
    expect(weekStartMonday('2026-01-04')).toBe('2025-12-29'); // Sunday -> previous Monday
    expect(weekStartMonday('2026-01-05')).toBe('2026-01-05'); // Monday
    expect(enumerateWeeks('2026-01-01', '2026-01-20')).toEqual([
      '2025-12-29',
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
    ]);
  });

  it('aggregateRowsByWeek sums daily values into week buckets', () => {
    const rows = [
      { date: '2026-01-05', metric: 'A', value: 2 },
      { date: '2026-01-06', metric: 'A', value: 3 },
      { date: '2026-01-12', metric: 'A', value: 1 },
    ];
    expect(aggregateRowsByWeek(rows)).toEqual([
      { date: '2026-01-05', metric: 'A', value: 5 },
      { date: '2026-01-12', metric: 'A', value: 1 },
    ]);
  });

  it('buildCumulativeMultiSeries accumulates per metric and ranks by baseline+period', () => {
    const days = ['2026-01-01', '2026-01-02'];
    const rows = [
      { date: '2026-01-01', metric: 'Alice', value: 1 },
      { date: '2026-01-02', metric: 'Alice', value: 2 },
      { date: '2026-01-02', metric: 'Bob', value: 4 },
    ];
    const baselines = new Map([
      ['Alice', 3],
      ['Bob', 0],
      ['Carol', 10],
    ]);
    const { seriesKeys, points } = buildCumulativeMultiSeries(days, rows, baselines, 5);
    expect(seriesKeys).toEqual(['Carol', 'Alice', 'Bob']);
    expect(points[0].values.Alice).toBe(4);
    expect(points[0].values.Bob).toBe(0);
    expect(points[0].values.Carol).toBe(10);
    expect(points[1].values.Alice).toBe(6);
    expect(points[1].values.Bob).toBe(4);
    expect(points[1].values.Carol).toBe(10);
  });
});
