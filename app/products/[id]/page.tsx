'use client';

import { useI18n } from '@/lib/i18n/provider';
import { sanitizeRichTextHtml } from '@/lib/sanitizeHtml';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';
import { getApiUrl } from '@/lib/api/config';
import {
  Product,
  ProductVersion,
  createProductVersion,
  deleteProduct,
  deleteProductVersion,
  downloadProductVersionPdf,
  getProduct,
  getProductVersion,
  getProductsAiAvailability,
  improveProductPatchNotes,
  listProductVersions,
  rebuildProductVersionPatchNotes,
  setProductApplications,
  setProductCustomers,
  setProductVersionApplicationVersions,
  updateProduct,
  updateProductVersion,
} from '@/lib/api/products';
import { mergeProductPatchNotesByApplication } from '@/lib/productPatchNotes';
import { useState, useEffect, use, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import RichTextEditor from '@/components/RichTextEditor';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import { useUrlTab } from '@/hooks/useUrlTab';
import { recordRecentNavAccess } from '@/lib/recentNavAccess';
import { NavModuleIcon } from '@/lib/navIcons';
import PageTabs from '@/components/PageTabs';
import PageStickyChrome from '@/components/PageStickyChrome';
import PageStickyActions, { pageActionButtonClass } from '@/components/PageStickyActions';

type Tab = 'overview' | 'versions' | 'settings';
const PRODUCT_DETAIL_TABS = ['overview', 'versions', 'settings'] as const;

const VERSION_STATUSES = ['Planning', 'In Development', 'Testing', 'Released', 'Archived'];

const STATUS_COLORS: Record<string, string> = {
  Planning: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'In Development': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Testing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Released: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Archived: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

type AppVersionOption = {
  Id: number;
  VersionNumber: string;
  VersionName?: string | null;
  Status?: string;
  PatchNotes?: string | null;
};

export default function ProductDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoadingSkeleton />}>
      <ProductDetailPageContent {...props} />
    </Suspense>
  );
}

function ProductDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useI18n();
  const { id } = use(params);
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  const { showToast } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [versions, setVersions] = useState<ProductVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useUrlTab<Tab>(PRODUCT_DETAIL_TABS, 'overview');

  const [orgApplications, setOrgApplications] = useState<
    { Id: number; Name: string; ImagePath?: string | null }[]
  >([]);
  const [orgCustomers, setOrgCustomers] = useState<{ Id: number; Name: string }[]>([]);
  const [catalogIds, setCatalogIds] = useState<number[]>([]);
  const [customerIds, setCustomerIds] = useState<number[]>([]);
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [isSavingCustomers, setIsSavingCustomers] = useState(false);
  const [isEditingCatalog, setIsEditingCatalog] = useState(false);

  const [selectedVersion, setSelectedVersion] = useState<ProductVersion | null>(null);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [editingVersion, setEditingVersion] = useState<ProductVersion | null>(null);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [isAiAvailable, setIsAiAvailable] = useState(false);
  const [isImprovingPatchNotes, setIsImprovingPatchNotes] = useState(false);
  const [appVersionsByAppId, setAppVersionsByAppId] = useState<Record<number, AppVersionOption[]>>({});
  const [linkSelections, setLinkSelections] = useState<Record<number, number>>({});
  const [versionForm, setVersionForm] = useState({
    VersionNumber: '',
    VersionName: '',
    IsCustomerSpecific: false,
    CustomerId: null as number | null,
    Status: 'Planning',
    ReleaseDate: '',
    PatchNotes: '',
  });

  const [editForm, setEditForm] = useState({
    Name: '',
    Description: '',
    IsCustomerSpecific: false,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmVariant?: 'primary' | 'danger';
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (token && id) void loadAll();
  }, [token, id]);

  const loadAll = async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const [{ product: loaded }, { versions: versionRows }] = await Promise.all([
        getProduct(token, id),
        listProductVersions(token, id),
      ]);
      setProduct(loaded);
      setVersions(versionRows || []);
      setCatalogIds((loaded.Applications || []).map((a) => a.Id));
      setCustomerIds((loaded.Customers || []).map((c) => c.Id));
      setEditForm({
        Name: loaded.Name,
        Description: loaded.Description || '',
        IsCustomerSpecific: !!loaded.IsCustomerSpecific,
      });
      recordRecentNavAccess('products', {
        id: loaded.Id,
        label: loaded.Name,
        href: `/products/${loaded.Id}`,
      }, user?.id);

      const [appsRes, customersRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/applications?organizationId=${loaded.OrganizationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/customers`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (appsRes.ok) {
        const data = await appsRes.json();
        setOrgApplications(
          ((data.applications || []) as { Id: number; Name: string; ImagePath?: string | null }[]).map(
            (a) => ({
              Id: a.Id,
              Name: a.Name,
              ImagePath: a.ImagePath || null,
            })
          )
        );
      }
      setIsEditingCatalog(false);
      if (customersRes.ok) {
        const data = await customersRes.json();
        setOrgCustomers(data.data || data.customers || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lit.failedToLoadProduct'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadVersionDetail = async (versionId: number) => {
    if (!token) return;
    try {
      const { version } = await getProductVersion(token, id, versionId);
      setSelectedVersion(version);
      const nextLinks: Record<number, number> = {};
      for (const link of version.ApplicationVersions || []) {
        nextLinks[link.ApplicationId] = link.ApplicationVersionId;
      }
      setLinkSelections(nextLinks);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : t('lit.failedToLoadVersion'),
      });
    }
  };

  const loadAppVersionsForCatalog = async (
    applicationIds: number[]
  ): Promise<Record<number, AppVersionOption[]>> => {
    if (!token || applicationIds.length === 0) {
      setAppVersionsByAppId({});
      return {};
    }
    const entries = await Promise.all(
      applicationIds.map(async (appId) => {
        try {
          const res = await fetch(`${getApiUrl()}/api/applications/${appId}/versions`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return [appId, [] as AppVersionOption[]] as const;
          const data = await res.json();
          return [appId, (data.versions || []) as AppVersionOption[]] as const;
        } catch {
          return [appId, [] as AppVersionOption[]] as const;
        }
      })
    );
    const map: Record<number, AppVersionOption[]> = {};
    for (const [appId, rows] of entries) map[appId] = rows;
    setAppVersionsByAppId(map);
    return map;
  };

  /** API returns versions by CreatedAt DESC — first entry is the latest. */
  const defaultLatestVersionSelections = (
    versionsByApp: Record<number, AppVersionOption[]>
  ): Record<number, number> => {
    const next: Record<number, number> = {};
    for (const [appIdRaw, rows] of Object.entries(versionsByApp)) {
      const latest = rows[0];
      if (latest?.Id) next[Number(appIdRaw)] = latest.Id;
    }
    return next;
  };

  const loadAiAvailability = async () => {
    if (!token) return;
    try {
      const data = await getProductsAiAvailability(token);
      setIsAiAvailable(Boolean(data.configured));
    } catch {
      setIsAiAvailable(false);
    }
  };

  const openCreateVersionModal = async () => {
    setEditingVersion(null);
    setVersionForm({
      VersionNumber: '',
      VersionName: '',
      IsCustomerSpecific: false,
      CustomerId: null,
      Status: 'Planning',
      ReleaseDate: '',
      PatchNotes: '',
    });
    const versionsByApp = await loadAppVersionsForCatalog(catalogIds);
    setLinkSelections(defaultLatestVersionSelections(versionsByApp));
    await loadAiAvailability();
    setShowVersionModal(true);
  };

  const openEditVersionModal = async (version: ProductVersion) => {
    setEditingVersion(version);
    setVersionForm({
      VersionNumber: version.VersionNumber,
      VersionName: version.VersionName || '',
      IsCustomerSpecific: !!version.IsCustomerSpecific,
      CustomerId: version.CustomerId ?? null,
      Status: version.Status || 'Planning',
      ReleaseDate: version.ReleaseDate ? String(version.ReleaseDate).split('T')[0] : '',
      PatchNotes: version.PatchNotes || '',
    });
    await loadVersionDetail(version.Id);
    await loadAppVersionsForCatalog(catalogIds);
    await loadAiAvailability();
    setShowVersionModal(true);
  };

  const buildLinksPayload = () =>
    Object.entries(linkSelections)
      .filter(([, versionId]) => Number(versionId) > 0)
      .map(([applicationId, applicationVersionId]) => ({
        applicationId: Number(applicationId),
        applicationVersionId: Number(applicationVersionId),
      }));

  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSavingVersion(true);
    setError('');
    try {
      if (!versionForm.VersionNumber.trim()) throw new Error(t('lit.versionNumberIsRequired'));
      if (versionForm.IsCustomerSpecific && !versionForm.CustomerId) {
        throw new Error(t('lit.customerIsRequiredWhenVersionIsCustomerSpecific'));
      }
      const links = buildLinksPayload();
      if (editingVersion) {
        await updateProductVersion(token, id, editingVersion.Id, {
          VersionNumber: versionForm.VersionNumber.trim(),
          VersionName: versionForm.VersionName.trim() || null,
          Status: versionForm.Status,
          ReleaseDate: versionForm.ReleaseDate || null,
          PatchNotes: versionForm.PatchNotes || null,
          IsCustomerSpecific: versionForm.IsCustomerSpecific,
          CustomerId: versionForm.IsCustomerSpecific ? versionForm.CustomerId : null,
        });
        await setProductVersionApplicationVersions(token, id, editingVersion.Id, links);
        showToast({ type: 'success', message: t('lit.versionUpdatedSuccessfully') });
        await loadVersionDetail(editingVersion.Id);
      } else {
        const created = await createProductVersion(token, id, {
          VersionNumber: versionForm.VersionNumber.trim(),
          VersionName: versionForm.VersionName.trim() || null,
          Status: versionForm.Status,
          ReleaseDate: versionForm.ReleaseDate || null,
          PatchNotes: versionForm.PatchNotes || null,
          IsCustomerSpecific: versionForm.IsCustomerSpecific,
          CustomerId: versionForm.IsCustomerSpecific ? versionForm.CustomerId : null,
          links,
        });
        showToast({ type: 'success', message: t('lit.versionCreatedSuccessfully') });
        await loadAll();
        if (created.id) await loadVersionDetail(created.id);
      }
      setShowVersionModal(false);
      const refreshed = await listProductVersions(token, id);
      setVersions(refreshed.versions || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('lit.failedToSaveVersion');
      setError(message);
      showToast({ type: 'error', message });
    } finally {
      setIsSavingVersion(false);
    }
  };

  const handleRebuildPatchNotes = () => {
    if (!selectedVersion || !token) return;
    setConfirmModal({
      title: t('lit.rebuildFromApplications'),
      message: t('lit.rebuildPatchNotesConfirm'),
      confirmLabel: t('lit.rebuildFromApplications'),
      confirmVariant: 'primary',
      onConfirm: async () => {
        try {
          const result = await rebuildProductVersionPatchNotes(token, id, selectedVersion.Id);
          setSelectedVersion({
            ...selectedVersion,
            PatchNotes: result.patchNotes || selectedVersion.PatchNotes,
          });
          setVersionForm((prev) => ({
            ...prev,
            PatchNotes: result.patchNotes || prev.PatchNotes,
          }));
          setConfirmModal(null);
          showToast({ type: 'success', message: t('lit.patchNotesRebuilt') });
        } catch (err) {
          showToast({
            type: 'error',
            message: err instanceof Error ? err.message : t('lit.failedToRebuildPatchNotes'),
          });
          setConfirmModal(null);
        }
      },
    });
  };

  const runImproveWithAi = async (splitByChangeType: boolean) => {
    if (!token || !isAiAvailable || isImprovingPatchNotes) return;
    setIsImprovingPatchNotes(true);
    try {
      const result = await improveProductPatchNotes(token, id, versionForm.PatchNotes || '', {
        splitByChangeType,
      });
      const improved = String(result.patchNotes || '').trim();
      if (!improved) throw new Error(t('lit.aiReturnedEmptyPatchNotes'));
      setVersionForm((prev) => ({ ...prev, PatchNotes: improved }));
      showToast({ type: 'success', message: t('lit.patchNotesImproved') });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : t('lit.failedToImprovePatchNotesWithAi'),
      });
    } finally {
      setIsImprovingPatchNotes(false);
    }
  };

  const handleImproveWithAi = () => {
    if (!token || !isAiAvailable || isImprovingPatchNotes) return;

    setConfirmModal({
      title: 'Improve with AI',
      message:
        'Split the patch notes into Added, Changed, and Fixed sections (inside each application)? Choose Yes to group by change type, or No to improve without that structure.',
      confirmLabel: 'Yes, split',
      cancelLabel: 'No, keep flat',
      confirmVariant: 'primary',
      onConfirm: () => void runImproveWithAi(true),
      onCancel: () => void runImproveWithAi(false),
    });
  };

  const fillPatchNotesFromSelectedAppVersions = () => {
    const sources = buildLinksPayload()
      .map((link) => {
        const appName =
          orgApplications.find((entry) => entry.Id === link.applicationId)?.Name ||
          (product?.Applications || []).find((entry) => entry.Id === link.applicationId)?.Name ||
          '';
        const version = (appVersionsByAppId[link.applicationId] || []).find(
          (entry) => entry.Id === link.applicationVersionId
        );
        if (!appName || !version) return null;
        return {
          applicationId: link.applicationId,
          applicationName: appName,
          applicationVersionId: link.applicationVersionId,
          versionNumber: version.VersionNumber,
          patchNotes: version.PatchNotes,
        };
      })
      .filter((source): source is NonNullable<typeof source> => source != null);

    if (sources.length === 0) {
      showToast({ type: 'error', message: t('lit.selectAtLeastOneApplicationVersion') });
      return;
    }

    const applyFill = () => {
      const merged = mergeProductPatchNotesByApplication(sources);
      setVersionForm((prev) => ({ ...prev, PatchNotes: merged }));
      setConfirmModal(null);
      showToast({ type: 'success', message: t('lit.patchNotesFilledFromApplications') });
    };

    if (String(versionForm.PatchNotes || '').trim()) {
      setConfirmModal({
        title: t('lit.fillPatchNotesFromApplications'),
        message: t('lit.fillPatchNotesFromApplicationsConfirm'),
        confirmLabel: t('lit.fillPatchNotesFromApplications'),
        confirmVariant: 'primary',
        onConfirm: applyFill,
      });
      return;
    }

    applyFill();
  };

  const handleDownloadPdf = async (version: ProductVersion) => {
    if (!token || !product) return;
    try {
      const filename = `${product.Name.replace(/[^a-z0-9]/gi, '_')}-v${version.VersionNumber}-release-notes.pdf`;
      await downloadProductVersionPdf(token, id, version.Id, filename);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : t('lit.failedToDownloadPdf'),
      });
    }
  };

  const handleSaveCatalog = async () => {
    if (!token) return;
    setIsSavingCatalog(true);
    try {
      await setProductApplications(token, id, catalogIds);
      await loadAll();
      showToast({ type: 'success', message: t('lit.productCatalogUpdated') });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : t('lit.failedToUpdateProductCatalog'),
      });
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleSaveCustomers = async () => {
    if (!token) return;
    setIsSavingCustomers(true);
    try {
      await setProductCustomers(token, id, customerIds);
      await loadAll();
      showToast({ type: 'success', message: t('lit.customersUpdated') });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : t('lit.failedToUpdateCustomers'),
      });
    } finally {
      setIsSavingCustomers(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSavingSettings(true);
    try {
      await updateProduct(token, id, {
        Name: editForm.Name.trim(),
        Description: editForm.Description.trim() || null,
        IsCustomerSpecific: editForm.IsCustomerSpecific,
      });
      await loadAll();
      showToast({ type: 'success', message: t('lit.productUpdatedSuccessfully') });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : t('lit.failedToSaveProduct'),
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleArchiveProduct = () => {
    if (!product || !token) return;
    setConfirmModal({
      title: t('lit.deleteProduct'),
      message: t('lit.deleteProductConfirm').replace('{name}', product.Name),
      onConfirm: async () => {
        try {
          await deleteProduct(token, product.Id);
          setConfirmModal(null);
          router.push('/products');
        } catch (err) {
          showToast({
            type: 'error',
            message: err instanceof Error ? err.message : t('lit.failedToDeleteProduct'),
          });
          setConfirmModal(null);
        }
      },
    });
  };

  const handleDeleteVersion = (version: ProductVersion) => {
    if (!token) return;
    setConfirmModal({
      title: t('lit.deleteVersion'),
      message: t('lit.deleteVersionConfirm').replace('{version}', version.VersionNumber),
      onConfirm: async () => {
        try {
          await deleteProductVersion(token, id, version.Id);
          setConfirmModal(null);
          if (selectedVersion?.Id === version.Id) setSelectedVersion(null);
          const refreshed = await listProductVersions(token, id);
          setVersions(refreshed.versions || []);
          showToast({ type: 'success', message: t('lit.versionDeletedSuccessfully') });
        } catch (err) {
          showToast({
            type: 'error',
            message: err instanceof Error ? err.message : t('lit.failedToDeleteVersion'),
          });
          setConfirmModal(null);
        }
      },
    });
  };

  if (authLoading || isLoading) return <PageLoadingSkeleton />;
  if (!user) return null;
  if (!product) {
    return (
      <div className="w-full px-4 py-8">
        <p className="text-red-600">{error || t('lit.productNotFound')}</p>
        <Link href="/products" className="text-blue-600 hover:underline mt-2 inline-block">
          {t('nav.products')}
        </Link>
      </div>
    );
  }

  const catalogApps = catalogIds
    .map((appId) => {
      const fromOrg = orgApplications.find((app) => app.Id === appId);
      if (fromOrg) return fromOrg;
      const fromProduct = (product.Applications || []).find((app) => app.Id === appId);
      return fromProduct
        ? { Id: fromProduct.Id, Name: fromProduct.Name, ImagePath: fromProduct.ImagePath }
        : null;
    })
    .filter((app): app is { Id: number; Name: string; ImagePath?: string | null } => app != null)
    .sort((a, b) => a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' }));

  const catalogDirty =
    [...catalogIds].sort((a, b) => a - b).join(',') !==
    (product.Applications || [])
      .map((app) => app.Id)
      .sort((a, b) => a - b)
      .join(',');

  return (
    <div className="w-full min-h-0 flex flex-col">
      <PageStickyChrome>
        <div className="space-y-3">
          <Link href="/products" className="inline-flex items-center gap-1 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-text)]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('nav.products')}
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            {product.ImagePath ? (
              <img
                src={product.ImagePath}
                alt=""
                className="h-14 w-14 rounded-xl object-cover border border-gray-200 dark:border-gray-600 shrink-0 bg-white"
              />
            ) : (
              <span className="shrink-0 text-[var(--pm-muted)] opacity-80">
                <NavModuleIcon href="/products" size={40} />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-[var(--pm-text)] truncate">{product.Name}</h1>
              <p className="text-sm text-[var(--pm-muted)]">{product.OrganizationName}</p>
            </div>
          </div>
        </div>

        <PageTabs
          tabs={[
            { id: 'overview', label: t('lit.overview') },
            { id: 'versions', label: `${t('lit.versions')} (${versions.length})` },
            ...(permissions?.canManageProducts
              ? [{ id: 'settings' as const, label: t('pages.organizations.settings') }]
              : []),
          ]}
          activeId={activeTab}
          onChange={(tabId) => setActiveTab(tabId as Tab)}
        />
      </PageStickyChrome>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-3 px-4 pb-8">
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
            {error}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {product.Description && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    {t('common.description')}
                  </h2>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{product.Description}</p>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('lit.productCatalog')} ({catalogApps.length})
                  </h2>
                  {permissions?.canManageProducts && (
                    <div className="flex items-center gap-2">
                      {!isEditingCatalog ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingCatalog(true)}
                          className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded"
                          title={t('lit.manageProductCatalog')}
                          aria-label={t('lit.manageProductCatalog')}
                        >
                          ⚙️
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setCatalogIds((product.Applications || []).map((app) => app.Id));
                              setIsEditingCatalog(false);
                            }}
                            className="text-xs px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await handleSaveCatalog();
                              setIsEditingCatalog(false);
                            }}
                            disabled={isSavingCatalog || !catalogDirty}
                            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded"
                          >
                            {isSavingCatalog ? t('lit.saving') : t('common.save')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {isEditingCatalog && permissions?.canManageProducts && (
                  <SearchableMultiSelect
                    options={orgApplications.map((app) => ({ value: app.Id, label: app.Name }))}
                    values={catalogIds}
                    onChange={(ids) => setCatalogIds(ids.map((v) => Number(v)))}
                    placeholder={t('lit.selectApplications')}
                  />
                )}

                {catalogApps.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('lit.addApplicationsToProductCatalogFirst')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {catalogApps.map((app) => (
                      <div
                        key={app.Id}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => router.push(`/applications/${app.Id}`)}
                        >
                          {app.ImagePath ? (
                            <img
                              src={app.ImagePath}
                              alt=""
                              className="h-9 w-9 rounded-lg object-cover border border-gray-200 dark:border-gray-600 shrink-0 bg-white"
                            />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shrink-0 text-[var(--pm-muted)]">
                              <NavModuleIcon href="/applications" size={18} />
                            </span>
                          )}
                          <span className="truncate font-medium text-gray-900 dark:text-white">
                            {app.Name}
                          </span>
                        </button>
                        {isEditingCatalog && permissions?.canManageProducts && (
                          <button
                            type="button"
                            className="shrink-0 p-1.5 text-gray-400 hover:text-red-500"
                            title={t('common.remove')}
                            aria-label={t('common.remove')}
                            onClick={() =>
                              setCatalogIds((prev) => prev.filter((value) => value !== app.Id))
                            }
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  {t('lit.quickStats')}
                </h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">{t('lit.applications')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{catalogApps.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">{t('lit.versions')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{versions.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">{t('lit.customers')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{(product.Customers || []).length}</dd>
                  </div>
                </dl>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('lit.customers')}
                  </h2>
                  {permissions?.canManageProducts && (
                    <button
                      type="button"
                      onClick={handleSaveCustomers}
                      disabled={isSavingCustomers}
                      className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded"
                    >
                      {isSavingCustomers ? t('lit.saving') : t('common.save')}
                    </button>
                  )}
                </div>
                <SearchableMultiSelect
                  options={orgCustomers.map((c) => ({ value: c.Id, label: c.Name }))}
                  values={customerIds}
                  onChange={(ids) => setCustomerIds(ids.map((v) => Number(v)))}
                  placeholder={t('lit.selectCustomers')}
                  disabled={!permissions?.canManageProducts}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'versions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{t('lit.versions')}</h2>
                {permissions?.canManageProductReleases && (
                  <button
                    type="button"
                    onClick={openCreateVersionModal}
                    className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    + {t('lit.newVersion')}
                  </button>
                )}
              </div>
              {versions.length === 0 ? (
                <p className="text-sm text-gray-500">{t('lit.noVersionsYet')}</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((version) => (
                    <button
                      key={version.Id}
                      type="button"
                      onClick={() => void loadVersionDetail(version.Id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedVersion?.Id === version.Id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{version.VersionNumber}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[version.Status] || STATUS_COLORS.Planning}`}>
                          {version.Status}
                        </span>
                      </div>
                      {version.VersionName && (
                        <p className="text-xs text-gray-500 mt-1 truncate">{version.VersionName}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              {!selectedVersion ? (
                <p className="text-sm text-gray-500">{t('lit.selectAVersionToViewDetails')}</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {selectedVersion.VersionNumber}
                        {selectedVersion.VersionName ? ` — ${selectedVersion.VersionName}` : ''}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {selectedVersion.ReleaseDate
                          ? String(selectedVersion.ReleaseDate).split('T')[0]
                          : t('lit.noReleaseDate')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {permissions?.canManageProductReleases && (
                        <>
                          <button
                            type="button"
                            onClick={() => void openEditVersionModal(selectedVersion)}
                            className={pageActionButtonClass.secondary}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            onClick={handleRebuildPatchNotes}
                            className={pageActionButtonClass.secondary}
                          >
                            {t('lit.rebuildFromApplications')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownloadPdf(selectedVersion)}
                            className={pageActionButtonClass.secondary}
                          >
                            {t('lit.downloadPdf')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVersion(selectedVersion)}
                            className="px-3 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white"
                          >
                            {t('common.delete')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {(selectedVersion.ApplicationVersions || []).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        {t('lit.includedApplicationVersions')}
                      </h4>
                      <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                        {(selectedVersion.ApplicationVersions || []).map((link) => (
                          <li key={`${link.ApplicationId}-${link.ApplicationVersionId}`}>
                            {link.ApplicationName} {link.VersionNumber}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      {t('lit.patchNotes')}
                    </h4>
                    {selectedVersion.PatchNotes ? (
                      <div
                        className="prose dark:prose-invert max-w-none text-sm"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeRichTextHtml(selectedVersion.PatchNotes),
                        }}
                      />
                    ) : (
                      <p className="text-sm text-gray-500">{t('lit.noPatchNotesWrittenForThisVersionYet')}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && permissions?.canManageProducts && (
          <form onSubmit={handleSaveSettings} className="max-w-xl bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.name')}</label>
              <input
                type="text"
                value={editForm.Name}
                onChange={(e) => setEditForm({ ...editForm, Name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.description')}</label>
              <textarea
                value={editForm.Description}
                onChange={(e) => setEditForm({ ...editForm, Description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={editForm.IsCustomerSpecific}
                onChange={(e) => setEditForm({ ...editForm, IsCustomerSpecific: e.target.checked })}
                className="rounded"
              />
              {t('lit.customerSpecific')}
            </label>
            <PageStickyActions>
              <button type="submit" disabled={isSavingSettings} className={pageActionButtonClass.primary}>
                {isSavingSettings ? t('lit.saving') : t('common.save')}
              </button>
              {permissions?.canDeleteProducts && (
                <button
                  type="button"
                  onClick={handleArchiveProduct}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
                >
                  {t('lit.archiveProduct')}
                </button>
              )}
            </PageStickyActions>
          </form>
        )}
      </main>

      {showVersionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSaveVersion} className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingVersion ? t('lit.editVersion') : t('lit.newVersion')}
                </h2>
                <button type="button" onClick={() => setShowVersionModal(false)} className="text-gray-500 hover:text-gray-700">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('lit.versionNumber')} *</label>
                  <input
                    type="text"
                    value={versionForm.VersionNumber}
                    onChange={(e) => setVersionForm({ ...versionForm, VersionNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('lit.versionName')}</label>
                  <input
                    type="text"
                    value={versionForm.VersionName}
                    onChange={(e) => setVersionForm({ ...versionForm, VersionName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('lit.status')}</label>
                  <select
                    value={versionForm.Status}
                    onChange={(e) => setVersionForm({ ...versionForm, Status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  >
                    {VERSION_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('lit.releaseDate')}</label>
                  <input
                    type="date"
                    value={versionForm.ReleaseDate}
                    onChange={(e) => setVersionForm({ ...versionForm, ReleaseDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={versionForm.IsCustomerSpecific}
                  onChange={(e) =>
                    setVersionForm({
                      ...versionForm,
                      IsCustomerSpecific: e.target.checked,
                      CustomerId: e.target.checked ? versionForm.CustomerId : null,
                    })
                  }
                  className="rounded"
                />
                {t('lit.customerSpecific')}
              </label>
              {versionForm.IsCustomerSpecific && (
                <select
                  value={versionForm.CustomerId || ''}
                  onChange={(e) =>
                    setVersionForm({
                      ...versionForm,
                      CustomerId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                  <option value="">{t('lit.selectCustomer')}</option>
                  {orgCustomers.map((c) => (
                    <option key={c.Id} value={c.Id}>
                      {c.Name}
                    </option>
                  ))}
                </select>
              )}

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  {t('lit.applicationVersions')}
                </h3>
                {catalogApps.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('lit.addApplicationsToProductCatalogFirst')}</p>
                ) : (
                  catalogApps.map((app) => (
                    <div key={app.Id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2 items-center">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{app.Name}</span>
                      <select
                        value={linkSelections[app.Id] || ''}
                        onChange={(e) =>
                          setLinkSelections((prev) => ({
                            ...prev,
                            [app.Id]: e.target.value ? Number(e.target.value) : 0,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                      >
                        <option value="">{t('lit.none')}</option>
                        {(appVersionsByAppId[app.Id] || []).map((av) => (
                          <option key={av.Id} value={av.Id}>
                            {av.VersionNumber}
                            {av.VersionName ? ` — ${av.VersionName}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium">{t('lit.patchNotes')}</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={fillPatchNotesFromSelectedAppVersions}
                      disabled={buildLinksPayload().length === 0}
                      className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded"
                      title={t('lit.fillPatchNotesFromApplications')}
                    >
                      {t('lit.fillPatchNotesFromApplications')}
                    </button>
                    {isAiAvailable && (
                      <button
                        type="button"
                        onClick={handleImproveWithAi}
                        disabled={isImprovingPatchNotes || !versionForm.PatchNotes}
                        className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded"
                        title={t('lit.improvePatchNotesWithAiWhilePreservingBulletPoints')}
                      >
                        {isImprovingPatchNotes ? t('lit.improving') : t('lit.improveWithAi')}
                      </button>
                    )}
                  </div>
                </div>
                <RichTextEditor
                  content={versionForm.PatchNotes}
                  onChange={(val) => setVersionForm({ ...versionForm, PatchNotes: val })}
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowVersionModal(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingVersion}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                >
                  {isSavingVersion ? t('lit.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmAlertModal
        isOpen={!!confirmModal}
        type="confirm"
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        confirmLabel={confirmModal?.confirmLabel}
        cancelLabel={confirmModal?.cancelLabel}
        confirmVariant={confirmModal?.confirmVariant || 'danger'}
        onConfirm={() => {
          const confirm = confirmModal?.onConfirm;
          setConfirmModal(null);
          confirm?.();
        }}
        onClose={() => {
          const cancel = confirmModal?.onCancel;
          setConfirmModal(null);
          cancel?.();
        }}
      />

      <ScrollToTopButton />
    </div>
  );
}
