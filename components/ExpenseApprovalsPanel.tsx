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
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import {
  Expense,
  listExpenses,
  approveExpense,
  recordReimbursement,
  listReimbursements,
  updateExpense,
  deleteExpense,
  getExpenseApprovalKpis,
  ExpenseReimbursementPayment,
  ExpenseApprovalKpis,
} from '@/lib/api/expenses';

const formatMoney = (value: number | string | null | undefined) => {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatReimbursementLabel = (expense: Expense) => {
  if (expense.ApprovalStatus === 'rejected' || expense.ReimbursementStatus === 'not_applicable') {
    return t('lit.notApplicable');
  }
  return expense.ReimbursementStatus.replace('_', ' ');
};

const resolveReimbursable = (expense: Expense) => {
  if (expense.ReimbursableAmount !== null && expense.ReimbursableAmount !== undefined) {
    return Number(expense.ReimbursableAmount);
  }
  return Number(expense.Amount);
};

const effectiveReimbursableCap = (expense: Expense) => {
  const base = resolveReimbursable(expense);
  const categoryMax =
    expense.CategoryMaxReimbursementAmount !== null &&
    expense.CategoryMaxReimbursementAmount !== undefined
      ? Number(expense.CategoryMaxReimbursementAmount)
      : null;
  if (categoryMax !== null && Number.isFinite(categoryMax)) {
    return Math.min(base, categoryMax, Number(expense.Amount));
  }
  return Math.min(base, Number(expense.Amount));
};

type ApprovalFilter = 'pending' | 'approved' | 'rejected' | 'all';
type ReimbursementFilter = '' | 'needs_reimbursement' | 'reimbursed' | 'partial' | 'pending' | 'not_required';

interface Props {
  token: string;
}

export default function ExpenseApprovalsPanel({ token }: Props) {
  const { t } = useI18n();

  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [kpis, setKpis] = useState<ExpenseApprovalKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<ApprovalFilter>('pending');
  const [filterReimbursement, setFilterReimbursement] = useState<ReimbursementFilter>('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [reimburseExpense, setReimburseExpense] = useState<Expense | null>(null);
  const [reimburseAmount, setReimburseAmount] = useState('');
  const [reimbursableCap, setReimbursableCap] = useState('');
  const [settleRemaining, setSettleRemaining] = useState(false);
  const [reimburseNotes, setReimburseNotes] = useState('');
  const [history, setHistory] = useState<ExpenseReimbursementPayment[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [adminEdit, setAdminEdit] = useState<Expense | null>(null);
  const [adminForm, setAdminForm] = useState({
    title: '',
    amount: '',
    reimbursableAmount: '',
    description: '',
    vendor: '',
    expenseDate: '',
    paidBy: 'employee' as 'employee' | 'company',
  });
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const data = await getExpenseApprovalKpis(token);
      setKpis(data);
    } catch {
      setKpis(null);
    } finally {
      setKpisLoading(false);
    }
  }, [token]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const rows = await listExpenses(token, {
        approvalStatus:
          filterReimbursement === 'needs_reimbursement'
            ? undefined
            : filterStatus === 'all'
              ? undefined
              : filterStatus,
        reimbursementStatus: filterReimbursement || undefined,
      });
      setExpenses(rows);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message || t('lit.failedToLoadExpenses'));
    } finally {
      setIsLoading(false);
    }
  }, [token, filterStatus, filterReimbursement]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadKpis()]);
  }, [load, loadKpis]);

  const pending = expenses.filter((e) => e.ApprovalStatus === 'pending');

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const batchApprove = async (status: 'approved' | 'rejected') => {
    setIsSaving(true);
    try {
      for (const id of selectedIds) {
        await approveExpense(token, id, status);
      }
      await refreshAll();
    } catch (err: any) {
      setError(err.message || t('lit.batchApprovalFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const openReimburse = async (expense: Expense) => {
    setReimburseExpense(expense);
    const cap = effectiveReimbursableCap(expense);
    const remaining = cap - Number(expense.ReimbursedAmount || 0);
    setReimbursableCap(cap.toFixed(2));
    setReimburseAmount(remaining > 0 ? remaining.toFixed(2) : '');
    setSettleRemaining(false);
    setReimburseNotes('');
    try {
      setHistory(await listReimbursements(token, expense.Id));
    } catch {
      setHistory([]);
    }
  };

  const submitReimburse = async () => {
    if (!reimburseExpense) return;
    setIsSaving(true);
    try {
      const cap = Number(reimbursableCap);
      const payment = Number(reimburseAmount);
      await recordReimbursement(token, reimburseExpense.Id, payment, reimburseNotes || undefined, {
        reimbursableAmount: Number.isFinite(cap) ? cap : undefined,
        settleRemaining: settleRemaining || undefined,
      });
      setReimburseExpense(null);
      await refreshAll();
    } catch (err: any) {
      setError(err.message || t('lit.reimbursementFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const openAdminEdit = (expense: Expense) => {
    setAdminEdit(expense);
    setAdminForm({
      title: expense.Title,
      amount: String(expense.Amount),
      reimbursableAmount: String(resolveReimbursable(expense)),
      description: expense.Description || '',
      vendor: expense.Vendor || '',
      expenseDate: String(expense.ExpenseDate).slice(0, 10),
      paidBy: expense.PaidBy || 'employee',
    });
  };

  const submitAdminEdit = async () => {
    if (!adminEdit) return;
    setIsSaving(true);
    try {
      await updateExpense(token, adminEdit.Id, {
        title: adminForm.title.trim(),
        amount: Number(adminForm.amount),
        reimbursableAmount: Number(adminForm.reimbursableAmount),
        description: adminForm.description || null,
        vendor: adminForm.vendor || null,
        expenseDate: adminForm.expenseDate,
        paidBy: adminForm.paidBy,
      });
      setAdminEdit(null);
      await refreshAll();
    } catch (err: any) {
      setError(err.message || t('lit.failedToUpdateExpense'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!kpisLoading && kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">⏳ Pending</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{kpis.pendingCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('lit.expensesAwaitingApproval')}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-green-600 dark:text-green-400 font-medium">✓ Approved</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{kpis.approvedCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              of {kpis.totalCount} total
              {kpis.rejectedCount > 0 ? ` · ${kpis.rejectedCount} rejected` : ''}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-amber-600 dark:text-amber-400 font-medium">💸 To reimburse</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
              {formatMoney(kpis.remainingToReimburse)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {kpis.needsReimbursementCount} expense{kpis.needsReimbursementCount !== 1 ? 's' : ''} outstanding
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">💰 Total Amount</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
              {formatMoney(kpis.totalAmount)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('lit.acrossAllExpensesInYourScope')}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as ApprovalFilter)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-2"
          >
            <option value="pending">{t('lit.pendingApproval')}</option>
            <option value="approved">{t('pages.approvals.approved')}</option>
            <option value="rejected">{t('pages.approvals.rejected')}</option>
            <option value="all">{t('lit.allApproval')}</option>
          </select>
          <select
            value={filterReimbursement}
            onChange={(e) => {
              const value = e.target.value as ReimbursementFilter;
              setFilterReimbursement(value);
              if (value === 'needs_reimbursement' || value === 'reimbursed') {
                setFilterStatus('approved');
              }
            }}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-2"
          >
            <option value="">{t('lit.allReimbursement')}</option>
            <option value="needs_reimbursement">{t('lit.needsReimbursement')}</option>
            <option value="reimbursed">{t('lit.reimbursed')}</option>
            <option value="partial">{t('lit.partial')}</option>
            <option value="pending">{t('lit.reimbursementPending')}</option>
            <option value="not_required">{t('lit.notRequired')}</option>
          </select>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {expenses.length} shown
            {filterStatus === 'pending' && !filterReimbursement ? ` · ${pending.length} pending` : ''}
          </span>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => batchApprove('approved')}
              className="h-10 px-4 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {t('lit.approveSelected')} ({selectedIds.size})
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => batchApprove('rejected')}
              className="h-10 px-4 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {t('lit.rejectSelected')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('lit.noExpensesInThisFilter')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    <span className="sr-only">{t('common.select')}</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common.date')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common.user')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('lit.title')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('lit.scope')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('pages.expenses.amount')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common.status')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {expenses.map((e) => {
                  const cap = effectiveReimbursableCap(e);
                  return (
                    <tr key={e.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-4 py-3">
                        {e.ApprovalStatus === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(e.Id)}
                            onChange={() => toggleSelect(e.Id)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                        {String(e.ExpenseDate).slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {e.SubmittedByFirstName || e.SubmittedByUsername}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <div className="font-medium">{e.Title}</div>
                        <div className="text-xs text-gray-500">{e.CategoryGroupName} / {e.CategoryName}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {e.ProjectName || <span className="italic text-gray-500">{t('lit.internal')}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-medium">
                        {formatMoney(e.Amount)}
                        {e.PaidBy === 'employee' && (
                          <div className="text-xs text-gray-500">
                            reimburse up to {formatMoney(cap)}
                            {e.CategoryMaxReimbursementAmount !== null &&
                              e.CategoryMaxReimbursementAmount !== undefined && (
                                <> (category cap {formatMoney(e.CategoryMaxReimbursementAmount)})</>
                              )}
                            {Number(e.ReimbursedAmount) > 0 && <> · paid {formatMoney(e.ReimbursedAmount)}</>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-gray-700 dark:text-gray-300">{e.ApprovalStatus}</div>
                        <div className="text-xs text-gray-500">{formatReimbursementLabel(e)}</div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {e.ApprovalStatus === 'pending' && (
                            <>
                              <button
                                type="button"
                                title={t('lit.approve')}
                                aria-label={t('lit.approve')}
                                onClick={() => approveExpense(token, e.Id, 'approved').then(refreshAll)}
                                className="p-1.5 text-gray-400 rounded hover:text-green-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button
                                type="button"
                                title={t('lit.reject')}
                                aria-label={t('lit.reject')}
                                onClick={() => approveExpense(token, e.Id, 'rejected').then(refreshAll)}
                                className="p-1.5 text-gray-400 rounded hover:text-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </>
                          )}
                          {e.ApprovalStatus === 'approved' && e.PaidBy === 'employee' && e.ReimbursementStatus !== 'reimbursed' && e.ReimbursementStatus !== 'not_required' && (
                            <button
                              type="button"
                              title={t('lit.reimburse')}
                              aria-label={t('lit.reimburse')}
                              onClick={() => openReimburse(e)}
                              className="p-1.5 text-gray-400 rounded hover:text-blue-600"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                          )}
                          {e.ApprovalStatus === 'rejected' && isAdmin && (
                            <button
                              type="button"
                              title={t('lit.revertToPending')}
                              aria-label={t('lit.revertToPending')}
                              onClick={() => approveExpense(token, e.Id, 'pending').then(refreshAll)}
                              className="p-1.5 text-gray-400 rounded hover:text-amber-600"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                            </button>
                          )}
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                title={t('lit.adminEdit')}
                                aria-label={t('lit.adminEdit')}
                                onClick={() => openAdminEdit(e)}
                                className="p-1.5 text-gray-400 rounded hover:text-blue-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button
                                type="button"
                                title={t('common.delete')}
                                aria-label={t('common.delete')}
                                onClick={() => setDeleteTarget(e)}
                                className="p-1.5 text-gray-400 rounded hover:text-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </>
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
      </div>

      {reimburseExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('lit.recordReimbursement')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{reimburseExpense.Title}</p>
            </div>
            <div className="p-6 space-y-3">
              <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <div>Expense total: {formatMoney(reimburseExpense.Amount)} (unchanged)</div>
                <div>Already paid: {formatMoney(reimburseExpense.ReimbursedAmount)}</div>
                {reimburseExpense.CategoryMaxReimbursementAmount !== null &&
                  reimburseExpense.CategoryMaxReimbursementAmount !== undefined && (
                    <div>
                      Category reimbursement cap: {formatMoney(reimburseExpense.CategoryMaxReimbursementAmount)}
                    </div>
                  )}
              </div>
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">{t('lit.amountToReimburseCap')}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={
                    reimburseExpense.CategoryMaxReimbursementAmount !== null &&
                    reimburseExpense.CategoryMaxReimbursementAmount !== undefined
                      ? Number(reimburseExpense.CategoryMaxReimbursementAmount)
                      : Number(reimburseExpense.Amount)
                  }
                  value={reimbursableCap}
                  onChange={(e) => {
                    let nextCap = Number(e.target.value);
                    const expenseTotal = Number(reimburseExpense.Amount);
                    const categoryMax =
                      reimburseExpense.CategoryMaxReimbursementAmount !== null &&
                      reimburseExpense.CategoryMaxReimbursementAmount !== undefined
                        ? Number(reimburseExpense.CategoryMaxReimbursementAmount)
                        : expenseTotal;
                    nextCap = Math.min(nextCap, expenseTotal, categoryMax);
                    setReimbursableCap(Number.isFinite(nextCap) ? String(nextCap) : e.target.value);
                    const already = Number(reimburseExpense.ReimbursedAmount || 0);
                    const rem = nextCap - already;
                    if (Number.isFinite(rem) && rem > 0) setReimburseAmount(rem.toFixed(2));
                  }}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('lit.cannotExceedTheCategoryCapOrExpenseTotalLowerToSettleForLessThanTheInvoiceAmount')}
                </span>
              </label>
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">{t('lit.thisPayment')}</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={reimburseAmount}
                  onChange={(e) => setReimburseAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
              </label>
              <label className="inline-flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={settleRemaining}
                  onChange={(e) => setSettleRemaining(e.target.checked)}
                  className="mt-1 rounded border-gray-300"
                />
                <span>
                  {t('lit.markAsFullySettledAfterThisPaymentNoFurtherReimbursementOwedEvenIfBelowExpenseTo')}
                </span>
              </label>
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">{t('lit.notes')}</span>
                <textarea
                  value={reimburseNotes}
                  onChange={(e) => setReimburseNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
              </label>
              {history.length > 0 && (
                <div className="text-xs text-gray-500 space-y-1">
                  {history.map((p) => (
                    <div key={p.Id}>{String(p.CreatedAt).slice(0, 10)} · {formatMoney(p.Amount)}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button type="button" onClick={() => setReimburseExpense(null)} className="h-10 px-4 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={isSaving || !reimburseAmount}
                onClick={submitReimburse}
                className="h-10 px-4 rounded-lg text-sm bg-blue-600 text-white disabled:opacity-50"
              >
                {t('lit.record')}
              </button>
            </div>
          </div>
        </div>
      )}

      {adminEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('lit.adminCorrection')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('lit.correctExpenseFieldsIfSomethingIsWrong')}</p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm sm:col-span-2">
                <span className="text-gray-700 dark:text-gray-300">{t('lit.title')}</span>
                <input
                  value={adminForm.title}
                  onChange={(e) => setAdminForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">{t('lit.expenseTotal')}</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={adminForm.amount}
                  onChange={(e) => setAdminForm((f) => ({ ...f, amount: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">{t('lit.amountToReimburse')}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adminForm.reimbursableAmount}
                  onChange={(e) => setAdminForm((f) => ({ ...f, reimbursableAmount: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">{t('common.date')}</span>
                <input
                  type="date"
                  value={adminForm.expenseDate}
                  onChange={(e) => setAdminForm((f) => ({ ...f, expenseDate: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">{t('lit.paidBy')}</span>
                <select
                  value={adminForm.paidBy}
                  onChange={(e) => setAdminForm((f) => ({ ...f, paidBy: e.target.value as 'employee' | 'company' }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                >
                  <option value="employee">{t('lit.employee')}</option>
                  <option value="company">{t('lit.company')}</option>
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-gray-700 dark:text-gray-300">{t('lit.vendor')}</span>
                <input
                  value={adminForm.vendor}
                  onChange={(e) => setAdminForm((f) => ({ ...f, vendor: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-gray-700 dark:text-gray-300">{t('common.description')}</span>
                <textarea
                  value={adminForm.description}
                  onChange={(e) => setAdminForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button type="button" onClick={() => setAdminEdit(null)} className="h-10 px-4 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={submitAdminEdit}
                className="h-10 px-4 rounded-lg text-sm bg-blue-600 text-white disabled:opacity-50"
              >
                {t('lit.saveCorrection')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmAlertModal
        isOpen={!!deleteTarget}
        type="confirm"
        title={t('lit.deleteExpense')}
        message={deleteTarget ? `Permanently delete "${deleteTarget.Title}"?` : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteExpense(token, deleteTarget.Id);
            setDeleteTarget(null);
            await refreshAll();
          } catch (err: any) {
            setError(err.message || t('lit.failedToDelete'));
            setDeleteTarget(null);
          }
        }}
        confirmLabel={t('common.delete')}
        confirmVariant="danger"
      />
    </div>
  );
}
