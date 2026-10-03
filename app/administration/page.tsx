'use client';

import { useI18n } from '@/lib/i18n/provider';
/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';
import PageTabs from '@/components/PageTabs';
import PageStickyChrome from '@/components/PageStickyChrome';
import PageStickyActions, { pageActionButtonClass } from '@/components/PageStickyActions';
import UsersManagement from '@/components/admin/UsersManagement';
import RolePermissionsManagement, {
  type RolePermissionsActionsState,
} from '@/components/admin/RolePermissionsManagement';
import SystemSettings, {
  type SystemSettingsActionsState,
} from '@/components/admin/SystemSettings';
import ActivityLogsManagement from '@/components/admin/ActivityLogsManagement';
import FrontpageEditor from '@/components/admin/FrontpageEditor';
import HolidaysManagement from '@/components/admin/HolidaysManagement';
import CustomFieldsManagement from '@/components/admin/CustomFieldsManagement';
import CustomTablesManagement from '@/components/admin/CustomTablesManagement';
import ApiTokensManagement from '@/components/admin/ApiTokensManagement';
import TaskFormVisibilitySettingsPanel, {
  type TaskFormVisibilityActionsState,
} from '@/components/admin/TaskFormVisibilitySettingsPanel';
import OrganizationsManagement from '@/components/admin/OrganizationsManagement';
import { useUrlTab } from '@/hooks/useUrlTab';

type AdminTab =
  | 'users'
  | 'organizations'
  | 'permissions'
  | 'settings'
  | 'task-form'
  | 'custom-fields'
  | 'custom-tables'
  | 'holidays'
  | 'logs'
  | 'frontpage'
  | 'api-tokens';

const ADMIN_TABS = [
  'users',
  'organizations',
  'permissions',
  'settings',
  'task-form',
  'custom-fields',
  'custom-tables',
  'holidays',
  'logs',
  'frontpage',
  'api-tokens',
] as const;

const ADMIN_TAB_LABELS: { id: AdminTab; labelKey: string }[] = [
  { id: 'users', labelKey: 'nav.users' },
  { id: 'organizations', labelKey: 'nav.organizations' },
  { id: 'permissions', labelKey: 'lit.rolePermissions' },
  { id: 'settings', labelKey: 'lit.systemSettings' },
  { id: 'task-form', labelKey: 'lit.taskForm' },
  { id: 'custom-fields', labelKey: 'lit.customFields' },
  { id: 'custom-tables', labelKey: 'lit.customTables' },
  { id: 'holidays', labelKey: 'lit.holidays' },
  { id: 'logs', labelKey: 'lit.activityLogs' },
  { id: 'frontpage', labelKey: 'lit.frontpage' },
  { id: 'api-tokens', labelKey: 'lit.apiTokens' },
];

export default function AdministrationPage() {
  return (
    <Suspense fallback={<PageLoadingSkeleton />}>
      <AdministrationPageContent />
    </Suspense>
  );
}

function AdministrationPageContent() {
  const { t } = useI18n();
  const adminTabLabels = useMemo(
    () => ADMIN_TAB_LABELS.map(({ id, labelKey }) => ({ id, label: t(labelKey) })),
    [t]
  );
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useUrlTab<AdminTab>(ADMIN_TABS, 'users');
  const [taskFormActions, setTaskFormActions] = useState<TaskFormVisibilityActionsState | null>(null);
  const [rolePermissionsActions, setRolePermissionsActions] =
    useState<RolePermissionsActionsState | null>(null);
  const [systemSettingsActions, setSystemSettingsActions] =
    useState<SystemSettingsActionsState | null>(null);
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!user || !user.isAdmin) {
    return null;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <PageStickyChrome>
        <div>
          <h1 className="text-xl font-semibold text-[var(--pm-text)]">{t('pages.administration.title')}</h1>
          <p className="text-sm text-[var(--pm-muted)]">{t('lit.manageSystemSettingsAndConfigurations')}</p>
        </div>

        <PageTabs
          tabs={adminTabLabels}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as AdminTab)}
        />
      </PageStickyChrome>

      <main ref={scrollContainerRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-3">
        <div className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] shadow-sm">
          {activeTab === 'users' && <UsersManagement />}
          {activeTab === 'organizations' && <OrganizationsManagement />}
          {activeTab === 'permissions' && (
            <RolePermissionsManagement
              actionsPlacement="none"
              onActionsStateChange={setRolePermissionsActions}
            />
          )}
          {activeTab === 'settings' && (
            <SystemSettings
              actionsPlacement="none"
              onActionsStateChange={setSystemSettingsActions}
            />
          )}
          {activeTab === 'task-form' && token && (
            <div className="p-4 sm:p-6">
              <TaskFormVisibilitySettingsPanel
                mode="global"
                token={token}
                canManage
                actionsPlacement="none"
                onActionsStateChange={setTaskFormActions}
              />
            </div>
          )}
          {activeTab === 'custom-fields' && <CustomFieldsManagement />}
          {activeTab === 'custom-tables' && <CustomTablesManagement />}
          {activeTab === 'holidays' && <HolidaysManagement />}
          {activeTab === 'logs' && <ActivityLogsManagement />}
          {activeTab === 'frontpage' && <FrontpageEditor />}
          {activeTab === 'api-tokens' && <ApiTokensManagement mode="admin" />}
        </div>
      </main>

      {activeTab === 'permissions' && rolePermissionsActions?.canSave && (
        <PageStickyActions>
          <button
            type="button"
            onClick={rolePermissionsActions.onSave}
            disabled={rolePermissionsActions.saving}
            className={pageActionButtonClass.primary}
          >
            {rolePermissionsActions.saving ? t('common.saving') : t('lit.saveChanges')}
          </button>
        </PageStickyActions>
      )}

      {activeTab === 'settings' && systemSettingsActions?.canSave && (
        <PageStickyActions>
          {systemSettingsActions.showSyncAiViews && (
            <button
              type="button"
              onClick={systemSettingsActions.onSyncAiViews}
              disabled={systemSettingsActions.syncingAiViews || systemSettingsActions.saving}
              className={pageActionButtonClass.secondary}
            >
              {systemSettingsActions.syncingAiViews ? t('lit.syncing') : t('lit.syncAiViewsNow')}
            </button>
          )}
          <button
            type="button"
            onClick={systemSettingsActions.onSave}
            disabled={systemSettingsActions.saving}
            className={pageActionButtonClass.primary}
          >
            {systemSettingsActions.saving ? t('common.saving') : t('lit.saveSettings')}
          </button>
        </PageStickyActions>
      )}

      {activeTab === 'task-form' && taskFormActions?.canManage && (
        <PageStickyActions>
          <button
            type="button"
            onClick={taskFormActions.onSave}
            disabled={taskFormActions.saving || taskFormActions.syncing}
            className={pageActionButtonClass.primary}
          >
            {taskFormActions.saving ? t('common.saving') : t('common.save')}
          </button>
        </PageStickyActions>
      )}

      <ScrollToTopButton scrollContainerRef={scrollContainerRef} />
    </div>
  );
}
