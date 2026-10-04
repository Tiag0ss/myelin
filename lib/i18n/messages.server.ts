import type { Locale } from './config';
import { loadLitServer } from './loadLit.server';
import { composeMessages, translate } from './translate';

/** Server-only sync translate (RSC / route handlers). Uses fs — never import from client. */
export function t(locale: Locale, path: string, vars?: Record<string, string | number>): string {
  const lit = loadLitServer(locale);
  const messages = composeMessages(locale, lit);
  const fallback = locale === 'en' ? null : composeMessages('en', loadLitServer('en'));
  return translate(messages, fallback, path, vars);
}

export function loadMessagesServer(locale: Locale) {
  const lit = loadLitServer(locale);
  return { locale, lit, messages: composeMessages(locale, lit) };
}
