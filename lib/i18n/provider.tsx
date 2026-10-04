'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  htmlLang,
  isLocale,
  persistLocaleClient,
  readLocaleStorage,
  type Locale,
} from './config';
import { setI18nRuntime, t as runtimeT } from './runtime';
import { composeMessages, translate, type LiteralMap, type Messages } from './translate';

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Path-based translate: t('common.save'), t('nav.projects'), t('lit.activeProjects'). */
  t: (path: string, vars?: Record<string, string | number>) => string;
  m: Messages;
};

const I18nContext = createContext<Ctx | null>(null);

const litCache = new Map<Locale, LiteralMap>();

async function fetchLit(locale: Locale): Promise<LiteralMap> {
  const cached = litCache.get(locale);
  if (cached) return cached;
  const res = await fetch(`/api/i18n/lit/${locale}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Failed to load locale ${locale}`);
  const lit = (await res.json()) as LiteralMap;
  litCache.set(locale, lit);
  return lit;
}

export function I18nProvider({
  children,
  initialLocale,
  initialLit,
  initialFallbackLit,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
  /** Server-loaded lit map so the client never statically imports locale JSON. */
  initialLit: LiteralMap;
  /** English lit for missing-key fallback (optional when locale is already en). */
  initialFallbackLit?: LiteralMap;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [lit, setLit] = useState<LiteralMap>(initialLit);
  const [fallbackLit, setFallbackLit] = useState<LiteralMap>(
    initialFallbackLit ?? (initialLocale === 'en' ? initialLit : {})
  );

  useEffect(() => {
    litCache.set(initialLocale, initialLit);
    if (initialFallbackLit) litCache.set('en', initialFallbackLit);
  }, [initialLocale, initialLit, initialFallbackLit]);

  useEffect(() => {
    const stored = readLocaleStorage();
    if (!stored || stored === initialLocale) return;
    void (async () => {
      try {
        const nextLit = await fetchLit(stored);
        if (stored !== 'en' && !litCache.has('en')) {
          try {
            setFallbackLit(await fetchLit('en'));
          } catch {
            /* keep SSR fallback */
          }
        }
        setLit(nextLit);
        setLocaleState(stored);
        document.documentElement.lang = htmlLang(stored);
      } catch {
        /* keep SSR locale */
      }
    })();
  }, [initialLocale]);

  // Keep module-level runtime.t() in sync during render (not only in effects),
  // so helpers that import `@/lib/i18n/runtime` see the SSR-provided lit map.
  setI18nRuntime(locale, lit, fallbackLit);

  const setLocale = (l: Locale) => {
    if (!isLocale(l)) return;
    void (async () => {
      try {
        const nextLit = await fetchLit(l);
        if (l !== 'en' && !litCache.has('en') && Object.keys(fallbackLit).length === 0) {
          try {
            setFallbackLit(await fetchLit('en'));
          } catch {
            /* ignore */
          }
        }
        setLit(nextLit);
        setLocaleState(l);
        persistLocaleClient(l);
        if (typeof document !== 'undefined') {
          document.documentElement.lang = htmlLang(l);
        }
      } catch {
        /* keep current locale */
      }
    })();
  };

  const messages = useMemo(() => composeMessages(locale, lit), [locale, lit]);
  const fallbackMessages = useMemo(
    () => composeMessages('en', locale === 'en' ? lit : fallbackLit),
    [locale, lit, fallbackLit]
  );

  const value = useMemo<Ctx>(
    () => ({
      locale,
      setLocale,
      t: (path, vars) => translate(messages, fallbackMessages, path, vars),
      m: messages,
    }),
    [locale, messages, fallbackMessages]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: 'en',
      setLocale: () => {},
      t: (path, vars) => runtimeT(path, vars),
      m: composeMessages('en', {}),
    };
  }
  return ctx;
}
