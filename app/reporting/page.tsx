'use client';

import { t as tPath } from '@/lib/i18n/messages';
import { readLocaleStorage, type Locale } from '@/lib/i18n/config';

function localeNow(): Locale {
  return (readLocaleStorage() as Locale) || 'en';
}
function t(path: string, vars?: Record<string, string | number>): string {
  return tPath(localeNow(), path, vars);
}

import { useI18n } from '@/lib/i18n/provider';
/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useUrlTab } from '@/hooks/useUrlTab';
import { organizationsApi } from '@/lib/api/organizations';
import { projectsApi, Project } from '@/lib/api/projects';
import { tasksApi, Task } from '@/lib/api/tasks';
import TaskDetailModal from '@/components/TaskDetailModal';
import { getApiUrl } from '@/lib/api/config';
import { reportingApi, ReportingAccessInfo, DeltaMetric } from '@/lib/api/reporting';
import { defaultReportingRange, formatDelta, previousPeriod } from '@/lib/reporting/period';
import { EXTRACT_DATASETS, EXTRACT_FILTER_CONFIG } from '@/lib/reporting/extractDatasets';
import { downloadCsv, toCsv, type CsvRow } from '@/lib/csv';
import { stripHtml } from '@/lib/stripHtml';
import { useFormatHours } from '@/lib/useFormatHours';
import { WebReportsExplorer } from '@/app/web-reports/page';
import { OrganizationCharts } from '@/components/reporting/OrganizationCharts';
import { TaskAnalyticsCharts } from '@/components/reporting/TaskAnalyticsCharts';

const MANAGER_TABS = [
  'organization',
  'portfolio',
  'delivery',
  'capacity',
  'data-quality',
  'expenses',
  'extract',
  'explore',
] as const;

const USER_TABS = ['extract'] as const;

type ReportingTab = (typeof MANAGER_TABS)[number];

type OrgOption = { Id: number; Name: string };

/** App route only — never `/api/...`. */
function projectHref(projectId: number | string) {
  return `/projects/${Number(projectId)}`;
}

function userHref(userId: number | string) {
  return `/users/${Number(userId)}`;
}

function formatMoney(n: number | string | null | undefined) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MetricCard({
  label,
  value,
  delta,
  onClick,
}: {
  label: string;
  value: string;
  delta?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-left ${
        onClick ? 'hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer' : ''
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
      {delta ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">vs previous: {delta}</div> : null}
    </Comp>
  );
}

function formatDeltaMetric(metric: DeltaMetric | undefined, hours = false): string | undefined {
  if (!metric) return undefined;
  return formatDelta(metric.delta, metric.deltaPct, hours ? 'h' : '');
}

function normalizeExtractRowDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function renderExtractCell(row: Record<string, unknown>, key: string) {
  const raw = row[key];
  if (raw == null || raw === '') return '';
  const text = String(raw);
  const projectId = Number(row.ProjectId ?? row.projectId ?? 0);
  const taskId = Number(row.TaskId ?? row.taskId ?? row.Id ?? 0);

  if (
    projectId > 0 &&
    (key === 'ProjectId' ||
      key === 'projectId' ||
      key === 'ProjectName' ||
      key === 'projectName' ||
      key === 'Project')
  ) {
    return (
      <Link href={projectHref(projectId)} className="text-blue-600 dark:text-blue-400 hover:underline">
        {text}
      </Link>
    );
  }

  if (
    projectId > 0 &&
    taskId > 0 &&
    (key === 'TaskId' || key === 'taskId' || key === 'TaskName' || key === 'taskName' || key === 'Task')
  ) {
    return (
      <Link
        href={`${projectHref(projectId)}?tab=tasks&taskId=${taskId}`}
        className="text-blue-600 dark:text-blue-400 hover:underline"
      >
        {text}
      </Link>
    );
  }

  if (key === 'UserId' || key === 'userId') {
    const userId = Number(raw);
    if (userId > 0) {
      return (
        <Link href={userHref(userId)} className="text-blue-600 dark:text-blue-400 hover:underline">
          {text}
        </Link>
      );
    }
  }

  if (/description|notes/i.test(key)) {
    return stripHtml(text);
  }

  return text;
}

function ReportingHubInner() {
  const { t } = useI18n();
  const { token, user, isCustomerUser } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const formatHours = useFormatHours();

  const formatPortfolioBudget = (amount: number, budgetType: string) => {
    if (budgetType === 'hours') return formatHours(amount);
    return `$${Number(amount).toFixed(2)}`;
  };


  const [access, setAccess] = useState<ReportingAccessInfo | null>(null);
  const [accessError, setAccessError] = useState('');
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizationId, setOrganizationId] = useState<number | ''>(() => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem('reporting.organizationId');
    return stored ? Number(stored) : '';
  });
  const [projectId, setProjectId] = useState<number | ''>('');
  const rangeDefaults = useMemo(() => defaultReportingRange(30), []);
  const [dateFrom, setDateFrom] = useState(() => {
    if (typeof window === 'undefined') return rangeDefaults.from;
    return localStorage.getItem('reporting.dateFrom') || rangeDefaults.from;
  });
  const [dateTo, setDateTo] = useState(() => {
    if (typeof window === 'undefined') return rangeDefaults.to;
    return localStorage.getItem('reporting.dateTo') || rangeDefaults.to;
  });

  useEffect(() => {
    if (organizationId) localStorage.setItem('reporting.organizationId', String(organizationId));
  }, [organizationId]);
  useEffect(() => {
    localStorage.setItem('reporting.dateFrom', dateFrom);
    localStorage.setItem('reporting.dateTo', dateTo);
  }, [dateFrom, dateTo]);

  const canManager = !!(access?.canAccessManagerPacks || user?.isAdmin || user?.isManager);
  const canCapacity = !!(
    access?.canAccessCapacity ||
    canManager ||
    permissions?.canViewOthersPlanning
  );
  const canExplore = !!(access?.canAccessExplore || canManager);

  const validTabs = useMemo(() => {
    if (canManager) return MANAGER_TABS;
    return USER_TABS;
  }, [canManager]);

  const defaultTab: ReportingTab = canManager ? 'organization' : 'extract';
  const [activeTab, setActiveTab] = useUrlTab(validTabs as unknown as readonly ReportingTab[], defaultTab);
  const [overview, setOverview] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [delivery, setDelivery] = useState<any>(null);
  const [capacity, setCapacity] = useState<any>(null);
  const [dataQuality, setDataQuality] = useState<any>(null);
  const [expensesEnabled, setExpensesEnabled] = useState(false);
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [expenseReport, setExpenseReport] = useState<any>(null);
  const [expenseGroupId, setExpenseGroupId] = useState<number | ''>('');
  const [expenseCategoryId, setExpenseCategoryId] = useState<number | ''>('');
  const [expenseUserId, setExpenseUserId] = useState<number | ''>('');
  const [expenseReimbFilter, setExpenseReimbFilter] = useState('');
  const [expenseInternalOnly, setExpenseInternalOnly] = useState(false);
  const [expenseDateFrom, setExpenseDateFrom] = useState('');
  const [expenseDateTo, setExpenseDateTo] = useState('');
  const [expenseBreakdown, setExpenseBreakdown] = useState<'rows' | 'category' | 'group'>('rows');
  const [dqSubTab, setDqSubTab] = useState<
    'unestimated' | 'unassigned' | 'noSprint' | 'staleOverdue' | 'pendingApprovals'
  >('unestimated');
  const [portfolioRagFilter, setPortfolioRagFilter] = useState<'all' | 'green' | 'amber' | 'red'>('all');
  const [expandedPortfolioIds, setExpandedPortfolioIds] = useState<Set<number>>(new Set());
  const [capacitySearch, setCapacitySearch] = useState('');
  const [deliverySection, setDeliverySection] = useState<'sprints' | 'closed'>('sprints');
  const [digests, setDigests] = useState<any[]>([]);
  const [digestRecipients, setDigestRecipients] = useState('');
  const [digestFrequency, setDigestFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [loading, setLoading] = useState(false);
  const [taskModalState, setTaskModalState] = useState<{
    show: boolean;
    isLoading: boolean;
    project: Project | null;
    task: Task | null;
    tasks: Task[];
    error: string;
  }>({
    show: false,
    isLoading: false,
    project: null,
    task: null,
    tasks: [],
    error: '',
  });

  const closeTaskDetails = () => {
    setTaskModalState({
      show: false,
      isLoading: false,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });
  };

  const openTaskDetails = async (projectId: number, taskId: number) => {
    if (!token || !projectId || !taskId) return;
    setTaskModalState({
      show: true,
      isLoading: true,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });
    try {
      const [projectRes, tasksRes] = await Promise.all([
        projectsApi.getById(projectId, token),
        tasksApi.getByProject(projectId, token),
      ]);
      const project = projectRes?.project || null;
      const projectTasks = Array.isArray(tasksRes?.tasks) ? tasksRes.tasks : [];
      const activeTask = projectTasks.find((entry) => Number(entry.Id) === Number(taskId)) || null;
      if (!project || !activeTask) {
        throw new Error(t('lit.taskNoLongerExistsInThisProject'));
      }
      setTaskModalState({
        show: true,
        isLoading: false,
        project,
        task: activeTask,
        tasks: projectTasks,
        error: '',
      });
    } catch (err: any) {
      setTaskModalState({
        show: true,
        isLoading: false,
        project: null,
        task: null,
        tasks: [],
        error: err?.message || t('lit.failedToOpenTaskDetail'),
      });
    }
  };


  const [error, setError] = useState('');

  const drillTo = useCallback(
    (
      tab: ReportingTab,
      options?: {
        dq?: typeof dqSubTab;
        rag?: typeof portfolioRagFilter;
        delivery?: typeof deliverySection;
      }
    ) => {
      if (options?.dq) setDqSubTab(options.dq);
      if (options?.rag) setPortfolioRagFilter(options.rag);
      if (options?.delivery) setDeliverySection(options.delivery);
      setActiveTab(tab);
    },
    [setActiveTab]
  );

  // Extract
  const [extractDataset, setExtractDataset] = useState('tasks');
  const [extractRecords, setExtractRecords] = useState<any[]>([]);
  const [extractLoadedCount, setExtractLoadedCount] = useState<number | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);

  const prev = useMemo(() => previousPeriod(dateFrom, dateTo), [dateFrom, dateTo]);

  const extractDatasetOptions = useMemo(
    () =>
      EXTRACT_DATASETS.filter((d) => {
        if (d.requiresExpensesModule && !expensesEnabled) return false;
        if (d.requiresInternalTickets && !internalTicketsEnabled) return false;
        return true;
      }),
    [expensesEnabled, internalTicketsEnabled]
  );

  const extractColumnKeys = useMemo(
    () => (extractRecords.length > 0 ? Object.keys(extractRecords[0]) : []),
    [extractRecords]
  );

  const filteredProjects = useMemo(() => {
    if (!organizationId) return projects;
    return projects.filter((p) => Number(p.OrganizationId) === Number(organizationId));
  }, [projects, organizationId]);

  useEffect(() => {
    if (!token || isCustomerUser) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await reportingApi.getAccess(token);
        if (cancelled) return;
        setAccess(result.data);
        if (!result.data.canAccessHub) {
          setAccessError('You do not have permission to view reports.');
        }
      } catch (err: any) {
        if (!cancelled) setAccessError(err?.message || t('lit.failedToLoadAccess'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isCustomerUser]);

  useEffect(() => {
    if (!token || !access?.canAccessHub) return;
    let cancelled = false;
    (async () => {
      try {
        const [orgRes, projRes, flagsRes] = await Promise.all([
          organizationsApi.getAll(token),
          projectsApi.getAll(token),
          fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (cancelled) return;
        const flagsData = flagsRes.ok ? await flagsRes.json() : {};
        setExpensesEnabled(flagsData.expensesEnabled === true);
        setInternalTicketsEnabled(flagsData.internalTicketsEnabled !== false);
        const organizations = (orgRes.organizations || []).map((o: any) => ({
          Id: Number(o.Id),
          Name: String(o.Name || `Organization #${o.Id}`),
        }));
        setOrgs(organizations);
        setProjects(projRes.projects || []);
        if (!organizationId && organizations.length > 0) {
          setOrganizationId(organizations[0].Id);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || t('lit.failedToLoadFilters'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, access?.canAccessHub]);

  const loadTabData = useCallback(async () => {
    if (!token || !access?.canAccessHub) return;
    setError('');
    setLoading(true);
    try {
      if (activeTab === 'organization' && organizationId && canManager) {
        const res = await reportingApi.getOrganizationOverview(token, {
          organizationId: Number(organizationId),
          from: dateFrom,
          to: dateTo,
          projectId: projectId ? Number(projectId) : null,
        });
        setOverview(res.data);
        const dig = await reportingApi.getDigests(token, Number(organizationId));
        setDigests(dig.data || []);
      } else if (activeTab === 'portfolio' && organizationId && canManager) {
        const res = await reportingApi.getPortfolio(token, Number(organizationId));
        setPortfolio(res.data);
        setExpandedPortfolioIds(new Set());
      } else if (activeTab === 'delivery' && organizationId && canManager) {
        const res = await reportingApi.getDelivery(token, {
          organizationId: Number(organizationId),
          from: dateFrom,
          to: dateTo,
          projectId: projectId ? Number(projectId) : null,
        });
        setDelivery(res.data);
      } else if (activeTab === 'capacity' && organizationId && canCapacity) {
        const res = await reportingApi.getCapacity(token, Number(organizationId), dateFrom, dateTo);
        setCapacity(res.data);
      } else if (activeTab === 'data-quality' && organizationId && canManager) {
        const res = await reportingApi.getDataQuality(
          token,
          Number(organizationId),
          projectId ? Number(projectId) : null
        );
        setDataQuality(res.data);
      } else if (activeTab === 'expenses' && organizationId && canManager && expensesEnabled) {
        const res = await reportingApi.getExpensesReport(token, {
          organizationId: Number(organizationId),
          from: expenseDateFrom || null,
          to: expenseDateTo || null,
          projectId: projectId ? Number(projectId) : null,
          groupId: expenseGroupId ? Number(expenseGroupId) : null,
          categoryId: expenseCategoryId ? Number(expenseCategoryId) : null,
          userId: expenseUserId ? Number(expenseUserId) : null,
          reimbursementStatus: expenseReimbFilter || null,
          internalOnly: expenseInternalOnly,
        });
        setExpenseReport(res.data ?? null);
      }
    } catch (err: any) {
      setError(err?.message || t('lit.failedToLoadReport'));
    } finally {
      setLoading(false);
    }
  }, [
    token,
    access?.canAccessHub,
    activeTab,
    dateFrom,
    dateTo,
    organizationId,
    projectId,
    canManager,
    canCapacity,
    expensesEnabled,
    expenseGroupId,
    expenseCategoryId,
    expenseUserId,
    expenseReimbFilter,
    expenseInternalOnly,
    expenseDateFrom,
    expenseDateTo,
  ]);

  useEffect(() => {
    if (!extractDatasetOptions.some((d) => d.id === extractDataset)) {
      setExtractDataset(extractDatasetOptions[0]?.id || 'tasks');
    }
  }, [extractDataset, extractDatasetOptions]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  useEffect(() => {
    if (activeTab === 'explore' && !canExplore) {
      setActiveTab(defaultTab);
    }
    if (
      ['organization', 'portfolio', 'delivery', 'capacity', 'data-quality', 'expenses'].includes(activeTab) &&
      !canManager &&
      activeTab !== 'capacity'
    ) {
      setActiveTab(defaultTab);
    }
    if (activeTab === 'capacity' && !canCapacity) {
      setActiveTab(defaultTab);
    }
    if (activeTab === 'expenses' && (!canManager || !expensesEnabled)) {
      setActiveTab(defaultTab);
    }
  }, [activeTab, canExplore, canManager, canCapacity, expensesEnabled, defaultTab, setActiveTab]);

  const loadExtract = async () => {
    if (!token) return;
    setExtractLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/reports/datasets/${extractDataset}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t('lit.failedToLoadDataset'));
      let records = data.records || [];
      setExtractLoadedCount(records.length);
      const filterConfig =
        EXTRACT_FILTER_CONFIG[extractDataset] ?? {
          organizationField: 'OrganizationId' as const,
          projectField: 'ProjectId' as const,
          dateFields: ['CreatedAt', 'UpdatedAt'],
        };

      if (organizationId && filterConfig.organizationField) {
        const orgKey = filterConfig.organizationField;
        records = records.filter(
          (r: any) => Number(r[orgKey] || 0) === Number(organizationId)
        );
      }
      if (projectId && filterConfig.projectField) {
        const projectKey = filterConfig.projectField;
        records = records.filter((r: any) => Number(r[projectKey] || 0) === Number(projectId));
      }
      const skipDateFilter = extractDataset === 'expenses' || extractDataset === 'expenseReimbursements';
      if (!skipDateFilter && (dateFrom || dateTo)) {
        let from = dateFrom;
        let to = dateTo;
        if (from && to && from > to) {
          [from, to] = [to, from];
        }
        records = records.filter((r: any) => {
          const raw = filterConfig.dateFields.map((k) => r[k]).find((v) => v != null && v !== '');
          const d = normalizeExtractRowDate(raw);
          if (!d) return true;
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      }
      setExtractRecords(records);
    } catch (err: any) {
      setError(err?.message || t('lit.extractFailed'));
      setExtractRecords([]);
      setExtractLoadedCount(null);
    } finally {
      setExtractLoading(false);
    }
  };

  const exportExtractCsv = () => {
    if (!extractRecords.length) return;
    const keys = Object.keys(extractRecords[0]);
    const rows: CsvRow[] = extractRecords.map((row) => {
      const next: CsvRow = {};
      for (const key of keys) {
        const raw = row[key];
        if (/description|notes/i.test(key) && typeof raw === 'string') {
          next[key] = stripHtml(raw);
        } else {
          next[key] = raw == null ? '' : String(raw);
        }
      }
      return next;
    });
    downloadCsv(`extract-${extractDataset}.csv`, toCsv(rows, keys));
  };

  const exportQualityCsv = (rows: any[], name: string) => {
    if (!rows?.length) return;
    const keys = Object.keys(rows[0]);
    const csvRows: CsvRow[] = rows.map((row) => {
      const next: CsvRow = {};
      for (const key of keys) {
        const raw = row[key];
        next[key] = raw == null ? '' : String(raw);
      }
      return next;
    });
    downloadCsv(`data-quality-${name}.csv`, toCsv(csvRows, keys));
  };

  const createDigest = async () => {
    if (!token || !organizationId || !digestRecipients.trim()) return;
    try {
      await reportingApi.createDigest(token, {
        organizationId: Number(organizationId),
        frequency: digestFrequency,
        recipients: digestRecipients.trim(),
        dayOfWeek: 1,
        dayOfMonth: 1,
      });
      setDigestRecipients('');
      const dig = await reportingApi.getDigests(token, Number(organizationId));
      setDigests(dig.data || []);
    } catch (err: any) {
      setError(err?.message || t('lit.failedToCreateDigest'));
    }
  };

  if (isCustomerUser) {
    return (
      <CustomerUserGuard>
        <div className="w-full">
          <main className="w-full p-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center text-gray-700 dark:text-gray-200">
              {t('lit.reportingIsNotAvailableForCustomerPortalUsers')}
            </div>
          </main>
        </div>
      </CustomerUserGuard>
    );
  }

  if (permissionsLoading || !access) {
    return (
      <CustomerUserGuard>
        <div className="w-full">
          <main className="w-full p-6 text-gray-600 dark:text-gray-300">{t('common.loading')}</main>
        </div>
      </CustomerUserGuard>
    );
  }

  if (!access.canAccessHub && !permissions?.canViewReports && !user?.isAdmin) {
    return (
      <CustomerUserGuard>
        <div className="w-full">
          <main className="w-full p-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{t('lit.accessDenied')}</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                {accessError || t('lit.youNeedTheCanviewreportsPermission')}
              </p>
            </div>
          </main>
        </div>
      </CustomerUserGuard>
    );
  }

  const tabs: { id: ReportingTab; label: string; show: boolean }[] = [
    { id: 'organization', label: t('lit.organization2'), show: canManager },
    { id: 'portfolio', label: t('lit.portfolio'), show: canManager },
    { id: 'delivery', label: t('lit.delivery'), show: canManager },
    { id: 'capacity', label: t('lit.capacity'), show: canCapacity },
    { id: 'data-quality', label: t('lit.dataQuality'), show: canManager },
    { id: 'expenses', label: t('lit.expenses'), show: canManager && expensesEnabled },
    { id: 'extract', label: t('lit.extract'), show: true },
    { id: 'explore', label: t('lit.exploreAdvanced'), show: canExplore },
  ];

  return (
    <CustomerUserGuard>
      <div className="w-full flex flex-col">
        <main className="w-full flex-1 flex flex-col min-h-0">
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('pages.reporting.title')}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Guided packs for analysis and export. Previous period: {prev.from} → {prev.to}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 items-end">
              {(canManager || canCapacity) && activeTab !== 'explore' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {t('common.organization')}
                  </label>
                  <select
                    value={organizationId}
                    onChange={(e) => {
                      setOrganizationId(e.target.value ? Number(e.target.value) : '');
                      setProjectId('');
                      setExpenseGroupId('');
                      setExpenseCategoryId('');
                      setExpenseUserId('');
                      setExpenseReimbFilter('');
                      setExpenseInternalOnly(false);
                    }}
                    className="h-10 min-w-[200px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {orgs.map((o) => (
                      <option key={o.Id} value={o.Id}>
                        {o.Name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(activeTab === 'organization' ||
                activeTab === 'delivery' ||
                activeTab === 'data-quality' ||
                activeTab === 'expenses' ||
                activeTab === 'extract') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {t('common.project')}
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
                    className="h-10 min-w-[200px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">{t('lit.allProjects')}</option>
                    {filteredProjects.map((p) => (
                      <option key={p.Id} value={p.Id}>
                        {p.ProjectName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {activeTab !== 'explore' && activeTab !== 'data-quality' && activeTab !== 'portfolio' && activeTab !== 'expenses' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('common.from')}</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('common.to')}</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </>
              )}
              {activeTab === 'portfolio' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('lit.rag')}</label>
                  <select
                    value={portfolioRagFilter}
                    onChange={(e) => setPortfolioRagFilter(e.target.value as typeof portfolioRagFilter)}
                    className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="all">{t('common.all')}</option>
                    <option value="red">{t('lit.red')}</option>
                    <option value="amber">{t('lit.amber')}</option>
                    <option value="green">{t('lit.green')}</option>
                  </select>
                </div>
              )}
              {activeTab === 'capacity' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {t('lit.person')}
                  </label>
                  <input
                    type="search"
                    value={capacitySearch}
                    onChange={(e) => setCapacitySearch(e.target.value)}
                    placeholder={t('lit.filterByName')}
                    className="h-10 min-w-[180px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              )}
              {activeTab === 'expenses' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('lit.expenseFrom')}</label>
                    <input
                      type="date"
                      value={expenseDateFrom}
                      onChange={(e) => setExpenseDateFrom(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('lit.expenseTo')}</label>
                    <input
                      type="date"
                      value={expenseDateTo}
                      onChange={(e) => setExpenseDateTo(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('lit.group')}</label>
                    <select
                      value={expenseGroupId}
                      onChange={(e) => {
                        setExpenseGroupId(e.target.value ? Number(e.target.value) : '');
                        setExpenseCategoryId('');
                      }}
                      className="h-10 min-w-[160px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">{t('lit.allGroups')}</option>
                      {(expenseReport?.filterOptions?.groups || []).map((g: any) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('pages.expenses.category')}</label>
                    <select
                      value={expenseCategoryId}
                      onChange={(e) => setExpenseCategoryId(e.target.value ? Number(e.target.value) : '')}
                      className="h-10 min-w-[180px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">{t('lit.allCategories')}</option>
                      {(expenseReport?.filterOptions?.categories || [])
                        .filter((c: any) => !expenseGroupId || c.groupId === expenseGroupId)
                        .map((c: any) => (
                          <option key={c.id} value={c.id}>{c.groupName} / {c.name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('lit.submittedBy')}</label>
                    <select
                      value={expenseUserId}
                      onChange={(e) => setExpenseUserId(e.target.value ? Number(e.target.value) : '')}
                      className="h-10 min-w-[160px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">{t('lit.allUsers')}</option>
                      {(expenseReport?.submitters || []).map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName || u.username || `User #${u.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('lit.reimbursement')}</label>
                    <select
                      value={expenseReimbFilter}
                      onChange={(e) => setExpenseReimbFilter(e.target.value)}
                      className="h-10 min-w-[160px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">{t('common.all')}</option>
                      <option value="needs_reimbursement">{t('lit.needsReimbursement')}</option>
                      <option value="reimbursed">{t('lit.fullyReimbursed')}</option>
                      <option value="partial">{t('lit.partial')}</option>
                      <option value="pending">{t('lit.pending')}</option>
                    </select>
                  </div>
                  <label className="inline-flex items-center gap-2 h-10 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={expenseInternalOnly}
                      onChange={(e) => setExpenseInternalOnly(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    {t('lit.internalOnly')}
                  </label>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('common.view')}</label>
                    <select
                      value={expenseBreakdown}
                      onChange={(e) => setExpenseBreakdown(e.target.value as typeof expenseBreakdown)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="rows">{t('lit.expenseLines')}</option>
                      <option value="category">{t('lit.byCategory')}</option>
                      <option value="group">{t('lit.byGroup')}</option>
                    </select>
                  </div>
                </>
              )}
              {activeTab === 'delivery' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {t('lit.focus')}
                  </label>
                  <select
                    value={deliverySection}
                    onChange={(e) => setDeliverySection(e.target.value as typeof deliverySection)}
                    className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="sprints">{t('lit.activeSprints')}</option>
                    <option value="closed">{t('lit.recentlyClosed')}</option>
                  </select>
                </div>
              )}
              {activeTab !== 'explore' && (
                <button
                  type="button"
                  onClick={() => void loadTabData()}
                  className="h-10 px-4 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {t('common.refresh')}
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 -mb-px">
              {tabs
                .filter((tab) => tab.show)
                .map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {error && (
              <div className="mb-4 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
                {error}
              </div>
            )}
            {loading && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('common.loading')}</div>
            )}

            {activeTab === 'organization' && overview && (
              <div className="space-y-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Organization overview for the selected period. Click a card to open the matching pack
                  (Portfolio, Delivery, or Data Quality) with the same organization context.
                </p>
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('lit.health')}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                      label={t('lit.projects')}
                      value={String(overview.health?.projectCount || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'all' })}
                    />
                    <MetricCard
                      label={t('lit.green')}
                      value={String(overview.health?.counts?.green || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'green' })}
                    />
                    <MetricCard
                      label={t('lit.amber')}
                      value={String(overview.health?.counts?.amber || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'amber' })}
                    />
                    <MetricCard
                      label={t('lit.red')}
                      value={String(overview.health?.counts?.red || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'red' })}
                    />
                  </div>
                </section>
                {overview.expenses && (
                  <section>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('lit.expensesApproved')}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-3">
                      <MetricCard
                        label={t('lit.projectExpenses')}
                        value={formatMoney(overview.expenses.totals?.ProjectTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label={t('lit.internalExpenses')}
                        value={formatMoney(overview.expenses.totals?.InternalTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label={t('lit.reimbursableCap')}
                        value={formatMoney(overview.expenses.totals?.ReimbursableCapTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label={t('lit.reimbursed')}
                        value={formatMoney(overview.expenses.totals?.ReimbursedTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label={t('lit.remainingToReimburse')}
                        value={formatMoney(overview.expenses.totals?.RemainingTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label={t('lit.fullyReimbursed')}
                        value={String(overview.expenses.totals?.FullyReimbursedCount || 0)}
                        onClick={() => drillTo('expenses')}
                      />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('lit.openTheExpensesTabForBreakdownByGroupCategorySubmitterAndLineDetail')}
                    </p>
                  </section>
                )}
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('lit.effort')}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <MetricCard
                      label={t('lit.estimatedLeaf')}
                      value={formatHours(overview.effort?.estimatedLeafHours || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'all' })}
                    />
                    <MetricCard
                      label={t('lit.plannedPeriod')}
                      value={formatHours(overview.effort?.plannedHours?.current || 0)}
                      delta={formatDeltaMetric(overview.effort?.plannedHours, true)}
                      onClick={() => drillTo('capacity')}
                    />
                    <MetricCard
                      label={t('lit.loggedPeriod')}
                      value={formatHours(overview.effort?.loggedHours?.current || 0)}
                      delta={formatDeltaMetric(overview.effort?.loggedHours, true)}
                      onClick={() => drillTo('capacity')}
                    />
                    <MetricCard
                      label={t('lit.openTasks')}
                      value={String(overview.tasks?.open || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'all' })}
                    />
                    <MetricCard
                      label={t('lit.leafWithHours')}
                      value={String(overview.tasks?.leafWithHours || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'unestimated' })}
                    />
                    <MetricCard
                      label={t('lit.unscheduledLeaf')}
                      value={String(overview.tasks?.unscheduledLeaf || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'unestimated' })}
                    />
                  </div>
                </section>
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('lit.deliveryRisk')}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                      label={t('lit.throughputClosed')}
                      value={String(overview.delivery?.throughput?.current || 0)}
                      delta={formatDeltaMetric(overview.delivery?.throughput)}
                      onClick={() => drillTo('delivery', { delivery: 'closed' })}
                    />
                    <MetricCard
                      label={t('lit.activeSprints')}
                      value={String(overview.delivery?.activeSprints || 0)}
                      onClick={() => drillTo('delivery', { delivery: 'sprints' })}
                    />
                    <MetricCard
                      label={t('lit.overdueTasks2')}
                      value={String(overview.tasks?.overdue || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'staleOverdue' })}
                    />
                    <MetricCard
                      label={t('lit.unestimatedLeaf')}
                      value={String(overview.risk?.unestimatedLeaf || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'unestimated' })}
                    />
                    <MetricCard
                      label={t('lit.unassigned')}
                      value={String(overview.risk?.unassigned || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'unassigned' })}
                    />
                  </div>
                </section>

                <OrganizationCharts charts={overview.charts} formatHours={formatHours} />

                {overview.taskAnalytics && (
                  <TaskAnalyticsCharts
                    data={overview.taskAnalytics}
                    viewAllHref="/reporting?tab=data-quality"
                  />
                )}

                <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {t('lit.emailDigest')}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    {t('lit.scheduleAWeeklyOrMonthlyOrganizationOverviewEmailStructuredMetricsOnly')}
                  </p>
                  <div className="flex flex-wrap gap-2 items-end">
                    <input
                      type="text"
                      value={digestRecipients}
                      onChange={(e) => setDigestRecipients(e.target.value)}
                      placeholder={t('lit.email1ExampleComEmail2')}
                      className="h-10 flex-1 min-w-[220px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <select
                      value={digestFrequency}
                      onChange={(e) => setDigestFrequency(e.target.value as 'weekly' | 'monthly')}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                    >
                      <option value="weekly">{t('lit.weeklyMon')}</option>
                      <option value="monthly">{t('lit.monthlyDay1')}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void createDigest()}
                      className="h-10 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                      {t('lit.addSchedule')}
                    </button>
                  </div>
                  {digests.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                      {digests.map((d) => (
                        <li key={d.Id} className="flex justify-between gap-2">
                          <span>
                            {d.Frequency} → {d.Recipients}
                            {d.LastSentAt ? ` (last: ${String(d.LastSentAt).slice(0, 10)})` : ''}
                          </span>
                          <button
                            type="button"
                            className="text-red-600 dark:text-red-400"
                            onClick={async () => {
                              if (!token) return;
                              await reportingApi.deleteDigest(token, Number(d.Id));
                              const dig = await reportingApi.getDigests(token, Number(organizationId));
                              setDigests(dig.data || []);
                            }}
                          >
                            {t('common.delete')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'portfolio' && portfolio && (() => {
              const rows = (portfolio.projects || []).filter(
                (p: any) => portfolioRagFilter === 'all' || p.healthStatus === portfolioRagFilter
              );
              const toggleProject = (id: number) => {
                setExpandedPortfolioIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              };
              const expandAll = () => {
                setExpandedPortfolioIds(new Set(rows.map((p: any) => Number(p.id))));
              };
              const collapseAll = () => setExpandedPortfolioIds(new Set());
              return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Showing {rows.length} project(s)
                    {portfolioRagFilter !== 'all' ? ` · RAG = ${portfolioRagFilter}` : ''}
                    . Projects stay collapsed by default — expand to compare leaf-task estimate vs logged hours.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={expandAll}
                      className="h-9 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {t('lit.expandAll')}
                    </button>
                    <button
                      type="button"
                      onClick={collapseAll}
                      className="h-9 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {t('lit.collapseAll')}
                    </button>
                  </div>
                </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="text-left px-3 py-2 w-10" aria-label={t('common.expand')} />
                      <th className="text-left px-3 py-2">{t('lit.projectTask')}</th>
                      <th className="text-left px-3 py-2">{t('lit.healthStatus')}</th>
                      <th className="text-right px-3 py-2">{t('lit.progress')}</th>
                      <th className="text-right px-3 py-2">{t('common.open')}</th>
                      <th className="text-right px-3 py-2">{t('lit.overdue2')}</th>
                      <th className="text-right px-3 py-2">{t('lit.estHours')}</th>
                      <th className="text-right px-3 py-2">{t('lit.planned')}</th>
                      <th className="text-right px-3 py-2">{t('lit.logged')}</th>
                      <th className="text-right px-3 py-2">{t('lit.variance')}</th>
                      <th className="text-right px-3 py-2">{t('lit.budgetSpent')}</th>
                      <th className="text-right px-3 py-2">{t('lit.remaining')}</th>
                      <th className="text-right px-3 py-2">{t('lit.burn')}</th>
                      <th className="text-left px-3 py-2">{t('lit.endDue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p: any) => {
                      const expanded = expandedPortfolioIds.has(Number(p.id));
                      const tasks = Array.isArray(p.tasks) ? p.tasks : [];
                      const projectVariance = Number(p.loggedHours || 0) - Number(p.estimatedHours || 0);
                      return (
                        <Fragment key={p.id}>
                          <tr className="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => toggleProject(Number(p.id))}
                                className="h-8 w-8 inline-flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                title={expanded ? t('lit.collapseTasks') : t('lit.expandTasks')}
                                aria-label={expanded ? t('lit.collapseTasks') : t('lit.expandTasks')}
                                aria-expanded={expanded}
                              >
                                {expanded ? '▾' : '▸'}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <Link
                                href={projectHref(p.id)}
                                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                              >
                                {p.name}
                              </Link>
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                {tasks.length} leaf task(s)
                              </span>
                            </td>
                            <td className="px-3 py-2 capitalize">
                              <span
                                className={
                                  p.healthStatus === 'red'
                                    ? 'text-red-600'
                                    : p.healthStatus === 'amber'
                                      ? 'text-amber-600'
                                      : 'text-green-600'
                                }
                              >
                                {p.healthStatus}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">{p.progressPct}%</td>
                            <td className="px-3 py-2 text-right">{p.openTasks ?? '—'}</td>
                            <td className="px-3 py-2 text-right">{p.overdueTasks}</td>
                            <td className="px-3 py-2 text-right">{formatHours(p.estimatedHours || 0)}</td>
                            <td className="px-3 py-2 text-right text-gray-400 dark:text-gray-500">—</td>
                            <td className="px-3 py-2 text-right">{formatHours(p.loggedHours || 0)}</td>
                            <td
                              className={`px-3 py-2 text-right ${
                                projectVariance > 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : projectVariance < 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {formatHours(projectVariance)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {p.budget != null && Number(p.budget) > 0 ? (
                                <span title={Number(p.hoursWithoutRate || 0) > 0 ? `${Number(p.hoursWithoutRate).toFixed(1)}h logged without an effective rate` : undefined}>
                                  {formatPortfolioBudget(Number(p.budgetSpent || 0), String(p.budgetType || 'monetary'))}
                                  {' / '}
                                  {formatPortfolioBudget(Number(p.budget), String(p.budgetType || 'monetary'))}
                                  {Number(p.hoursWithoutRate || 0) > 0 && String(p.budgetType || '') !== 'hours' ? (
                                    <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">!</span>
                                  ) : null}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {p.budgetRemaining != null && p.budget != null && Number(p.budget) > 0
                                ? formatPortfolioBudget(Number(p.budgetRemaining), String(p.budgetType || 'monetary'))
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {p.budgetBurnPct != null ? `${p.budgetBurnPct}%` : '—'}
                            </td>
                            <td className="px-3 py-2">{p.endDate ? String(p.endDate).slice(0, 10) : '—'}</td>
                          </tr>
                          {expanded && tasks.length === 0 && (
                            <tr className="bg-gray-50/80 dark:bg-gray-900/30">
                              <td />
                              <td colSpan={13} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                {t('lit.noLeafTasksInThisProject')}
                              </td>
                            </tr>
                          )}
                          {expanded &&
                            tasks.map((task: any) => (
                              <tr
                                key={`${p.id}-${task.id}`}
                                className="border-t border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/30"
                              >
                                <td />
                                <td className="px-3 py-2 pl-8">
                                  <button
                                    type="button"
                                    onClick={() => void openTaskDetails(Number(p.id), Number(task.id))}
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                                  >
                                    {task.name}
                                  </button>
                                  {task.isOverdue ? (
                                    <span className="ml-2 text-xs text-red-600 dark:text-red-400">{t('lit.overdue')}</span>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                  {task.statusName || '—'}
                                  {task.assigneeName ? (
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                                      {task.assigneeName}
                                    </span>
                                  ) : (
                                    <span className="block text-xs text-amber-600 dark:text-amber-400">
                                      {t('lit.unassigned')}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-400">—</td>
                                <td className="px-3 py-2 text-right text-gray-400">—</td>
                                <td className="px-3 py-2 text-right">
                                  {task.isOverdue ? t('lit.yes') : '—'}
                                </td>
                                <td className="px-3 py-2 text-right">{formatHours(task.estimatedHours || 0)}</td>
                                <td className="px-3 py-2 text-right">{formatHours(task.plannedHours || 0)}</td>
                                <td className="px-3 py-2 text-right">{formatHours(task.loggedHours || 0)}</td>
                                <td
                                  className={`px-3 py-2 text-right ${
                                    Number(task.varianceHours || 0) > 0
                                      ? 'text-red-600 dark:text-red-400'
                                      : Number(task.varianceHours || 0) < 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {formatHours(task.varianceHours || 0)}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {String(p.budgetType || '') === 'monetary'
                                    ? (
                                      <span title={Number(task.hoursWithoutRate || 0) > 0 ? t('lit.someHoursLackAnEffectiveRate') : undefined}>
                                        {formatPortfolioBudget(Number(task.costSpent || 0), 'monetary')}
                                        {Number(task.hoursWithoutRate || 0) > 0 ? (
                                          <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">!</span>
                                        ) : null}
                                      </span>
                                    )
                                    : '—'}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-400">—</td>
                                <td className="px-3 py-2 text-right text-gray-400">—</td>
                                <td className="px-3 py-2">{task.dueDate || '—'}</td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
              );
            })()}

            {activeTab === 'delivery' && delivery && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <MetricCard
                    label={t('lit.tasksClosedInPeriod')}
                    value={String(delivery.throughput?.current || 0)}
                    delta={formatDeltaMetric(delivery.throughput)}
                  />
                  <MetricCard label={t('lit.tasksCreatedInPeriod')} value={String(delivery.tasksCreated || 0)} />
                  <MetricCard
                    label={t('lit.activeSprints')}
                    value={String((delivery.activeSprints || []).length)}
                  />
                </div>

                {deliverySection === 'sprints' && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t('lit.activeSprints')}</h2>
                  {(delivery.activeSprints || []).length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No active sprints in this organization for the current filters. Throughput still counts
                      closed tasks in the selected date range.
                    </p>
                  ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                          <tr>
                            <th className="text-left px-3 py-2">{t('lit.sprint')}</th>
                            <th className="text-left px-3 py-2">{t('common.project')}</th>
                            <th className="text-left px-3 py-2">{t('lit.window')}</th>
                            <th className="text-right px-3 py-2">{t('lit.closedTotal')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {delivery.activeSprints.map((s: any) => (
                            <tr key={s.id} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{s.name}</td>
                              <td className="px-3 py-2">
                                <Link href={projectHref(s.projectId)} className="text-blue-600 dark:text-blue-400 hover:underline">
                                  {s.projectName}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                {s.startDate || '—'} → {s.endDate || '—'}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {s.closedTaskCount} / {s.taskCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                )}

                {deliverySection === 'closed' && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Recently closed ({(delivery.recentlyClosed || []).length})
                  </h2>
                  {(delivery.recentlyClosed || []).length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('lit.noTasksWereClosedInThisPeriodTryWideningTheDateRange')}
                    </p>
                  ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                          <tr>
                            <th className="text-left px-3 py-2">{t('common.task')}</th>
                            <th className="text-left px-3 py-2">{t('common.project')}</th>
                            <th className="text-left px-3 py-2">{t('lit.closed')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {delivery.recentlyClosed.map((task: any) => (
                            <tr key={task.id} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => void openTaskDetails(Number(task.projectId), Number(task.id))}
                                  className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                                >
                                  {task.name}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <Link
                                  href={projectHref(task.projectId)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {task.projectName}
                                </Link>
                              </td>
                              <td className="px-3 py-2">{task.closedAt || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                )}
              </div>
            )}

            {activeTab === 'capacity' && capacity && (
              <div className="space-y-4">
                <MetricCard
                  label={t('lit.pendingTimeApprovals')}
                  value={String(capacity.pendingApprovals || 0)}
                />
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                      <tr>
                        <th className="text-left px-3 py-2">{t('common.user')}</th>
                        <th className="text-right px-3 py-2">{t('lit.capacity')}</th>
                        <th className="text-right px-3 py-2">{t('lit.planned')}</th>
                        <th className="text-right px-3 py-2">{t('lit.logged')}</th>
                        <th className="text-right px-3 py-2">{t('lit.util')}</th>
                        <th className="text-right px-3 py-2">{t('lit.planVsCapacity')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(capacity.byUser || [])
                        .filter((u: any) => {
                          if (!capacitySearch.trim()) return true;
                          const q = capacitySearch.trim().toLowerCase();
                          return String(u.displayName || u.username || '')
                            .toLowerCase()
                            .includes(q);
                        })
                        .map((u: any) => (
                        <tr key={u.userId} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="px-3 py-2">
                            {u.userId ? (
                              <Link
                                href={userHref(u.userId)}
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {u.displayName || u.username}
                              </Link>
                            ) : (
                              <span className="text-gray-900 dark:text-white">{u.displayName}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{formatHours(u.capacityHours || 0)}</td>
                          <td className="px-3 py-2 text-right">{formatHours(u.plannedHours)}</td>
                          <td className="px-3 py-2 text-right">{formatHours(u.loggedHours)}</td>
                          <td className="px-3 py-2 text-right">
                            {u.utilizationPct == null ? '—' : `${u.utilizationPct}%`}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {u.planVsCapacityPct == null ? '—' : `${u.planVsCapacityPct}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'data-quality' && dataQuality && (() => {
              const dqTabs = [
                { id: 'unestimated' as const, label: t('lit.unestimated'), rows: dataQuality.unestimated || [] },
                { id: 'unassigned' as const, label: t('lit.unassigned'), rows: dataQuality.unassigned || [] },
                { id: 'noSprint' as const, label: t('lit.noSprint'), rows: dataQuality.noSprint || [] },
                { id: 'staleOverdue' as const, label: t('lit.staleOverdue'), rows: dataQuality.staleOverdue || [] },
                {
                  id: 'pendingApprovals' as const,
                  label: t('lit.pendingApprovals'),
                  rows: dataQuality.pendingApprovals || [],
                },
              ];
              const activeDq = dqTabs.find((t) => t.id === dqSubTab) || dqTabs[0];
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700">
                    {dqTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setDqSubTab(tab.id)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                          dqSubTab === tab.id
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {tab.label} ({tab.rows.length})
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => exportQualityCsv(activeDq.rows, activeDq.id)}
                      className="h-10 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600"
                      disabled={!activeDq.rows.length}
                    >
                      {t('lit.exportCsv')}
                    </button>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 max-h-[60vh] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          <th className="text-left px-3 py-2">{t('common.project')}</th>
                          <th className="text-left px-3 py-2">{t('lit.detail')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDq.rows.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                              {t('lit.noIssuesInThisCategory')}
                            </td>
                          </tr>
                        ) : (
                          activeDq.rows.map((r: any) => (
                            <tr key={`${activeDq.id}-${r.Id}`} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2">
                                {r.ProjectId ? (
                                  <Link
                                    href={projectHref(r.ProjectId)}
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {r.ProjectName || `Project #${r.ProjectId}`}
                                  </Link>
                                ) : (
                                  r.ProjectName || '—'
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {r.TaskName && r.ProjectId ? (
                                  <button
                                    type="button"
                                    onClick={() => void openTaskDetails(Number(r.ProjectId), Number(r.Id))}
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                                  >
                                    {r.TaskName}
                                  </button>
                                ) : (
                                  r.TaskName || r.Username || `#${r.Id}`
                                )}
                                {r.Hours != null ? ` (${r.Hours}h)` : ''}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'expenses' && expenseReport && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Approved expenses
                  {expenseDateFrom || expenseDateTo
                    ? ` with expense date ${expenseDateFrom || '…'} – ${expenseDateTo || '…'}`
                    : ' (all dates)'}
                  . Use Expense from/to above to narrow by invoice date.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <MetricCard label={t('lit.expenses')} value={String(expenseReport.totals?.ExpenseCount || 0)} />
                  <MetricCard label={t('lit.totalAmount')} value={formatMoney(expenseReport.totals?.GrandTotal)} />
                  <MetricCard label={t('lit.reimbursableCap')} value={formatMoney(expenseReport.totals?.ReimbursableCapTotal)} />
                  <MetricCard label={t('lit.reimbursed')} value={formatMoney(expenseReport.totals?.ReimbursedTotal)} />
                  <MetricCard label={t('lit.remaining')} value={formatMoney(expenseReport.totals?.RemainingTotal)} />
                  <MetricCard label={t('lit.fullyReimbursed')} value={String(expenseReport.totals?.FullyReimbursedCount || 0)} />
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 max-h-[65vh] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                      {expenseBreakdown === 'rows' ? (
                        <tr>
                          <th className="text-left px-3 py-2">{t('common.date')}</th>
                          <th className="text-left px-3 py-2">{t('lit.title')}</th>
                          <th className="text-left px-3 py-2">{t('lit.submittedBy')}</th>
                          <th className="text-left px-3 py-2">{t('lit.group')}</th>
                          <th className="text-left px-3 py-2">{t('pages.expenses.category')}</th>
                          <th className="text-left px-3 py-2">{t('common.project')}</th>
                          <th className="text-right px-3 py-2">{t('pages.expenses.amount')}</th>
                          <th className="text-right px-3 py-2">{t('lit.reimbCap')}</th>
                          <th className="text-right px-3 py-2">{t('lit.reimbursed')}</th>
                          <th className="text-right px-3 py-2">{t('lit.remaining')}</th>
                          <th className="text-left px-3 py-2">{t('lit.reimbStatus')}</th>
                        </tr>
                      ) : expenseBreakdown === 'category' ? (
                        <tr>
                          <th className="text-left px-3 py-2">{t('lit.group')}</th>
                          <th className="text-left px-3 py-2">{t('pages.expenses.category')}</th>
                          <th className="text-right px-3 py-2">{t('lit.count')}</th>
                          <th className="text-right px-3 py-2">{t('common.total')}</th>
                          <th className="text-right px-3 py-2">{t('lit.reimbCap')}</th>
                          <th className="text-right px-3 py-2">{t('lit.reimbursed')}</th>
                          <th className="text-right px-3 py-2">{t('lit.remaining')}</th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="text-left px-3 py-2">{t('lit.group')}</th>
                          <th className="text-right px-3 py-2">{t('common.total')}</th>
                          <th className="text-right px-3 py-2">{t('lit.reimbCap')}</th>
                          <th className="text-right px-3 py-2">{t('lit.reimbursed')}</th>
                          <th className="text-right px-3 py-2">{t('lit.remaining')}</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {expenseBreakdown === 'rows' &&
                        ((expenseReport.rows || []).length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                              {t('lit.noApprovedExpensesInThisPeriodForTheSelectedFilters')}
                            </td>
                          </tr>
                        ) : (
                          expenseReport.rows.map((row: any) => {
                            const submitter =
                              [row.submittedByFirstName, row.submittedByLastName].filter(Boolean).join(' ') ||
                              row.submittedByUsername ||
                              `User #${row.submittedByUserId}`;
                            const reimbLabel =
                              row.reimbursementStatus === 'not_applicable'
                                ? t('lit.notApplicable')
                                : row.reimbursementStatus === 'reimbursed'
                                  ? t('lit.fullyReimbursed')
                                  : row.reimbursementStatus || '—';
                            return (
                              <tr key={row.id} className="border-t border-gray-100 dark:border-gray-700">
                                <td className="px-3 py-2 text-gray-900 dark:text-white whitespace-nowrap">{row.expenseDate}</td>
                                <td className="px-3 py-2 text-gray-900 dark:text-white">{row.title}</td>
                                <td className="px-3 py-2">
                                  <Link href={userHref(row.submittedByUserId)} className="text-blue-600 dark:text-blue-400 hover:underline">
                                    {submitter}
                                  </Link>
                                </td>
                                <td className="px-3 py-2 text-gray-900 dark:text-white">{row.groupName || '—'}</td>
                                <td className="px-3 py-2 text-gray-900 dark:text-white">{row.categoryName || '—'}</td>
                                <td className="px-3 py-2">
                                  {row.projectId ? (
                                    <Link href={projectHref(row.projectId)} className="text-blue-600 dark:text-blue-400 hover:underline">
                                      {row.projectName || `Project #${row.projectId}`}
                                    </Link>
                                  ) : (
                                    <span className="text-gray-500 dark:text-gray-400">{t('lit.internal')}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.amount)}</td>
                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursableCap)}</td>
                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursedAmount)}</td>
                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.remainingAmount)}</td>
                                <td className="px-3 py-2 text-gray-900 dark:text-white">{reimbLabel}</td>
                              </tr>
                            );
                          })
                        ))}
                      {expenseBreakdown === 'category' &&
                        ((expenseReport.byCategory || []).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                              {t('lit.noDataForTheSelectedFilters')}
                            </td>
                          </tr>
                        ) : (
                          expenseReport.byCategory.map((row: any) => (
                            <tr key={`${row.groupName}-${row.categoryName}`} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{row.groupName}</td>
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{row.categoryName}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{row.expenseCount}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.totalAmount)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursableCap)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursed)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.remaining)}</td>
                            </tr>
                          ))
                        ))}
                      {expenseBreakdown === 'group' &&
                        ((expenseReport.byGroup || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                              {t('lit.noDataForTheSelectedFilters')}
                            </td>
                          </tr>
                        ) : (
                          expenseReport.byGroup.map((row: any) => (
                            <tr key={row.groupName} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{row.groupName}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.totalAmount)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursableCap)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursed)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.remaining)}</td>
                            </tr>
                          ))
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'expenses' && !expenseReport && !loading && (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
                {organizationId
                  ? 'No expense data loaded. Adjust filters and click Refresh, or wait for the report to load.'
                  : 'Select an organization to view expenses.'}
              </div>
            )}

            {activeTab === 'expenses' && !expenseReport && loading && (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
                {t('lit.loadingExpenseReport')}
              </div>
            )}

            {activeTab === 'extract' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Export raw rows to CSV. Use organization and project filters in the toolbar to narrow results
                  client-side. Expense datasets include all dates unless you filter on the Expenses tab. CSV includes
                  every column; the preview shows up to 200 rows.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="w-full sm:w-auto sm:min-w-[240px] sm:max-w-sm">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t('lit.dataset')}
                    </label>
                    <select
                      value={extractDataset}
                      onChange={(e) => setExtractDataset(e.target.value)}
                      className="h-10 w-full px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                    >
                      {extractDatasetOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void loadExtract()}
                      className="h-10 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                      {extractLoading ? 'Loading…' : t('lit.loadData')}
                    </button>
                    <button
                      type="button"
                      onClick={exportExtractCsv}
                      disabled={!extractRecords.length}
                      className="h-10 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 disabled:opacity-50 text-gray-900 dark:text-white"
                    >
                      {t('lit.exportCsv')}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                  {extractDatasetOptions.find((d) => d.id === extractDataset)?.description}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {extractRecords.length} row(s), {extractColumnKeys.length} column(s)
                  {extractRecords.length > 200 ? ' — preview limited to 200 rows' : ''}.
                  {extractLoadedCount != null &&
                    extractLoadedCount > extractRecords.length &&
                    ` ${extractLoadedCount} loaded; toolbar filters removed ${extractLoadedCount - extractRecords.length}.`}
                  {extractLoadedCount === 0 &&
                    ' No rows returned — check permissions or try another dataset.'}
                  {extractLoadedCount != null &&
                    extractLoadedCount > 0 &&
                    extractRecords.length === 0 &&
                    ' Widen or clear organization, project, and date filters above.'}
                </p>
                {extractRecords.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-auto max-h-[60vh]">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          {extractColumnKeys.map((k) => (
                            <th key={k} className="text-left px-2 py-2 whitespace-nowrap">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {extractRecords.slice(0, 200).map((row, idx) => (
                          <tr key={idx} className="border-t border-gray-100 dark:border-gray-700">
                            {extractColumnKeys.map((k) => (
                              <td key={k} className="px-2 py-1 whitespace-nowrap max-w-[240px] truncate">
                                {renderExtractCell(row, k)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'explore' && canExplore && (
              <div className="w-full">
                <WebReportsExplorer embedded />
              </div>
            )}
          </div>
        </main>
        
      {taskModalState.show && (
        <>
          {taskModalState.isLoading && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 text-sm text-gray-700 dark:text-gray-200">
                {t('lit.loadingTask')}
              </div>
            </div>
          )}
          {!taskModalState.isLoading && taskModalState.error && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <div className="text-sm text-red-600 dark:text-red-400 mb-4">{taskModalState.error}</div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeTaskDetails}
                    className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {!taskModalState.isLoading && !taskModalState.error && taskModalState.project && taskModalState.task && token && (
            <TaskDetailModal
              projectId={Number(taskModalState.project.Id)}
              organizationId={Number(taskModalState.project.OrganizationId)}
              task={taskModalState.task}
              project={taskModalState.project}
              tasks={taskModalState.tasks}
              onOpenTask={(targetTask) => {
                const fullTask =
                  taskModalState.tasks.find((entry) => Number(entry.Id) === Number(targetTask.Id)) ||
                  targetTask;
                setTaskModalState((prev) => ({ ...prev, task: fullTask }));
              }}
              onClose={closeTaskDetails}
              onSaved={async () => {
                if (!taskModalState.project || !taskModalState.task) return;
                await openTaskDetails(
                  Number(taskModalState.project.Id),
                  Number(taskModalState.task.Id)
                );
              }}
              token={token}
            />
          )}
        </>
      )}

        <ScrollToTopButton />
      </div>
    </CustomerUserGuard>
  );
}

function ReportingPageFallback() {
  const { t } = useI18n();
  return (
    <div className="w-full text-gray-600 dark:text-gray-300 p-6">
      {t('common.loading')}
    </div>
  );
}

export default function ReportingPage() {
  return (
    <Suspense fallback={<ReportingPageFallback />}>
      <ReportingHubInner />
    </Suspense>
  );
}
