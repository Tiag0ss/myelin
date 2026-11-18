import {
  applicationVersionHref,
  parseVersionIdParam,
  productVersionHref,
} from '../../lib/versionDeepLinks';

describe('versionDeepLinks', () => {
  it('builds product and application version deep links', () => {
    expect(productVersionHref(10, 22)).toBe('/products/10?tab=versions&versionId=22');
    expect(applicationVersionHref(3, 9)).toBe('/applications/3?tab=versions&versionId=9');
  });

  it('parses valid versionId query values', () => {
    expect(parseVersionIdParam('12')).toBe(12);
    expect(parseVersionIdParam('0')).toBeNull();
    expect(parseVersionIdParam('abc')).toBeNull();
    expect(parseVersionIdParam(null)).toBeNull();
  });
});
