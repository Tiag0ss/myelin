'use client';


import { useI18n } from '@/lib/i18n/provider';
import React, { useEffect, useState } from 'react';
import TaskFormVisibilitySettingsPanel, {
  type TaskFormVisibilityActionsState,
} from '@/components/admin/TaskFormVisibilitySettingsPanel';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import { organizationsApi, Organization } from '@/lib/api/organizations';

interface ProfileTaskFormVisibilityProps {
  token: string;
  onActionsStateChange?: (state: TaskFormVisibilityActionsState | null) => void;
}

export default function ProfileTaskFormVisibility({
  token,
  onActionsStateChange,
}: ProfileTaskFormVisibilityProps) {
  const { t } = useI18n();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pendingReset, setPendingReset] = useState<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingOrgs(true);
    setLoadError('');
    organizationsApi
      .getAll(token)
      .then((result) => {
        if (cancelled) return;
        const orgs = result.organizations || [];
        setOrganizations(orgs);
        if (orgs.length > 0) {
          setOrganizationId((prev) => prev ?? orgs[0].Id);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : t('lit.failedToLoadOrganizations'));
      })
      .finally(() => {
        if (!cancelled) setLoadingOrgs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!organizationId) onActionsStateChange?.(null);
  }, [organizationId, onActionsStateChange]);

  if (loadingOrgs) {
    return <div className="text-sm text-[var(--pm-muted)]">{t('common.loading')}</div>;
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-400 bg-red-100 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
        {loadError}
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3 text-sm text-[var(--pm-muted)]">
        {t('lit.youAreNotAMemberOfAnyOrganizationSoThereIsNoTaskFormLayoutToCustomize')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('common.organization')}</label>
        <select
          value={organizationId ?? ''}
          onChange={(e) => setOrganizationId(Number(e.target.value))}
          className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
        >
          {organizations.map((org) => (
            <option key={org.Id} value={org.Id}>
              {org.Name}
              {org.Abbreviation ? ` (${org.Abbreviation})` : ''}
            </option>
          ))}
        </select>
        <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
          {t('lit.personalOverridesArePerOrganizationCascadeYourOverrideOrganizationGlobal')}
        </p>
      </div>

      {organizationId && (
        <TaskFormVisibilitySettingsPanel
          mode="user"
          token={token}
          organizationId={organizationId}
          canManage
          actionsPlacement="none"
          onActionsStateChange={onActionsStateChange}
          onRequestResetConfirm={(onConfirm) => {
            setPendingReset(() => onConfirm);
            setResetConfirmOpen(true);
          }}
        />
      )}

      <ConfirmAlertModal
        isOpen={resetConfirmOpen}
        type="confirm"
        title={t('lit.useOrganizationDefault')}
        message={t('lit.thisRemovesYourPersonalTaskFormOverrideForThisOrganizationTheOrganizatio')}
        onClose={() => {
          setResetConfirmOpen(false);
          setPendingReset(null);
        }}
        onConfirm={() => {
          const action = pendingReset;
          setResetConfirmOpen(false);
          setPendingReset(null);
          action?.();
        }}
        confirmLabel={t('lit.reset')}
        confirmVariant="primary"
      />
    </div>
  );
}
