'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import RichTextEditor from '@/components/RichTextEditor';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import {
  createProductReleaseWizard,
  getProductReleaseCandidateTasks,
  getProductReleaseSeedTasks,
  getProductReleaseWizardState,
  getProductsAiAvailability,
  improveProductPatchNotes,
  updateProductReleaseWizard,
  type ProductReleaseWizardPayload,
} from '@/lib/api/products';
import { buildWizardProductPatchNotes } from '@/lib/productPatchNotes';
import { resolvePatchNoteIssueRef } from '@/lib/releasePatchNotes';
import { defaultApplicationIdsForTask } from '@/lib/productReleaseWizard';
import { projectsApi } from '@/lib/api/projects';
import { getApiUrl } from '@/lib/api/config';
import ProductReleaseTasksPickerModal, {
  type ProductReleasePickerTask,
} from './ProductReleaseTasksPickerModal';

const VERSION_STATUSES = ['Planning', 'In Development', 'Testing', 'Released', 'Archived'];

type CatalogApp = { Id: number; Name: string };

type AppRow = {
  applicationId: number;
  name: string;
  included: boolean;
  mode: 'create' | 'link';
  versionNumber: string;
  versionName: string;
  applicationVersionId: number | null;
  /** Link mode only: replace existing application version patch notes on save. Default false. */
  recreatePatchNotes: boolean;
  existingVersions: Array<{
    Id: number;
    VersionNumber: string;
    VersionName?: string | null;
    PatchNotes?: string | null;
  }>;
};

type SelectedTask = {
  taskId: number;
  TaskName: string;
  ProjectId: number | null;
  ProjectName: string | null;
  ApplicationId: number | null;
  relatedApplicationIds: number[];
  applicationIds: number[];
  TaskTypeName?: string | null;
  JiraIssueKey?: string | null;
  ExternalIssueId?: string | null;
  TicketId?: number | null;
  TicketNumber?: string | number | null;
  GitHubIssueNumber?: string | number | null;
  GiteaIssueNumber?: string | number | null;
  JiraUrl?: string | null;
  JiraProjectsUrl?: string | null;
};

function mapSelectedTaskToPatchNoteInput(task: SelectedTask) {
  return {
    Id: task.taskId,
    TaskName: task.TaskName,
    ProjectName: task.ProjectName,
    TaskTypeName: task.TaskTypeName ?? null,
    JiraIssueKey: task.JiraIssueKey ?? null,
    ExternalIssueId: task.ExternalIssueId ?? null,
    TicketId: task.TicketId ?? null,
    TicketNumber: task.TicketNumber ?? null,
    GitHubIssueNumber: task.GitHubIssueNumber ?? null,
    GiteaIssueNumber: task.GiteaIssueNumber ?? null,
    JiraUrl: task.JiraUrl ?? null,
    JiraProjectsUrl: task.JiraProjectsUrl ?? null,
  };
}

type Props = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  productId: number | string;
  productVersionId?: number | null;
  organizationId: number;
  token: string;
  customers: Array<{ Id: number; Name: string }>;
  onClose: () => void;
  onSaved: (versionId: number) => void;
};

export default function ProductReleaseWizardModal({
  isOpen,
  mode,
  productId,
  productVersionId,
  organizationId,
  token,
  customers,
  onClose,
  onSaved,
}: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiAvailable, setIsAiAvailable] = useState(false);
  const [isImproving, setIsImproving] = useState(false);

  const [versionNumber, setVersionNumber] = useState('');
  const [versionName, setVersionName] = useState('');
  const [status, setStatus] = useState('Planning');
  const [releaseDate, setReleaseDate] = useState('');
  const [isCustomerSpecific, setIsCustomerSpecific] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [projectIds, setProjectIds] = useState<number[]>([]);
  const [orgProjects, setOrgProjects] = useState<Array<{ Id: number; ProjectName: string }>>([]);

  const [appRows, setAppRows] = useState<AppRow[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<SelectedTask[]>([]);
  const [projectCatalogApplicationIds, setProjectCatalogApplicationIds] = useState<number[]>([]);
  const [showTasksPicker, setShowTasksPicker] = useState(false);
  const [patchNotes, setPatchNotes] = useState('');
  const [baselineFingerprint, setBaselineFingerprint] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const includedApps = useMemo(() => appRows.filter((a) => a.included), [appRows]);

  const buildBaselinePatchNotes = (): string => {
    const sources = includedApps.map((app) => {
      const versionLabel =
        app.mode === 'link'
          ? app.existingVersions.find((v) => v.Id === app.applicationVersionId)?.VersionNumber ||
            app.versionNumber ||
            ''
          : app.versionNumber || versionNumber;
      return {
        applicationId: app.applicationId,
        applicationName: app.name,
        applicationVersionId: app.applicationVersionId || app.applicationId,
        versionNumber: versionLabel || versionNumber || '—',
        versionName: app.versionName || null,
        patchNotes: null,
      };
    });
    return buildWizardProductPatchNotes(sources, {
      tasks: selectedTasks.map(mapSelectedTaskToPatchNoteInput),
      generalProjectLabel: t('lit.general') || 'General',
      untypedLabel: t('lit.other') || 'Other changes',
    });
  };

  const currentFingerprint = useMemo(() => {
    return JSON.stringify({
      apps: includedApps.map((a) => ({
        id: a.applicationId,
        mode: a.mode,
        vn: a.versionNumber,
        avid: a.applicationVersionId,
      })),
      tasks: selectedTasks.map((t) => ({ id: t.taskId, apps: t.applicationIds })),
      versionNumber,
    });
  }, [includedApps, selectedTasks, versionNumber]);

  useEffect(() => {
    if (!isOpen) return;
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, productVersionId]);

  useEffect(() => {
    if (!isOpen || step !== 4) return;
    if (mode === 'edit' && baselineFingerprint === '') {
      // Keep saved notes on first enter in edit mode.
      setBaselineFingerprint(currentFingerprint);
      return;
    }
    if (baselineFingerprint !== currentFingerprint) {
      setPatchNotes(buildBaselinePatchNotes());
      setBaselineFingerprint(currentFingerprint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentFingerprint, isOpen]);

  const bootstrap = async () => {
    setIsLoading(true);
    setError('');
    setStep(1);
    try {
      const [projectsRes, aiRes, catalogRes] = await Promise.all([
        projectsApi.getAll(token),
        getProductsAiAvailability(token).catch(() => ({ configured: false })),
        getProductReleaseCandidateTasks(token, productId, {}),
      ]);
      setIsAiAvailable(Boolean(aiRes.configured));
      const projects = (projectsRes.projects || []).filter(
        (p: { OrganizationId?: number }) =>
          !p.OrganizationId || Number(p.OrganizationId) === Number(organizationId)
      );
      setOrgProjects(
        projects.map((p: { Id: number; ProjectName: string }) => ({
          Id: p.Id,
          ProjectName: p.ProjectName,
        }))
      );

      const catalogApps: CatalogApp[] = catalogRes.data.catalogApplications || [];
      setProjectCatalogApplicationIds(catalogRes.data.projectCatalogApplicationIds || []);
      const versionsByApp = await loadExistingVersions(catalogApps.map((a) => a.Id));

      if (mode === 'edit' && productVersionId) {
        const state = await getProductReleaseWizardState(token, productId, productVersionId);
        const v = state.data.version;
        setVersionNumber(String(v.VersionNumber || ''));
        setVersionName(String(v.VersionName || ''));
        setStatus(String(v.Status || 'Planning'));
        setReleaseDate(v.ReleaseDate ? String(v.ReleaseDate).split('T')[0] : '');
        setIsCustomerSpecific(Boolean(v.IsCustomerSpecific));
        setCustomerId(v.CustomerId ?? null);
        setProjectIds(state.data.projectIds || []);
        setPatchNotes(String(v.PatchNotes || ''));
        setBaselineFingerprint('');

        const stateAppById = new Map(
          state.data.applications.map((a) => [a.applicationId, a])
        );
        setAppRows(
          catalogApps.map((app) => {
            const existing = stateAppById.get(app.Id);
            return {
              applicationId: app.Id,
              name: app.Name,
              included: Boolean(existing?.included),
              mode: 'link' as const,
              versionNumber: existing?.versionNumber || versionNumber || '',
              versionName: existing?.versionName || '',
              applicationVersionId: existing?.applicationVersionId ?? null,
              recreatePatchNotes: false,
              existingVersions: versionsByApp[app.Id] || [],
            };
          })
        );
        setSelectedTasks(
          state.data.tasks.map((task) => ({
            taskId: task.taskId,
            TaskName: task.TaskName,
            ProjectId: task.ProjectId,
            ProjectName: task.ProjectName,
            ApplicationId: task.ApplicationId,
            relatedApplicationIds: task.relatedApplicationIds || [],
            applicationIds: task.applicationIds || [],
            TaskTypeName: task.TaskTypeName ?? null,
            JiraIssueKey: task.JiraIssueKey ?? null,
            ExternalIssueId: task.ExternalIssueId ?? null,
            TicketId: task.TicketId ?? null,
            TicketNumber: task.TicketNumber ?? null,
            GitHubIssueNumber: task.GitHubIssueNumber ?? null,
            GiteaIssueNumber: task.GiteaIssueNumber ?? null,
            JiraUrl: task.JiraUrl ?? null,
            JiraProjectsUrl: task.JiraProjectsUrl ?? null,
          }))
        );
      } else {
        setVersionNumber('');
        setVersionName('');
        setStatus('Planning');
        setReleaseDate('');
        setIsCustomerSpecific(false);
        setCustomerId(null);
        setProjectIds([]);
        setPatchNotes('');
        setBaselineFingerprint('');
        setSelectedTasks([]);
        setAppRows(
          catalogApps.map((app) => ({
            applicationId: app.Id,
            name: app.Name,
            included: true,
            mode: 'create' as const,
            versionNumber: '',
            versionName: '',
            applicationVersionId: null,
            recreatePatchNotes: false,
            existingVersions: versionsByApp[app.Id] || [],
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lit.failedToLoadWizard') || 'Failed to load wizard');
    } finally {
      setIsLoading(false);
    }
  };

  const loadExistingVersions = async (applicationIds: number[]) => {
    const result: Record<
      number,
      Array<{ Id: number; VersionNumber: string; VersionName?: string | null; PatchNotes?: string | null }>
    > = {};
    await Promise.all(
      applicationIds.map(async (applicationId) => {
        try {
          const res = await fetch(`${getApiUrl()}/api/applications/${applicationId}/versions`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (res.ok) {
            result[applicationId] = (data.versions || data.data || []).map(
              (v: {
                Id: number;
                VersionNumber: string;
                VersionName?: string | null;
                PatchNotes?: string | null;
              }) => ({
                Id: v.Id,
                VersionNumber: v.VersionNumber,
                VersionName: v.VersionName,
                PatchNotes: v.PatchNotes,
              })
            );
          } else {
            result[applicationId] = [];
          }
        } catch {
          result[applicationId] = [];
        }
      })
    );
    return result;
  };

  const refreshCandidates = async (nextProjectIds: number[]) => {
    const data = await getProductReleaseCandidateTasks(token, productId, {
      projectIds: nextProjectIds,
    });
    setProjectCatalogApplicationIds(data.data.projectCatalogApplicationIds || []);
    if (mode === 'create') {
      const suggested = new Set(data.data.projectCatalogApplicationIds || []);
      setAppRows((prev) =>
        prev.map((row) => ({
          ...row,
          included: nextProjectIds.length === 0 ? true : suggested.has(row.applicationId),
          versionNumber: row.mode === 'create' && !row.versionNumber ? versionNumber : row.versionNumber,
        }))
      );
    }
  };

  const syncSeedsFromLinkedVersions = async (rows: AppRow[], keepManual: SelectedTask[]) => {
    const linkedIds = rows
      .filter((r) => r.included && r.mode === 'link' && r.applicationVersionId)
      .map((r) => Number(r.applicationVersionId));
    if (linkedIds.length === 0) {
      // Drop tasks that only existed from previous seeds when no links remain? Keep manual.
      setSelectedTasks(keepManual);
      return;
    }
    const seedRes = await getProductReleaseSeedTasks(token, productId, linkedIds);
    const byTask = new Map<number, SelectedTask>();
    for (const task of keepManual) {
      byTask.set(task.taskId, { ...task, applicationIds: [...task.applicationIds] });
    }
    for (const seed of seedRes.data.tasks || []) {
      const existing = byTask.get(seed.taskId);
      if (existing) {
        if (!existing.applicationIds.includes(seed.applicationId)) {
          existing.applicationIds = [...existing.applicationIds, seed.applicationId];
        }
        existing.TaskTypeName = existing.TaskTypeName ?? seed.TaskTypeName ?? null;
        existing.JiraIssueKey = existing.JiraIssueKey ?? seed.JiraIssueKey ?? null;
        existing.ExternalIssueId = existing.ExternalIssueId ?? seed.ExternalIssueId ?? null;
        existing.TicketId = existing.TicketId ?? seed.TicketId ?? null;
        existing.TicketNumber = existing.TicketNumber ?? seed.TicketNumber ?? null;
        existing.GitHubIssueNumber = existing.GitHubIssueNumber ?? seed.GitHubIssueNumber ?? null;
        existing.GiteaIssueNumber = existing.GiteaIssueNumber ?? seed.GiteaIssueNumber ?? null;
        existing.JiraUrl = existing.JiraUrl ?? seed.JiraUrl ?? null;
        existing.JiraProjectsUrl = existing.JiraProjectsUrl ?? seed.JiraProjectsUrl ?? null;
      } else {
        byTask.set(seed.taskId, {
          taskId: seed.taskId,
          TaskName: seed.TaskName,
          ProjectId: seed.ProjectId,
          ProjectName: seed.ProjectName,
          ApplicationId: seed.ApplicationId,
          relatedApplicationIds: [],
          applicationIds: [seed.applicationId],
          TaskTypeName: seed.TaskTypeName ?? null,
          JiraIssueKey: seed.JiraIssueKey ?? null,
          ExternalIssueId: seed.ExternalIssueId ?? null,
          TicketId: seed.TicketId ?? null,
          TicketNumber: seed.TicketNumber ?? null,
          GitHubIssueNumber: seed.GitHubIssueNumber ?? null,
          GiteaIssueNumber: seed.GiteaIssueNumber ?? null,
          JiraUrl: seed.JiraUrl ?? null,
          JiraProjectsUrl: seed.JiraProjectsUrl ?? null,
        });
      }
    }
    setSelectedTasks([...byTask.values()]);
  };

  const validateStep = (current: number): boolean => {
    setError('');
    if (current === 1) {
      if (!versionNumber.trim()) {
        setError(t('lit.versionNumberIsRequired'));
        return false;
      }
      if (isCustomerSpecific && !customerId) {
        setError(t('lit.customerIsRequiredWhenVersionIsCustomerSpecific'));
        return false;
      }
    }
    if (current === 2) {
      if (includedApps.length === 0) {
        setError(t('lit.selectAtLeastOneApplication') || 'Select at least one application');
        return false;
      }
      for (const app of includedApps) {
        if (app.mode === 'create' && !(app.versionNumber.trim() || versionNumber.trim())) {
          setError(
            t('lit.versionNumberIsRequiredForApplication') ||
              `Version number required for ${app.name}`
          );
          return false;
        }
        if (app.mode === 'link' && !(app.applicationVersionId && app.applicationVersionId > 0)) {
          setError(
            t('lit.selectApplicationVersion') || `Select a version for ${app.name}`
          );
          return false;
        }
      }
    }
    if (current === 3) {
      const invalid = selectedTasks.find((task) => task.applicationIds.length === 0);
      if (invalid) {
        setError(
          t('lit.eachTaskNeedsAtLeastOneApplication') ||
            'Each selected task needs at least one application'
        );
        return false;
      }
    }
    return true;
  };

  const goNext = async () => {
    if (!validateStep(step)) return;
    if (step === 2) {
      setAppRows((prev) =>
        prev.map((row) =>
          row.included && row.mode === 'create' && !row.versionNumber.trim()
            ? { ...row, versionNumber: versionNumber.trim() }
            : row
        )
      );
      await syncSeedsFromLinkedVersions(
        appRows.map((row) =>
          row.included && row.mode === 'create' && !row.versionNumber.trim()
            ? { ...row, versionNumber: versionNumber.trim() }
            : row
        ),
        selectedTasks
      );
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const buildPayload = (): ProductReleaseWizardPayload => ({
    VersionNumber: versionNumber.trim(),
    VersionName: versionName.trim() || null,
    Status: status,
    ReleaseDate: releaseDate || null,
    PatchNotes: patchNotes || null,
    IsCustomerSpecific: isCustomerSpecific,
    CustomerId: isCustomerSpecific ? customerId : null,
    projectIds,
    applications: includedApps.map((app) => ({
      applicationId: app.applicationId,
      mode: app.mode,
      versionNumber:
        app.mode === 'create' ? app.versionNumber.trim() || versionNumber.trim() : null,
      versionName: app.mode === 'create' ? app.versionName.trim() || null : null,
      applicationVersionId: app.mode === 'link' ? app.applicationVersionId : null,
      recreatePatchNotes: app.mode === 'link' ? Boolean(app.recreatePatchNotes) : false,
      taskIds: selectedTasks
        .filter((task) => task.applicationIds.includes(app.applicationId))
        .map((task) => task.taskId),
    })),
  });

  const handleSave = async () => {
    if (!validateStep(4)) return;
    setIsSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      if (mode === 'edit' && productVersionId) {
        await updateProductReleaseWizard(token, productId, productVersionId, payload);
        onSaved(Number(productVersionId));
      } else {
        const created = await createProductReleaseWizard(token, productId, payload);
        onSaved(Number(created.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lit.failedToSaveVersion'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetNotes = () => {
    const apply = () => {
      setPatchNotes(buildBaselinePatchNotes());
      setBaselineFingerprint(currentFingerprint);
    };
    if (String(patchNotes || '').trim()) {
      setConfirmModal({
        title: t('lit.reset') || 'Reset',
        message:
          t('lit.resetPatchNotesConfirm') ||
          'Reset patch notes from the associated application versions? Current edits will be overwritten.',
        confirmLabel: t('lit.reset') || 'Reset',
        onConfirm: apply,
      });
      return;
    }
    apply();
  };

  const handleImproveAi = () => {
    if (!isAiAvailable || isImproving || !patchNotes.trim()) return;
    setConfirmModal({
      title: t('lit.improveWithAi') || 'Improve with AI',
      message:
        t('lit.improvePatchNotesSplitHelp') ||
        'Improve patch notes with AI? Choose Yes to keep change-type sections when possible.',
      confirmLabel: t('common.yes') || 'Yes',
      onConfirm: () => void runImprove(true),
      onCancel: () => void runImprove(false),
    });
  };

  const runImprove = async (splitByChangeType: boolean) => {
    setIsImproving(true);
    try {
      const result = await improveProductPatchNotes(token, productId, patchNotes, {
        splitByChangeType,
      });
      if (result.patchNotes) setPatchNotes(result.patchNotes);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('lit.failedToImprovePatchNotesWithAi') || 'Failed to improve patch notes'
      );
    } finally {
      setIsImproving(false);
    }
  };

  const applyPickerSelection = (picked: ProductReleasePickerTask[]) => {
    const includedIds = includedApps.map((a) => a.applicationId);
    const previousById = new Map(selectedTasks.map((task) => [task.taskId, task]));
    const next: SelectedTask[] = [];
    for (const task of picked) {
      const existing = previousById.get(task.Id);
      if (existing) {
        next.push({
          ...existing,
          TaskName: task.TaskName || existing.TaskName,
          ProjectId: task.ProjectId ?? existing.ProjectId,
          ProjectName: task.ProjectName ?? existing.ProjectName,
          ApplicationId: task.ApplicationId ?? existing.ApplicationId,
          relatedApplicationIds: task.relatedApplicationIds || existing.relatedApplicationIds,
          TaskTypeName: task.TaskTypeName ?? existing.TaskTypeName ?? null,
          JiraIssueKey: task.JiraIssueKey ?? existing.JiraIssueKey ?? null,
          ExternalIssueId: task.ExternalIssueId ?? existing.ExternalIssueId ?? null,
          TicketId: task.TicketId ?? existing.TicketId ?? null,
          TicketNumber: task.TicketNumber ?? existing.TicketNumber ?? null,
          GitHubIssueNumber: task.GitHubIssueNumber ?? existing.GitHubIssueNumber ?? null,
          GiteaIssueNumber: task.GiteaIssueNumber ?? existing.GiteaIssueNumber ?? null,
          JiraUrl: task.JiraUrl ?? existing.JiraUrl ?? null,
          JiraProjectsUrl: task.JiraProjectsUrl ?? existing.JiraProjectsUrl ?? null,
        });
        continue;
      }
      const defaults = (task.defaultApplicationIds || []).filter((id) =>
        includedIds.includes(id)
      );
      const fallback = defaultApplicationIdsForTask(
        {
          taskId: task.Id,
          primaryApplicationId: task.ApplicationId,
          relatedApplicationIds: task.relatedApplicationIds,
        },
        includedIds,
        projectCatalogApplicationIds
      );
      next.push({
        taskId: task.Id,
        TaskName: task.TaskName,
        ProjectId: task.ProjectId ?? null,
        ProjectName: task.ProjectName ?? null,
        ApplicationId: task.ApplicationId ?? null,
        relatedApplicationIds: task.relatedApplicationIds || [],
        applicationIds: defaults.length > 0 ? defaults : fallback,
        TaskTypeName: task.TaskTypeName ?? null,
        JiraIssueKey: task.JiraIssueKey ?? null,
        ExternalIssueId: task.ExternalIssueId ?? null,
        TicketId: task.TicketId ?? null,
        TicketNumber: task.TicketNumber ?? null,
        GitHubIssueNumber: task.GitHubIssueNumber ?? null,
        GiteaIssueNumber: task.GiteaIssueNumber ?? null,
        JiraUrl: task.JiraUrl ?? null,
        JiraProjectsUrl: task.JiraProjectsUrl ?? null,
      });
    }
    setSelectedTasks(next);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {mode === 'edit'
                ? t('lit.editProductReleaseWizard') || 'Edit product release'
                : t('lit.newProductReleaseWizard') || 'New product release'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {`${t('lit.wizardStep') || 'Step'} ${step} / 4`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label={t('common.close') || 'Close'}
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {isLoading ? (
            <p className="text-sm text-gray-500">{t('common.loading') || 'Loading…'}</p>
          ) : (
            <>
              {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{t('lit.versionNumber')}</span>
                      <input
                        value={versionNumber}
                        onChange={(e) => setVersionNumber(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{t('lit.versionName')}</span>
                      <input
                        value={versionName}
                        onChange={(e) => setVersionName(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{t('lit.status')}</span>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      >
                        {VERSION_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{t('lit.releaseDate')}</span>
                      <input
                        type="date"
                        value={releaseDate}
                        onChange={(e) => setReleaseDate(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      />
                    </label>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={isCustomerSpecific}
                      onChange={(e) => setIsCustomerSpecific(e.target.checked)}
                    />
                    {t('lit.customerSpecific')}
                  </label>
                  {isCustomerSpecific && (
                    <select
                      value={customerId ?? ''}
                      onChange={(e) =>
                        setCustomerId(e.target.value ? Number(e.target.value) : null)
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                    >
                      <option value="">{t('lit.selectCustomer')}</option>
                      {customers.map((c) => (
                        <option key={c.Id} value={c.Id}>
                          {c.Name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {t('lit.projectFilterOptional') || 'Project filter (optional)'}
                    </p>
                    <SearchableMultiSelect
                      options={orgProjects.map((p) => ({ value: p.Id, label: p.ProjectName }))}
                      values={projectIds}
                      onChange={(ids) => {
                        const next = ids.map((v) => Number(v));
                        setProjectIds(next);
                        void refreshCandidates(next);
                      }}
                      placeholder={t('lit.selectProjects') || 'Select projects'}
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  {appRows.map((app) => (
                    <div
                      key={app.applicationId}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center gap-3 justify-between">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                          <input
                            type="checkbox"
                            checked={app.included}
                            onChange={(e) =>
                              setAppRows((prev) =>
                                prev.map((row) =>
                                  row.applicationId === app.applicationId
                                    ? { ...row, included: e.target.checked }
                                    : row
                                )
                              )
                            }
                          />
                          {app.name}
                        </label>
                        {app.included && (
                          <select
                            value={app.mode}
                            onChange={(e) =>
                              setAppRows((prev) =>
                                prev.map((row) =>
                                  row.applicationId === app.applicationId
                                    ? {
                                        ...row,
                                        mode: e.target.value as 'create' | 'link',
                                        versionNumber:
                                          e.target.value === 'create'
                                            ? row.versionNumber || versionNumber
                                            : row.versionNumber,
                                        recreatePatchNotes:
                                          e.target.value === 'link' ? row.recreatePatchNotes : false,
                                      }
                                    : row
                                )
                              )
                            }
                            className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                          >
                            <option value="create">
                              {t('lit.createNewVersion') || 'Create new'}
                            </option>
                            <option value="link">
                              {t('lit.linkExistingVersion') || 'Link existing'}
                            </option>
                          </select>
                        )}
                      </div>
                      {app.included && app.mode === 'create' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <input
                            value={app.versionNumber}
                            onChange={(e) =>
                              setAppRows((prev) =>
                                prev.map((row) =>
                                  row.applicationId === app.applicationId
                                    ? { ...row, versionNumber: e.target.value }
                                    : row
                                )
                              )
                            }
                            placeholder={versionNumber || t('lit.versionNumber')}
                            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                          />
                          <input
                            value={app.versionName}
                            onChange={(e) =>
                              setAppRows((prev) =>
                                prev.map((row) =>
                                  row.applicationId === app.applicationId
                                    ? { ...row, versionName: e.target.value }
                                    : row
                                )
                              )
                            }
                            placeholder={t('lit.versionName')}
                            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                          />
                        </div>
                      )}
                      {app.included && app.mode === 'link' && (
                        <div className="space-y-2">
                          <select
                            value={app.applicationVersionId ?? ''}
                            onChange={(e) =>
                              setAppRows((prev) =>
                                prev.map((row) =>
                                  row.applicationId === app.applicationId
                                    ? {
                                        ...row,
                                        applicationVersionId: e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                        // Keep opt-in off when changing the linked version.
                                        recreatePatchNotes: false,
                                      }
                                    : row
                                )
                              )
                            }
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                          >
                            <option value="">
                              {t('lit.selectVersion') || 'Select version'}
                            </option>
                            {app.existingVersions.map((v) => (
                              <option key={v.Id} value={v.Id}>
                                {v.VersionNumber}
                                {v.VersionName ? ` — ${v.VersionName}` : ''}
                              </option>
                            ))}
                          </select>
                          {app.applicationVersionId ? (
                            <label className="inline-flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={app.recreatePatchNotes}
                                onChange={(e) =>
                                  setAppRows((prev) =>
                                    prev.map((row) =>
                                      row.applicationId === app.applicationId
                                        ? { ...row, recreatePatchNotes: e.target.checked }
                                        : row
                                    )
                                  )
                                }
                              />
                              <span>
                                {t('lit.recreateApplicationPatchNotes') ||
                                  'Recreate application patch notes from the selected tasks'}
                              </span>
                            </label>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {(t('lit.tasksInThisRelease') || 'Tasks in this release') +
                        ` (${selectedTasks.length})`}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowTasksPicker(true)}
                      className="h-9 px-3 rounded-lg text-sm font-medium bg-gray-900 hover:bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white transition-colors"
                    >
                      {t('lit.selectTasks') || 'Select tasks'}
                    </button>
                  </div>
                  {selectedTasks.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg px-3 py-4 text-center">
                      {t('lit.noTasksLinkedYetUseSelectTasks') ||
                        'No tasks linked yet. Use Select tasks to pick from available work.'}
                    </p>
                  ) : (
                    <div className="max-h-96 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                      {selectedTasks.map((task) => (
                        <div key={task.taskId} className="px-3 py-2 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {task.TaskName}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span>#{task.taskId}</span>
                                {(() => {
                                  const ref = resolvePatchNoteIssueRef({
                                    JiraIssueKey: task.JiraIssueKey,
                                    ExternalIssueId: task.ExternalIssueId,
                                    TicketId: task.TicketId,
                                    TicketNumber: task.TicketNumber,
                                    JiraUrl: task.JiraUrl,
                                    JiraProjectsUrl: task.JiraProjectsUrl,
                                    GitHubIssueNumber: task.GitHubIssueNumber,
                                    GiteaIssueNumber: task.GiteaIssueNumber,
                                  });
                                  if (!ref?.key) return null;
                                  return ref.url ? (
                                    <a
                                      href={ref.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                      {ref.key}
                                    </a>
                                  ) : (
                                    <span>{ref.key}</span>
                                  );
                                })()}
                                {task.ProjectName ? <span>{task.ProjectName}</span> : null}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedTasks((prev) =>
                                  prev.filter((row) => row.taskId !== task.taskId)
                                )
                              }
                              className="shrink-0 p-1 text-gray-400 hover:text-red-500 rounded"
                              title={t('common.remove')}
                              aria-label={t('common.remove')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {includedApps.map((app) => (
                              <label
                                key={app.applicationId}
                                className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={task.applicationIds.includes(app.applicationId)}
                                  onChange={(e) =>
                                    setSelectedTasks((prev) =>
                                      prev.map((row) => {
                                        if (row.taskId !== task.taskId) return row;
                                        const next = e.target.checked
                                          ? [...row.applicationIds, app.applicationId]
                                          : row.applicationIds.filter(
                                              (id) => id !== app.applicationId
                                            );
                                        return { ...row, applicationIds: [...new Set(next)] };
                                      })
                                    )
                                  }
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                {app.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={handleResetNotes}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                    >
                      {t('lit.reset') || 'Reset'}
                    </button>
                    {isAiAvailable && (
                      <button
                        type="button"
                        disabled={isImproving || !patchNotes.trim()}
                        onClick={handleImproveAi}
                        className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white"
                      >
                        {isImproving
                          ? t('lit.improving') || 'Improving…'
                          : t('lit.improveWithAi') || 'Improve with AI'}
                      </button>
                    )}
                  </div>
                  <RichTextEditor content={patchNotes} onChange={setPatchNotes} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => (step === 1 ? onClose() : setStep((s) => s - 1))}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
            disabled={isSaving}
          >
            {step === 1 ? t('common.cancel') || 'Cancel' : t('common.back') || 'Back'}
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={() => void goNext()}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isLoading || isSaving}
            >
              {t('common.continue')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSave()}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              disabled={isSaving || isLoading}
            >
              {isSaving
                ? t('lit.saving') || 'Saving…'
                : mode === 'edit'
                  ? t('common.save')
                  : t('common.create')}
            </button>
          )}
        </div>
      </div>

      <ConfirmAlertModal
        isOpen={!!confirmModal}
        type="confirm"
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        confirmLabel={confirmModal?.confirmLabel}
        onClose={() => {
          confirmModal?.onCancel?.();
          setConfirmModal(null);
        }}
        onConfirm={() => {
          confirmModal?.onConfirm();
          setConfirmModal(null);
        }}
      />

      <ProductReleaseTasksPickerModal
        isOpen={showTasksPicker}
        productId={productId}
        token={token}
        projectIds={projectIds}
        initiallySelectedIds={selectedTasks.map((task) => task.taskId)}
        onClose={() => setShowTasksPicker(false)}
        onConfirm={applyPickerSelection}
      />
    </div>
  );
}
