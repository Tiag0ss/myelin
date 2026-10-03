'use client';

import { useI18n } from '@/lib/i18n/provider';
/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — redirects to the Reporting hub Extract tab. */
export default function ReportsRedirectPage() {
  const { t } = useI18n();
  const router = useRouter();
  useEffect(() => {
    router.replace('/reporting?tab=extract');
  }, [router]);

  return (
    <div className="w-full flex items-center justify-center text-gray-600 dark:text-gray-300">
      {t('lit.redirectingToReporting')}
    </div>
  );
}
