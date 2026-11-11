'use client';

import { useI18n } from '@/lib/i18n/provider';
import { getApiUrl } from '@/lib/api/config';
import {
  Product,
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from '@/lib/api/products';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import { useRouter } from 'next/navigation';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import EmptyState from '@/components/EmptyState';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import { NavModuleIcon } from '@/lib/navIcons';
import { compareWithPinnedFirst } from '@/lib/pinnedListItems';
import { usePinnedListItems } from '@/hooks/usePinnedListItems';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { Pin, PinOff } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';

interface Organization {
  Id: number;
  Name: string;
}

interface Customer {
  Id: number;
  Name: string;
}

interface ApplicationOption {
  Id: number;
  Name: string;
  OrganizationId: number;
}

type ProductSortField = 'name' | 'organization' | 'applications' | 'versions' | 'customers';
type SortDirection = 'asc' | 'desc';

type ProductsListFilters = {
  searchQuery: string;
  filterOrg: string;
  sortField: ProductSortField;
  sortDirection: SortDirection;
};

const DEFAULT_PRODUCTS_LIST_FILTERS: ProductsListFilters = {
  searchQuery: '',
  filterOrg: '',
  sortField: 'name',
  sortDirection: 'asc',
};

const PRODUCT_SORT_FIELDS: ProductSortField[] = [
  'name',
  'organization',
  'applications',
  'versions',
  'customers',
];

function mergeProductsListFilters(
  stored: Record<string, unknown>,
  defaults: ProductsListFilters
): ProductsListFilters {
  const sortField = PRODUCT_SORT_FIELDS.includes(stored.sortField as ProductSortField)
    ? (stored.sortField as ProductSortField)
    : defaults.sortField;
  const sortDirection =
    stored.sortDirection === 'desc' || stored.sortDirection === 'asc'
      ? stored.sortDirection
      : defaults.sortDirection;
  return {
    searchQuery: typeof stored.searchQuery === 'string' ? stored.searchQuery : defaults.searchQuery,
    filterOrg: typeof stored.filterOrg === 'string' ? stored.filterOrg : defaults.filterOrg,
    sortField,
    sortDirection,
  };
}

export default function ProductsPage() {
  const { t } = useI18n();
  const { user, token, isLoading: authLoading } = useAuth();
  const { pinnedIds, isPinned, togglePinned } = usePinnedListItems('products', user?.id);
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const router = useRouter();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem('products:viewMode');
    return stored === 'grid' || stored === 'list' ? stored : 'list';
  });
  const effectiveViewMode: 'list' | 'grid' = isMobile ? 'grid' : viewMode;
  const [listFilters, setListFilters, resetListFilters] = usePersistedFilters(
    'products',
    DEFAULT_PRODUCTS_LIST_FILTERS,
    { userId: user?.id, merge: mergeProductsListFilters }
  );
  const { searchQuery, filterOrg, sortField, sortDirection } = listFilters;

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    Name: '',
    Description: '',
    IsCustomerSpecific: false,
    OrganizationId: 0,
    ApplicationIds: [] as number[],
    CustomerIds: [] as number[],
  });
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (token) void loadData();
  }, [token]);

  useEffect(() => {
    window.localStorage.setItem('products:viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmModal) {
        setConfirmModal(null);
        return;
      }
      if (showModal) closeModal();
    };
    window.addEventListener('keydown', handleEscClose);
    return () => window.removeEventListener('keydown', handleEscClose);
  }, [confirmModal, showModal]);

  const loadData = async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const [productsRes, orgsRes, customersRes, appsRes] = await Promise.all([
        listProducts(token),
        fetch(`${getApiUrl()}/api/organizations`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/customers`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/applications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setProducts(productsRes.products || []);

      if (orgsRes.ok) {
        const data = await orgsRes.json();
        setOrganizations(data.organizations || data || []);
      }
      if (customersRes.ok) {
        const data = await customersRes.json();
        setCustomers(data.data || data.customers || []);
      }
      if (appsRes.ok) {
        const data = await appsRes.json();
        setApplications(
          ((data.applications || []) as ApplicationOption[]).map((app) => ({
            Id: app.Id,
            Name: app.Name,
            OrganizationId: app.OrganizationId,
          }))
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('lit.failedToLoadProducts');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const orgNames = Array.from(new Set(products.map((p) => p.OrganizationName).filter(Boolean))).sort();

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.Name.toLowerCase().includes(q) ||
          (p.Description || '').toLowerCase().includes(q) ||
          (p.OrganizationName || '').toLowerCase().includes(q)
      );
    }
    if (filterOrg) {
      result = result.filter((p) => p.OrganizationName === filterOrg);
    }

    result.sort((a, b) =>
      compareWithPinnedFirst(a, b, (item) => item.Id, pinnedIds, (left, right) => {
        let cmp = 0;
        switch (sortField) {
          case 'organization':
            cmp = (left.OrganizationName || '').localeCompare(right.OrganizationName || '');
            break;
          case 'applications':
            cmp = (left.ApplicationCount || 0) - (right.ApplicationCount || 0);
            break;
          case 'versions':
            cmp = (left.VersionCount || 0) - (right.VersionCount || 0);
            break;
          case 'customers':
            cmp = (left.CustomerCount || 0) - (right.CustomerCount || 0);
            break;
          default:
            cmp = left.Name.localeCompare(right.Name);
        }
        return sortDirection === 'asc' ? cmp : -cmp;
      })
    );

    return result;
  }, [products, searchQuery, filterOrg, sortField, sortDirection, pinnedIds]);

  const orgApplications = applications.filter(
    (app) => !formData.OrganizationId || app.OrganizationId === formData.OrganizationId
  );

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({
      Name: '',
      Description: '',
      IsCustomerSpecific: false,
      OrganizationId: organizations[0]?.Id || 0,
      ApplicationIds: [],
      CustomerIds: [],
    });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      Name: product.Name,
      Description: product.Description || '',
      IsCustomerSpecific: !!product.IsCustomerSpecific,
      OrganizationId: product.OrganizationId,
      ApplicationIds: (product.Applications || []).map((a) => a.Id),
      CustomerIds: (product.Customers || []).map((c) => c.Id),
    });
    setError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
    setError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSaving(true);
    setError('');
    try {
      if (!formData.Name.trim()) throw new Error(t('lit.nameIsRequired'));
      if (!formData.OrganizationId) throw new Error(t('lit.organizationIsRequired'));

      if (editingProduct) {
        await updateProduct(token, editingProduct.Id, {
          Name: formData.Name.trim(),
          Description: formData.Description.trim() || null,
          IsCustomerSpecific: formData.IsCustomerSpecific,
        });
        showToast({ type: 'success', message: t('lit.productUpdatedSuccessfully') });
      } else {
        await createProduct(token, {
          Name: formData.Name.trim(),
          Description: formData.Description.trim() || null,
          OrganizationId: formData.OrganizationId,
          IsCustomerSpecific: formData.IsCustomerSpecific,
          applicationIds: formData.ApplicationIds,
          customerIds: formData.CustomerIds,
        });
        showToast({ type: 'success', message: t('lit.productCreatedSuccessfully') });
      }
      closeModal();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('lit.failedToSaveProduct');
      setError(message);
      showToast({ type: 'error', message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (product: Product) => {
    setConfirmModal({
      title: t('lit.deleteProduct'),
      message: t('lit.deleteProductConfirm').replace('{name}', product.Name),
      onConfirm: async () => {
        if (!token) return;
        try {
          await deleteProduct(token, product.Id);
          setConfirmModal(null);
          await loadData();
          showToast({ type: 'success', message: t('lit.productDeletedSuccessfully') });
        } catch (err) {
          const message = err instanceof Error ? err.message : t('lit.failedToDeleteProduct');
          setError(message);
          showToast({ type: 'error', message });
          setConfirmModal(null);
        }
      },
    });
  };

  if (authLoading || permissionsLoading || isLoading) {
    return (
      <div className="w-full">
        <div className="w-full mx-auto px-4 py-8">
          <div className="space-y-5 animate-pulse">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-20" />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-14" />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="w-full">
      <div className="w-full mx-auto px-4 py-4 sm:py-6 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight text-gray-900 dark:text-white">
              {t('pages.products.title')}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {products.length} {t('pages.products.title').toLowerCase()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center rounded-md border border-gray-300 bg-gray-100 p-0.5 dark:border-gray-600 dark:bg-gray-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`rounded p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-white shadow dark:bg-gray-600' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                title={t('lit.gridView')}
                type="button"
              >
                <svg className="h-4 w-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`rounded p-1.5 transition-colors ${viewMode === 'list' ? 'bg-white shadow dark:bg-gray-600' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                title={t('lit.listView')}
                type="button"
              >
                <svg className="h-4 w-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
            {permissions?.canCreateProducts && (
              <button
                onClick={openCreateModal}
                type="button"
                className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <span className="text-base leading-none">+</span>
                {t('pages.products.newProduct')}
              </button>
            )}
          </div>
        </div>

        {error && !showModal && (
          <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
            {error}
          </div>
        )}

        {products.length > 0 && (
          <CollapsibleFilterPanel
            className="mb-2"
            title={t('lit.productFilters')}
            activeCount={[searchQuery.trim() ? 1 : 0, filterOrg ? 1 : 0].reduce((a, b) => a + b, 0)}
            onClear={resetListFilters}
            bodyClassName="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <input
                type="text"
                placeholder={t('lit.searchProducts')}
                value={searchQuery}
                onChange={(e) => setListFilters({ searchQuery: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <select
                value={filterOrg}
                onChange={(e) => setListFilters({ filterOrg: e.target.value })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">{t('lit.allOrganisations')}</option>
                {orgNames.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <select
                value={sortField}
                onChange={(e) => setListFilters({ sortField: e.target.value as ProductSortField })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="name">{t('lit.name')}</option>
                <option value="organization">{t('lit.organization')}</option>
                <option value="applications">{t('lit.applications')}</option>
                <option value="versions">{t('lit.versions')}</option>
                <option value="customers">{t('lit.customers')}</option>
              </select>
              <select
                value={sortDirection}
                onChange={(e) => setListFilters({ sortDirection: e.target.value as SortDirection })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="asc">{t('lit.ascending')}</option>
                <option value="desc">{t('lit.descending')}</option>
              </select>
            </div>
          </CollapsibleFilterPanel>
        )}

        {filteredAndSortedProducts.length === 0 ? (
          <EmptyState
            title={t('pages.products.noProducts')}
            message={t('lit.createAProductToGetStarted')}
            primaryAction={
              permissions?.canCreateProducts
                ? { label: t('pages.products.newProduct'), onClick: openCreateModal }
                : undefined
            }
          />
        ) : effectiveViewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAndSortedProducts.map((product) => (
              <div
                key={product.Id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                onClick={() => router.push(`/products/${product.Id}`)}
              >
                <div className="flex items-start gap-3">
                  {product.ImagePath ? (
                    <img
                      src={product.ImagePath}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                    />
                  ) : (
                    <span className="shrink-0 text-[var(--pm-muted)]">
                      <NavModuleIcon href="/products" size={28} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{product.Name}</h3>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-amber-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinned(product.Id);
                        }}
                        title={isPinned(product.Id) ? t('lit.unpin') : t('lit.pin')}
                      >
                        {isPinned(product.Id) ? <PinOff size={16} /> : <Pin size={16} />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{product.OrganizationName}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{product.ApplicationCount || 0} {t('lit.applications').toLowerCase()}</span>
                      <span>·</span>
                      <span>{product.VersionCount || 0} {t('lit.versions').toLowerCase()}</span>
                      <span>·</span>
                      <span>{product.CustomerCount || 0} {t('lit.customers').toLowerCase()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lit.name')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lit.organization')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lit.applications')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lit.versions')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lit.customers')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lit.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAndSortedProducts.map((product) => (
                  <tr
                    key={product.Id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
                    onClick={() => router.push(`/products/${product.Id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-gray-400 hover:text-amber-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinned(product.Id);
                          }}
                          title={isPinned(product.Id) ? t('lit.unpin') : t('lit.pin')}
                        >
                          {isPinned(product.Id) ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        {product.Name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{product.OrganizationName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{product.ApplicationCount || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{product.VersionCount || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{product.CustomerCount || 0}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          title={t('lit.open')}
                          aria-label={t('lit.open')}
                          className="p-1.5 text-gray-500 hover:text-blue-600"
                          onClick={() => router.push(`/products/${product.Id}`)}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                        {permissions?.canManageProducts && (
                          <button
                            type="button"
                            title={t('common.edit')}
                            aria-label={t('common.edit')}
                            className="p-1.5 text-gray-500 hover:text-blue-600"
                            onClick={() => openEditModal(product)}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {permissions?.canDeleteProducts && (
                          <button
                            type="button"
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                            className="p-1.5 text-gray-500 hover:text-red-600"
                            onClick={() => handleDelete(product)}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingProduct ? t('lit.editProduct') : t('pages.products.newProduct')}
                </h2>
                <button type="button" onClick={closeModal} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.name')} *</label>
                <input
                  type="text"
                  value={formData.Name}
                  onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.description')}</label>
                <textarea
                  value={formData.Description}
                  onChange={(e) => setFormData({ ...formData, Description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {!editingProduct && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('lit.organization')} *</label>
                  <select
                    value={formData.OrganizationId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        OrganizationId: Number(e.target.value),
                        ApplicationIds: [],
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  >
                    <option value={0}>{t('lit.selectOrganization')}</option>
                    {organizations.map((org) => (
                      <option key={org.Id} value={org.Id}>
                        {org.Name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={formData.IsCustomerSpecific}
                  onChange={(e) => setFormData({ ...formData, IsCustomerSpecific: e.target.checked })}
                  className="rounded"
                />
                {t('lit.customerSpecific')}
              </label>

              {!editingProduct && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('lit.productCatalog')}
                    </label>
                    <SearchableMultiSelect
                      options={orgApplications.map((app) => ({ value: app.Id, label: app.Name }))}
                      values={formData.ApplicationIds}
                      onChange={(ids) =>
                        setFormData({ ...formData, ApplicationIds: ids.map((id) => Number(id)) })
                      }
                      placeholder={t('lit.selectApplications')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('lit.customers')}
                    </label>
                    <SearchableMultiSelect
                      options={customers.map((c) => ({ value: c.Id, label: c.Name }))}
                      values={formData.CustomerIds}
                      onChange={(ids) =>
                        setFormData({ ...formData, CustomerIds: ids.map((id) => Number(id)) })
                      }
                      placeholder={t('lit.selectCustomers')}
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                >
                  {isSaving ? t('lit.saving') : t('common.save')}
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
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={confirmModal?.onConfirm}
        onClose={() => setConfirmModal(null)}
      />

      <ScrollToTopButton />
    </div>
  );
}
