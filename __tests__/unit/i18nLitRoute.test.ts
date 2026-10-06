import { isLitLocale, resolveLitLocalePath } from '../../server/modules/i18n/lit';

describe('i18n lit locale helpers', () => {
  it('accepts supported locales only', () => {
    expect(isLitLocale('en')).toBe(true);
    expect(isLitLocale('pt')).toBe(true);
    expect(isLitLocale('es')).toBe(true);
    expect(isLitLocale('fr')).toBe(true);
    expect(isLitLocale('de')).toBe(false);
    expect(isLitLocale('')).toBe(false);
  });

  it('resolves locale files under lib/i18n/locales', () => {
    expect(resolveLitLocalePath('es')).toMatch(/lib[/\\]i18n[/\\]locales[/\\]litEs\.json$/);
    expect(resolveLitLocalePath('pt')).toMatch(/litPt\.json$/);
  });
});
