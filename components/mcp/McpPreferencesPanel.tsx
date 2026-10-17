'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { useI18n } from '@/lib/i18n/provider';

export default function McpPreferencesPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [mcpWritesEnabled, setMcpWritesEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${getApiUrl()}/api/mcp/preferences`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || t('chrome.requestFailed'));
        }
        if (!cancelled) {
          setMcpWritesEnabled(!!data.data?.mcpWritesEnabled);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('chrome.requestFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const save = async (next: boolean) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${getApiUrl()}/api/mcp/preferences`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mcpWritesEnabled: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || t('chrome.requestFailed'));
      }
      setMcpWritesEnabled(!!data.data?.mcpWritesEnabled);
      setMessage(t('lit.mcpPreferencesSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chrome.requestFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-surface)] p-4">
      <h3 className="text-sm font-semibold text-[var(--pm-text)]">{t('lit.mcpSettingsTitle')}</h3>
      <p className="mt-1 text-xs text-[var(--pm-muted)]">{t('lit.mcpSettingsHint')}</p>
      {loading ? (
        <p className="mt-3 text-sm text-[var(--pm-muted)]">{t('common.loading')}</p>
      ) : (
        <label className="mt-3 flex items-start gap-2 text-sm text-[var(--pm-text)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={mcpWritesEnabled}
            disabled={saving}
            onChange={(e) => void save(e.target.checked)}
          />
          <span>{t('lit.mcpAllowWrites')}</span>
        </label>
      )}
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {message ? <p className="mt-2 text-sm text-green-600 dark:text-green-400">{message}</p> : null}
      <p className="mt-3 text-xs text-[var(--pm-muted)]">
        {t('lit.mcpEndpointHint', { path: '/api/mcp' })}
      </p>
      <p className="mt-1 text-xs text-[var(--pm-muted)]">{t('lit.mcpCursorConfigHint')}</p>
    </div>
  );
}
