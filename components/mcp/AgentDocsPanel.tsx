'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { useI18n } from '@/lib/i18n/provider';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import PageTabs from '@/components/PageTabs';

type AgentDoc = {
  Id: number;
  Name: string;
  Slug: string;
  Content?: string | null;
  SortOrder?: number;
};

type Kind = 'skills' | 'rules';

export default function AgentDocsPanel({
  token,
  basePath,
  canManage,
}: {
  token: string;
  /** e.g. /api/organizations/3 or /api/applications/12 */
  basePath: string;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Kind>('skills');
  const [docs, setDocs] = useState<AgentDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AgentDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const formOpen = creating || !!editing;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${getApiUrl()}${basePath}/agent-${kind}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || t('chrome.requestFailed'));
      }
      setDocs(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setDocs([]);
      setError(err instanceof Error ? err.message : t('chrome.requestFailed'));
    } finally {
      setLoading(false);
    }
  }, [basePath, kind, token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setName('');
    setSlug('');
    setContent('');
    setFormError('');
  };

  const openEdit = (doc: AgentDoc) => {
    setCreating(false);
    setEditing(doc);
    setName(doc.Name || '');
    setSlug(doc.Slug || '');
    setContent(doc.Content || '');
    setFormError('');
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setFormError('');
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setFormError('');
    try {
      const isEdit = !!editing;
      const url = isEdit
        ? `${getApiUrl()}${basePath}/agent-${kind}/${editing.Id}`
        : `${getApiUrl()}${basePath}/agent-${kind}`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          content,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || t('chrome.requestFailed'));
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('chrome.requestFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    try {
      const res = await fetch(`${getApiUrl()}${basePath}/agent-${kind}/${deleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || t('chrome.requestFailed'));
      }
      setDeleteId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chrome.requestFailed'));
      setDeleteId(null);
    }
  };

  const modalTitle = editing
    ? kind === 'skills'
      ? t('lit.mcpEditAgentSkill')
      : t('lit.mcpEditAgentRule')
    : kind === 'skills'
      ? t('lit.mcpAddAgentSkill')
      : t('lit.mcpAddAgentRule');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <PageTabs
            tabs={[
              { id: 'skills', label: t('lit.mcpAgentSkills') },
              { id: 'rules', label: t('lit.mcpAgentRules') },
            ]}
            activeId={kind}
            onChange={(id) => {
              setKind(id as Kind);
              closeForm();
            }}
          />
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 shrink-0 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t('common.add')}
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('lit.mcpNoAgentDocs')}</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {docs.map((doc) => (
            <li key={doc.Id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white">{doc.Name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{doc.Slug}</p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                    onClick={() => openEdit(doc)}
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                    onClick={() => setDeleteId(doc.Id)}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {formOpen && canManage ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-doc-modal-title"
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
              <h2
                id="agent-doc-modal-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {modalTitle}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="text-2xl leading-none text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label={t('common.cancel')}
              >
                ×
              </button>
            </div>
            <div className="space-y-3 p-4">
              {formError ? (
                <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                  {formError}
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('common.name')}
                </label>
                <input
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('lit.mcpDocSlug')}
                </label>
                <input
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={t('lit.mcpDocSlugOptional')}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('lit.content')}
                </label>
                <textarea
                  className="min-h-[220px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={saving || !name.trim()}
                  onClick={() => void save()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {saving ? t('lit.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmAlertModal
        isOpen={deleteId != null}
        type="confirm"
        title={t('chrome.deleteConfirmTitle')}
        message={t('lit.mcpDeleteAgentDocConfirm')}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
