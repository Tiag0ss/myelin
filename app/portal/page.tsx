'use client';

import { useI18n } from '@/lib/i18n/provider';
/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CustomerPortalPage() {
  const { t } = useI18n();
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, []);
  return null;
}
