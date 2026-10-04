/**
 * Locale JSON lives in ./locales/*.json and is loaded via fs (server) or
 * `/api/i18n/lit/[locale]` (client). Do not statically import those files here —
 * bundling all four into the client graph was the OOM root cause in dev.
 */
export type { LiteralMap } from './translate';
