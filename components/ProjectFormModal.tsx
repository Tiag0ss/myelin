'use client';


import { useI18n } from '@/lib/i18n/provider';
import { getApiUrl } from '@/lib/api/config';
import { useEffect, useState } from 'react';
import { projectsApi, Project, CreateProjectData } from '@/lib/api/projects';
import { organizationsApi, Organization } from '@/lib/api/organizations';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import SearchableSelect from '@/components/SearchableSelect';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import CustomFieldsFormSection from '@/components/custom-fields/CustomFieldsFormSection';
import { CustomFieldValues, extractCustomFieldValues } from '@/lib/customFields';
import { useToast } from '@/contexts/ToastContext';
import { usePermissions } from '@/contexts/PermissionsContext';

const canCreateProjectsInOrganization = (org: Organization): boolean => {
  if (org.Role === 'Owner' || org.Role === 'Admin') {
    return true;
  }
  return Number(org.CanCreateProjects || 0) === 1;
};

interface ProjectFormModalProps {
  project: Project | null;
  onClose: () => void;
  onSaved: () => void;
  token: string;
  canViewBudgetInfo: boolean;
}

export default function ProjectFormModal({
  project,
  onClose,
  onSaved,
  token,
  canViewBudgetInfo,
}: ProjectFormModalProps) {
  const { t } = useI18n();

  const { showToast } = useToast();
  const { permissions } = usePermissions();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<{ Id: number; Name: string }[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [jiraIntegration, setJiraIntegration] = useState<{ JiraUrl: string; JiraProjectKey: string } | null>(null);
  const [availableApplications, setAvailableApplications] = useState<{ Id: number; Name: string }[]>([]);
  const [formData, setFormData] = useState<CreateProjectData>({
    organizationId: project?.OrganizationId || 0,
    projectName: project?.ProjectName || '',
    description: project?.Description || '',
    status: project?.Status ?? null,
    startDate: project?.StartDate ? project.StartDate.split('T')[0] : '',
    endDate: project?.EndDate ? project.EndDate.split('T')[0] : '',
    isHobby: project?.IsHobby || false,
    isGlobal: !!project?.IsGlobal,
    customerId: project?.CustomerId || undefined,
    jiraBoardId: project?.JiraBoardId || undefined,
    budget: project?.Budget ?? undefined,
    budgetType: project?.BudgetType === 'hours' ? 'hours' : 'monetary',
    hourlyRate: project?.HourlyRate ?? undefined,
    applicationIds: project?.ApplicationIds || [],
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldValues>(() => extractCustomFieldValues(project));

  useEffect(() => {
    if (!token) return;
    void loadOrganizations();
  }, [token, permissions?.canCreateProjects]);

  useEffect(() => {
    if (formData.organizationId && formData.organizationId > 0) {
      void loadCustomers(formData.organizationId);
      void loadProjectStatuses(formData.organizationId);
      void loadJiraIntegration(formData.organizationId);
      void loadApplicationsList(formData.organizationId);
    } else {
      setCustomers([]);
      setProjectStatuses([]);
      setJiraIntegration(null);
      setAvailableApplications([]);
    }
  }, [formData.organizationId]);

  const loadApplicationsList = async (orgId: number) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/applications?organizationId=${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableApplications(data.applications || []);
      }
    } catch {
      setAvailableApplications([]);
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await organizationsApi.getAll(token);
      const allOrganizations = Array.isArray(response.organizations) ? response.organizations : [];

      // Prefer orgs where this membership can create (Owner/Admin/permission group).
      let organizationsForSelect = project
        ? allOrganizations
        : allOrganizations.filter(canCreateProjectsInOrganization);

      // Global role CanCreateProjects (Developer/Support/Manager) is aggregated into
      // permissions.canCreateProjects but is not always mirrored on each org row.
      // If the per-org filter is empty, fall back to all memberships for entitled users.
      if (!project && organizationsForSelect.length === 0 && permissions?.canCreateProjects) {
        organizationsForSelect = allOrganizations;
      }

      setOrganizations(organizationsForSelect);

      if (!project && organizationsForSelect.length > 0) {
        setError('');
        setFormData((prev) => {
          if (prev.organizationId && organizationsForSelect.some((org) => org.Id === prev.organizationId)) {
            return prev;
          }
          return { ...prev, organizationId: organizationsForSelect[0].Id };
        });
      } else if (!project && organizationsForSelect.length === 0) {
        setError(t('lit.noOrganizationsAvailableForProjectCreationAskAnAdminToGrantCreateProject'));
      }
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
      setOrganizations([]);
      setError(err.message || t('lit.failedToLoadOrganizations'));
    }
  };

  const loadCustomers = async (orgId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/customers?organizationId=${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.data || []);
      }
    } catch (err: any) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadProjectStatuses = async (orgId: number) => {
    try {
      const response = await statusValuesApi.getProjectStatuses(orgId, token);
      const statuses = response.statuses || [];
      setProjectStatuses(statuses);

      setFormData((prev) => {
        if (project) {
          return prev;
        }

        const hasValidStatus =
          typeof prev.status === 'number' &&
          statuses.some((status) => Number(status.Id) === Number(prev.status));

        if (hasValidStatus) {
          return prev;
        }

        const defaultStatus = statuses.find((status) => Number(status.IsDefault) === 1) || statuses[0];

        return {
          ...prev,
          status: defaultStatus ? Number(defaultStatus.Id) : null,
        };
      });
    } catch (err: any) {
      console.error('Failed to load project statuses:', err);
    }
  };

  const loadJiraIntegration = async (orgId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.integration && data.integration.IsEnabled && data.integration.JiraProjectsUrl) {
          setJiraIntegration({ JiraUrl: data.integration.JiraProjectsUrl, JiraProjectKey: '' });
        } else {
          setJiraIntegration(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load Jira integration:', err);
      setJiraIntegration(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (formData.isGlobal && formData.customerId) {
        throw new Error(t('lit.globalProjectsCannotBeAssociatedWithACustomer'));
      }

      const requestData: CreateProjectData = canViewBudgetInfo
        ? { ...formData, customFields }
        : { ...formData, budget: undefined, budgetType: undefined, hourlyRate: undefined, customFields };

      if (project) {
        await projectsApi.update(project.Id, requestData, token);
      } else {
        await projectsApi.create(requestData, token);
      }
      onSaved();
    } catch (err: any) {
      const message = err.message || t('lit.failedToSaveProject');
      setError(message);
      showToast({ type: 'error', title: t('lit.projectError'), message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {project ? t('pages.projects.editProject') : t('lit.createNewProject')}
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
                {t('lit.organization')}
              </label>
              <SearchableSelect
                value={formData.organizationId > 0 ? formData.organizationId.toString() : ''}
                onChange={(value) => setFormData({ ...formData, organizationId: parseInt(value) || 0 })}
                options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                placeholder={t('lit.selectOrganization2')}
                emptyText={t('lit.selectOrganization')}
                disabled={!!project}
                autoSelectSingleOption={!project}
              />
              {!project && organizations.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {t('lit.noOrganizationsAvailableYourMembershipNeedsCreateProjectsPermission')}
                </p>
              )}
              {!!project && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('lit.organizationCannotBeChangedAfterProjectCreation')}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('common.customer')}
              </label>
              <SearchableSelect
                value={formData.customerId?.toString() || ''}
                onChange={(value) => setFormData({ ...formData, customerId: value ? parseInt(value) : undefined })}
                options={customers.map(customer => ({ value: customer.Id, label: customer.Name }))}
                placeholder={t('lit.selectCustomer')}
                emptyText={t('lit.noCustomer')}
                disabled={!formData.organizationId || formData.organizationId === 0 || !!formData.isGlobal}
                autoSelectSingleOption={!project}
              />
              {formData.isGlobal && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {t('lit.globalProjectsCannotHaveACustomerAssociation')}
                </p>
              )}
              {formData.organizationId > 0 && customers.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('lit.noCustomersAvailableForThisOrganization')}
                </p>
              )}
            </div>

            {availableApplications.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('nav.applications')}
                </label>
                <SearchableMultiSelect
                  values={formData.applicationIds || []}
                  onChange={(values) => setFormData({ ...formData, applicationIds: values as number[] })}
                  options={availableApplications.map(app => ({ value: app.Id, label: app.Name }))}
                  placeholder={t('lit.selectApplications2')}
                />
              </div>
            )}

            {jiraIntegration && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                  </svg>
                  <label className="block text-sm font-medium text-blue-700 dark:text-blue-300">
                    {t('lit.jiraBoardId')}
                  </label>
                </div>
                <input
                  type="text"
                  value={formData.jiraBoardId || ''}
                  onChange={(e) => setFormData({ ...formData, jiraBoardId: e.target.value || undefined })}
                  className="w-full px-4 py-2 border border-blue-300 dark:border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder={t('lit.eG123FromBoardUrl')}
                />
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {t('lit.associateThisProjectWithAJiraBoardFindTheBoardIdInYourJiraBoardUrlBoards123')}
                </p>
              </div>
            )}

            {availableApplications.length > 0 && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-300 dark:border-gray-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('lit.gitVcsRepositories')}
                </label>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Configure repository URL and GitHub / Gitea / Bitbucket credentials on each{' '}
                  <strong>{t('lit.application')}</strong>, then link applications to this project. Issue import uses the
                  selected application&apos;s repository.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('lit.projectName2')}
              </label>
              <input
                type="text"
                value={formData.projectName}
                onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder={t('lit.enterProjectName')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('common.description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder={t('lit.enterProjectDescription')}
              />
            </div>

            {canViewBudgetInfo && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('lit.budgetType')}
                  </label>
                  <SearchableSelect
                    value={formData.budgetType || 'monetary'}
                    onChange={(value) => setFormData({ ...formData, budgetType: value === 'hours' ? 'hours' : 'monetary' })}
                    options={[
                      { value: 'monetary', label: t('lit.monetary') },
                      { value: 'hours', label: t('lit.totalHours2') },
                    ]}
                    placeholder={t('lit.selectBudgetType')}
                    emptyText={t('lit.noBudgetType')}
                    autoSelectSingleOption
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('lit.budget')}
                  </label>
                  <div className="relative">
                    {formData.budgetType !== 'hours' && (
                      <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400">$</span>
                    )}
                    <input
                      type="number"
                      min="0"
                      step={formData.budgetType === 'hours' ? '0.5' : '0.01'}
                      value={formData.budget ?? ''}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
                      className={`w-full ${formData.budgetType === 'hours' ? 'pl-4' : 'pl-7'} pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                      placeholder={formData.budgetType === 'hours' ? '0.0' : '0.00'}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formData.budgetType === 'hours'
                      ? t('lit.optionalProjectBudgetInTotalPlannedHours')
                      : t('lit.optionalProjectBudgetInCurrencyUnits')}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('lit.hourlyRate')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.hourlyRate ?? ''}
                      onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder='0.00'
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Optional default rate for cost. Falls back to each user&apos;s hourly rate when unset. Task rates override this.
                  </p>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('common.status')}
              </label>
              <SearchableSelect
                value={formData.status ?? ''}
                onChange={(value) => setFormData({ ...formData, status: value ? parseInt(value, 10) : null })}
                options={projectStatuses.map((status) => ({
                  value: status.Id,
                  label: status.StatusName,
                }))}
                placeholder={t('lit.selectStatus2')}
                emptyText={t('lit.selectStatus2')}
                disabled={!formData.organizationId || formData.organizationId === 0}
              />
              {formData.organizationId > 0 && projectStatuses.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('lit.noProjectStatusesAvailableForThisOrganization')}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('lit.startDate')}
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('lit.endDate')}
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <input
                  type="checkbox"
                  id="isGlobal"
                  checked={!!formData.isGlobal}
                  onChange={(e) => setFormData({
                    ...formData,
                    isGlobal: e.target.checked,
                    customerId: e.target.checked ? undefined : formData.customerId,
                  })}
                  className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:border-blue-600"
                />
                <div>
                  <label htmlFor="isGlobal" className="block text-sm font-medium text-blue-700 dark:text-blue-300 cursor-pointer">
                    🌐 Global Project
                  </label>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {t('lit.globalProjectsAreNotAssociatedWithASpecificCustomer')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <input
                  type="checkbox"
                  id="isHobby"
                  checked={formData.isHobby || false}
                  onChange={(e) => setFormData({ ...formData, isHobby: e.target.checked })}
                  className="w-5 h-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500 dark:bg-gray-700 dark:border-purple-600"
                />
                <div>
                  <label htmlFor="isHobby" className="block text-sm font-medium text-purple-700 dark:text-purple-300 cursor-pointer">
                    🎨 Hobby Project
                  </label>
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    {t('lit.hobbyProjectsAreScheduledOutsideOfRegularWorkHours')}
                  </p>
                </div>
              </div>
            </div>

            <CustomFieldsFormSection
              tableName="Projects"
              token={token}
              values={customFields}
              onChange={setCustomFields}
            />

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
                {isLoading ? t('lit.saving') : project ? t('lit.updateProject') : t('lit.createProject')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
