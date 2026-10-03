'use client';
import { useI18n } from '@/lib/i18n/provider';

import React from 'react';

export function TaskDragActionModal({
  open,
  onAction,
  onCancel,
}: {
  open: boolean;
  onAction: (action: 'child' | 'reorder') => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  if (!open) return null;

  return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[130]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {t('lit.moveTask')}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {t('lit.howWouldYouLikeToMoveThisTask')}
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <button
                  type="button"
                  onClick={() => onAction('child')}
                  className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <div className="font-medium text-gray-900 dark:text-white">{t('lit.makeAsChildTask')}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t('lit.thisTaskWillBecomeASubtaskOfTheTargetTask')}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onAction('reorder')}
                  className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                >
                  <div className="font-medium text-gray-900 dark:text-white">{t('lit.reorderTask')}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t('lit.moveThisTaskToTheSameLevelAndPositionAsTheTargetTask')}
                  </div>
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>

  );
}
