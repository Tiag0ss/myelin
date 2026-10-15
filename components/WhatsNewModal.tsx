'use client';

import { useI18n } from '@/lib/i18n/provider';
import type { WhatsNewEntry } from '@/lib/api/whatsNew';

type WhatsNewModalProps = {
  isOpen: boolean;
  mode: 'delta' | 'full';
  currentVersion: string;
  entries: WhatsNewEntry[];
  onClose: () => void;
  /** When true, primary button acknowledges (PATCH) — used for auto delta modal. */
  acknowledgeOnClose?: boolean;
  acknowledging?: boolean;
};

export default function WhatsNewModal({
  isOpen,
  mode,
  currentVersion,
  entries,
  onClose,
  acknowledgeOnClose = false,
  acknowledging = false,
}: WhatsNewModalProps) {
  const { t } = useI18n();

  if (!isOpen) return null;

  const title =
    mode === 'full'
      ? t('chrome.whatsNew')
      : t('lit.whatsNewSinceLastVisit');

  const primaryLabel = acknowledgeOnClose
    ? t('lit.whatsNewGotIt')
    : t('common.ok');

  const sorted = [...entries].sort((a, b) => {
    // Newest first for reading
    const pa = a.version.split('.').map((n) => parseInt(n, 10) || 0);
    const pb = b.version.split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i += 1) {
      const d = (pb[i] || 0) - (pa[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="flex max-h-[min(90vh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800"
      >
        <div className="border-b border-gray-200 px-4 py-4 sm:px-6 dark:border-gray-700">
          <h3
            id="whats-new-title"
            className="text-lg font-medium text-gray-900 dark:text-white"
          >
            {title}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t('lit.whatsNewCurrentVersion', { version: currentVersion })}
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {sorted.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('lit.whatsNewEmpty')}
            </p>
          ) : (
            sorted.map((entry) => (
              <section key={entry.version} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {entry.version}
                    {entry.title ? ` — ${entry.title}` : ''}
                  </h4>
                  {entry.date ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {entry.date}
                    </span>
                  ) : null}
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
                  {(entry.items || []).map((item, index) => (
                    <li key={`${entry.version}-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-4 py-4 sm:px-6 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={acknowledging}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {acknowledging ? t('lit.whatsNewSaving') : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
