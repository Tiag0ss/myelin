'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  htmlLang,
  isLocale,
  persistLocaleClient,
  readLocaleStorage,
  type Locale,
} from './config';
import { catalogs, t as translate, type Messages } from './messages';

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Path-based translate: t('common.save'), t('nav.projects'), t('lit.activeProjects'). */
  t: (path: string, vars?: Record<string, string | number>) => string;
  m: Messages;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const stored = readLocaleStorage();
    if (stored && stored !== locale) {
      setLocaleState(stored);
      document.documentElement.lang = htmlLang(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate from storage once
  }, []);

  const setLocale = (l: Locale) => {
    if (!isLocale(l)) return;
    setLocaleState(l);
    persistLocaleClient(l);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = htmlLang(l);
    }
  };

  const value = useMemo<Ctx>(
    () => ({
      locale,
      setLocale,
      t: (path, vars) => translate(locale, path, vars),
      m: catalogs[locale],
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: 'en',
      setLocale: () => {},
      t: (path, vars) => translate('en', path, vars),
      m: catalogs.en,
    };
  }
  return ctx;
}
