#!/usr/bin/env node
/**
 * Migrate English-as-key tl('Save Changes') → t('lit.saveChanges')
 * and rewrite literalsCatalog to stable camelCase keys.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const structured = JSON.parse(fs.readFileSync('/tmp/i18n-structured-map.json', 'utf8'));
const exactPt = JSON.parse(fs.readFileSync('scripts/i18n-exact-pt.json', 'utf8'));
const exactEs = JSON.parse(fs.readFileSync('scripts/i18n-exact-es.json', 'utf8'));
const exactFr = JSON.parse(fs.readFileSync('scripts/i18n-exact-fr.json', 'utf8'));
const cache = fs.existsSync('lib/i18n/.lit-translate-cache.json')
  ? JSON.parse(fs.readFileSync('lib/i18n/.lit-translate-cache.json', 'utf8'))
  : { pt: {}, es: {}, fr: {} };

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'docs' && dir.endsWith(`${path.sep}app`)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(e.name) && !p.includes(`${path.sep}i18n${path.sep}`)) acc.push(p);
  }
  return acc;
}

function slugKey(english) {
  let s = english
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/&apos;/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();
  if (!s) s = 'literal';
  const parts = s.split(/\s+/).filter(Boolean);
  let key = parts
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  if (/^\d/.test(key)) key = `n${key}`;
  if (key.length > 80) key = key.slice(0, 80);
  return key;
}

function looksNonTranslatable(s) {
  if (!s || s.length <= 1) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(s)) return true;
  if (/^[0-9]+([.,][0-9]+)?%?$/.test(s)) return true;
  if (/^x{2,}(-x+)+\b/i.test(s)) return true;
  return false;
}

// Collect english strings from source + old catalog
const englishSet = new Set();
const files = [...walk('app'), ...walk('components')];
for (const f of files) {
  if (f.includes(`${path.sep}docs${path.sep}`)) continue;
  const src = fs.readFileSync(f, 'utf8');
  for (const re of [/\btl\(\s*'((?:\\'|[^'])*)'\s*(?:,|\))/g, /\btl\(\s*"((?:\\"|[^"])*)"\s*(?:,|\))/g]) {
    let m;
    while ((m = re.exec(src))) {
      englishSet.add(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
    }
  }
}

const oldCat = fs.readFileSync('lib/i18n/literalsCatalog.ts', 'utf8');
const oldEn = oldCat.match(/export const litEn: LiteralMap = \{([\s\S]*?)\n\};/)?.[1] || '';
const oldPt = oldCat.match(/export const litPt: LiteralMap = \{([\s\S]*?)\n\};/)?.[1] || '';
const oldEs = oldCat.match(/export const litEs: LiteralMap = \{([\s\S]*?)\n\};/)?.[1] || '';
const oldFr = oldCat.match(/export const litFr: LiteralMap = \{([\s\S]*?)\n\};/)?.[1] || '';
function parseMap(block) {
  const map = {};
  const r = /^\s+'((?:\\'|[^'])*)'\s*:\s*'((?:\\'|[^'])*)'/gm;
  let m;
  while ((m = r.exec(block))) {
    map[m[1].replace(/\\'/g, "'")] = m[2].replace(/\\'/g, "'");
  }
  return map;
}
const prev = {
  en: parseMap(oldEn),
  pt: parseMap(oldPt),
  es: parseMap(oldEs),
  fr: parseMap(oldFr),
};
for (const k of Object.keys(prev.en)) englishSet.add(k);

// Build english -> key OR structured path
const enToKey = new Map(); // english -> lit.key (without lit. prefix) OR null if structured
const enToPath = new Map(); // english -> full t() path
const keyToEn = new Map();
const usedKeys = new Set();

const sortedEn = [...englishSet].sort((a, b) => a.localeCompare(b));
for (const en of sortedEn) {
  if (structured[en]) {
    enToPath.set(en, structured[en]);
    continue;
  }
  if (looksNonTranslatable(en)) {
    // keep as lit key that maps to itself in all langs
  }
  let base = slugKey(en);
  let key = base;
  let n = 2;
  while (usedKeys.has(key) && keyToEn.get(key) !== en) {
    key = `${base}${n++}`;
  }
  usedKeys.add(key);
  keyToEn.set(key, en);
  enToKey.set(en, key);
  enToPath.set(en, `lit.${key}`);
}

function pickTranslation(en, lang) {
  if (looksNonTranslatable(en)) return en;
  const exact = lang === 'pt' ? exactPt : lang === 'es' ? exactEs : exactFr;
  if (exact[en] && exact[en] !== en) return exact[en];
  if (cache[lang]?.[en] && cache[lang][en] !== en && !/MYMEMORY WARNING/i.test(cache[lang][en])) {
    return cache[lang][en];
  }
  if (prev[lang]?.[en] && prev[lang][en] !== en) return prev[lang][en];
  return null; // missing — filled later
}

const litKeys = [...keyToEn.keys()].sort();
const litEn = {};
const litPt = {};
const litEs = {};
const litFr = {};
const missing = { pt: [], es: [], fr: [] };

for (const key of litKeys) {
  const en = keyToEn.get(key);
  litEn[key] = en;
  for (const lang of ['pt', 'es', 'fr']) {
    const tr = pickTranslation(en, lang);
    if (tr) {
      if (lang === 'pt') litPt[key] = tr;
      if (lang === 'es') litEs[key] = tr;
      if (lang === 'fr') litFr[key] = tr;
    } else {
      missing[lang].push(en);
      if (lang === 'pt') litPt[key] = en;
      if (lang === 'es') litEs[key] = en;
      if (lang === 'fr') litFr[key] = en;
    }
  }
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isIdent(k) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k);
}

function emit(name, map) {
  const lines = litKeys.map((k) => {
    const left = isIdent(k) ? k : `'${esc(k)}'`;
    return `  ${left}: '${esc(map[k])}',`;
  });
  return `export const ${name}: LiteralMap = {\n${lines.join('\n')}\n};\n`;
}

const header =
  `/** Key-based UI literals. Use t('lit.someKey') — never English source strings as keys. */\n` +
  `export type LiteralMap = Record<string, string>;\n\n`;

fs.writeFileSync(
  'lib/i18n/literalsCatalog.ts',
  header + emit('litEn', litEn) + '\n' + emit('litPt', litPt) + '\n' + emit('litEs', litEs) + '\n' + emit('litFr', litFr)
);

// Rewrite call sites: tl('...') / tl("...") → t('path')
let fileCount = 0;
let replaceCount = 0;
for (const f of files) {
  if (f.includes(`${path.sep}docs${path.sep}`)) continue;
  let src = fs.readFileSync(f, 'utf8');
  const before = src;
  src = src.replace(/\btl\(\s*'((?:\\'|[^'])*)'\s*\)/g, (_, raw) => {
    const en = raw.replace(/\\'/g, "'");
    const p = enToPath.get(en);
    if (!p) return `t('lit.missing') /* TODO: ${raw} */`;
    replaceCount++;
    return `t('${p}')`;
  });
  src = src.replace(/\btl\(\s*"((?:\\"|[^"])*)"\s*\)/g, (_, raw) => {
    const en = raw.replace(/\\"/g, '"');
    const p = enToPath.get(en);
    if (!p) return `t('lit.missing') /* TODO */`;
    replaceCount++;
    return `t('${p}')`;
  });
  src = src.replace(/\btl\(\s*'((?:\\'|[^'])*)'\s*,\s*(\{[^}]*\})\s*\)/g, (_, raw, vars) => {
    const en = raw.replace(/\\'/g, "'");
    const p = enToPath.get(en) || 'lit.missing';
    replaceCount++;
    return `t('${p}', ${vars})`;
  });
  // destructuring: const { t, tl } → const { t }
  src = src.replace(/const \{ t, tl \} = useI18n\(\);/g, 'const { t } = useI18n();');
  src = src.replace(/const \{ tl, t \} = useI18n\(\);/g, 'const { t } = useI18n();');
  src = src.replace(/const \{ t, locale, setLocale, tl \} = useI18n\(\);/g, 'const { t, locale, setLocale } = useI18n();');
  src = src.replace(/const \{ locale, setLocale, t, tl \} = useI18n\(\);/g, 'const { locale, setLocale, t } = useI18n();');
  src = src.replace(/const \{ tl \} = useI18n\(\);/g, 'const { t } = useI18n();');
  if (src !== before) {
    fs.writeFileSync(f, src);
    fileCount++;
  }
}

// Update messages.ts / provider: keep tl as thin alias that ONLY accepts keys under lit. for safety during transition — actually remove english lookup
const messagesPath = 'lib/i18n/messages.ts';
let messages = fs.readFileSync(messagesPath, 'utf8');
messages = messages.replace(
  /\/\*\* Translate a UI literal \(English source\) via the literals catalog\. \*\/\nexport function tl\(locale: Locale, english: string, vars\?: Record<string, string \| number>\): string \{\n  const raw = catalogs\[locale\]\.lit\[english\] \?\? catalogs\.en\.lit\[english\] \?\? english;\n  let s = String\(raw\);\n  if \(vars\) \{\n    for \(const \[k, v\] of Object\.entries\(vars\)\) \{\n      s = s\.replace\(new RegExp\(`\\\$\{k\\\}`, 'g'\), String\(v\)\);\n    \}\n  \}\n  return s;\n\}/,
  `/** @deprecated Use t('lit.key') or t('common.key'). Kept as alias: tl(locale, 'key') looks up lit[key]. */\nexport function tl(locale: Locale, key: string, vars?: Record<string, string | number>): string {\n  if (key.includes('.')) return t(locale, key, vars);\n  return t(locale, \`lit.\${key}\`, vars);\n}`
);
// simpler replace if regex fails
if (messages.includes('catalogs[locale].lit[english]')) {
  messages = messages.replace(
    /\/\*\* Translate a UI literal[\s\S]*?^}/m,
    `/** Prefer t('lit.someKey'). Alias: bare key resolves under lit.* */\nexport function tl(locale: Locale, key: string, vars?: Record<string, string | number>): string {\n  if (key.includes('.')) return t(locale, key, vars);\n  return t(locale, \`lit.\${key}\`, vars);\n}`
  );
}
fs.writeFileSync(messagesPath, messages);

const providerPath = 'lib/i18n/provider.tsx';
let provider = fs.readFileSync(providerPath, 'utf8');
provider = provider.replace(
  /\/\*\* Translate an English UI literal \(tooltips, aria-labels, placeholders\)\. \*\//,
  `/** @deprecated Prefer t('lit.key') / t('common.key'). */`
);
fs.writeFileSync(providerPath, provider);

// Persist mapping for translate fill step
fs.writeFileSync(
  'lib/i18n/.lit-key-map.json',
  JSON.stringify(
    {
      enToPath: Object.fromEntries(enToPath),
      keyToEn: Object.fromEntries(keyToEn),
      missing,
      stats: {
        english: sortedEn.length,
        litKeys: litKeys.length,
        structuredMapped: [...enToPath.values()].filter((p) => !p.startsWith('lit.')).length,
        filesChanged: fileCount,
        replacements: replaceCount,
        missingPt: missing.pt.length,
        missingEs: missing.es.length,
        missingFr: missing.fr.length,
      },
    },
    null,
    2
  )
);

console.log({
  english: sortedEn.length,
  litKeys: litKeys.length,
  structuredMapped: [...enToPath.values()].filter((p) => !p.startsWith('lit.')).length,
  filesChanged: fileCount,
  replacements: replaceCount,
  missingPt: missing.pt.length,
  missingEs: missing.es.length,
  missingFr: missing.fr.length,
});
