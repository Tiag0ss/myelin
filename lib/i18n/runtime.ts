import type { Locale } from './config';
import { composeMessages, translate, type LiteralMap, type Messages } from './translate';

/**
 * Client-safe sync translator. Lit maps are injected by I18nProvider (SSR props + fetch),
 * so Turbopack never bundles the large locale JSON into page graphs.
 */
let activeLocale: Locale = 'en';
let activeLit: LiteralMap = {};
let activeMessages: Messages = composeMessages('en', {});
let fallbackMessages: Messages = composeMessages('en', {});

export function setI18nRuntime(locale: Locale, lit: LiteralMap, fallbackLit?: LiteralMap): void {
  activeLocale = locale;
  activeLit = lit;
  activeMessages = composeMessages(locale, lit);
  fallbackMessages = composeMessages('en', fallbackLit ?? (locale === 'en' ? lit : {}));
}

export function getRuntimeLocale(): Locale {
  return activeLocale;
}

export function getRuntimeLit(): LiteralMap {
  return activeLit;
}

export function t(path: string, vars?: Record<string, string | number>): string {
  return translate(activeMessages, fallbackMessages, path, vars);
}

/** @deprecated Prefer runtime `t` or useI18n — kept as alias for gradual migration. */
export { t as tPath };
