'use client';


import { useI18n } from '@/lib/i18n/provider';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';
import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, use, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { organizationsApi, Organization, OrganizationMember } from '@/lib/api/organizations';
import { permissionGroupsApi, PermissionGroup, CreatePermissionGroupData } from '@/lib/api/permissionGroups';
import { statusValuesApi, StatusValue, CreateStatusValueData } from '@/lib/api/statusValues';
import { workflowTransitionPoliciesApi, WorkflowTransitionPolicy, UpsertWorkflowTransitionPolicyData } from '@/lib/api/workflowTransitionPolicies';
import { projectsApi, Project } from '@/lib/api/projects';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PageTabs from '@/components/PageTabs';
import PageStickyChrome from '@/components/PageStickyChrome';
import PageStickyActions, { pageActionButtonClass } from '@/components/PageStickyActions';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import ChangeHistory from '@/components/ChangeHistory';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import SearchableSelect from '@/components/SearchableSelect';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import { useFormatHours } from '@/lib/useFormatHours';
import { useColorVision } from '@/hooks/useColorVision';
import { TaskTypeIcon, TaskTypeIconPicker, resolveTaskTypeIcon } from '@/lib/taskTypeIcons';
import TaskFormVisibilitySettingsPanel, {
  type TaskFormVisibilityActionsState,
} from '@/components/admin/TaskFormVisibilitySettingsPanel';
import ExpenseTaxonomyManager from '@/components/ExpenseTaxonomyManager';
import OrganizationIntegrationsPanel from '@/components/OrganizationIntegrationsPanel';
import { useUrlTab } from '@/hooks/useUrlTab';

import { t as tPath } from '@/lib/i18n/messages';
import { readLocaleStorage, type Locale } from '@/lib/i18n/config';

function localeNow(): Locale {
  return readLocaleStorage() ?? 'en';
}

/** Path translate without hook — for nested helpers/components that cannot call useI18n. */
function t(path: string, vars?: Record<string, string | number>): string {
  return tPath(localeNow(), path, vars);
}


const ORGANIZATION_DETAIL_TABS = [
  'overview',
  'members',
  'projects',
  'permissions',
  'statuses',
  'expense-categories',
  'tags',
  'integrations',
  'sla',
  'workflow-policies',
  'task-form',
  'attachments',
  'history',
] as const;
type OrganizationDetailTab = (typeof ORGANIZATION_DETAIL_TABS)[number];

export default function OrganizationDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <PageLoadingSkeleton />
      }
    >
      <OrganizationDetailPageContent {...props} />
    </Suspense>
  );
}
function OrganizationDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useI18n();
  const resolvedParams = use(params);
  const orgId = parseInt(resolvedParams.id);
  
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activeTab, setActiveTab] = useUrlTab<OrganizationDetailTab>(ORGANIZATION_DETAIL_TABS, 'overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  
  // Edit organization state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const [taskFormActions, setTaskFormActions] = useState<TaskFormVisibilityActionsState | null>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  
  const [modalMessage, setModalMessage] = useState<{
    type: 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
    confirmLabel?: string;
    confirmVariant?: 'primary' | 'danger';
  } | null>(null);

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm, ...options });
  };

  const closeConfirmModal = () => {
    setModalMessage(null);
  };

  const handleModalConfirm = () => {
    if (modalMessage?.onConfirm) {
      modalMessage.onConfirm();
    }
    closeConfirmModal();
  };

  useEffect(() => {
    if (!token) {
      setFeatureFlagsLoaded(true);
      return;
    }

    const loadFeatureFlags = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setInternalTicketsEnabled(data.internalTicketsEnabled !== false);
        } else {
          setInternalTicketsEnabled(true);
        }
      } catch {
        setInternalTicketsEnabled(true);
      } finally {
        setFeatureFlagsLoaded(true);
      }
    };

    loadFeatureFlags();
  }, [token]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user && token && featureFlagsLoaded) {
      loadOrganization();
    }
  }, [user, token, authLoading, orgId, router, featureFlagsLoaded]);

  const loadOrganization = async () => {
    if (!token) return;
    
    try {
      setIsLoading(true);
      const response = await organizationsApi.getById(orgId, token);
      setOrganization(response.organization);
      setError('');
    } catch (err: any) {
      setError(err.message || t('lit.failedToLoadOrganization'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setIsSaving(true);
    setError('');

    try {
      const response = await fetch(
        `${getApiUrl()}/api/organizations/${orgId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: editForm.name,
            description: editForm.description,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || t('lit.failedToUpdateOrganization'));
      }

      await loadOrganization();
      setShowEditModal(false);
    } catch (err: any) {
      setError(err.message || t('lit.failedToUpdateOrganization'));
    } finally {
      setIsSaving(false);
    }
  };

  const loadAttachments = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/organization-attachments/organization/${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAttachments(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load attachments:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError(t('lit.fileSizeMustBeLessThan10mb'));
      return;
    }
    
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip', 'application/x-zip-compressed',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      setError(t('lit.fileTypeNotAllowedAllowedImagesPdfWordExcelZipTxt'));
      return;
    }
    
    setUploadingFile(true);
    setError('');
    
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        const base64Content = base64Data.split(',')[1];
        
        const response = await fetch(
          `${getApiUrl()}/api/organization-attachments/organization/${orgId}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              fileData: base64Content,
            }),
          }
        );
        
        if (response.ok) {
          await loadAttachments();
          e.target.value = '';
        } else {
          const data = await response.json();
          setError(data.message || t('lit.failedToUploadFile'));
        }
      };
      
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || t('lit.anErrorOccurredDuringUpload'));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!token) return;
    
    showConfirm(
      t('lit.deleteAttachment'),
      'Are you sure you want to delete this attachment?',
      async () => {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/organization-attachments/${attachmentId}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );
          
          if (response.ok) {
            await loadAttachments();
          } else {
            const data = await response.json();
            setError(data.message || t('lit.failedToDeleteAttachment'));
          }
        } catch (err: any) {
          setError(err.message || t('lit.anErrorOccurred'));
        }
      }
    );
  };

  if (authLoading || isLoading) {
    return (
      <PageLoadingSkeleton />
    );
  }

  if (!user || !organization) return null;

  const canManageSettings =
    !!user?.isAdmin ||
    !!permissions?.canManageOrganizations ||
    organization.Role === 'Owner' ||
    organization.Role === 'Admin' ||
    Number(organization.CanManageSettings || 0) === 1;

  const organizationTabs = [
    { id: 'overview' as const, label: t('lit.overview') },
    { id: 'members' as const, label: t('lit.members') },
    { id: 'projects' as const, label: t('lit.projects') },
    { id: 'permissions' as const, label: t('lit.permissionGroups') },
    { id: 'statuses' as const, label: t('lit.statusPriorities') },
    { id: 'expense-categories' as const, label: t('lit.expenseCategories') },
    { id: 'tags' as const, label: t('lit.tags') },
    ...(canManageSettings
      ? [
          { id: 'integrations' as const, label: t('lit.integrations') },
          { id: 'sla' as const, label: t('lit.slaRules') },
          { id: 'workflow-policies' as const, label: t('lit.workflowTransitionPoliciesDorDod') },
          { id: 'task-form' as const, label: t('lit.taskForm') },
        ]
      : []),
    { id: 'attachments' as const, label: t('lit.attachments') },
    { id: 'history' as const, label: t('lit.history') },
  ];

  return (
    <CustomerUserGuard>
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <PageStickyChrome>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-[var(--pm-text)] truncate">{organization.Name}</h1>
            {canManageSettings && (
              <button
                type="button"
                onClick={() => {
                  setEditForm({ name: organization.Name, description: organization.Description || '' });
                  setShowEditModal(true);
                }}
                className="mt-1 text-sm text-[var(--pm-accent)] hover:underline"
              >
                {t('common.edit')}
              </button>
            )}
          </div>
          <Link
            href="/administration?tab=organizations"
            className="text-sm text-[var(--pm-muted)] hover:text-[var(--pm-text)]"
          >
            ← Back to Organizations
          </Link>
        </div>

        <PageTabs
          tabs={organizationTabs}
          activeId={activeTab}
          onChange={(id) => {
            setActiveTab(id as OrganizationDetailTab);
            if (id === 'attachments') loadAttachments();
          }}
        />
      </PageStickyChrome>

      <main ref={scrollContainerRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-3">
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          <div>
            {activeTab === 'overview' && <OverviewTab organization={organization} orgId={orgId} token={token!} internalTicketsEnabled={internalTicketsEnabled} />}
            {activeTab === 'members' && <MembersTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'projects' && <ProjectsTab orgId={orgId} canManage={canManageSettings} token={token!} />}
            {activeTab === 'permissions' && <PermissionsTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'statuses' && (
              <StatusesTab
                orgId={orgId}
                canManage={canManageSettings}
                token={token!}
                showConfirm={showConfirm}
                internalTicketsEnabled={internalTicketsEnabled}
              />
            )}
            {activeTab === 'expense-categories' && token && (
              <ExpenseTaxonomyManager
                orgId={orgId}
                token={token}
                canManage={canManageSettings || !!permissions?.canManageExpenses || !!user?.isAdmin}
              />
            )}
            {activeTab === 'tags' && <TagsTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'integrations' && <OrganizationIntegrationsPanel orgId={orgId} token={token!} />}
            {activeTab === 'sla' && <SlaTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'workflow-policies' && (
              <WorkflowPoliciesTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />
            )}
            {activeTab === 'task-form' && token && (
              <TaskFormVisibilitySettingsPanel
                mode="organization"
                organizationId={orgId}
                token={token}
                canManage={canManageSettings}
                actionsPlacement="none"
                onActionsStateChange={setTaskFormActions}
                onRequestSyncConfirm={(onConfirm) => {
                  showConfirm(
                    t('lit.syncFromGlobal'),
                    'This will overwrite this organization\'s task form visibility with the global template. Continue?',
                    onConfirm,
                    { confirmLabel: t('lit.sync'), confirmVariant: 'primary' }
                  );
                }}
              />
            )}
            {activeTab === 'attachments' && (
              <AttachmentsTab 
                orgId={orgId} 
                token={token!} 
                attachments={attachments}
                uploadingFile={uploadingFile}
                onFileUpload={handleFileUpload}
                onDeleteAttachment={handleDeleteAttachment}
              />
            )}
            {activeTab === 'history' && (
              <div>
                <ChangeHistory entityType="organization" entityId={orgId} />
              </div>
            )}
          </div>
        </main>

      {activeTab === 'task-form' && taskFormActions?.canManage && (
        <PageStickyActions>
          <button
            type="button"
            onClick={taskFormActions.onSync}
            disabled={taskFormActions.saving || taskFormActions.syncing}
            className={pageActionButtonClass.secondary}
          >
            {taskFormActions.syncing ? 'Syncing…' : t('lit.syncFromGlobal')}
          </button>
          <button
            type="button"
            onClick={taskFormActions.onSave}
            disabled={taskFormActions.saving || taskFormActions.syncing}
            className={pageActionButtonClass.primary}
          >
            {taskFormActions.saving ? t('lit.saving2') : t('common.save')}
          </button>
        </PageStickyActions>
      )}

      {/* Edit Organization Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('lit.editOrganization2')}
              </h2>
            </div>
            <form onSubmit={handleSaveOrganization} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('lit.name')}
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('common.description')}
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isSaving ? t('lit.saving') : t('lit.saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ScrollToTopButton scrollContainerRef={scrollContainerRef} />

      <ConfirmAlertModal
        isOpen={!!modalMessage}
        type="confirm"
        title={modalMessage?.title || ''}
        message={modalMessage?.message || ''}
        onClose={closeConfirmModal}
        onConfirm={handleModalConfirm}
        confirmLabel={modalMessage?.confirmLabel}
        confirmVariant={modalMessage?.confirmVariant}
      />
    </div>
    </CustomerUserGuard>
  );
}

function OverviewTab({ organization, orgId, token, internalTicketsEnabled }: { organization: Organization; orgId: number; token: string; internalTicketsEnabled: boolean }) {
  const decimalHoursToHMS = useFormatHours();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadProjects();
    if (internalTicketsEnabled) {
      void loadTickets();
    } else {
      setTickets([]);
    }
  }, [orgId, internalTicketsEnabled]);

  const loadProjects = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/projects?organizationId=${orgId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error(t('lit.failedToLoadProjects'));
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message || t('lit.failedToLoadProjects'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadTickets = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/tickets?organizationId=${orgId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to load tickets:', err);
    }
  };

  const normalizeDate = (value?: string | null) => {
    if (!value) return null;
    return String(value).split('T')[0];
  };

  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().split('T')[0];
  const upcomingLimit = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  upcomingLimit.setDate(upcomingLimit.getDate() + 14);
  const upcomingLimitKey = upcomingLimit.toISOString().split('T')[0];

  const totalProjects = projects.length;
  const activeProjects = projects.filter((project) => Number(project.StatusIsClosed || 0) !== 1 && Number(project.StatusIsCancelled || 0) !== 1).length;
  const completedProjects = projects.filter((project) => Number(project.StatusIsClosed || 0) === 1).length;
  const cancelledProjects = projects.filter((project) => Number(project.StatusIsCancelled || 0) === 1).length;
  const onHoldProjects = projects.filter((project) => String(project.StatusName || '').toLowerCase() === 'on hold').length;
  const hobbyProjects = projects.filter((project) => Number(project.IsHobby || 0) === 1).length;
  const workProjects = totalProjects - hobbyProjects;
  const customerVisibleProjects = projects.filter((project) => Number(project.IsVisibleToCustomer || 0) === 1).length;
  const globalProjects = projects.filter((project) => Number(project.IsGlobal || 0) === 1).length;

  const totalEstimated = projects.reduce((sum, project) => sum + Number(project.TotalEstimatedHours || 0), 0);
  const totalWorked = projects.reduce((sum, project) => sum + Number(project.TotalWorkedHours || 0), 0);
  const totalTasks = projects.reduce((sum, project) => sum + Number(project.TotalTasks || 0), 0);
  const completedTasks = projects.reduce((sum, project) => sum + Number(project.CompletedTasks || 0), 0);
  const overdueTasks = projects.reduce((sum, project) => sum + Number(project.OverdueTasks || 0), 0);
  const unplannedTasks = projects.reduce((sum, project) => sum + Number(project.UnplannedTasks || 0), 0);
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const hoursProgress = totalEstimated > 0 ? Math.round((totalWorked / totalEstimated) * 100) : 0;

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((ticket) => String(ticket.Status || '').toLowerCase() === 'open').length;
  const inProgressTickets = tickets.filter((ticket) => String(ticket.Status || '').toLowerCase().includes('progress')).length;
  const waitingTickets = tickets.filter((ticket) => String(ticket.Status || '').toLowerCase().includes('waiting')).length;
  const resolvedTickets = tickets.filter((ticket) => Number(ticket.StatusIsClosed || 0) === 1).length;
  const unresolvedTickets = totalTickets - resolvedTickets;
  const urgentTickets = tickets.filter((ticket) => ['urgent', 'high'].includes(String(ticket.Priority || '').toLowerCase())).length;

  const overdueProjects = useMemo(() => {
    return projects
      .filter((project) => {
        const endDate = normalizeDate(project.EndDate);
        return !!endDate
          && Number(project.StatusIsClosed || 0) !== 1
          && Number(project.StatusIsCancelled || 0) !== 1
          && endDate < todayKey;
      })
      .sort((a, b) => String(a.EndDate || '').localeCompare(String(b.EndDate || '')));
  }, [projects, todayKey]);

  const upcomingProjects = useMemo(() => {
    return projects
      .filter((project) => {
        const endDate = normalizeDate(project.EndDate);
        return !!endDate
          && Number(project.StatusIsClosed || 0) !== 1
          && Number(project.StatusIsCancelled || 0) !== 1
          && endDate >= todayKey
          && endDate <= upcomingLimitKey;
      })
      .sort((a, b) => String(a.EndDate || '').localeCompare(String(b.EndDate || '')));
  }, [projects, todayKey, upcomingLimitKey]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(String(b.UpdatedAt || b.CreatedAt || 0)).getTime() - new Date(String(a.UpdatedAt || a.CreatedAt || 0)).getTime())
      .slice(0, 6);
  }, [projects]);

  const customerSummaries = useMemo(() => {
    const map = new Map<string, { name: string; projectCount: number; workedHours: number; estimatedHours: number }>();

    projects.forEach((project) => {
      const customerName = String(project.CustomerName || '').trim();
      if (!customerName) return;

      const existing = map.get(customerName) || {
        name: customerName,
        projectCount: 0,
        workedHours: 0,
        estimatedHours: 0,
      };

      existing.projectCount += 1;
      existing.workedHours += Number(project.TotalWorkedHours || 0);
      existing.estimatedHours += Number(project.TotalEstimatedHours || 0);
      map.set(customerName, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.projectCount - a.projectCount || b.workedHours - a.workedHours)
      .slice(0, 5);
  }, [projects]);

  const projectStatusCards = [
    { label: t('lit.active2'), value: activeProjects, tone: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' },
    { label: t('lit.completed'), value: completedProjects, tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' },
    { label: t('lit.onHold'), value: onHoldProjects, tone: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' },
    { label: t('lit.cancelled'), value: cancelledProjects, tone: 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/60' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Portfolio health, delivery progress, and operational signals for {organization.Name}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                Role: {organization.Role}
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {organization.MemberCount || 0} members
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {workProjects} work / {hobbyProjects} hobby projects
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-500 dark:text-gray-400">{t('lit.createdBy')}</div>
                <div className="font-medium text-gray-900 dark:text-white">{organization.CreatorName || t('lit.unknown')}</div>
              </div>
              <div>
                <div className="text-gray-500 dark:text-gray-400">{t('lit.createdOn')}</div>
                <div className="font-medium text-gray-900 dark:text-white">{new Date(organization.CreatedAt).toLocaleDateString()}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-full lg:min-w-[320px] lg:max-w-[360px]">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('lit.customerVisible')}</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{customerVisibleProjects}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('lit.projectsVisibleInPortal')}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('lit.global')}</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{globalProjects}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('lit.sharedProjects')}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('lit.overdueTasks')}</div>
              <div className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{overdueTasks}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('lit.acrossAllProjects')}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('lit.unplannedTasks')}</div>
              <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{unplannedTasks}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('lit.needPlanning')}</div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={`org-overview-skeleton-${index}`} className="h-32 bg-white dark:bg-gray-800 rounded-lg shadow animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-1 md:grid-cols-2 ${internalTicketsEnabled ? 'xl:grid-cols-5' : 'xl:grid-cols-4'} gap-4`}>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-blue-500">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{t('common.projects')}</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalProjects}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{activeProjects} active · {completedProjects} completed</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-purple-500">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{t('common.tasks')}</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalTasks}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{completedTasks} completed · {overallProgress}% progress</div>
            </div>
            {internalTicketsEnabled && (
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-indigo-500">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{t('common.tickets')}</div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalTickets}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{unresolvedTickets} open · {urgentTickets} urgent/high</div>
              </div>
            )}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-orange-500">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{t('lit.estimatedHours')}</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{decimalHoursToHMS(totalEstimated)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('lit.plannedAcrossProjectTotals')}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-green-500">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{t('lit.hoursWorked')}</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{decimalHoursToHMS(totalWorked)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hoursProgress}% of estimated effort</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('lit.deliveryProgress')}</h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{t('lit.tasksCompleted')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{completedTasks}/{totalTasks} ({overallProgress}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div className="bg-blue-600 h-3 rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{t('lit.hoursProgress')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{decimalHoursToHMS(totalWorked)} / {decimalHoursToHMS(totalEstimated)}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div className={`h-3 rounded-full transition-all ${totalWorked > totalEstimated ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, totalEstimated > 0 ? (totalWorked / totalEstimated) * 100 : 0)}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  {projectStatusCards.map((card) => (
                    <div key={card.label} className={`rounded-lg p-4 text-center ${card.tone}`}>
                      <div className="text-2xl font-bold">{card.value}</div>
                      <div className="text-sm">{card.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('lit.portfolioMix')}</div>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">{workProjects} work projects</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{hobbyProjects} hobby projects</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('lit.taskRisks')}</div>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">{overdueTasks} overdue tasks</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{unplannedTasks} unplanned tasks</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('lit.supportLoad')}</div>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">{openTickets} open tickets</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{waitingTickets} waiting · {inProgressTickets} in progress</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('lit.attentionAreas')}</h3>
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-red-600 dark:text-red-400">{t('lit.overdueProjects')}</h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{overdueProjects.length}</span>
                  </div>
                  {overdueProjects.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('lit.noOverdueProjects')}</p>
                  ) : (
                    <div className="space-y-2">
                      {overdueProjects.slice(0, 4).map((project) => {
                        const endDate = normalizeDate(project.EndDate);
                        const daysOverdue = endDate ? Math.max(1, Math.floor((new Date(todayKey).getTime() - new Date(endDate).getTime()) / 86400000)) : 0;
                        return (
                          <div key={project.Id} className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 p-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{project.ProjectName}</div>
                            <div className="text-xs text-red-600 dark:text-red-400 mt-1">{daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400">{t('lit.upcomingDeadlines')}</h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('lit.next14Days')}</span>
                  </div>
                  {upcomingProjects.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('lit.noUpcomingDeadlines')}</p>
                  ) : (
                    <div className="space-y-2">
                      {upcomingProjects.slice(0, 4).map((project) => {
                        const endDate = normalizeDate(project.EndDate);
                        const daysLeft = endDate ? Math.max(0, Math.ceil((new Date(endDate).getTime() - new Date(todayKey).getTime()) / 86400000)) : 0;
                        return (
                          <div key={project.Id} className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{project.ProjectName}</div>
                            <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">{daysLeft === 0 ? t('lit.dueToday') : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('lit.recentProjectActivity')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('lit.mostRecentlyUpdatedProjectsInThisOrganization')}</p>
              </div>
              {recentProjects.length === 0 ? (
                <div className="p-6 text-sm text-gray-500 dark:text-gray-400">{t('lit.noProjectsFound')}</div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {recentProjects.map((project) => {
                    const progress = Number(project.TotalTasks || 0) > 0 ? Math.round((Number(project.CompletedTasks || 0) / Number(project.TotalTasks || 1)) * 100) : 0;

                    return (
                      <div key={project.Id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-medium text-gray-900 dark:text-white truncate">{project.ProjectName}</div>
                              {project.StatusName && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={project.StatusColor ? { backgroundColor: `${project.StatusColor}20`, color: project.StatusColor } : undefined}>
                                  {project.StatusName}
                                </span>
                              )}
                              {Number(project.IsHobby || 0) === 1 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                  {t('lit.hobby')}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              <span>{project.CustomerName || t('lit.internalNoCustomer')}</span>
                              <span>{Number(project.TotalTasks || 0)} tasks</span>
                              <span>{Number(project.TotalWorkedHours || 0).toFixed(1) !== '0.0' ? decimalHoursToHMS(Number(project.TotalWorkedHours || 0)) : '00:00:00'} worked</span>
                              <span>Updated {new Date(project.UpdatedAt).toLocaleDateString()}</span>
                            </div>
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                <span>{t('lit.taskProgress')}</span>
                                <span>{progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${progress}%` }} />
                              </div>
                            </div>
                          </div>
                          <Link href={`/projects/${project.Id}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
                            {t('lit.openProject')}
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('lit.topCustomers')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">{t('lit.customersWithTheMostActivePortfolioFootprint')}</p>
              {customerSummaries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('lit.noCustomerLinkedProjectsYet')}</p>
              ) : (
                <div className="space-y-3">
                  {customerSummaries.map((customer) => (
                    <div key={customer.name} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <div className="font-medium text-gray-900 dark:text-white">{customer.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{customer.projectCount} project{customer.projectCount !== 1 ? 's' : ''}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">{decimalHoursToHMS(customer.workedHours)} worked / {decimalHoursToHMS(customer.estimatedHours)} estimated</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {internalTicketsEnabled && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('lit.ticketSnapshot')}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('lit.currentSupportLoadInsideThisOrganization')}</p>
                </div>
                <Link href={`/tickets?organizationId=${orgId}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
                  {t('lit.viewTickets')}
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-700/60 p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('common.total')}</div>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{openTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('common.open')}</div>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-4 text-center">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{waitingTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('lit.waiting2')}</div>
                </div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{inProgressTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('lit.inProgress3')}</div>
                </div>
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{resolvedTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('lit.resolved2')}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MembersTab({ 
  orgId, 
  canManage, 
  token,
  showConfirm 
}: { 
  orgId: number; 
  canManage: boolean; 
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
}) {
  const { t } = useI18n();

  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);

  useEffect(() => {
    void loadMembers();
    void loadGroups();
  }, [orgId]);

  const loadMembers = async () => {
    try {
      setIsLoading(true);
      const response = await organizationsApi.getMembers(orgId, token);
      setMembers(response.members || []);
      setError('');
    } catch (err: any) {
      setError(err.message || t('lit.failedToLoadMembers'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await permissionGroupsApi.getByOrganization(orgId, token);
      setGroups(response.groups || []);
    } catch (err: any) {
      console.error('Failed to load groups:', err);
    }
  };

  const handleRemove = async (memberId: number) => {
    showConfirm(t('lit.removeMember2'), 'Are you sure you want to remove this member?', async () => {
      try {
        await organizationsApi.removeMember(orgId, memberId, token);
        await loadMembers();
      } catch (err: any) {
        setError(err.message || t('lit.failedToRemoveMember'));
      }
    });
  };

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400">{t('lit.loadingMembers')}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('lit.organizationMembers')}</h3>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            {t('lit.addMember')}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">{t('common.user')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">{t('auth.email')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">{t('lit.role')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">{t('lit.permissionGroup')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">{t('lit.joined')}</th>
                {canManage && (
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {members.map((member) => (
                <tr key={member.Id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{member.Username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.Email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{member.Role}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.GroupName || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(member.JoinedAt).toLocaleDateString()}</td>
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {member.Role !== 'Owner' ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingMember(member)}
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                            title={t('lit.editMember')}
                            aria-label={t('lit.editMember')}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRemove(member.Id)}
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                            title={t('lit.removeMember')}
                            aria-label={t('lit.removeMember')}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" />
                            </svg>
                          </button>
                        </div>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t('lit.noMembersFound')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <AddMemberModal
          orgId={orgId}
          groups={groups}
          token={token}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            void loadMembers();
          }}
        />
      )}

      {editingMember && (
        <EditMemberModal
          orgId={orgId}
          member={editingMember}
          groups={groups}
          token={token}
          onClose={() => setEditingMember(null)}
          onUpdated={() => {
            setEditingMember(null);
            void loadMembers();
          }}
        />
      )}
    </div>
  );
}

function AddMemberModal({ orgId, groups, onClose, onAdded, token }: {
  orgId: number;
  groups: PermissionGroup[];
  onClose: () => void;
  onAdded: () => void;
  token: string;
}) {
  const { t } = useI18n();
  const [availableUsers, setAvailableUsers] = useState<Array<{ Id: number; Username: string; Email: string; FirstName?: string; LastName?: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [formData, setFormData] = useState<{ userId?: number; role: string; permissionGroupId?: number }>({
    role: 'Member',
    permissionGroupId: undefined,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadAvailableUsers = async () => {
      try {
        setLoadingUsers(true);
        const response = await organizationsApi.getAvailableUsers(orgId, token);
        const users = response.users || [];
        setAvailableUsers(users);
        if (users.length === 1) {
          setFormData((prev) => ({ ...prev, userId: users[0].Id }));
        }
      } catch (err: any) {
        setError(err.message || t('lit.failedToLoadAvailableUsers'));
      } finally {
        setLoadingUsers(false);
      }
    };

    void loadAvailableUsers();
  }, [orgId, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.userId) {
      setError(t('lit.pleaseSelectAUser'));
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await organizationsApi.addMember(orgId, formData, token);
      onAdded();
    } catch (err: any) {
      setError(err.message || t('lit.failedToAddMember'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 overflow-y-auto max-h-[90vh]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('lit.addMember')}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl">×</button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.user')}</label>
              <SearchableSelect
                value={formData.userId || ''}
                onChange={(value) => setFormData({ ...formData, userId: value ? parseInt(String(value), 10) : undefined })}
                options={availableUsers.map((userItem) => ({ value: userItem.Id, label: `${userItem.Username} (${userItem.Email})` }))}
                placeholder={t('common.user')}
                emptyText={loadingUsers ? 'Loading users...' : (availableUsers.length === 0 ? t('lit.noAvailableUsers') : t('lit.selectUser'))}
                disabled={loadingUsers || availableUsers.length === 0}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.role')}</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="Member">{t('lit.member')}</option>
                <option value="Admin">{t('nav.sectionAdmin')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.permissionGroupOptional')}</label>
              <select
                value={formData.permissionGroupId || ''}
                onChange={(e) => setFormData({ ...formData, permissionGroupId: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">{t('common.none')}</option>
                {groups.map((group) => (
                  <option key={group.Id} value={group.Id}>{group.GroupName}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 mt-6">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium">{t('common.cancel')}</button>
              <button type="submit" disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium">
                {isLoading ? 'Adding...' : t('lit.addMember')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function EditMemberModal({ orgId, member, groups, onClose, onUpdated, token }: {
  orgId: number;
  member: OrganizationMember;
  groups: PermissionGroup[];
  onClose: () => void;
  onUpdated: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState({
    role: member.Role,
    permissionGroupId: member.PermissionGroupId || undefined,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await organizationsApi.updateMember(orgId, member.Id, formData, token);
      onUpdated();
    } catch (err: any) {
      setError(err.message || t('lit.failedToUpdateMember'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('lit.editMember2')}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl">×</button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <div className="mb-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('common.user')}</div>
            <div className="text-lg font-medium text-gray-900 dark:text-white">{member.Username}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{member.Email}</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.role')}</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="Member">{t('lit.member')}</option>
                <option value="Admin">{t('nav.sectionAdmin')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.permissionGroupOptional')}</label>
              <select
                value={formData.permissionGroupId || ''}
                onChange={(e) => setFormData({ ...formData, permissionGroupId: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">{t('common.none')}</option>
                {groups.map((group) => (
                  <option key={group.Id} value={group.Id}>{group.GroupName}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 mt-6">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium">{t('common.cancel')}</button>
              <button type="submit" disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium">
                {isLoading ? 'Updating...' : t('lit.updateMember')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const PERMISSION_GROUP_FLAGS = [
  { field: 'CanManageProjects', formKey: 'canManageProjects', label: t('lit.manageProjects') },
  { field: 'CanCreateProjects', formKey: 'canCreateProjects', label: t('lit.createProjects') },
  { field: 'CanDeleteProjects', formKey: 'canDeleteProjects', label: t('lit.deleteProjects') },
  { field: 'CanManageTasks', formKey: 'canManageTasks', label: t('lit.manageTasks') },
  { field: 'CanCreateTasks', formKey: 'canCreateTasks', label: t('lit.createTasks') },
  { field: 'CanDeleteTasks', formKey: 'canDeleteTasks', label: t('lit.deleteTasks') },
  { field: 'CanAssignTasks', formKey: 'canAssignTasks', label: t('lit.assignTasks') },
  { field: 'CanPlanTasks', formKey: 'canPlanTasks', label: t('lit.planTasks') },
  { field: 'CanManageTimeEntries', formKey: 'canManageTimeEntries', label: t('lit.manageTimeEntries') },
  { field: 'CanViewReports', formKey: 'canViewReports', label: t('lit.viewReports') },
  { field: 'CanViewBudgetInfo', formKey: 'canViewBudgetInfo', label: t('lit.viewBudgetInfo') },
  { field: 'CanManageTickets', formKey: 'canManageTickets', label: t('lit.manageTickets') },
  { field: 'CanCreateTickets', formKey: 'canCreateTickets', label: t('lit.createTickets') },
  { field: 'CanDeleteTickets', formKey: 'canDeleteTickets', label: t('lit.deleteTickets') },
  { field: 'CanAssignTickets', formKey: 'canAssignTickets', label: t('lit.assignTickets') },
  { field: 'CanCreateTaskFromTicket', formKey: 'canCreateTaskFromTicket', label: t('lit.createTaskFromTicket') },
  { field: 'CanViewOthersPlanning', formKey: 'canViewOthersPlanning', label: t('lit.viewOthersPlanning') },
  { field: 'CanViewApplications', formKey: 'canViewApplications', label: t('lit.viewApplications') },
  { field: 'CanManageMembers', formKey: 'canManageMembers', label: t('lit.manageMembers') },
  { field: 'CanManageSettings', formKey: 'canManageSettings', label: t('lit.manageSettings') },
  { field: 'CanManageApplications', formKey: 'canManageApplications', label: t('lit.manageApplications') },
  { field: 'CanCreateApplications', formKey: 'canCreateApplications', label: t('lit.createApplications') },
  { field: 'CanDeleteApplications', formKey: 'canDeleteApplications', label: t('lit.deleteApplications') },
  { field: 'CanManageReleases', formKey: 'canManageReleases', label: t('lit.manageReleases') },
] as const;

type PermissionGroupFlagField = (typeof PERMISSION_GROUP_FLAGS)[number]['field'];

function getGrantedPermissionLabels(group: PermissionGroup): string[] {
  return PERMISSION_GROUP_FLAGS
    .filter((flag) => Number(group[flag.field as PermissionGroupFlagField]) === 1)
    .map((flag) => flag.label);
}

function PermissionsTab({
  orgId,
  canManage,
  token,
  showConfirm,
}: {
  orgId: number;
  canManage: boolean;
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
}) {
  const { t } = useI18n();

  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PermissionGroup | null>(null);

  useEffect(() => {
    void loadGroups();
  }, [orgId]);

  const loadGroups = async () => {
    try {
      setIsLoading(true);
      const response = await permissionGroupsApi.getByOrganization(orgId, token);
      setGroups(response.groups);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.failedToLoadPermissionGroups'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    showConfirm(
      'Delete Permission Group',
      'Are you sure you want to delete this permission group?',
      async () => {
        try {
          await permissionGroupsApi.delete(id, token);
          await loadGroups();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : t('lit.failedToDeletePermissionGroup'));
        }
      }
    );
  };

  const handleSync = async (group: PermissionGroup) => {
    showConfirm(
      'Sync from Global Defaults',
      `Reset "${group.GroupName}" permissions to match the current global "${group.LinkedRole}" role defaults? Any org-specific customizations will be overwritten.`,
      async () => {
        try {
          await permissionGroupsApi.syncFromGlobal(group.Id, token);
          await loadGroups();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : t('lit.failedToSyncPermissionGroup'));
        }
      },
      {
        confirmLabel: t('lit.sync'),
        confirmVariant: 'primary',
      }
    );
  };

  if (isLoading) {
    return <div className="py-4 text-sm text-gray-500 dark:text-gray-400">{t('lit.loadingPermissionGroups')}</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {groups.length} group{groups.length !== 1 ? 's' : ''}
        </p>
        {canManage && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t('lit.createGroup')}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-100 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          {t('lit.noPermissionGroupsYet')}
        </div>
      ) : (
        <div className="overflow-x-auto overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  {t('lit.group')}
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  {t('lit.members')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  {t('lit.grantedPermissions')}
                </th>
                {canManage && (
                  <th scope="col" className="relative px-3 py-2">
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {groups.map((group) => {
                const granted = getGrantedPermissionLabels(group);
                const plainDescription = group.Description?.replace(/<[^>]*>/g, '').trim() || '';

                return (
                  <tr key={group.Id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-3 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {group.GroupName}
                        </div>
                        {!!group.IsSystemGroup && group.LinkedRole && (
                          <span className="mt-1 inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                            Linked: {group.LinkedRole}
                          </span>
                        )}
                        {plainDescription && (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                            {plainDescription}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {group.MemberCount || 0}
                    </td>
                    <td className="px-3 py-3">
                      <div className="mb-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        {granted.length} of {PERMISSION_GROUP_FLAGS.length} enabled
                      </div>
                      {granted.length === 0 ? (
                        <span className="text-xs italic text-gray-400">{t('lit.noPermissionsGranted')}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {granted.map((label) => (
                            <span
                              key={label}
                              className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingGroup(group)}
                            title={t('lit.editPermissionGroup')}
                            aria-label={t('lit.editPermissionGroup')}
                            className="rounded p-1.5 text-gray-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {group.IsSystemGroup ? (
                            <button
                              onClick={() => handleSync(group)}
                              title={`Reset to global ${group.LinkedRole} defaults`}
                              aria-label={`Sync ${group.GroupName} from global defaults`}
                              className="rounded p-1.5 text-gray-400 transition-colors hover:text-purple-600 dark:hover:text-purple-400"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDelete(group.Id)}
                              title={t('lit.deletePermissionGroup')}
                              aria-label={t('lit.deletePermissionGroup')}
                              className="rounded p-1.5 text-gray-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <PermissionGroupModal
          orgId={orgId}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false);
            void loadGroups();
          }}
          token={token}
        />
      )}

      {editingGroup && (
        <PermissionGroupModal
          orgId={orgId}
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSaved={() => {
            setEditingGroup(null);
            void loadGroups();
          }}
          token={token}
        />
      )}
    </div>
  );
}

function PermissionGroupModal({
  orgId,
  group,
  onClose,
  onSaved,
  token,
}: {
  orgId: number;
  group?: PermissionGroup;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const { t } = useI18n();

  const [formData, setFormData] = useState<CreatePermissionGroupData>({
    organizationId: orgId,
    groupName: group?.GroupName || '',
    description: group?.Description || '',
    canManageProjects: !!group?.CanManageProjects,
    canCreateProjects: !!group?.CanCreateProjects,
    canDeleteProjects: !!group?.CanDeleteProjects,
    canManageTasks: !!group?.CanManageTasks,
    canCreateTasks: !!group?.CanCreateTasks,
    canDeleteTasks: !!group?.CanDeleteTasks,
    canAssignTasks: !!group?.CanAssignTasks,
    canPlanTasks: !!group?.CanPlanTasks,
    canManageTimeEntries: !!group?.CanManageTimeEntries,
    canViewReports: !!group?.CanViewReports,
    canViewBudgetInfo: !!group?.CanViewBudgetInfo,
    canManageTickets: !!group?.CanManageTickets,
    canCreateTickets: !!group?.CanCreateTickets,
    canDeleteTickets: !!group?.CanDeleteTickets,
    canAssignTickets: !!group?.CanAssignTickets,
    canCreateTaskFromTicket: !!group?.CanCreateTaskFromTicket,
    canViewOthersPlanning: !!group?.CanViewOthersPlanning,
    canViewApplications: !!group?.CanViewApplications,
    canManageMembers: !!group?.CanManageMembers,
    canManageSettings: !!group?.CanManageSettings,
    canManageApplications: !!group?.CanManageApplications,
    canCreateApplications: !!group?.CanCreateApplications,
    canDeleteApplications: !!group?.CanDeleteApplications,
    canManageReleases: !!group?.CanManageReleases,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (group) {
        await permissionGroupsApi.update(group.Id, formData, token);
      } else {
        await permissionGroupsApi.create(formData, token);
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.failedToSavePermissionGroup'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {group ? t('common.edit') : t('lit.create')} Permission Group
              </h2>
              {!!group?.IsSystemGroup && group?.LinkedRole && (
                <p className="mt-1 text-sm text-purple-600 dark:text-purple-400">
                  {t('lit.linkedToGlobal')} <strong>{group.LinkedRole}</strong> {t('lit.roleEditingOverridesOrgDefaults')}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-2xl leading-none text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('lit.groupName')}
              </label>
              <input
                type="text"
                value={formData.groupName}
                onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                required
                readOnly={!!group?.IsSystemGroup}
                className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${group?.IsSystemGroup ? 'cursor-not-allowed opacity-60' : ''}`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('common.description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('lit.permissions')}
              </label>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PERMISSION_GROUP_FLAGS.map(({ formKey, label }) => (
                    <label
                      key={formKey}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                    >
                      <input
                        type="checkbox"
                        checked={formData[formKey as keyof CreatePermissionGroupData] as boolean}
                        onChange={(e) => setFormData({ ...formData, [formKey]: e.target.checked })}
                        className="h-4 w-4 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg bg-gray-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
              >
                {isLoading ? t('lit.saving2') : group ? t('lit.update') : t('lit.create')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const MILESTONE_TYPE_ICON_OPTIONS = [
  { value: 'flag', label: t('lit.flag') },
  { value: 'target', label: t('lit.target') },
  { value: 'rocket', label: t('lit.rocket') },
  { value: 'calendar', label: t('lit.calendar') },
  { value: 'star', label: t('lit.star') },
  { value: 'trophy', label: t('lit.trophy') },
  { value: 'check-circle', label: t('lit.checkCircle') },
  { value: 'milestone', label: t('lit.milestone') },
];

function renderMilestoneTypeIcon(iconSvg: string | undefined, className: string = 'w-4 h-4') {
  switch (iconSvg) {
    case 'target':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="2" /><circle cx="12" cy="12" r="5" strokeWidth="2" /><circle cx="12" cy="12" r="1.5" strokeWidth="2" /></svg>;
    case 'rocket':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3l7 7-4 4-7-7 4-4zm-5 5l7 7-8 5 1-6-6 1 6-7z" /></svg>;
    case 'calendar':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" strokeWidth="2" /><path strokeLinecap="round" strokeWidth={2} d="M16 3v4M8 3v4M3 10h18" /></svg>;
    case 'star':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l2.8 5.7L21 9.6l-4.5 4.4 1.1 6.3L12 17.3 6.4 20.3 7.5 14 3 9.6l6.2-.9L12 3z" /></svg>;
    case 'trophy':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4h8v3a4 4 0 01-8 0V4zm-3 1h3v1a5 5 0 01-3 4V5zm14 0h-3v1a5 5 0 003 4V5zM12 14v4m-3 3h6" /></svg>;
    case 'check-circle':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12l2.5 2.5L16 9" /></svg>;
    case 'milestone':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 20V4m0 0l10 3-10 3m0-6v16" /></svg>;
    case 'flag':
    default:
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 20V4m0 0c4 0 4 2 8 2s4-2 8-2v8c-4 0-4 2-8 2s-4-2-8-2" /></svg>;
  }
}

function StatusesTab({ 
  orgId, 
  canManage, 
  token,
  showConfirm,
  internalTicketsEnabled,
}: { 
  orgId: number; 
  canManage: boolean; 
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
  internalTicketsEnabled: boolean;
}) {
  const { t } = useI18n();

  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<StatusValue[]>([]);
  const [taskTypes, setTaskTypes] = useState<StatusValue[]>([]);
  const [milestoneTypes, setMilestoneTypes] = useState<StatusValue[]>([]);
  const [ticketStatuses, setTicketStatuses] = useState<any[]>([]);
  const [ticketPriorities, setTicketPriorities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeType, setActiveType] = useState<'project' | 'task' | 'priority' | 'type' | 'milestone-type' | 'ticket' | 'ticket-priority'>('project');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState<StatusValue | null>(null);

  useEffect(() => {
    loadStatuses();
  }, [orgId]);

  useEffect(() => {
    if (!internalTicketsEnabled && (activeType === 'ticket' || activeType === 'ticket-priority')) {
      setActiveType('project');
    }
  }, [internalTicketsEnabled, activeType]);

  const loadStatuses = async () => {
    try {
      setIsLoading(true);
      const [projectRes, taskRes, priorityRes, typeRes, milestoneTypeRes] = await Promise.all([
        statusValuesApi.getProjectStatuses(orgId, token),
        statusValuesApi.getTaskStatuses(orgId, token),
        statusValuesApi.getTaskPriorities(orgId, token),
        statusValuesApi.getTaskTypes(orgId, token),
        statusValuesApi.getMilestoneTypes(orgId, token),
      ]);

      let ticketRes: any = { statuses: [] };
      let ticketPriRes: any = { priorities: [] };

      if (internalTicketsEnabled) {
        [ticketRes, ticketPriRes] = await Promise.all([
          fetch(`${getApiUrl()}/api/status-values/ticket/${orgId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
          fetch(`${getApiUrl()}/api/status-values/ticket-priority/${orgId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        ]);
      }

      setProjectStatuses(projectRes.statuses);
      setTaskStatuses(taskRes.statuses);
      setTaskPriorities(priorityRes.priorities);
      setTaskTypes(typeRes.types);
      setMilestoneTypes(milestoneTypeRes.types);
      setTicketStatuses(ticketRes.statuses || []);
      setTicketPriorities(ticketPriRes.priorities || []);
      setError('');
    } catch (err: any) {
      setError(err.message || t('lit.failedToLoadStatusValues'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number, type: 'project' | 'task' | 'priority' | 'type' | 'milestone-type' | 'ticket' | 'ticket-priority') => {
    const itemType = (type === 'priority' || type === 'ticket-priority')
      ? 'priority'
      : (type === 'type' || type === 'milestone-type')
        ? 'type value'
        : 'status value';
    showConfirm(
      `Delete ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
      `Are you sure you want to delete this ${itemType}?`,
      async () => {
        try {
          if (type === 'project') {
            await statusValuesApi.deleteProjectStatus(id, token);
          } else if (type === 'task') {
            await statusValuesApi.deleteTaskStatus(id, token);
          } else if (type === 'priority') {
            await statusValuesApi.deleteTaskPriority(id, token);
          } else if (type === 'type') {
            await statusValuesApi.deleteTaskType(id, token);
          } else if (type === 'milestone-type') {
            await statusValuesApi.deleteMilestoneType(id, token);
          } else {
            const endpoint = type === 'ticket' ? 'ticket' : 'ticket-priority';
            await fetch(`${getApiUrl()}/api/status-values/${endpoint}/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
          }
          await loadStatuses();
        } catch (err: any) {
          setError(err.message || t('lit.failedToDelete2') + itemType);
        }
      }
    );
  };

  if (isLoading) return <div className="text-[var(--pm-muted)]">{t('lit.loadingStatusValues')}</div>;

  const statusSubTabs = [
    { id: 'project' as const, label: t('lit.projectStatuses') },
    { id: 'task' as const, label: t('lit.taskStatuses') },
    { id: 'priority' as const, label: t('lit.taskPriorities') },
    { id: 'type' as const, label: t('lit.taskTypes') },
    { id: 'milestone-type' as const, label: t('lit.milestoneTypes') },
    ...(internalTicketsEnabled
      ? [
          { id: 'ticket' as const, label: t('lit.ticketStatuses') },
          { id: 'ticket-priority' as const, label: t('lit.ticketPriorities') },
        ]
      : []),
  ];

  const currentStatuses = activeType === 'project' ? projectStatuses
    : activeType === 'task' ? taskStatuses
    : activeType === 'priority' ? taskPriorities
    : activeType === 'type' ? taskTypes
    : activeType === 'milestone-type' ? milestoneTypes
    : activeType === 'ticket' ? ticketStatuses
    : ticketPriorities;
  const buttonLabel = (activeType === 'priority' || activeType === 'ticket-priority') ? t('lit.addPriority') : (activeType === 'type' || activeType === 'milestone-type') ? t('lit.addType') : t('lit.addStatus');
  const isPriority = activeType === 'priority' || activeType === 'ticket-priority';
  const isType = activeType === 'type' || activeType === 'milestone-type';

  const displayName = (status: StatusValue) =>
    isPriority ? status.PriorityName : isType ? status.TypeName : status.StatusName;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <PageTabs
            tabs={statusSubTabs}
            activeId={activeType}
            onChange={(id) => setActiveType(id as typeof activeType)}
          />
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex h-9 shrink-0 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {buttonLabel}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {currentStatuses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          No {isPriority ? 'priorities' : isType ? 'types' : 'statuses'} yet.
        </div>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  {t('lit.color')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  {t('common.name')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  {t('lit.flags')}
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  {t('lit.order')}
                </th>
                {canManage && (
                  <th scope="col" className="relative px-3 py-2">
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {currentStatuses.map((status) => {
                const color = status.ColorCode || (status as StatusValue & { Color?: string }).Color;
                return (
                  <tr key={status.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-3 py-2.5">
                      {color ? (
                        <span
                          className="inline-block h-5 w-5 rounded border border-gray-200 dark:border-gray-600"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
                        {activeType === 'milestone-type' && (
                          <span className="inline-flex text-gray-600 dark:text-gray-300">
                            {renderMilestoneTypeIcon(status.IconSvg || 'flag', 'w-4 h-4')}
                          </span>
                        )}
                        {activeType === 'type' && (
                          <span
                            className="inline-flex"
                            style={status.ColorCode ? { color: status.ColorCode } : undefined}
                          >
                            <TaskTypeIcon
                              iconSvg={resolveTaskTypeIcon(status.IconSvg, status.TypeName)}
                              className="w-4 h-4"
                            />
                          </span>
                        )}
                        {displayName(status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {!!status.IsDefault && (
                          <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            {t('lit.default')}
                          </span>
                        )}
                        {!!status.IsClosed && (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                            {t('lit.closed')}
                          </span>
                        )}
                        {!!status.IsCancelled && (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            {t('lit.cancelled')}
                          </span>
                        )}
                        {!!status.HideFromPlanningAndStatistics && (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {t('lit.hiddenInPlanningStats')}
                          </span>
                        )}
                        {!status.IsDefault && !status.IsClosed && !status.IsCancelled && !status.HideFromPlanningAndStatistics && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {status.SortOrder}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingStatus(status)}
                            title={t('lit.editValue')}
                            aria-label={t('lit.editValue')}
                            className="rounded p-1.5 text-gray-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(status.Id, activeType)}
                            title={t('lit.deleteValue')}
                            aria-label={t('lit.deleteValue')}
                            className="rounded p-1.5 text-gray-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <StatusValueModal
          orgId={orgId}
          type={activeType}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false);
            loadStatuses();
          }}
          token={token}
        />
      )}

      {editingStatus && (
        <StatusValueModal
          orgId={orgId}
          type={activeType}
          status={editingStatus}
          onClose={() => setEditingStatus(null)}
          onSaved={() => {
            setEditingStatus(null);
            loadStatuses();
          }}
          token={token}
        />
      )}
    </div>
  );
}

function WorkflowPoliciesTab({
  orgId,
  canManage,
  token,
  showConfirm,
}: {
  orgId: number;
  canManage: boolean;
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
}) {
  const { t } = useI18n();

  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [workflowPolicies, setWorkflowPolicies] = useState<WorkflowTransitionPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<WorkflowTransitionPolicy | null>(null);

  useEffect(() => {
    void loadWorkflowPolicies();
  }, [orgId]);

  const loadWorkflowPolicies = async () => {
    try {
      setIsLoading(true);
      const [taskRes, workflowPolicyRes] = await Promise.all([
        statusValuesApi.getTaskStatuses(orgId, token),
        workflowTransitionPoliciesApi.getByOrganization(orgId, token),
      ]);

      setTaskStatuses(taskRes.statuses || []);
      setWorkflowPolicies(workflowPolicyRes.policies || []);
      setError('');
    } catch (err: any) {
      setError(err.message || t('lit.failedToLoadWorkflowTransitionPolicies'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePolicy = async (policyId: number) => {
    showConfirm(
      'Delete Workflow Policy',
      'Are you sure you want to delete this workflow transition policy?',
      async () => {
        try {
          await workflowTransitionPoliciesApi.delete(policyId, token);
          await loadWorkflowPolicies();
        } catch (err: any) {
          setError(err.message || t('lit.failedToDeleteWorkflowTransitionPolicy'));
        }
      }
    );
  };

  if (isLoading) {
    return <div>{t('lit.loadingWorkflowTransitionPolicies')}</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('lit.validateRequiredFieldsWhenMovingTasksBetweenStatuses')}</p>
        {canManage && (
          <button
            onClick={() => setShowPolicyModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {t('lit.addPolicy')}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {workflowPolicies.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            {t('lit.noWorkflowTransitionPoliciesConfiguredYet')}
          </div>
        ) : workflowPolicies.map((policy) => {
          const requiredFields = [
            policy.RequireDescription ? t('lit.description2') : null,
            policy.RequireAssignee ? t('lit.assignee') : null,
            policy.RequireDueDate ? t('lit.dueDate') : null,
            policy.RequireEstimatedHours ? t('lit.estimatedHours') : null,
            policy.RequireStoryPoints ? t('lit.storyPoints') : null,
            policy.RequirePlannedDates ? t('lit.plannedDates') : null,
          ].filter(Boolean);

          return (
            <div key={policy.Id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white">{policy.PolicyName}</span>
                  <span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full">{policy.RuleType || t('lit.custom')}</span>
                  {!policy.IsActive && (
                    <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full">{t('common.inactive')}</span>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {policy.FromStatusName || `#${policy.FromStatusId}`} → {policy.ToStatusName || `#${policy.ToStatusId}`}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Required: {requiredFields.length > 0 ? requiredFields.join(', ') : t('lit.none2')}
                </div>
              </div>

              {canManage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingPolicy(policy)}
                    title={t('lit.editPolicy')}
                    aria-label={t('lit.editPolicy')}
                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 px-3 py-1"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeletePolicy(policy.Id)}
                    title={t('lit.deletePolicy')}
                    aria-label={t('lit.deletePolicy')}
                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 px-3 py-1"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showPolicyModal && (
        <WorkflowPolicyModal
          orgId={orgId}
          taskStatuses={taskStatuses}
          onClose={() => setShowPolicyModal(false)}
          onSaved={() => {
            setShowPolicyModal(false);
            void loadWorkflowPolicies();
          }}
          token={token}
        />
      )}

      {editingPolicy && (
        <WorkflowPolicyModal
          orgId={orgId}
          taskStatuses={taskStatuses}
          policy={editingPolicy}
          onClose={() => setEditingPolicy(null)}
          onSaved={() => {
            setEditingPolicy(null);
            void loadWorkflowPolicies();
          }}
          token={token}
        />
      )}
    </div>
  );
}

function WorkflowPolicyModal({
  orgId,
  taskStatuses,
  policy,
  onClose,
  onSaved,
  token,
}: {
  orgId: number;
  taskStatuses: StatusValue[];
  policy?: WorkflowTransitionPolicy;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const { t } = useI18n();

  const [formData, setFormData] = useState<UpsertWorkflowTransitionPolicyData>({
    organizationId: orgId,
    fromStatusId: policy?.FromStatusId || 0,
    toStatusId: policy?.ToStatusId || 0,
    policyName: policy?.PolicyName || '',
    ruleType: policy?.RuleType || t('lit.custom'),
    requireDescription: !!policy?.RequireDescription,
    requireAssignee: !!policy?.RequireAssignee,
    requireDueDate: !!policy?.RequireDueDate,
    requireEstimatedHours: !!policy?.RequireEstimatedHours,
    requireStoryPoints: !!policy?.RequireStoryPoints,
    requirePlannedDates: !!policy?.RequirePlannedDates,
    isActive: policy ? !!policy.IsActive : true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.fromStatusId || !formData.toStatusId) {
      setError(t('lit.fromStatusAndToStatusAreRequired'));
      return;
    }

    setIsLoading(true);
    try {
      if (policy) {
        await workflowTransitionPoliciesApi.update(policy.Id, formData, token);
      } else {
        await workflowTransitionPoliciesApi.create(formData, token);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || t('lit.failedToSaveWorkflowPolicy'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {policy ? t('lit.editWorkflowPolicy') : t('lit.createWorkflowPolicy')}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.policyName')}</label>
              <input
                type="text"
                value={formData.policyName || ''}
                onChange={(e) => setFormData({ ...formData, policyName: e.target.value })}
                placeholder={t('lit.eGDodBeforeDone')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.ruleType')}</label>
              <select
                value={formData.ruleType || t('lit.custom')}
                onChange={(e) => setFormData({ ...formData, ruleType: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="DoR">{t('lit.dor')}</option>
                <option value="DoD">{t('lit.dod')}</option>
                <option value="Custom">{t('lit.custom')}</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.fromStatus')}</label>
                <select
                  value={formData.fromStatusId || ''}
                  onChange={(e) => setFormData({ ...formData, fromStatusId: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">{t('lit.selectStatus')}</option>
                  {taskStatuses.map((status) => (
                    <option key={status.Id} value={status.Id}>{status.StatusName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('lit.toStatus')}</label>
                <select
                  value={formData.toStatusId || ''}
                  onChange={(e) => setFormData({ ...formData, toStatusId: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">{t('lit.selectStatus')}</option>
                  {taskStatuses.map((status) => (
                    <option key={status.Id} value={status.Id}>{status.StatusName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('lit.requiredFieldsForThisTransition')}</p>

              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireDescription}
                  onChange={(e) => setFormData({ ...formData, requireDescription: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                {t('common.description')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireAssignee}
                  onChange={(e) => setFormData({ ...formData, requireAssignee: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                {t('lit.assignee')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireDueDate}
                  onChange={(e) => setFormData({ ...formData, requireDueDate: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                {t('lit.dueDate')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireEstimatedHours}
                  onChange={(e) => setFormData({ ...formData, requireEstimatedHours: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                {t('lit.estimatedHours')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireStoryPoints}
                  onChange={(e) => setFormData({ ...formData, requireStoryPoints: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                {t('lit.storyPoints')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requirePlannedDates}
                  onChange={(e) => setFormData({ ...formData, requirePlannedDates: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                {t('lit.plannedStartAndEndDates')}
              </label>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={!!formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              {t('lit.policyIsActive')}
            </label>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {isLoading ? t('lit.saving') : policy ? t('lit.update') : t('lit.create')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatusValueModal({ orgId, type, status, onClose, onSaved, token }: {
  orgId: number;
  type: 'project' | 'task' | 'priority' | 'type' | 'milestone-type' | 'ticket' | 'ticket-priority';
  status?: any;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const isPriority = type === 'priority' || type === 'ticket-priority';
  const isTaskType = type === 'type' || type === 'milestone-type';
  const isMilestoneType = type === 'milestone-type';
  const isTaskTypeOnly = type === 'type';
  const isTicketStatus = type === 'ticket';
  const STATUS_TYPE_OPTIONS = [
    { value: 'open',        label: t('lit.openNewTicketsAwaitingAction') },
    { value: 'in_progress', label: t('lit.inProgressActivelyBeingWorked') },
    { value: 'waiting',     label: t('lit.waitingAwaitingCustomerResponse') },
    { value: 'resolved',    label: t('lit.resolvedWorkDonePendingConfirmation') },
    { value: 'closed',      label: t('lit.closedFullyClosed') },
    { value: 'other',       label: t('lit.other') },
  ];
  const [formData, setFormData] = useState<CreateStatusValueData & { statusType: string }>({
    organizationId: orgId,
    statusName: isPriority ? (status?.PriorityName || '') : isTaskType ? (status?.TypeName || '') : (status?.StatusName || ''),
    colorCode: status?.ColorCode || status?.Color || '#3b82f6',
    iconSvg: isMilestoneType
      ? (status?.IconSvg || 'flag')
      : isTaskTypeOnly
        ? resolveTaskTypeIcon(status?.IconSvg, status?.TypeName)
        : undefined,
    sortOrder: status?.SortOrder || 0,
    isDefault: !!status?.IsDefault,
    isClosed: !!status?.IsClosed,
    isCancelled: !!status?.IsCancelled,
    isInProgress: !!status?.IsInProgress,
    hideFromPlanningAndStatistics: !!status?.HideFromPlanningAndStatistics,
    statusType: status?.StatusType || 'other',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const ticketPayload = {
        organizationId: orgId,
        statusName: formData.statusName,
        priorityName: formData.statusName,
        color: formData.colorCode,
        sortOrder: formData.sortOrder,
        isDefault: formData.isDefault,
        isClosed: formData.isClosed,
        statusType: formData.statusType,
      };
      if (status) {
        if (type === 'project') {
          await statusValuesApi.updateProjectStatus(status.Id, formData, token);
        } else if (type === 'task') {
          await statusValuesApi.updateTaskStatus(status.Id, formData, token);
        } else if (type === 'priority') {
          await statusValuesApi.updateTaskPriority(status.Id, formData, token);
        } else if (type === 'type') {
          await statusValuesApi.updateTaskType(status.Id, { ...formData, typeName: formData.statusName }, token);
        } else if (type === 'milestone-type') {
          await statusValuesApi.updateMilestoneType(status.Id, { ...formData, typeName: formData.statusName }, token);
        } else {
          const endpoint = type === 'ticket' ? 'ticket' : 'ticket-priority';
          const res = await fetch(`${getApiUrl()}/api/status-values/${endpoint}/${status.Id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketPayload),
          });
          if (!res.ok) throw new Error(t('lit.failedToUpdate'));
        }
      } else {
        if (type === 'project') {
          await statusValuesApi.createProjectStatus(formData, token);
        } else if (type === 'task') {
          await statusValuesApi.createTaskStatus(formData, token);
        } else if (type === 'priority') {
          await statusValuesApi.createTaskPriority(formData, token);
        } else if (type === 'type') {
          await statusValuesApi.createTaskType({ ...formData, typeName: formData.statusName }, token);
        } else if (type === 'milestone-type') {
          await statusValuesApi.createMilestoneType({ ...formData, typeName: formData.statusName }, token);
        } else {
          const endpoint = type === 'ticket' ? 'ticket' : 'ticket-priority';
          const res = await fetch(`${getApiUrl()}/api/status-values/${endpoint}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketPayload),
          });
          if (!res.ok) throw new Error(t('lit.failedToCreate'));
        }
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || t('lit.failedToSave') + (isPriority ? 'priority' : isTaskType ? 'type value' : 'status value'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto ${isTaskTypeOnly ? 'max-w-xl' : 'max-w-md'}`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {status ? t('common.edit') : t('lit.create')} {type === 'ticket-priority' ? t('lit.ticketPriority') : type === 'ticket' ? t('lit.ticketStatus') : type === 'priority' ? t('lit.taskPriority') : type === 'type' ? t('lit.taskType') : type === 'milestone-type' ? t('lit.milestoneType') : type === 'project' ? t('lit.projectStatus') : t('lit.taskStatus')}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {isPriority ? t('lit.priority') : isTaskType ? t('lit.type2') : t('lit.status')} Name *
              </label>
              <input
                type="text"
                value={formData.statusName}
                onChange={(e) => setFormData({ ...formData, statusName: e.target.value })}
                required
                placeholder={isPriority ? 'e.g., Critical, High, Medium, Low' : isTaskType ? 'e.g., Feature, Bug, Improvement, Chore' : ''}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('lit.color')}
              </label>
              <input
                type="color"
                value={formData.colorCode}
                onChange={(e) => setFormData({ ...formData, colorCode: e.target.value })}
                className="w-full h-10 px-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700"
              />
            </div>

            {isTaskTypeOnly && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('lit.icon')}
                </label>
                <TaskTypeIconPicker
                  value={formData.iconSvg || ''}
                  color={formData.colorCode}
                  onChange={(iconId) => setFormData({ ...formData, iconSvg: iconId })}
                />
              </div>
            )}

            {isMilestoneType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('lit.svgIcon')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {MILESTONE_TYPE_ICON_OPTIONS.map((iconOption) => {
                    const selected = (formData.iconSvg || 'flag') === iconOption.value;
                    return (
                      <button
                        key={iconOption.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, iconSvg: iconOption.value })}
                        className={`h-10 rounded-lg border inline-flex items-center justify-center transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        style={formData.colorCode ? { color: formData.colorCode } : undefined}
                        title={iconOption.label}
                        aria-label={iconOption.label}
                      >
                        {renderMilestoneTypeIcon(iconOption.value, 'w-5 h-5')}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('lit.sortOrder2')}
              </label>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Set as default {isPriority ? 'priority' : isTaskType ? 'type' : 'status'}</span>
            </label>

            {!isPriority && !isTaskType && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isClosed}
                    onChange={(e) => setFormData({ ...formData, isClosed: e.target.checked })}
                    className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{t('lit.markAsClosedStatus')}</span>
                </label>

                {type !== 'ticket' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isCancelled}
                      onChange={(e) => setFormData({ ...formData, isCancelled: e.target.checked })}
                      className="w-4 h-4 text-red-600 rounded focus:ring-2 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t('lit.markAsCancelledStatus')}</span>
                  </label>
                )}

                {type === 'task' && (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!formData.isInProgress}
                      onChange={(e) => setFormData({ ...formData, isInProgress: e.target.checked })}
                      className="w-4 h-4 mt-0.5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium">{t('lit.inProgressStatus')}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {t('lit.usedByTheIdeKanbanSendToAiActionWhenNoExplicitStatusIdIsSetInEditorSettings')}
                      </span>
                    </span>
                  </label>
                )}

                {type === 'task' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!formData.hideFromPlanningAndStatistics}
                      onChange={(e) => setFormData({ ...formData, hideFromPlanningAndStatistics: e.target.checked })}
                      className="w-4 h-4 text-slate-600 rounded focus:ring-2 focus:ring-slate-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t('lit.hideFromPlanningAndStatistics')}</span>
                  </label>
                )}

                {isTicketStatus && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('lit.statusType')} <span className="text-xs text-gray-500">(used for statistics & automation)</span>
                    </label>
                    <select
                      value={formData.statusType}
                      onChange={(e) => setFormData({ ...formData, statusType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      {STATUS_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {isLoading ? t('lit.saving') : status ? t('lit.update') : t('lit.create')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Projects Tab Component
function ProjectsTab({ orgId, canManage, token }: { orgId: number; canManage: boolean; token: string }) {
  const decimalHoursToHMS = useFormatHours();
  const { pillStyle } = useColorVision();
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [transferringProject, setTransferringProject] = useState<Project | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<number>(0);
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [hideCompleted, setHideCompleted] = useState(true);
  const router = useRouter();

  useEffect(() => {
    void loadProjects();
    if (canManage) {
      void loadOrganizations();
    }
  }, [orgId, canManage]);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${getApiUrl()}/api/projects?organizationId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t('lit.failedToLoadProjects'));
      setProjects(data.projects || []);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.failedToLoadProjects'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await organizationsApi.getAll(token);
      const adminOrgs = response.organizations.filter(
        (org) => (org.Role === 'Owner' || org.Role === 'Admin') && org.Id !== orgId
      );
      setOrganizations(adminOrgs);
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  };

  const handleTransfer = async () => {
    if (!transferringProject || !selectedOrgId) return;

    try {
      await projectsApi.transfer(transferringProject.Id, selectedOrgId, token);
      setTransferringProject(null);
      setSelectedOrgId(0);
      await loadProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('lit.failedToTransferProject'));
    }
  };

  const statusOptions = useMemo(() => {
    const names = Array.from(
      new Set(projects.map((p) => p.StatusName).filter((name): name is string => Boolean(name)))
    ).sort((a, b) => a.localeCompare(b));
    return names;
  }, [projects]);

  const customerOptions = useMemo(() => {
    const names = Array.from(
      new Set(projects.map((p) => p.CustomerName).filter((name): name is string => Boolean(name)))
    ).sort((a, b) => a.localeCompare(b));
    return names;
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return projects
      .filter((project) => {
        if (hideCompleted && (Number(project.StatusIsClosed || 0) === 1 || Number(project.StatusIsCancelled || 0) === 1)) {
          return false;
        }
        if (filterStatus && project.StatusName !== filterStatus) return false;
        if (filterCustomer && project.CustomerName !== filterCustomer) return false;
        if (!q) return true;
        const haystack = [
          project.ProjectName,
          project.CustomerName,
          project.StatusName,
          project.CreatorName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => a.ProjectName.localeCompare(b.ProjectName));
  }, [projects, filterText, filterStatus, filterCustomer, hideCompleted]);

  const activeFilterCount = [
    filterText.trim() ? 1 : 0,
    filterStatus ? 1 : 0,
    filterCustomer ? 1 : 0,
    hideCompleted ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearProjectFilters = () => {
    setFilterText('');
    setFilterStatus('');
    setFilterCustomer('');
    setHideCompleted(false);
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const key = String(value).split('T')[0];
    const d = new Date(`${key}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const healthDot = (status?: string) => {
    if (status === 'red') return 'bg-red-500';
    if (status === 'amber') return 'bg-amber-500';
    if (status === 'green') return 'bg-green-500';
    return 'bg-gray-400';
  };

  if (isLoading) {
    return <div className="text-center py-4 text-gray-500 dark:text-gray-400">{t('lit.loadingProjects')}</div>;
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {filteredProjects.length === projects.length
            ? `${projects.length} project${projects.length !== 1 ? 's' : ''}`
            : `${filteredProjects.length} of ${projects.length} projects`}
        </p>
      </div>

      {projects.length > 0 && (
        <CollapsibleFilterPanel
          className="mb-2"
          title={t('lit.projectFilters')}
          activeCount={activeFilterCount}
          onClear={clearProjectFilters}
          headerExtra={
            <span className="text-xs text-gray-400">
              {filteredProjects.length} shown
            </span>
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative lg:col-span-2">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder={t('lit.searchProjects2')}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">{t('lit.allStatuses')}</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">{t('lit.allCustomers')}</option>
              {customerOptions.map((customer) => (
                <option key={customer} value={customer}>{customer}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 sm:col-span-2 lg:col-span-4">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {t('lit.hideCompletedCancelled')}
            </label>
            {activeFilterCount > 0 && (
              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  type="button"
                  onClick={clearProjectFilters}
                  className="rounded-lg bg-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  {t('lit.clearFilters')}
                </button>
              </div>
            )}
          </div>
        </CollapsibleFilterPanel>
      )}

      {projects.length === 0 ? (
        <div className="rounded-lg bg-gray-50 py-12 text-center dark:bg-gray-700/50">
          <div className="text-gray-500 dark:text-gray-400">{t('lit.noProjectsInThisOrganization')}</div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center dark:border-gray-600">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('lit.noProjectsMatchTheCurrentFilters')}</p>
          <button
            type="button"
            onClick={clearProjectFilters}
            className="mt-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {t('lit.clearFilters')}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">{t('common.project')}</th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">{t('lit.health')}</th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">{t('common.status')}</th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">{t('lit.progress')}</th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">{t('common.hours')}</th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">{t('common.tickets')}</th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">{t('lit.dates')}</th>
                <th scope="col" className="relative px-3 py-2">
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {filteredProjects.map((project) => {
                const totalTasks = Number(project.TotalTasks || 0);
                const completedTasks = Number(project.CompletedTasks || 0);
                const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                const estimated = Number(project.TotalEstimatedHours || 0);
                const worked = Number(project.TotalWorkedHours || 0);
                const openTickets = Number(project.OpenTickets || 0);
                const overdueTasks = Number(project.OverdueTasks || 0);
                const unplannedTasks = Number(project.UnplannedTasks || 0);

                return (
                  <tr
                    key={project.Id}
                    onClick={() => router.push(`/projects/${project.Id}`)}
                    className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  >
                    <td className="px-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {project.ProjectName}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {project.CustomerName ? (
                            <span>{project.CustomerName}</span>
                          ) : (
                            <span className="italic">{t('lit.noCustomer')}</span>
                          )}
                          {Number(project.IsHobby || 0) === 1 && <span className="text-amber-600 dark:text-amber-400">{t('lit.hobby')}</span>}
                          {Number(project.IsGlobal || 0) === 1 && <span>{t('lit.global')}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${healthDot(project.HealthStatus)}`}
                        title={project.HealthReasons?.join(' · ') || project.HealthStatus || t('lit.unknown')}
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={pillStyle(project.StatusColor || '#6b7280', { alpha: '25', borderAlpha: '50' }) ?? undefined}
                      >
                        {project.StatusName || t('lit.unknown')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="mx-auto w-28">
                        <div className="mb-1 flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                          <span>{completedTasks}/{totalTasks}</span>
                          <span>{progressPct}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.min(100, progressPct)}%` }}
                          />
                        </div>
                        {(overdueTasks > 0 || unplannedTasks > 0) && (
                          <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                            {overdueTasks > 0 && <span className="text-red-600 dark:text-red-400">{overdueTasks} overdue</span>}
                            {overdueTasks > 0 && unplannedTasks > 0 && ' · '}
                            {unplannedTasks > 0 && <span>{unplannedTasks} unplanned</span>}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-gray-700 dark:text-gray-300">
                      <div className="font-medium tabular-nums">{decimalHoursToHMS(worked)}</div>
                      <div className="text-gray-500 dark:text-gray-400 tabular-nums">
                        of {decimalHoursToHMS(estimated)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {openTickets}
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                      <div>{formatDate(project.StartDate)}</div>
                      <div>→ {formatDate(project.EndDate)}</div>
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/projects/${project.Id}`)}
                          title={t('lit.viewProject')}
                          aria-label={t('lit.viewProject')}
                          className="rounded p-1.5 text-gray-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z" />
                          </svg>
                        </button>
                        {canManage && organizations.length > 0 && (
                          <button
                            onClick={() => setTransferringProject(project)}
                            title={t('lit.transferProject')}
                            aria-label={t('lit.transferProject')}
                            className="rounded p-1.5 text-gray-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h11m0 0l-3-3m3 3l-3 3M16 17H5m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {transferringProject && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
              {t('lit.transferProject2')}
            </h3>

            <p className="mb-4 text-gray-600 dark:text-gray-400">
              Transfer &quot;{transferringProject.ProjectName}&quot; to another organization
            </p>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('lit.destinationOrganization')}
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value={0}>{t('lit.selectOrganization2')}</option>
                {organizations.map((org) => (
                  <option key={org.Id} value={org.Id}>
                    {org.Name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
              <p className="text-sm text-yellow-800 dark:text-yellow-400">
                This will change project access. Only members of the destination organization will be able to access this project.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setTransferringProject(null);
                  setSelectedOrgId(0);
                }}
                className="flex-1 rounded-lg bg-gray-600 px-6 py-2 text-white transition-colors hover:bg-gray-700"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleTransfer}
                disabled={!selectedOrgId}
                className="flex-1 rounded-lg bg-orange-600 px-6 py-2 text-white transition-colors hover:bg-orange-700 disabled:bg-orange-400"
              >
                {t('lit.transferProject2')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tags Tab Component
interface Tag {
  Id: number;
  Name: string;
  Color: string;
  Description?: string;
  CreatedAt: string;
}

const clampTagColorChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const normalizeTagHexColor = (color: string | undefined): string => {
  const fallback = '#6B7280';
  if (!color) return fallback;
  const trimmed = color.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex.split('').map((char) => char + char).join('')}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex}`;
  }

  return fallback;
};

const tagHexToRgb = (color: string): { r: number; g: number; b: number } => {
  const normalized = normalizeTagHexColor(color);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

const tagRgbToHex = ({ r, g, b }: { r: number; g: number; b: number }): string => {
  const toHex = (value: number) => clampTagColorChannel(value).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const blendTagHexColors = (baseColor: string, mixColor: string, ratio: number): string => {
  const base = tagHexToRgb(baseColor);
  const mix = tagHexToRgb(mixColor);
  const mixRatio = Math.max(0, Math.min(1, ratio));
  const baseRatio = 1 - mixRatio;

  return tagRgbToHex({
    r: base.r * baseRatio + mix.r * mixRatio,
    g: base.g * baseRatio + mix.g * mixRatio,
    b: base.b * baseRatio + mix.b * mixRatio,
  });
};

const withTagAlpha = (color: string, alphaHex: string): string => `${normalizeTagHexColor(color)}${alphaHex}`;

function TagsTab({
  orgId,
  canManage,
  token,
  showConfirm
}: {
  orgId: number;
  canManage: boolean;
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    color: '#6B7280',
    description: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isImportingDefaults, setIsImportingDefaults] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTags();
  }, [orgId]);

  const loadTags = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tags/organization/${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTags(data.tags || []);
      }
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingTag(null);
    setFormData({ name: '', color: '#6B7280', description: '' });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.Name,
      color: tag.Color,
      description: tag.Description || ''
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError(t('lit.tagNameIsRequired'));
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const url = editingTag
        ? `${getApiUrl()}/api/tags/${editingTag.Id}`
        : `${getApiUrl()}/api/tags`;

      const response = await fetch(url, {
        method: editingTag ? 'PUT' : t('lit.post'),
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: orgId,
          name: formData.name.trim(),
          color: formData.color,
          description: formData.description.trim() || null
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || t('lit.failedToSaveTag'));
      }

      setShowModal(false);
      loadTags();
    } catch (err: any) {
      setError(err.message || t('lit.failedToSaveTag'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (tag: Tag) => {
    showConfirm(
      'Delete Tag',
      `Are you sure you want to delete the tag "${tag.Name}"? This will remove it from all tasks.`,
      async () => {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/tags/${tag.Id}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          if (response.ok) {
            loadTags();
          }
        } catch (err) {
          console.error('Failed to delete tag:', err);
        }
      }
    );
  };

  const handleImportDefaults = async () => {
    showConfirm(
      'Import Default Tags',
      'Import the default slash-based tag presets into this organization? Existing tags with the same name will be skipped.',
      async () => {
        setIsImportingDefaults(true);
        setError('');

        try {
          const response = await fetch(
            `${getApiUrl()}/api/tags/organization/${orgId}/import-defaults`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.message || t('lit.failedToImportDefaultTags'));
          }

          await loadTags();
        } catch (err: any) {
          setError(err.message || t('lit.failedToImportDefaultTags'));
        } finally {
          setIsImportingDefaults(false);
        }
      },
      {
        confirmLabel: t('lit.import'),
        confirmVariant: 'primary',
      }
    );
  };

  const colorPresets = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
    '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
    '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
    '#EC4899', '#F43F5E', '#6B7280', '#374151', '#1F2937'
  ];

  const renderSegmentedTagPreview = (tag: { Id: number; Name: string; Color: string }) => {
    const segments = tag.Name
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    const baseColor = normalizeTagHexColor(tag.Color);

    if (segments.length <= 1) {
      return (
        <span
          className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md border"
          style={{
            backgroundColor: withTagAlpha(baseColor, '20'),
            color: baseColor,
            borderColor: withTagAlpha(baseColor, '55'),
          }}
        >
          {segments[0] || tag.Name}
        </span>
      );
    }

    return (
      <span className="inline-flex items-stretch overflow-hidden rounded-md border" style={{ borderColor: withTagAlpha(baseColor, '66') }}>
        {segments.map((segment, index) => {
          const segmentBackground = index === 0
            ? blendTagHexColors(baseColor, '#111827', 0.18)
            : index === segments.length - 1
              ? baseColor
              : blendTagHexColors(baseColor, '#ffffff', 0.12 * index);

          const segmentTextColor = index === 0
            ? blendTagHexColors(baseColor, '#ffffff', 0.72)
            : '#ffffff';

          return (
            <span
              key={`${tag.Id}-${segment}-${index}`}
              className="px-2.5 py-1 text-xs font-semibold leading-none"
              style={{
                backgroundColor: segmentBackground,
                color: segmentTextColor,
                borderLeft: index === 0 ? 'none' : `1px solid ${withTagAlpha(baseColor, '88')}`,
              }}
            >
              {segment}
            </span>
          );
        })}
      </span>
    );
  };

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400">{t('lit.loadingTags')}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('lit.tags')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('lit.manageTagsForOrganizingAndCategorizingTasks')}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleImportDefaults}
              disabled={isImportingDefaults}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m14.836 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.356-2m15.356 2H15" />
              </svg>
              {isImportingDefaults ? 'Importing...' : t('lit.importDefaultTags')}
            </button>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('lit.createTag')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {tags.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-4">🏷️</div>
          <p>{t('lit.noTagsCreatedYet')}</p>
          {canManage && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                onClick={handleImportDefaults}
                disabled={isImportingDefaults}
                className="text-gray-900 dark:text-gray-100 hover:underline disabled:opacity-60"
              >
                {isImportingDefaults ? 'Importing defaults...' : t('lit.importDefaultTags2')}
              </button>
              <button
                onClick={openCreateModal}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t('lit.createYourFirstTag')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map((tag) => (
            <div
              key={tag.Id}
              className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div>
                  <div className="mb-2">{renderSegmentedTagPreview(tag)}</div>
                  {tag.Description && (() => {
                    const plainText = tag.Description.replace(/<[^>]*>/g, '').trim();
                    return plainText ? (
                      <div className="text-xs text-gray-300 dark:text-gray-400">{plainText}</div>
                    ) : null;
                  })()}
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(tag)}
                    className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                    title={t('lit.editTag')}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(tag)}
                    className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                    title={t('lit.deleteTag')}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Tag Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                {editingTag ? t('lit.editTag2') : t('lit.createTag')}
              </h3>

              {error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('lit.tagName')}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder={t('lit.eGKindBugReviewedConfirmedStatusBlocked')}
                    maxLength={50}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('lit.use')} <span className="font-semibold">/</span> {t('lit.toCreateSegmentedLabelsVisuallyForExample')} <span className="font-semibold">{t('lit.kindBug')}</span>.
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('lit.color')}
                  </label>
                  <div className="flex items-center gap-3 mb-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder='#6B7280'
                    />
                    <span
                      className="px-3 py-1 rounded-full text-sm font-medium"
                      style={{ backgroundColor: formData.color + '20', color: formData.color, border: `1px solid ${formData.color}` }}
                    >
                      {t('lit.preview')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {colorPresets.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${formData.color === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('lit.descriptionOptional')}
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder={t('lit.briefDescriptionOfWhenToUseThisTag')}
                    maxLength={255}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                  >
                    {isSaving ? t('lit.saving') : (editingTag ? t('lit.saveChanges') : t('lit.createTag'))}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// Attachments Tab Component
function AttachmentsTab({ 
  orgId: _orgId,
  token, 
  attachments,
  uploadingFile,
  onFileUpload,
  onDeleteAttachment
}: { 
  orgId: number; 
  token: string;
  attachments: any[];
  uploadingFile: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteAttachment: (id: number) => void;
}) {
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
    if (fileType.includes('zip')) return '🗜️';
    if (fileType === 'text/plain') return '📃';
    return '📎';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const handleDownloadAttachment = async (attachmentId: number, fileName: string) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/organization-attachments/${attachmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const fileData = data.data;
        
        const byteCharacters = atob(fileData.FileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: fileData.FileType });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to download attachment:', err);
    }
  };

  const handlePreviewAttachment = async (attachmentId: number) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/organization-attachments/${attachmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const fileData = data.data;
        
        const byteCharacters = atob(fileData.FileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: fileData.FileType });
        
        // Open in new tab
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        
        // Clean up URL after a delay
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      console.error('Failed to preview attachment:', err);
    }
  };

  const canPreview = (fileType: string): boolean => {
    return fileType.startsWith('image/') || fileType === 'application/pdf';
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-end">
        <div>
          <input
            type="file"
            id="org-file-upload"
            className="hidden"
            onChange={onFileUpload}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
          />
          <label
            htmlFor="org-file-upload"
            className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors ${
              uploadingFile ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {uploadingFile ? '📤 Uploading...' : '📤 Upload File'}
          </label>
        </div>
      </div>

      {attachments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          {t('lit.noAttachmentsYetUploadFilesToGetStarted')}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {attachments.map((attachment) => (
            <div
              key={attachment.Id}
              className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-3xl">{getFileIcon(attachment.FileType)}</span>
                <div className="flex gap-2">
                  {canPreview(attachment.FileType) && (
                    <button
                      onClick={() => handlePreviewAttachment(attachment.Id)}
                      className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                      title={t('lit.preview')}
                    >
                      👁️
                    </button>
                  )}
                  <button
                    onClick={() => handleDownloadAttachment(attachment.Id, attachment.FileName)}
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    title={t('common.download')}
                  >
                    ⬇️
                  </button>
                  <button
                    onClick={() => onDeleteAttachment(attachment.Id)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    title={t('common.delete')}
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="font-medium text-gray-900 dark:text-white truncate mb-1">
                {attachment.FileName}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {formatFileSize(attachment.FileSize)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(attachment.CreatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SlaTab ──────────────────────────────────────────────────────────────────

interface SlaRule {
  Id: number;
  OrganizationId: number;
  Name: string;
  PriorityId: number | null;
  PriorityName: string | null;
  PriorityColor: string | null;
  FirstResponseHours: number | null;
  ResolutionHours: number | null;
  AutoTransitionHours: number | null;
  AutoTransitionStatusId: number | null;
  AutoTransitionStatusName?: string | null;
  AutoTransitionStatusColor?: string | null;
  IsActive: number;
}

interface TicketPriority {
  Id: number;
  PriorityName: string;
  Color: string;
}

interface TicketStatus {
  Id: number;
  StatusName: string;
  Color?: string;
}

function SlaTab({
  orgId,
  canManage,
  token,
  showConfirm,
}: {
  orgId: number;
  canManage: boolean;
  token: string;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
  const [rules, setRules] = useState<SlaRule[]>([]);
  const [priorities, setPriorities] = useState<TicketPriority[]>([]);
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<SlaRule | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    priorityId: '',
    firstResponseHours: '',
    resolutionHours: '',
    autoTransitionHours: '',
    autoTransitionStatusId: '',
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, [orgId]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [rulesRes, priRes, statusRes] = await Promise.all([
        fetch(`${API_URL}/api/sla-rules/organization/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/status-values/ticket-priority/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/status-values/ticket/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (rulesRes.ok) setRules((await rulesRes.json()).rules || []);
      if (priRes.ok) {
        const d = await priRes.json();
        setPriorities(d.priorities || d.ticketPriorities || []);
      }
      if (statusRes.ok) {
        const d = await statusRes.json();
        setStatuses(d.statuses || []);
      }
    } catch {
      setError(t('lit.failedToLoadSlaConfiguration'));
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setEditingRule(null);
    setForm({
      name: '',
      priorityId: '',
      firstResponseHours: '',
      resolutionHours: '',
      autoTransitionHours: '',
      autoTransitionStatusId: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const openEdit = (rule: SlaRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.Name,
      priorityId: rule.PriorityId != null ? String(rule.PriorityId) : '',
      firstResponseHours: rule.FirstResponseHours != null ? String(rule.FirstResponseHours) : '',
      resolutionHours: rule.ResolutionHours != null ? String(rule.ResolutionHours) : '',
      autoTransitionHours: rule.AutoTransitionHours != null ? String(rule.AutoTransitionHours) : '',
      autoTransitionStatusId: rule.AutoTransitionStatusId != null ? String(rule.AutoTransitionStatusId) : '',
      isActive: rule.IsActive === 1,
    });
    setShowModal(true);
  };

  const saveRule = async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      const hoursRaw = form.autoTransitionHours.trim();
      const statusRaw = form.autoTransitionStatusId.trim();
      const parsedHours = hoursRaw ? parseFloat(hoursRaw) : null;
      const parsedStatus = statusRaw ? parseInt(statusRaw, 10) : null;
      // Auto-transition is optional: both fields required together, otherwise both ignored
      const autoTransitionEnabled =
        parsedHours != null &&
        Number.isFinite(parsedHours) &&
        parsedHours > 0 &&
        parsedStatus != null &&
        Number.isFinite(parsedStatus);

      const body = {
        organizationId: orgId,
        name: form.name.trim(),
        priorityId: form.priorityId ? parseInt(form.priorityId, 10) : null,
        firstResponseHours: form.firstResponseHours ? parseFloat(form.firstResponseHours) : null,
        resolutionHours: form.resolutionHours ? parseFloat(form.resolutionHours) : null,
        autoTransitionHours: autoTransitionEnabled ? parsedHours : null,
        autoTransitionStatusId: autoTransitionEnabled ? parsedStatus : null,
        isActive: form.isActive,
      };
      const url = editingRule ? `${API_URL}/api/sla-rules/${editingRule.Id}` : `${API_URL}/api/sla-rules`;
      const method = editingRule ? 'PUT' : t('lit.post');
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message || t('lit.failedToSave2'));
        return;
      }
      setShowModal(false);
      await loadData();
    } catch {
      setError(t('lit.failedToSaveSlaRule'));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRule = (rule: SlaRule) => {
    showConfirm(
      'Delete SLA Rule',
      `Delete "${rule.Name}"? This cannot be undone.`,
      async () => {
        await fetch(`${API_URL}/api/sla-rules/${rule.Id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        await loadData();
      }
    );
  };

  const toggleActive = async (rule: SlaRule) => {
    await fetch(`${API_URL}/api/sla-rules/${rule.Id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: rule.Name,
        priorityId: rule.PriorityId,
        firstResponseHours: rule.FirstResponseHours,
        resolutionHours: rule.ResolutionHours,
        autoTransitionHours: rule.AutoTransitionHours,
        autoTransitionStatusId: rule.AutoTransitionStatusId,
        isActive: !rule.IsActive,
      }),
    });
    await loadData();
  };

  const formatHours = (h: number | null) => {
    if (h == null) return '—';
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h === 1) return '1h';
    if (Number.isInteger(h)) return `${h}h`;
    const whole = Math.floor(h);
    const mins = Math.round((h - whole) * 60);
    return `${whole}h ${mins}m`;
  };

  if (isLoading) return <div className="py-12 text-center text-gray-500">{t('lit.loadingSlaRules')}</div>;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('lit.defineResponseAndResolutionTimeTargetsForTicketsBreachedSlasAreShownInTheTicketL')}
        </p>
        {canManage && (
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New Rule
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {rules.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">{t('lit.noSlaRulesConfigured')}</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            {t('lit.createARuleToStartTrackingResponseAndResolutionTimesForTickets')}
          </p>
          {canManage && (
            <button
              onClick={openCreate}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
            >
              {t('lit.createFirstRule')}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">{t('lit.ruleName')}</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">{t('lit.appliesToPriority')}</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">{t('lit.firstResponse')}</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">{t('lit.resolution')}</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">{t('lit.autoStatusChange')}</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">{t('common.status')}</th>
                {canManage && (
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rules.map(rule => (
                <tr key={rule.Id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${!rule.IsActive ? 'opacity-50' : ''}`}>
                  <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">{rule.Name}</td>
                  <td className="py-3 pr-4">
                    {rule.PriorityId != null && rule.PriorityName ? (
                      <span
                        className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: rule.PriorityColor ? `${rule.PriorityColor}22` : undefined,
                          color: rule.PriorityColor || undefined,
                        }}
                      >
                        {rule.PriorityName}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-xs italic">{t('lit.allPriorities')}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                    {formatHours(rule.FirstResponseHours)}
                  </td>
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                    {formatHours(rule.ResolutionHours)}
                  </td>
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                    {rule.AutoTransitionHours != null && rule.AutoTransitionStatusId != null ? (
                      <span>
                        {formatHours(rule.AutoTransitionHours)} →{' '}
                        <span
                          className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: rule.AutoTransitionStatusColor ? `${rule.AutoTransitionStatusColor}22` : undefined,
                            color: rule.AutoTransitionStatusColor || undefined,
                          }}
                        >
                          {rule.AutoTransitionStatusName || `Status ${rule.AutoTransitionStatusId}`}
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {canManage ? (
                      <button
                        onClick={() => toggleActive(rule)}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                          rule.IsActive
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200'
                        }`}
                        title={t('lit.clickToToggle')}
                      >
                        {rule.IsActive ? '✅ Active' : '⏸ Inactive'}
                      </button>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${rule.IsActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {rule.IsActive ? t('lit.active2') : t('lit.inactive')}
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="py-3 text-right">
                      <button
                        onClick={() => openEdit(rule)}
                        title={t('lit.editSlaRule')}
                        aria-label={t('lit.editSlaRule')}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 mr-3"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteRule(rule)}
                        title={t('lit.deleteSlaRule')}
                        aria-label={t('lit.deleteSlaRule')}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                      >
                        🗑️
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
        <p className="font-medium mb-1">{t('lit.howSlaBadgesWork')}</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
          <li>🟢 <strong>{t('lit.green')}</strong> — ticket is within SLA time limits</li>
          <li>🟡 <strong>{t('lit.yellow')}</strong> — &gt; 75% of the allowed time has elapsed</li>
          <li>🔴 <strong>{t('lit.red')}</strong> — SLA has been breached (time limit exceeded)</li>
          <li>{t('lit.rulesWithNoPrioritySetActAsACatchAllForAllTicketPriorities')}</li>
          <li>{t('lit.ifAPrioritySpecificRuleExistsItTakesPrecedenceOverTheCatchAll')}</li>
        </ul>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingRule ? t('lit.editSlaRule2') : t('lit.newSlaRule')}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('lit.ruleName2')}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder={t('lit.eGUrgentTicketsStandardSla')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('lit.appliesToPriority')}
                </label>
                <select
                  value={form.priorityId}
                  onChange={e => setForm({ ...form, priorityId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">{t('lit.allPrioritiesCatchAll')}</option>
                  {priorities.map(p => (
                    <option key={p.Id} value={p.Id}>{p.PriorityName}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">{t('lit.leaveEmptyToApplyToAllPrioritiesNotCoveredByAnotherRule')}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('lit.firstResponseHours')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.firstResponseHours}
                    onChange={e => setForm({ ...form, firstResponseHours: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder={t('lit.eG4')}
                  />
                  <p className="text-xs text-gray-400 mt-1">{t('lit.maxHoursUntilFirstStaffReply')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('lit.resolutionHours')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.resolutionHours}
                    onChange={e => setForm({ ...form, resolutionHours: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder={t('lit.eG24')}
                  />
                  <p className="text-xs text-gray-400 mt-1">{t('lit.maxHoursUntilTicketIsResolved')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('lit.autoStatusChangeAfterHours')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.autoTransitionHours}
                    onChange={e => {
                      const autoTransitionHours = e.target.value;
                      setForm({
                        ...form,
                        autoTransitionHours,
                        // Clearing hours disables auto-transition
                        autoTransitionStatusId: autoTransitionHours.trim() ? form.autoTransitionStatusId : '',
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder={t('lit.eG8')}
                  />
                  <p className="text-xs text-gray-400 mt-1">{t('lit.optionalLeaveEmptyToDisableAutoTransition')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('lit.changeStatusTo')}
                  </label>
                  <select
                    value={form.autoTransitionStatusId}
                    onChange={e => setForm({ ...form, autoTransitionStatusId: e.target.value })}
                    disabled={!form.autoTransitionHours.trim()}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50"
                  >
                    <option value="">
                      {form.autoTransitionHours.trim() ? 'Select status…' : 'Disabled (set hours first)'}
                    </option>
                    {statuses.map(s => (
                      <option key={s.Id} value={String(s.Id)}>{s.StatusName}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">{t('lit.requiredOnlyWhenAutoTransitionHoursAreSet')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="sla-active"
                  checked={form.isActive}
                  onChange={e => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="sla-active" className="text-sm text-gray-700 dark:text-gray-300">
                  {t('lit.activeRuleIsEnforced')}
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => { setShowModal(false); setError(''); }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={saveRule}
                disabled={isSaving || !form.name.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white rounded-lg transition-colors text-sm"
              >
                {isSaving ? t('lit.saving2') : editingRule ? t('lit.saveChanges') : t('lit.createRule')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

