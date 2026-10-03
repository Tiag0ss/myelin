'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getApiUrl } from '@/lib/api/config';
import { readStoredSession } from '@/lib/auth/session';
import { useI18n } from '@/lib/i18n/provider';

function SsoAuthorizeLoading() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pm-bg)]">
      <p className="text-sm text-[var(--pm-muted)]">{t('common.loading')}</p>
    </div>
  );
}

function SsoAuthorizeInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState(() => t('lit.preparingSingleSignOn'));

  useEffect(() => {
    const run = async () => {
      const redirectUri = searchParams.get('redirect_uri') || searchParams.get('redirectUri') || '';
      const state = searchParams.get('state') || '';
      const clientId = searchParams.get('client_id') || searchParams.get('clientId') || 'synapse';

      if (!redirectUri) {
        setMessage(t('lit.missingRedirectUri'));
        return;
      }

      const session = readStoredSession();
      const token = session?.token;
      if (!token) {
        const returnUrl = `/sso/authorize?${searchParams.toString()}`;
        router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
        return;
      }

      try {
        const res = await fetch(`${getApiUrl()}/api/sso/handoff`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ redirectUri, state, clientId }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setMessage(data.message || t('lit.ssoHandoffFailed'));
          return;
        }

        const target = new URL(data.data.redirectUri);
        target.searchParams.set('code', data.data.code);
        if (state) target.searchParams.set('state', state);
        window.location.href = target.toString();
      } catch {
        setMessage(t('lit.ssoHandoffFailed'));
      }
    };

    void run();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pm-bg)] px-4">
      <p className="text-sm text-[var(--pm-muted)]">{message}</p>
    </div>
  );
}

export default function SsoAuthorizePage() {
  return (
    <Suspense fallback={<SsoAuthorizeLoading />}>
      <SsoAuthorizeInner />
    </Suspense>
  );
}
