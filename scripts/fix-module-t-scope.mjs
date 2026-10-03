#!/usr/bin/env node
import fs from 'fs';

const lit = fs.readFileSync('lib/i18n/literalsCatalog.ts', 'utf8');
const litEn = {};
const enB = lit.match(/export const litEn: LiteralMap = \{([\s\S]*?)\n\};/)[1];
const r = /^\s*([A-Za-z_$][\w$]*)\s*:\s*'((?:\\'|[^'])*)'/gm;
let m;
while ((m = r.exec(enB))) litEn[m[1]] = m[2].replace(/\\'/g, "'");

const files = [
  'app/dashboard/page.tsx',
  'app/profile/page.tsx',
  'app/reporting/page.tsx',
  'app/web-reports/page.tsx',
  'app/layout.tsx',
  'components/admin/SystemSettings.tsx',
  'components/admin/TaskFormVisibilityEditor.tsx',
  'components/CallRecordFormModal.tsx',
  'components/OrganizationIntegrationsPanel.tsx',
];

const helper = `
import { t as tPath } from '@/lib/i18n/messages';
import { readLocaleStorage, type Locale } from '@/lib/i18n/config';

function localeNow(): Locale {
  return (readLocaleStorage() as Locale) || 'en';
}
function t(path: string, vars?: Record<string, string | number>): string {
  return tPath(localeNow(), path, vars);
}
`;

function ensureModuleT(src) {
  if (/function t\(path: string/.test(src)) return src;
  let s = src;
  // strip duplicate imports if we inject helper block
  if (!s.includes("from '@/lib/i18n/messages'")) {
    if (s.startsWith("'use client'") || s.startsWith('"use client"')) {
      const nl = s.indexOf('\n');
      s = s.slice(0, nl + 1) + helper + s.slice(nl + 1);
    } else {
      s = helper + s;
    }
  } else if (!/function t\(path: string/.test(s)) {
    if (!s.includes('t as tPath')) {
      s = s.replace(
        /import \{([^}]*)\} from '@\/lib\/i18n\/messages';/,
        (all, inner) => `import { t as tPath, ${inner.trim()} } from '@/lib/i18n/messages';`
      );
    }
    if (!s.includes("from '@/lib/i18n/config'")) {
      s = s.replace(
        /from '@\/lib\/i18n\/messages';\n/,
        (m) => `${m}import { readLocaleStorage, type Locale } from '@/lib/i18n/config';\n`
      );
    }
    const insertAt = s.indexOf("from '@/lib/i18n/config';");
    if (insertAt >= 0) {
      const end = s.indexOf('\n', insertAt) + 1;
      s =
        s.slice(0, end) +
        `
function localeNow(): Locale {
  return (readLocaleStorage() as Locale) || 'en';
}
function t(path: string, vars?: Record<string, string | number>): string {
  return tPath(localeNow(), path, vars);
}
` +
        s.slice(end);
    }
  }
  return s;
}

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  const before = s;

  s = s.replace(/key:\s*t\('lit\.([^']+)'\)/g, (_, key) => {
    const en = litEn[key] || key;
    return `key: '${en.replace(/'/g, "\\'")}'`;
  });
  s = s.replace(/\b(field|FieldName|columnKey|dataKey|sortKey):\s*t\('lit\.([^']+)'\)/g, (_, prop, key) => {
    const en = litEn[key] || key;
    return `${prop}: '${en.replace(/'/g, "\\'")}'`;
  });

  if (/t\('lit\./.test(s) || /t\('common\./.test(s)) {
    s = ensureModuleT(s);
  }

  // Rename component hook destructure to avoid duplicate function t in same scope issues:
  // const { t } = useI18n() shadows module t — that's fine inside components.
  if (s !== before) {
    fs.writeFileSync(f, s);
    console.log('fixed', f);
  }
}
