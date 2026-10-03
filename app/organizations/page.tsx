'use client';
import { useI18n } from '@/lib/i18n/provider';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';

/** Organizations list lives under Administration; keep detail routes at /organizations/[id]. */
export default function OrganizationsPage() {
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    router.replace('/administration?tab=organizations');
  }, [router]);

  return <PageLoadingSkeleton />;
}
