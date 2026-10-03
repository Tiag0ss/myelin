'use client';

import { useI18n } from '@/lib/i18n/provider';
/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';

export default function UsersPage() {
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    router.replace('/administration');
  }, [router]);

  return <PageLoadingSkeleton />;
}
