import { NextResponse } from 'next/server';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { loadLitServer } from '@/lib/i18n/loadLit.server';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string }> }
) {
  const { locale: raw } = await context.params;
  if (!isLocale(raw)) {
    return NextResponse.json({ success: false, message: 'Invalid locale' }, { status: 400 });
  }
  const locale = raw as Locale;
  const lit = loadLitServer(locale);
  return NextResponse.json(lit, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
