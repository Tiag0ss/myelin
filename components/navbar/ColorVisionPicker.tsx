'use client';
import { useI18n } from '@/lib/i18n/provider';

import {
  COLOR_VISION_MODES,
  ColorVisionMode,
  setColorVisionMode,
} from '@/lib/colorVision';

const MODE_LABEL_KEYS: Record<ColorVisionMode, { short: string; full: string }> = {
  default: { short: 'lit.default', full: 'lit.defaultColorVision' },
  deuteranopia: { short: 'lit.deuter', full: 'lit.deuteranopiaRedGreen' },
  protanopia: { short: 'lit.protan', full: 'lit.protanopiaRedGreen' },
  tritanopia: { short: 'lit.tritan', full: 'lit.tritanopiaBlueYellow' },
};

interface ColorVisionPickerProps {
  colorVisionMode: ColorVisionMode;
  onChange: (mode: ColorVisionMode) => void;
}

export default function ColorVisionPicker({ colorVisionMode, onChange }: ColorVisionPickerProps) {
  const { t } = useI18n();

  return (
    <div className="px-4 py-2">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        {t('lit.colorVision')}
      </p>
      <div className="grid grid-cols-2 gap-1">
        {COLOR_VISION_MODES.map((mode) => {
          const labelKeys = MODE_LABEL_KEYS[mode];
          return (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setColorVisionMode(mode);
                onChange(mode);
              }}
              aria-label={t(labelKeys.full)}
              title={t(labelKeys.full)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${colorVisionMode === mode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
            >
              {t(labelKeys.short)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
