import {
  isLocale,
  LUSOPHONE_COUNTRIES,
  LOCALE_COUNTRY_HINTS,
  type Locale,
} from './config';

/** Shared locale detection: cookie → country → Accept-Language → en. */
export function detectLocaleFromHints(
  cookieVal: string | undefined,
  country: string,
  acceptLang: string
): Locale {
  if (isLocale(cookieVal)) return cookieVal;
  const c = country.trim().toUpperCase();
  if (c && LOCALE_COUNTRY_HINTS[c]) return LOCALE_COUNTRY_HINTS[c];
  if (c && (LUSOPHONE_COUNTRIES as readonly string[]).includes(c)) return 'pt';
  const al = acceptLang.toLowerCase();
  if (al.startsWith('pt') || al.includes(',pt') || al.includes(' pt')) return 'pt';
  if (al.startsWith('es') || al.includes(',es') || al.includes(' es')) return 'es';
  if (al.startsWith('fr') || al.includes(',fr') || al.includes(' fr')) return 'fr';
  return 'en';
}
