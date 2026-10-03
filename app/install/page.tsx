'use client';


import { useI18n } from '@/lib/i18n/provider';
import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import AuthShell, {
  authFieldClass,
  authLabelClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
} from '@/components/AuthShell';

const API_URL = getApiUrl();

export default function InstallPage() {
  const { t } = useI18n();

  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [organizationName, setOrganizationName] = useState('');
  const [organizationAbbreviation, setOrganizationAbbreviation] = useState('');
  const [organizationDescription, setOrganizationDescription] = useState('');

  useEffect(() => {
    checkInstallStatus();
  }, []);

  const checkInstallStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/install/check`);
      if (response.ok) {
        const data = await response.json();
        if (!data.needsInstall) {
          router.replace('/login');
          return;
        }
      }
    } catch {
      // Show wizard if probe fails.
    } finally {
      setIsLoading(false);
    }
  };

  const validateStep1 = (): boolean => {
    if (!username.trim()) {
      setError(t('lit.usernameIsRequired'));
      return false;
    }
    if (!email.trim()) {
      setError(t('lit.emailIsRequired'));
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t('lit.invalidEmailFormat'));
      return false;
    }
    const password = readPasswordInput(passwordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);
    if (!password) {
      setError(t('lit.passwordIsRequired'));
      return false;
    }
    if (password.length < 6) {
      setError(t('lit.passwordMustBeAtLeast6Characters'));
      return false;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordsMismatch'));
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!organizationName.trim()) {
      setError(t('lit.organizationNameIsRequired'));
      return false;
    }
    if (organizationAbbreviation && organizationAbbreviation.length > 10) {
      setError(t('lit.abbreviationMustBe10CharactersOrLess'));
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    setError('');
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handlePrevStep = () => {
    setError('');
    setStep(1);
  };

  const handleSubmit = async () => {
    setError('');
    if (!validateStep2()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/install/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password: readPasswordInput(passwordRef),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          organizationName: organizationName.trim(),
          organizationAbbreviation: organizationAbbreviation.trim() || undefined,
          organizationDescription: organizationDescription.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = data.message || t('lit.setupFailed');
        if (data.error?.sqlMessage) {
          errorMessage += `\n${t('lit.databaseError')}: ${data.error.sqlMessage}`;
        } else if (data.error?.details) {
          errorMessage += `\n${t('common.details')}: ${data.error.details}`;
        }
        throw new Error(errorMessage);
      }

      if (data.token && data.user) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('authUser', JSON.stringify(data.user));
      }
      clearPasswordInput(passwordRef);
      clearPasswordInput(confirmPasswordRef);

      window.location.href = '/dashboard';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.anErrorOccurredDuringSetup'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pm-bg)]">
        <div className="text-sm text-[var(--pm-muted)]">{t('lit.checkingSystemStatus')}</div>
      </div>
    );
  }

  return (
    <AuthShell
      title={t('lit.systemSetup')}
      description={t('lit.welcomeConfigureTheAdministratorAccountAndPrimaryOrganization')}
      companyName="Myelin"
      maxWidthClassName="max-w-lg"
      footer={
        <p>{t('lit.thisSetupWizardOnlyAppearsWhenNoUsersExistInTheSystem')}</p>
      }
    >
      <div className="mb-4 flex items-center justify-center gap-2 text-xs">
        <span
          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-medium ${
            step >= 1
              ? 'bg-[var(--pm-accent)] text-[var(--pm-accent-fg)]'
              : 'bg-[var(--pm-surface-2)] text-[var(--pm-muted)]'
          }`}
        >
          {step > 1 ? '✓' : '1'}
        </span>
        <span className={step >= 1 ? 'text-[var(--pm-text)]' : 'text-[var(--pm-muted)]'}>
          {t('nav.sectionAdmin')}
        </span>
        <span className={`h-px w-8 ${step >= 2 ? 'bg-[var(--pm-accent)]' : 'bg-[var(--pm-border)]'}`} />
        <span
          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-medium ${
            step >= 2
              ? 'bg-[var(--pm-accent)] text-[var(--pm-accent-fg)]'
              : 'bg-[var(--pm-surface-2)] text-[var(--pm-muted)]'
          }`}
        >
          2
        </span>
        <span className={step >= 2 ? 'text-[var(--pm-text)]' : 'text-[var(--pm-muted)]'}>
          {t('common.organization')}
        </span>
      </div>

      {error && (
        <div className="mb-3 whitespace-pre-wrap rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--pm-muted)]">
            {t('lit.createTheMainAdministratorAccountWithFullSystemAccess')}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={authLabelClass}>{t('lit.firstName')}</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t('lit.john')}
                className={authFieldClass}
              />
            </div>
            <div>
              <label className={authLabelClass}>{t('lit.lastName')}</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('lit.doe')}
                className={authFieldClass}
              />
            </div>
          </div>

          <div>
            <label className={authLabelClass}>
              {t('auth.username')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('lit.admin')}
              className={authFieldClass}
              required
            />
          </div>

          <div>
            <label className={authLabelClass}>
              {t('auth.email')} <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('lit.adminExampleCom')}
              className={authFieldClass}
              required
            />
          </div>

          <div>
            <label className={authLabelClass}>
              {t('auth.password')} <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              ref={passwordRef}
              name="password"
              placeholder={t('lit.min6Characters')}
              required
              autoComplete="new-password"
              preventAutofill
            />
          </div>

          <div>
            <label className={authLabelClass}>
              {t('auth.confirmPassword')} <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              ref={confirmPasswordRef}
              name="confirmPassword"
              placeholder={t('lit.repeatPassword')}
              required
              autoComplete="new-password"
              preventAutofill
            />
          </div>

          <button type="button" onClick={handleNextStep} className={authPrimaryButtonClass}>
            {t('lit.nextOrganization')}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--pm-muted)]">
            {t('lit.createThePrimaryOrganizationYouCanAddMoreOrganizationsLater')}
          </p>
          <div>
            <label className={authLabelClass}>
              {t('lit.organizationName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder={t('lit.myCompany')}
              className={authFieldClass}
              required
            />
          </div>

          <div>
            <label className={authLabelClass}>{t('lit.abbreviation')}</label>
            <input
              type="text"
              value={organizationAbbreviation}
              onChange={(e) => setOrganizationAbbreviation(e.target.value.toUpperCase())}
              placeholder={t('lit.eGAcme')}
              maxLength={10}
              className={authFieldClass}
            />
            <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
              {t('lit.usedInTicketNumbersEGTktAcme1Max10Characters')}
            </p>
          </div>

          <div>
            <label className={authLabelClass}>{t('common.description')}</label>
            <textarea
              value={organizationDescription}
              onChange={(e) => setOrganizationDescription(e.target.value)}
              placeholder={t('lit.briefDescriptionOfTheOrganization')}
              rows={3}
              className={`${authFieldClass} resize-none`}
            />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={handlePrevStep} className={authSecondaryButtonClass}>
              {t('common.back')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={authPrimaryButtonClass}
            >
              {isSubmitting ? t('lit.installing') : t('lit.completeSetup')}
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
