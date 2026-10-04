import type { Locale } from './config';
import { commonEn, commonEs, commonFr, commonPt, type CommonMessages } from './commonCatalog';
import { navEn, navEs, navFr, navPt, type NavMessages } from './navCatalog';
import { authEn, authEs, authFr, authPt, type AuthMessages } from './authCatalog';
import { chromeEn, chromeEs, chromeFr, chromePt, type ChromeMessages } from './chromeCatalog';
import { pagesEn, pagesEs, pagesFr, pagesPt, type PagesMessages } from './pagesCatalog';

export type LiteralMap = Record<string, string>;

export type Messages = {
  brand: string;
  common: CommonMessages;
  nav: NavMessages;
  auth: AuthMessages;
  chrome: ChromeMessages;
  pages: PagesMessages;
  lit: LiteralMap;
};

const shellByLocale: Record<
  Locale,
  Omit<Messages, 'lit'>
> = {
  en: {
    brand: 'Myelin',
    common: commonEn,
    nav: navEn,
    auth: authEn,
    chrome: chromeEn,
    pages: pagesEn,
  },
  pt: {
    brand: 'Myelin',
    common: commonPt,
    nav: navPt,
    auth: authPt,
    chrome: chromePt,
    pages: pagesPt,
  },
  es: {
    brand: 'Myelin',
    common: commonEs,
    nav: navEs,
    auth: authEs,
    chrome: chromeEs,
    pages: pagesEs,
  },
  fr: {
    brand: 'Myelin',
    common: commonFr,
    nav: navFr,
    auth: authFr,
    chrome: chromeFr,
    pages: pagesFr,
  },
};

export function composeMessages(locale: Locale, lit: LiteralMap): Messages {
  return { ...shellByLocale[locale], lit };
}

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function translate(
  messages: Messages,
  fallback: Messages | null,
  path: string,
  vars?: Record<string, string | number>
): string {
  const raw =
    getByPath(messages, path) ?? (fallback ? getByPath(fallback, path) : undefined) ?? path;
  let s = String(raw);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}
