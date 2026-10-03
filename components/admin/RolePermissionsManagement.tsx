'use client';

import { useI18n } from '@/lib/i18n/provider';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getRolePermissions, updateRolePermission, RolePermission } from '@/lib/api/rolePermissions';
import { useToast } from '@/contexts/ToastContext';

const ROLE_NAMES = ['Developer', 'Support', 'Manager'] as const;
const ROLE_NAME_KEYS: Record<(typeof ROLE_NAMES)[number], string> = {
  Developer: 'lit.developer',
  Support: 'lit.support',
  Manager: 'lit.manager',
};

const PERMISSION_CATEGORIES = [
  {
    nameKey: 'lit.viewPermissions',
    permissions: [
      'CanViewDashboard',
      'CanViewPlanning',
      'CanViewProjects',
      'CanViewTasks',
      'CanViewReports',
      'CanViewBudgetInfo',
    ],
  },
  {
    nameKey: 'lit.projects',
    permissions: ['CanManageProjects', 'CanCreateProjects', 'CanDeleteProjects'],
  },
  {
    nameKey: 'lit.taskManagement',
    permissions: [
      'CanManageTasks',
      'CanCreateTasks',
      'CanDeleteTasks',
      'CanAssignTasks',
      'CanPlanTasks',
      'CanViewOthersPlanning',
    ],
  },
  {
    nameKey: 'lit.timeTracking',
    permissions: ['CanManageTimeEntries'],
  },
  {
    nameKey: 'lit.administration',
    permissions: ['CanManageOrganizations', 'CanManageUsers'],
  },
  {
    nameKey: 'lit.customerManagement',
    permissions: [
      'CanViewCustomers',
      'CanManageCustomers',
      'CanCreateCustomers',
      'CanDeleteCustomers',
    ],
  },
  {
    nameKey: 'lit.ticketManagement',
    permissions: [
      'CanManageTickets',
      'CanCreateTickets',
      'CanDeleteTickets',
      'CanAssignTickets',
      'CanCreateTaskFromTicket',
    ],
  },
  {
    nameKey: 'lit.expenseManagement',
    permissions: [
      'CanViewExpenses',
      'CanCreateExpenses',
      'CanManageExpenses',
      'CanApproveExpenses',
    ],
  },
] as const;

const PERMISSION_LABEL_KEYS: Record<string, string> = {
  CanViewDashboard: 'lit.viewDashboard',
  CanViewPlanning: 'lit.viewPlanning',
  CanViewProjects: 'lit.viewProjects',
  CanManageProjects: 'lit.manageProjects',
  CanCreateProjects: 'lit.createProjects',
  CanDeleteProjects: 'lit.deleteProjects',
  CanViewTasks: 'lit.viewTasks',
  CanManageTasks: 'lit.manageTasks',
  CanCreateTasks: 'lit.createTasks',
  CanDeleteTasks: 'lit.deleteTasks',
  CanAssignTasks: 'lit.assignTasks',
  CanManageTimeEntries: 'lit.manageTimeEntries',
  CanViewReports: 'lit.viewReports',
  CanViewBudgetInfo: 'lit.viewBudgetInfo',
  CanManageOrganizations: 'lit.manageOrganizations',
  CanViewCustomers: 'lit.viewCustomers',
  CanManageCustomers: 'lit.manageCustomers',
  CanCreateCustomers: 'lit.createCustomers',
  CanDeleteCustomers: 'lit.deleteCustomers',
  CanManageUsers: 'lit.manageUsers',
  CanManageTickets: 'lit.manageTickets',
  CanCreateTickets: 'lit.createTickets',
  CanDeleteTickets: 'lit.deleteTickets',
  CanAssignTickets: 'lit.assignTickets',
  CanCreateTaskFromTicket: 'lit.createTaskFromTicket',
  CanPlanTasks: 'lit.planTasks',
  CanViewOthersPlanning: 'lit.viewOthersPlanning',
  CanViewExpenses: 'lit.viewExpenses',
  CanCreateExpenses: 'lit.createExpenses',
  CanManageExpenses: 'lit.manageExpenses',
  CanApproveExpenses: 'lit.approveExpenses',
};

export type RolePermissionsActionsState = {
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
};

type RolePermissionsManagementProps = {
  /** Use `none` when the parent owns PageStickyActions (Administration). */
  actionsPlacement?: 'embedded' | 'none';
  onActionsStateChange?: (state: RolePermissionsActionsState | null) => void;
};

export default function RolePermissionsManagement({
  actionsPlacement = 'embedded',
  onActionsStateChange,
}: RolePermissionsManagementProps) {
  const { t } = useI18n();
  const { token } = useAuth();
  const { showToast } = useToast();
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>(t('lit.developer'));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadPermissions();
     
  }, [token]);

  const loadPermissions = async () => {
    if (!token) return;

    setIsLoading(true);
    setError('');

    try {
      const data = await getRolePermissions(token);
      setPermissions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.failedToLoadPermissions'));
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentRolePermissions = (): RolePermission | null => {
    return permissions.find((p) => p.RoleName === selectedRole) || null;
  };

  const handlePermissionChange = (permissionKey: string, value: boolean) => {
    setPermissions((prev) => {
      const existing = prev.find((p) => p.RoleName === selectedRole);

      if (existing) {
        return prev.map((p) =>
          p.RoleName === selectedRole ? { ...p, [permissionKey]: value } : p
        );
      }

      const newPermission: RolePermission = {
        Id: 0,
        RoleName: selectedRole,
        CanViewDashboard: false,
        CanViewPlanning: false,
        CanViewProjects: false,
        CanManageProjects: false,
        CanCreateProjects: false,
        CanDeleteProjects: false,
        CanViewTasks: false,
        CanManageTasks: false,
        CanCreateTasks: false,
        CanDeleteTasks: false,
        CanAssignTasks: false,
        CanManageTimeEntries: false,
        CanViewReports: false,
        CanViewBudgetInfo: false,
        CanManageOrganizations: false,
        CanViewCustomers: false,
        CanManageCustomers: false,
        CanCreateCustomers: false,
        CanDeleteCustomers: false,
        CanManageUsers: false,
        CanManageTickets: false,
        CanCreateTickets: false,
        CanDeleteTickets: false,
        CanAssignTickets: false,
        CanCreateTaskFromTicket: false,
        CanPlanTasks: false,
        CanViewOthersPlanning: false,
        CanViewApplications: false,
        CanManageApplications: false,
        CanCreateApplications: false,
        CanDeleteApplications: false,
        CanManageReleases: false,
        CanViewExpenses: false,
        CanCreateExpenses: false,
        CanManageExpenses: false,
        CanApproveExpenses: false,
        [permissionKey]: value,
      } as RolePermission;
      return [...prev, newPermission];
    });
  };

  const handleSave = async () => {
    if (!token) return;

    const currentPerms = getCurrentRolePermissions();
    if (!currentPerms) return;

    setIsSaving(true);
    setError('');

    try {
      await updateRolePermission(token, selectedRole, {
        CanViewDashboard: currentPerms.CanViewDashboard,
        CanViewPlanning: currentPerms.CanViewPlanning,
        CanViewProjects: currentPerms.CanViewProjects,
        CanManageProjects: currentPerms.CanManageProjects,
        CanCreateProjects: currentPerms.CanCreateProjects,
        CanDeleteProjects: currentPerms.CanDeleteProjects,
        CanViewTasks: currentPerms.CanViewTasks,
        CanManageTasks: currentPerms.CanManageTasks,
        CanCreateTasks: currentPerms.CanCreateTasks,
        CanDeleteTasks: currentPerms.CanDeleteTasks,
        CanAssignTasks: currentPerms.CanAssignTasks,
        CanManageTimeEntries: currentPerms.CanManageTimeEntries,
        CanViewReports: currentPerms.CanViewReports,
        CanViewBudgetInfo: currentPerms.CanViewBudgetInfo,
        CanManageOrganizations: currentPerms.CanManageOrganizations,
        CanManageUsers: currentPerms.CanManageUsers,
        CanViewCustomers: currentPerms.CanViewCustomers,
        CanManageCustomers: currentPerms.CanManageCustomers,
        CanCreateCustomers: currentPerms.CanCreateCustomers,
        CanDeleteCustomers: currentPerms.CanDeleteCustomers,
        CanManageTickets: currentPerms.CanManageTickets,
        CanCreateTickets: currentPerms.CanCreateTickets,
        CanDeleteTickets: currentPerms.CanDeleteTickets,
        CanAssignTickets: currentPerms.CanAssignTickets,
        CanCreateTaskFromTicket: currentPerms.CanCreateTaskFromTicket,
        CanPlanTasks: currentPerms.CanPlanTasks,
        CanViewOthersPlanning: currentPerms.CanViewOthersPlanning,
        CanViewApplications: currentPerms.CanViewApplications,
        CanManageApplications: currentPerms.CanManageApplications,
        CanCreateApplications: currentPerms.CanCreateApplications,
        CanDeleteApplications: currentPerms.CanDeleteApplications,
        CanManageReleases: currentPerms.CanManageReleases,
        CanViewExpenses: currentPerms.CanViewExpenses,
        CanCreateExpenses: currentPerms.CanCreateExpenses,
        CanManageExpenses: currentPerms.CanManageExpenses,
        CanApproveExpenses: currentPerms.CanApproveExpenses,
      });

      await loadPermissions();
      showToast({
        type: 'success',
        title: t('lit.permissionsSaved'),
        message: t('lit.permissionsSavedSuccessfully'),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.failedToSavePermissions'));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!onActionsStateChange) return;
    if (isLoading) {
      onActionsStateChange(null);
      return;
    }
    onActionsStateChange({
      saving: isSaving,
      canSave: !!getCurrentRolePermissions(),
      onSave: () => {
        void handleSave();
      },
    });
    return () => onActionsStateChange(null);
     
  }, [isLoading, isSaving, selectedRole, permissions]);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--pm-muted)]">
        {t('lit.loadingPermissions')}
      </div>
    );
  }

  const currentPerms = getCurrentRolePermissions();
  const showEmbeddedActions = actionsPlacement === 'embedded';

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--pm-muted)]">
          {t('lit.configureWhatEachRoleCanDoPermissionsFromMultipleRolesAreCombined')}
        </p>
        <div className="inline-flex items-center rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-0.5">
          {ROLE_NAMES.map((roleName) => (
            <button
              key={roleName}
              type="button"
              onClick={() => setSelectedRole(roleName)}
              className={`h-8 rounded px-3 text-sm font-medium transition-colors ${
                selectedRole === roleName
                  ? 'bg-[var(--pm-accent)] text-[var(--pm-bg)]'
                  : 'text-[var(--pm-muted)] hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]'
              }`}
            >
              {t(ROLE_NAME_KEYS[roleName])}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {PERMISSION_CATEGORIES.map((category) => (
          <div
            key={category.nameKey}
            className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)]"
          >
            <div className="border-b border-[var(--pm-border)] px-3 py-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
                {t(category.nameKey)}
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2 lg:grid-cols-3">
              {category.permissions.map((key) => {
                const labelKey = PERMISSION_LABEL_KEYS[key];
                const label = labelKey ? t(labelKey) : key;
                const isChecked = currentPerms
                  ? Boolean((currentPerms as unknown as Record<string, unknown>)[key])
                  : false;

                return (
                  <label
                    key={key}
                    htmlFor={`${selectedRole}-${key}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--pm-panel)]"
                  >
                    <input
                      type="checkbox"
                      id={`${selectedRole}-${key}`}
                      checked={isChecked}
                      onChange={(e) => handlePermissionChange(key, e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                    />
                    <span className="text-sm text-[var(--pm-text)]">{label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[var(--pm-muted)]">
        {t('lit.adminsAlwaysHaveAllPermissionsChangesApplyImmediatelyAfterSaving')}
      </p>

      {showEmbeddedActions && (
        <div className="sticky bottom-0 z-10 -mx-4 flex justify-end border-t border-[var(--pm-border)] bg-[var(--pm-panel)] px-4 py-3 sm:-mx-6 sm:px-6">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !currentPerms}
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isSaving ? t('common.saving') : t('lit.saveChanges')}
          </button>
        </div>
      )}
    </div>
  );
}
