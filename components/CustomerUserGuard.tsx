'use client';
import { useI18n } from '@/lib/i18n/provider';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';

interface CustomerUserGuardProps {
  children: React.ReactNode;
}

/**
 * Guard component that prevents customer users from accessing internal pages.
 * Customer users (those with a CustomerId set) will be redirected to the dashboard.
 */
export default function CustomerUserGuard({ children }: CustomerUserGuardProps) {
  const { t } = useI18n();

  const { user, isLoading, isCustomerUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && isCustomerUser) {
      router.push('/dashboard');
    }
  }, [isLoading, user, isCustomerUser, router]);

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (isCustomerUser) {
    return (
      <div className="w-full rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] p-8 text-center">
        <h2 className="mb-2 text-xl font-semibold text-[var(--pm-text)]">{t('lit.accessRestricted')}</h2>
        <p className="text-[var(--pm-muted)]">{t('lit.youDontHavePermissionToAccessThisPage')}</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          {t('lit.goToDashboard')}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
