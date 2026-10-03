'use client';


import { useI18n } from '@/lib/i18n/provider';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { useToast } from '@/contexts/ToastContext';
import { getApiUrl } from '@/lib/api/config';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import AuthShell, {
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/components/AuthShell';

export default function ResetPasswordPage() {
  const { t } = useI18n();

  const { showToast } = useToast();
  const [token, setToken] = useState('');
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [isCheckingToken, setIsCheckingToken] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [companyName, setCompanyName] = useState('Myelin');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token') || '';
    setToken(tokenParam);
  }, []);

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/system-settings/public`);
        if (response.ok) {
          const data = await response.json();
          setCompanyName(data.companyName || 'Myelin');
          setCompanyLogoUrl(data.companyLogoUrl || '');
        }
      } catch {
        // Keep defaults.
      }
    };
    void loadBranding();
  }, []);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsTokenValid(false);
        setIsCheckingToken(false);
        return;
      }

      try {
        setIsCheckingToken(true);
        const result = await authApi.validateResetToken(token);
        setIsTokenValid(!!result.valid);
        if (!result.valid) {
          setError(t('lit.thisResetLinkIsInvalidOrExpired'));
        }
      } catch (err: unknown) {
        setIsTokenValid(false);
        setError(err instanceof Error ? err.message : t('lit.failedToValidateResetLink'));
      } finally {
        setIsCheckingToken(false);
      }
    };

    validateToken();
  }, [token]);

  const syncSubmitState = () => {
    const newPassword = readPasswordInput(newPasswordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);
    setCanSubmit(
      isTokenValid &&
        newPassword.length >= 8 &&
        confirmPassword.length > 0 &&
        newPassword === confirmPassword
    );
  };

  useEffect(() => {
    syncSubmitState();
  }, [isTokenValid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const newPassword = readPasswordInput(newPasswordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);

    if (newPassword.length < 8) {
      setError(t('lit.passwordMustBeAtLeast8Characters'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordsMismatch'));
      return;
    }

    try {
      setIsSaving(true);
      const result = await authApi.resetPassword(token, newPassword);
      const message =
        result.message || t('lit.passwordResetSuccessfullyRedirectingToLogin');
      showToast({ type: 'success', title: t('lit.passwordReset'), message });
      clearPasswordInput(newPasswordRef);
      clearPasswordInput(confirmPasswordRef);
      setCanSubmit(false);
      setTimeout(() => router.push('/login'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.failedToResetPassword'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.resetTitle')}
      description={t('auth.resetHint')}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      footer={
        <Link href="/login" className={authLinkClass}>
          {t('auth.backSignIn')}
        </Link>
      }
    >
      {error && (
        <div className="mb-3 rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {isCheckingToken ? (
        <div className="text-center text-sm text-[var(--pm-muted)]">
          {t('lit.validatingResetLink')}
        </div>
      ) : !isTokenValid ? (
        <div className="text-center">
          <Link href="/forgot-password" className={`text-sm ${authLinkClass}`}>
            {t('lit.requestANewResetLink')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="newPassword" className={authLabelClass}>
              {t('auth.newPassword')}
            </label>
            <PasswordInput
              ref={newPasswordRef}
              id="newPassword"
              name="newPassword"
              onInput={syncSubmitState}
              required
              minLength={8}
              autoComplete="new-password"
              preventAutofill
              placeholder={t('lit.atLeast8Characters')}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className={authLabelClass}>
              {t('auth.confirmPassword')}
            </label>
            <PasswordInput
              ref={confirmPasswordRef}
              id="confirmPassword"
              name="confirmPassword"
              onInput={syncSubmitState}
              required
              minLength={8}
              autoComplete="new-password"
              preventAutofill
              placeholder={t('lit.repeatNewPassword')}
            />
          </div>

          <button type="submit" disabled={isSaving || !canSubmit} className={authPrimaryButtonClass}>
            {isSaving ? t('lit.resetting') : t('auth.resetTitle')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
