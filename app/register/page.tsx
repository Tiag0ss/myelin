'use client';


import { useI18n } from '@/lib/i18n/provider';
import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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

export default function RegisterPage() {
  const { t } = useI18n();

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSettings, setIsCheckingSettings] = useState(true);
  const [companyName, setCompanyName] = useState('Myelin');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const { register } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkRegistrationSettings();
    prepareAuthEncryptionSession().catch(() => {
      // Encryption session is best-effort before submit.
    });
  }, []);

  const checkRegistrationSettings = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/public`);

      if (response.ok) {
        const data = await response.json();
        if (data.allowPublicRegistration !== true) {
          router.replace('/login');
          return;
        }
        setCompanyName(data.companyName || 'Myelin');
        setCompanyLogoUrl(data.companyLogoUrl || '');
      }
    } catch {
      // Fall through to show form if settings probe fails.
    } finally {
      setIsCheckingSettings(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const password = readPasswordInput(passwordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);

    if (password !== confirmPassword) {
      setError(t('auth.passwordsMismatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('lit.passwordMustBeAtLeast6CharactersLong'));
      return;
    }

    setIsLoading(true);

    try {
      await register({
        username: formData.username,
        email: formData.email,
        password,
        firstName: formData.firstName || undefined,
        lastName: formData.lastName || undefined,
      });
      clearPasswordInput(passwordRef);
      clearPasswordInput(confirmPasswordRef);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.registrationFailedPleaseTryAgain'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSettings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pm-bg)]">
        <div className="text-sm text-[var(--pm-muted)]">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <AuthShell
      title={t('auth.registerTitle')}
      description={t('auth.registerSubtitle')}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      footer={
        <p>
          {t('lit.alreadyHaveAnAccount')}{' '}
          <Link href="/login" className={`${authLinkClass} font-medium`}>
            {t('lit.loginHere')}
          </Link>
        </p>
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
            {t('auth.username')} *
          </label>
          <input
            id="username"
            name="username"
            type="text"
            value={formData.username}
            onChange={handleChange}
            required
            className={authFieldClass}
            placeholder={t('lit.chooseAUsername')}
          />
        </div>

        <div>
          <label htmlFor="email" className={authLabelClass}>
            {t('auth.email')} *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            className={authFieldClass}
            placeholder={t('lit.yourEmailCom')}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className={authLabelClass}>
              {t('lit.firstName')}
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              value={formData.firstName}
              onChange={handleChange}
              className={authFieldClass}
              placeholder={t('lit.firstName')}
            />
          </div>

          <div>
            <label htmlFor="lastName" className={authLabelClass}>
              {t('lit.lastName')}
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              value={formData.lastName}
              onChange={handleChange}
              className={authFieldClass}
              placeholder={t('lit.lastName')}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className={authLabelClass}>
            {t('auth.password')} *
          </label>
          <PasswordInput
            ref={passwordRef}
            id="password"
            name="password"
            required
            autoComplete="new-password"
            preventAutofill
            placeholder={t('lit.atLeast6Characters')}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className={authLabelClass}>
            {t('auth.confirmPassword')} *
          </label>
          <PasswordInput
            ref={confirmPasswordRef}
            id="confirmPassword"
            name="confirmPassword"
            required
            autoComplete="new-password"
            preventAutofill
            placeholder={t('lit.reEnterPassword')}
          />
        </div>

        <button type="submit" disabled={isLoading} className={authPrimaryButtonClass}>
          {isLoading ? t('auth.creating') : t('auth.createAccount')}
        </button>
      </form>
    </AuthShell>
  );
}
