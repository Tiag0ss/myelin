/**
 * Compatibility shim — client code should prefer `useI18n()` or `@/lib/i18n/runtime`.
 * Must NOT import locale JSON (that caused Next/Turbopack heap blow-ups in the shared process).
 */
import type { Locale } from './config';
import { t as runtimeT } from './runtime';

export type { LiteralMap, Messages } from './translate';
export { composeMessages, translate } from './translate';
export { setI18nRuntime, getRuntimeLocale, getRuntimeLit } from './runtime';

/**
 * Supports both:
 * - t('lit.key', vars?)  — preferred
 * - t(locale, 'lit.key', vars?) — legacy helpers; locale is ignored (runtime locale wins)
 */
export function t(
  localeOrPath: Locale | string,
  pathOrVars?: string | Record<string, string | number>,
  maybeVars?: Record<string, string | number>
): string {
  if (typeof pathOrVars === 'string') {
    return runtimeT(pathOrVars, maybeVars);
  }
  return runtimeT(localeOrPath, pathOrVars);
}

export const tPath = t;
