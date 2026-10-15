import {
  compareSemver,
  filterChangelogEntries,
  normalizeVersion,
  parseSemverParts,
  type ChangelogEntry,
} from '../../server/modules/whats-new/changelogFilter';

const SAMPLE: ChangelogEntry[] = [
  { version: '1.0.0', title: 'Initial', items: ['a'] },
  { version: '1.0.1', title: 'Patch', items: ['b'] },
  { version: '1.1.0', title: 'Minor', items: ['c'] },
  { version: '1.1.4', title: 'Current', items: ['d'] },
  { version: '2.0.0', title: 'Future', items: ['e'] },
];

describe('parseSemverParts / compareSemver', () => {
  it('parses and strips V prefix', () => {
    expect(parseSemverParts('V1.1.4')).toEqual([1, 1, 4]);
    expect(parseSemverParts('1.0.0-beta')).toEqual([1, 0, 0]);
  });

  it('compares semver correctly', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareSemver('1.1.4', '1.1.3')).toBeGreaterThan(0);
    expect(compareSemver('1.1.0', '1.1.0')).toBe(0);
  });
});

describe('normalizeVersion', () => {
  it('normalizes and rejects empty', () => {
    expect(normalizeVersion('V1.1.4')).toBe('1.1.4');
    expect(normalizeVersion('')).toBeNull();
    expect(normalizeVersion(null)).toBeNull();
  });
});

describe('filterChangelogEntries', () => {
  it('returns full history up to current when full=true', () => {
    const entries = filterChangelogEntries(SAMPLE, '1.1.4', { full: true });
    expect(entries.map((e) => e.version)).toEqual([
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '1.1.4',
    ]);
  });

  it('excludes versions after current', () => {
    const entries = filterChangelogEntries(SAMPLE, '1.1.0', { full: true });
    expect(entries.map((e) => e.version)).toEqual(['1.0.0', '1.0.1', '1.1.0']);
  });

  it('filters exclusive since for delta', () => {
    const entries = filterChangelogEntries(SAMPLE, '1.1.4', { since: '1.0.1' });
    expect(entries.map((e) => e.version)).toEqual(['1.1.0', '1.1.4']);
  });

  it('with null since returns all up to current (first visit)', () => {
    const entries = filterChangelogEntries(SAMPLE, '1.1.4', { since: null });
    expect(entries.map((e) => e.version)).toEqual([
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '1.1.4',
    ]);
  });

  it('returns empty when already on current', () => {
    const entries = filterChangelogEntries(SAMPLE, '1.1.4', { since: '1.1.4' });
    expect(entries).toEqual([]);
  });
});
