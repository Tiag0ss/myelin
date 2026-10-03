import type { Locale } from './config';
import { commonEn, commonEs, commonFr, commonPt, type CommonMessages } from './commonCatalog';
import { navEn, navEs, navFr, navPt, type NavMessages } from './navCatalog';
import { authEn, authEs, authFr, authPt, type AuthMessages } from './authCatalog';
import { chromeEn, chromeEs, chromeFr, chromePt, type ChromeMessages } from './chromeCatalog';
import { pagesEn, pagesEs, pagesFr, pagesPt, type PagesMessages } from './pagesCatalog';
import { litEn, litEs, litFr, litPt, type LiteralMap } from './literalsCatalog';

export type Messages = {
  brand: string;
  common: CommonMessages;
  nav: NavMessages;
  auth: AuthMessages;
  chrome: ChromeMessages;
  pages: PagesMessages;
  lit: LiteralMap;
};

const en: Messages = {
  brand: 'Myelin',
  common: commonEn,
  nav: navEn,
  auth: authEn,
  chrome: chromeEn,
  pages: pagesEn,
  lit: litEn,
};

const pt: Messages = {
  brand: 'Myelin',
  common: commonPt,
  nav: navPt,
  auth: authPt,
  chrome: chromePt,
  pages: pagesPt,
  lit: litPt,
};

const es: Messages = {
  brand: 'Myelin',
  common: commonEs,
  nav: navEs,
  auth: authEs,
  chrome: chromeEs,
  pages: pagesEs,
  lit: litEs,
};

const fr: Messages = {
  brand: 'Myelin',
  common: commonFr,
  nav: navFr,
  auth: authFr,
  chrome: chromeFr,
  pages: pagesFr,
  lit: litFr,
};

export const catalogs: Record<Locale, Messages> = { en, pt, es, fr };

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function t(locale: Locale, path: string, vars?: Record<string, string | number>): string {
  const raw = getByPath(catalogs[locale], path) ?? getByPath(catalogs.en, path) ?? path;
  let s = String(raw);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

