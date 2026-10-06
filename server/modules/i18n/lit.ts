import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';

const router = Router();

const LIT_LOCALES = ['pt', 'en', 'es', 'fr'] as const;
type LitLocale = (typeof LIT_LOCALES)[number];

const FILE_BY_LOCALE: Record<LitLocale, string> = {
  en: 'litEn.json',
  pt: 'litPt.json',
  es: 'litEs.json',
  fr: 'litFr.json',
};

const cache = new Map<LitLocale, Record<string, string>>();

export function isLitLocale(value: string): value is LitLocale {
  return (LIT_LOCALES as readonly string[]).includes(value);
}

export function resolveLitLocalePath(locale: LitLocale): string {
  return path.join(process.cwd(), 'lib/i18n/locales', FILE_BY_LOCALE[locale]);
}

function loadLit(locale: LitLocale): Record<string, string> {
  const hit = cache.get(locale);
  if (hit) return hit;

  const full = resolveLitLocalePath(locale);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing lit locale file at ${full}`);
  }
  const parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, string>;
  cache.set(locale, parsed);
  return parsed;
}

/**
 * Public locale catalog for client language switches.
 * Must live on Express: `/api/*` is never forwarded to Next.js App Router.
 *
 * GET /api/i18n/lit/:locale
 */
router.get('/lit/:locale', (req: Request, res: Response) => {
  const raw = String(req.params.locale || '').toLowerCase();
  if (!isLitLocale(raw)) {
    return res.status(400).json({ success: false, message: 'Invalid locale' });
  }

  try {
    const lit = loadLit(raw);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json(lit);
  } catch (error) {
    logger.error('Failed to load lit locale', {
      locale: raw,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ success: false, message: 'Failed to load locale' });
  }
});

export default router;
