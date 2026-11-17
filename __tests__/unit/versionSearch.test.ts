import { versionLabelsMatchSearch, versionRowMatchesSearch } from '@/lib/versionSearch';

describe('versionRowMatchesSearch', () => {
  const version = {
    VersionNumber: '1.3.0',
    VersionName: 'Spring release',
    Status: 'Released',
    CustomerName: 'Acme',
  };

  it('matches empty query', () => {
    expect(versionRowMatchesSearch(version, '')).toBe(true);
    expect(versionRowMatchesSearch(version, '   ')).toBe(true);
  });

  it('matches version number, name, status, and customer', () => {
    expect(versionRowMatchesSearch(version, '1.3')).toBe(true);
    expect(versionRowMatchesSearch(version, 'spring')).toBe(true);
    expect(versionRowMatchesSearch(version, 'released')).toBe(true);
    expect(versionRowMatchesSearch(version, 'acme')).toBe(true);
  });

  it('rejects non-matching query', () => {
    expect(versionRowMatchesSearch(version, '2.0.0')).toBe(false);
  });
});

describe('versionLabelsMatchSearch', () => {
  it('matches empty query', () => {
    expect(versionLabelsMatchSearch(['1.2.0'], '')).toBe(true);
  });

  it('matches any label substring', () => {
    expect(versionLabelsMatchSearch(['1.2.0', 'Hotfix'], '1.2')).toBe(true);
    expect(versionLabelsMatchSearch(['1.2.0', 'Hotfix'], 'hot')).toBe(true);
  });

  it('rejects missing labels or non-matching query', () => {
    expect(versionLabelsMatchSearch(undefined, '1.2')).toBe(false);
    expect(versionLabelsMatchSearch([], '1.2')).toBe(false);
    expect(versionLabelsMatchSearch(['1.2.0'], '9.9')).toBe(false);
  });
});
