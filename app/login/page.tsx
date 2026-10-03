'use client';


import { useI18n } from '@/lib/i18n/provider';
import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { prepareAuthEncryptionSession } from '@/lib/api/auth';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import AuthShell, {
  authFieldClass,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/components/AuthShell';

function AuthPageLoading() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pm-bg)]">
      <div className="text-sm text-[var(--pm-muted)]">{t('common.loading')}</div>
    </div>
  );
}

function LoginPageInner() {
  const { t } = useI18n();

  const [username, setUsername] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(false);
  const [registrationType, setRegistrationType] = useState<'internal' | 'customer'>('internal');
  const [companyName, setCompanyName] = useState('Myelin');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    checkInstallStatus();
    checkRegistrationSettings();
    prepareAuthEncryptionSession().catch(() => {
      // Encryption session is best-effort before submit.
    });
  }, []);

  const checkInstallStatus = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/install/check`);
      if (response.ok) {
        const data = await response.json();
        if (data.needsInstall) {
          router.replace('/install');
          return;
        }
      }
    } catch {
      // Ignore install probe failures on login.
    }
  };

  const checkRegistrationSettings = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/public`);

      if (response.ok) {
        const data = await response.json();
        setAllowPublicRegistration(data.allowPublicRegistration === true);
        setRegistrationType(data.publicRegistrationType || 'internal');
        setCompanyName(data.companyName || 'Myelin');
        setCompanyLogoUrl(data.companyLogoUrl || '');
      }
    } catch {
      // Keep defaults when public settings are unavailable.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login({ username, password: readPasswordInput(passwordRef) });
      clearPasswordInput(passwordRef);
      const returnUrl = searchParams.get('returnUrl');
      if (returnUrl && returnUrl.startsWith('/')) {
        router.push(returnUrl);
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.loginFailedPleaseTryAgain'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.loginTitle')}
      description={t('auth.loginSubtitle')}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      footer={
        allowPublicRegistration ? (
          <p>
            {registrationType === 'customer'
              ? t('lit.needCustomerAccess')
              : t('lit.dontHaveAnAccount')}{' '}
            <Link href="/register" className={`${authLinkClass} font-medium`}>
              {registrationType === 'customer' ? t('lit.registerAsCustomer') : t('auth.createAccount')}
            </Link>
          </p>
        ) : null
      }
    >
      {error && (
        <div className="mb-3 rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="username" className={authLabelClass}>
            {t('auth.usernameOrEmail')}
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className={authFieldClass}
            placeholder={t('lit.enterYourUsernameOrEmail')}
          />
        </div>

        <div>
          <label htmlFor="password" className={authLabelClass}>
            {t('auth.password')}
          </label>
          <PasswordInput
            ref={passwordRef}
            id="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder={t('lit.enterYourPassword')}
          />
          <div className="mt-1.5 text-right">
            <Link href="/forgot-password" className={`text-xs ${authLinkClass}`}>
              {t('auth.forgotPassword')}
            </Link>
          </div>
        </div>

        <button type="submit" disabled={isLoading} className={authPrimaryButtonClass}>
          {isLoading ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageLoading />}>
      <LoginPageInner />
    </Suspense>
  );
}
