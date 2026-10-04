import fs from 'fs';
import path from 'path';
import type { Locale } from './config';
import type { LiteralMap } from './translate';

const FILE_BY_LOCALE: Record<Locale, string> = {
  en: 'litEn.json',
  pt: 'litPt.json',
  es: 'litEs.json',
  fr: 'litFr.json',
};

/** Process-wide cache — one parsed map per locale (not bundled into client). */
const cache = new Map<Locale, LiteralMap>();

export function loadLitServer(locale: Locale): LiteralMap {
  const hit = cache.get(locale);
  if (hit) return hit;

  const file = FILE_BY_LOCALE[locale];
  const full = path.join(process.cwd(), 'lib/i18n/locales', file);
  if (!fs.existsSync(full)) {
    throw new Error(
      `Missing lit locale file at ${full}. In Docker images, ensure lib/i18n/locales is copied into the runtime stage.`
    );
  }
  const parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as LiteralMap;
  cache.set(locale, parsed);
  return parsed;
}
