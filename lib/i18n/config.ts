export type Locale = 'pt' | 'en' | 'es' | 'fr';

export const LOCALES: readonly Locale[] = ['pt', 'en', 'es', 'fr'] as const;

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
  fr: 'Français',
};

export const LUSOPHONE_COUNTRIES = ['PT', 'BR', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL', 'GQ', 'MO'] as const;

/** Prefer these country codes when no cookie is set. */
export const LOCALE_COUNTRY_HINTS: Record<string, Locale> = {
  PT: 'pt',
  BR: 'pt',
  AO: 'pt',
  MZ: 'pt',
  CV: 'pt',
  GW: 'pt',
  ST: 'pt',
  TL: 'pt',
  GQ: 'pt',
  MO: 'pt',
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  CL: 'es',
  PE: 'es',
  UY: 'es',
  PY: 'es',
  BO: 'es',
  EC: 'es',
  VE: 'es',
  CR: 'es',
  PA: 'es',
  GT: 'es',
  HN: 'es',
  SV: 'es',
  NI: 'es',
  DO: 'es',
  CU: 'es',
  FR: 'fr',
  BE: 'fr',
  LU: 'fr',
  MC: 'fr',
  CH: 'fr',
};

export const LOCALE_COOKIE = 'myelin_locale';
export const LOCALE_MAX_AGE_SEC = 365 * 24 * 60 * 60;

export function isLocale(v: string | undefined | null): v is Locale {
  return v === 'pt' || v === 'en' || v === 'es' || v === 'fr';
}

export function htmlLang(locale: Locale): string {
  if (locale === 'pt') return 'pt-PT';
  if (locale === 'es') return 'es-ES';
  if (locale === 'fr') return 'fr-FR';
  return 'en';
}

export function persistLocaleClient(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_MAX_AGE_SEC}; SameSite=Lax`;
  try {
    localStorage.setItem(LOCALE_COOKIE, locale);
  } catch {
    /* ignore */
  }
}

export function readLocaleStorage(): Locale | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(LOCALE_COOKIE);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}
