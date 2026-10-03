#!/usr/bin/env node
/**
 * Pass 4: wrap leftover UI English (toasts, alerts, errors, label maps, JSX).
 * Safer contexts only; then translate new lit keys (PT pré-AO90 / ES / FR).
 */
import fs from 'fs';
import path from 'path';
import translate from 'google-translate-api-x';
import { toPreAo90 } from './normalize-pt-pre-ao90.mjs';

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'docs' && dir.endsWith(`${path.sep}app`)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

function parseLit(name) {
  const src = fs.readFileSync('lib/i18n/literalsCatalog.ts', 'utf8');
  const m = src.match(new RegExp(`export const ${name}: LiteralMap = \\{([\\s\\S]*?)\\n\\};`));
  const map = {};
  const r = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(['"])((?:\\.|(?!\2).)*)\2\s*,?\s*$/gm;
  let x;
  while ((x = r.exec(m[1]))) {
    map[x[1]] = x[3].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  return map;
}

function slugKey(english) {
  let s = english
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();
  if (!s) s = 'literal';
  const parts = s.split(/\s+/).filter(Boolean);
  let key = parts
    .map((w, i) => {
      const lower = w.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  if (/^\d/.test(key)) key = `n${key}`;
  if (key.length > 72) key = key.slice(0, 72);
  return key;
}

function looksUiEnglish(s) {
  if (!s || s.length < 2 || s.length > 180) return false;
  if (/^https?:|^#|^\/|^[a-z]+([A-Z][a-z0-9]+)+$/.test(s)) return false;
  if (/^[a-z0-9_\-./:@]+$/.test(s)) return false;
  if (/^\$\{/.test(s)) return false;
  if (s.includes('{') || s.includes('`') || s.includes('${')) return false;
  if (!/[A-Za-z]{3,}/.test(s)) return false;
  if (!/^[A-Za-zÀ-ÿ]/.test(s)) return false;
  // reject code-like fragments
  if (/\.(length|map|filter|then)\b|\|\||&&|\(\s*$/.test(s)) return false;
  if (/^[a-z]+[A-Z]/.test(s) && !/\s/.test(s)) return false; // camelCase id
  return true;
}

function skipKeepEnglish(s) {
  return (
    /^(Myelin|OK|ID|API|CSV|PDF|JSON|SQL|AI|KPI|SLA|URL|Jira|GitHub|Outlook|OpenAI|Linux|Windows|Global|Auto|Admin|Kanban|Gantt|Sprint|Backlog|AVG|Est\.|Util\. %|Total:|total|Vertical|Horizontal|Developer|Support|Manager|Tickets|RAG|SSO|UTC|GMT|Bitbucket|Gitea|Zoom)$/i.test(
      s
    ) ||
    /^gpt-|^o\d|^sk-|^smtp\.|^noreply@|^xxxxxxxx|^myaccount\.|^0\.00|^\d+$|^PROJ$|^vAI_/i.test(s)
  );
}

const COMMON_MAP = {
  Delete: 'common.delete',
  Confirm: 'common.confirm',
  Cancel: 'common.cancel',
  Save: 'common.save',
  Close: 'common.close',
  Edit: 'common.edit',
  Add: 'common.add',
  Remove: 'common.remove',
  Clear: 'common.clear',
  Search: 'common.search',
  Filters: 'common.filters',
  Loading: 'common.loading',
  None: 'common.none',
  All: 'common.all',
  Yes: 'common.yes',
  No: 'common.no',
  Error: 'common.error',
};

const litEn = parseLit('litEn');
const litPt = parseLit('litPt');
const litEs = parseLit('litEs');
const litFr = parseLit('litFr');

// Drop garbage keys that look like code
for (const k of Object.keys(litEn)) {
  const v = litEn[k];
  if (/\.(length|map)\b|\|\||&&/.test(v) || /Preview\.length/.test(v)) {
    delete litEn[k];
    delete litPt[k];
    delete litEs[k];
    delete litFr[k];
    console.log('drop garbage key', k);
  }
}

const enToKey = new Map();
for (const [k, v] of Object.entries(litEn)) {
  if (!enToKey.has(v)) enToKey.set(v, k);
}
const usedKeys = new Set(Object.keys(litEn));

function ensureKey(english) {
  if (COMMON_MAP[english]) return null;
  if (enToKey.has(english)) return enToKey.get(english);
  let base = slugKey(english);
  let key = base;
  let n = 2;
  while (usedKeys.has(key) && litEn[key] !== english) key = `${base}${n++}`;
  usedKeys.add(key);
  enToKey.set(english, key);
  litEn[key] = english;
  litPt[key] = english;
  litEs[key] = english;
  litFr[key] = english;
  return key;
}

function pathFor(english) {
  if (COMMON_MAP[english]) return COMMON_MAP[english];
  return `lit.${ensureKey(english)}`;
}

const files = [...walk('app'), ...walk('components')].filter((f) => !f.includes(`${path.sep}docs${path.sep}`));

const candidates = new Set();
const collectRes = [
  /\b(?:label|title|placeholder|message|heading|description|emptyMessage|emptyText|confirmTitle|confirmMessage|confirmLabel|cancelLabel|ariaLabel|buttonLabel|header|tooltip|subtitle|alt)\s*[:=]\s*'((?:\\'|[^'])*)'/g,
  /\b(?:label|title|placeholder|message|heading|description|emptyMessage|emptyText|confirmTitle|confirmMessage|confirmLabel|cancelLabel|ariaLabel|buttonLabel|header|tooltip|subtitle|alt)\s*[:=]\s*"((?:\\"|[^"])*)"/g,
  /\b(?:showToast|setError|setSuccess|setMessage|showAlert)\(\s*'((?:\\'|[^'])*)'/g,
  /\b(?:showToast|setError|setSuccess|setMessage|showAlert)\(\s*"((?:\\"|[^"])*)"/g,
  /\bshowAlert\(\s*'((?:\\'|[^'])*)'\s*,\s*'((?:\\'|[^'])*)'/g,
  /\bshowAlert\(\s*"((?:\\"|[^"])*)"\s*,\s*"((?:\\"|[^"])*)"/g,
  /\bthrow new Error\(\s*'((?:\\'|[^'])*)'/g,
  /\bthrow new Error\(\s*"((?:\\"|[^"])*)"/g,
  /\|\|\s*'((?:\\'|[^'])*)'/g,
  /\|\|\s*"((?:\\"|[^"])*)"/g,
  // label maps: 'FieldKey': 'Display Label'
  /['"][A-Za-z][A-Za-z0-9_]*['"]\s*:\s*'([A-Z](?:\\'|[^']){2,})'/g,
  /['"][A-Za-z][A-Za-z0-9_]*['"]\s*:\s*"([A-Z](?:\\"|[^"]){2,})"/g,
];

for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const re of collectRes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      for (let i = 1; i < m.length; i++) {
        if (!m[i]) continue;
        const en = m[i].replace(/\\'/g, "'").replace(/\\"/g, '"');
        if (looksUiEnglish(en) && !skipKeepEnglish(en)) candidates.add(en);
      }
    }
  }
  const jsxRe = /(?<!=)>(\s*)([A-Z][A-Za-z][^<>{]{2,100}?)(\s*)</g;
  let m;
  while ((m = jsxRe.exec(s))) {
    const en = m[2].trim().replace(/&apos;/g, "'").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"');
    if (looksUiEnglish(en) && !skipKeepEnglish(en)) candidates.add(en);
  }
}

console.log('candidates', candidates.size);
for (const en of candidates) {
  if (!COMMON_MAP[en]) ensureKey(en);
}

function isUiContext(src, idx) {
  const ctx = src.slice(Math.max(0, idx - 160), idx);
  if (
    /\b(label|title|placeholder|message|heading|description|emptyMessage|emptyText|confirmTitle|confirmMessage|confirmLabel|cancelLabel|showToast|setError|setSuccess|setMessage|showAlert|header|tooltip|aria-label|ariaLabel|subtitle|alt|throw new Error)\b/.test(
      ctx
    )
  ) {
    return true;
  }
  if (/>\s*$/.test(ctx) || /\{\s*$/.test(ctx)) return true;
  if (/\?\s*$/.test(ctx)) return true;
  // || 'fallback'
  if (/\|\|\s*$/.test(ctx)) {
    // only common display fallbacks
    return true;
  }
  // label map value
  if (/['"][A-Za-z][A-Za-z0-9_]*['"]\s*:\s*$/.test(ctx)) return true;
  return false;
}

function replaceQuoted(src, quote, en, tPath) {
  const lit =
    quote === "'"
      ? en.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      : en.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const from = `${quote}${lit}${quote}`;
  const to = `t('${tPath}')`;
  let count = 0;
  let out = '';
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf(from, i);
    if (idx < 0) {
      out += src.slice(i);
      break;
    }
    const before = src.slice(Math.max(0, idx - 12), idx);
    if (/(?:^|[^A-Za-z0-9_])t\(\s*$/.test(before) || /from\s+$/.test(before) || /import\s+$/.test(before)) {
      out += src.slice(i, idx + from.length);
      i = idx + from.length;
      continue;
    }
    // Don't wrap object keys
    const after = src.slice(idx + from.length, idx + from.length + 3);
    if (/^\s*:/.test(after) && !isUiContext(src, idx)) {
      out += src.slice(i, idx + from.length);
      i = idx + from.length;
      continue;
    }
    if (!isUiContext(src, idx)) {
      out += src.slice(i, idx + from.length);
      i = idx + from.length;
      continue;
    }
    out += src.slice(i, idx) + to;
    i = idx + from.length;
    count++;
  }
  return { src: out, count };
}

let fileCount = 0;
let replaceCount = 0;
const list = [...candidates].sort((a, b) => b.length - a.length);

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  let local = 0;
  for (const en of list) {
    const tPath = pathFor(en);
    const a = replaceQuoted(s, "'", en, tPath);
    s = a.src;
    local += a.count;
    const b = replaceQuoted(s, '"', en, tPath);
    s = b.src;
    local += b.count;
  }
  // JSX text nodes
  s = s.replace(/(?<!=)>(\s*)([A-Z][A-Za-z][^<>{]{2,100}?)(\s*)</g, (full, a, text, c) => {
    const en = text.trim().replace(/&apos;/g, "'");
    if (!candidates.has(en) && !(looksUiEnglish(en) && !skipKeepEnglish(en))) return full;
    if (!looksUiEnglish(en) || skipKeepEnglish(en)) return full;
    const tPath = pathFor(en);
    local++;
    return `>${a}{t('${tPath}')}${c}<`;
  });

  if (local > 0) {
    if (!s.includes("from '@/lib/i18n/provider'") && !s.includes('from "@/lib/i18n/provider"')) {
      if (s.startsWith("'use client'") || s.startsWith('"use client"')) {
        const nl = s.indexOf('\n');
        s = s.slice(0, nl + 1) + "import { useI18n } from '@/lib/i18n/provider';\n" + s.slice(nl + 1);
      }
    }
    if (/\bt\('(?:lit|common)\./.test(s) && !/useI18n\s*\(/.test(s) && !/function t\(path: string/.test(s)) {
      s = s.replace(/(export default function \w+[^{]*\{)/, '$1\n  const { t } = useI18n();\n');
      if (!/useI18n\s*\(/.test(s) && !/function t\(path: string/.test(s)) {
        s = s.replace(/(export function \w+[^{]*\{)/, '$1\n  const { t } = useI18n();\n');
      }
    }
    s = s.replace(/(\s)([A-Za-z_:][A-Za-z0-9_:-]*)=t\((['"](?:lit|common)\.[^'"]+['"])\)(?!\s*\})/g, '$1$2={t($3)}');
    fs.writeFileSync(f, s);
    fileCount++;
    replaceCount += local;
  }
}

console.log({ fileCount, replaceCount, catalogKeys: Object.keys(litEn).length });

function skip(s) {
  return skipKeepEnglish(s) || !looksUiEnglish(s);
}
const missing = { pt: [], es: [], fr: [] };
for (const [k, en] of Object.entries(litEn)) {
  if (skip(en)) continue;
  if (!litPt[k] || litPt[k] === en) missing.pt.push(k);
  if (!litEs[k] || litEs[k] === en) missing.es.push(k);
  if (!litFr[k] || litFr[k] === en) missing.fr.push(k);
}
console.log('missing', { pt: missing.pt.length, es: missing.es.length, fr: missing.fr.length });

// Apply exact overrides first
for (const [lang, file, target] of [
  ['pt', 'scripts/i18n-exact-pt.json', litPt],
  ['es', 'scripts/i18n-exact-es.json', litEs],
  ['fr', 'scripts/i18n-exact-fr.json', litFr],
]) {
  if (!fs.existsSync(file)) continue;
  const exact = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [en, tr] of Object.entries(exact)) {
    const key = enToKey.get(en);
    if (key) target[key] = tr;
  }
}

async function fill(lang, code, arr, target) {
  const CHUNK = 35;
  for (let i = 0; i < arr.length; i += CHUNK) {
    const chunk = arr.slice(i, i + CHUNK);
    // re-skip if exact already filled
    const need = chunk.filter((k) => !target[k] || target[k] === litEn[k]);
    if (!need.length) continue;
    const texts = need.map((k) => litEn[k]);
    try {
      const res = await translate(texts, { from: 'en', to: code });
      const out = Array.isArray(res) ? res : [res];
      need.forEach((k, idx) => {
        target[k] = out[idx].text;
      });
      console.log(lang, Math.min(i + CHUNK, arr.length), '/', arr.length);
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.error('fail', lang, e.message);
      for (const k of need) {
        try {
          const r = await translate(litEn[k], { from: 'en', to: code });
          target[k] = r.text;
          await new Promise((x) => setTimeout(x, 150));
        } catch {}
      }
    }
  }
}

await fill('pt', 'pt', missing.pt, litPt);
await fill('es', 'es', missing.es, litEs);
await fill('fr', 'fr', missing.fr, litFr);

function brCleanup(t) {
  return String(t)
    .replace(/Você não tem/g, 'Não tem')
    .replace(/\bvocê\b/gi, '')
    .replace(/\busuários?\b/gi, (m) => (/s$/i.test(m) ? 'utilizadores' : 'utilizador'))
    .replace(/\bUsuários?\b/g, (m) => (m.endsWith('s') ? 'Utilizadores' : 'Utilizador'))
    .replace(/\barquivos?\b/gi, (m) => (/s$/i.test(m) ? 'ficheiros' : 'ficheiro'))
    .replace(/\bsalvar\b/gi, 'guardar')
    .replace(/\bSalvar\b/g, 'Guardar')
    .replace(/\btela\b/gi, 'ecrã')
    .replace(/\bsenha\b/gi, 'palavra-passe')
    .replace(/\bdeletar\b/gi, 'eliminar')
    .replace(/\bGerenciamento\b/g, 'Gestão')
    .replace(/\bgerenciamento\b/g, 'gestão')
    .replace(/\bingressos?\b/gi, (m) => (/s$/i.test(m) ? 'tickets' : 'ticket'))
    .replace(/\s{2,}/g, ' ')
    .trim();
}
for (const k of Object.keys(litEn)) {
  litPt[k] = toPreAo90(brCleanup(litPt[k] || litEn[k]));
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function isIdent(k) {
  return /^[A-Za-z_$][\w$]*$/.test(k);
}
const keys = Object.keys(litEn).sort((a, b) => a.localeCompare(b));
function emit(name, obj) {
  const lines = keys.map((k) => {
    const left = isIdent(k) ? k : `'${esc(k)}'`;
    return `  ${left}: '${esc(obj[k] ?? litEn[k])}',`;
  });
  return `export const ${name}: LiteralMap = {\n${lines.join('\n')}\n};\n`;
}
const header =
  `/** Key-based UI literals. Use t('lit.someKey'). PT-PT uses pre-1990 orthography. */\n` +
  `export type LiteralMap = Record<string, string>;\n\n`;
fs.writeFileSync(
  'lib/i18n/literalsCatalog.ts',
  header + emit('litEn', litEn) + '\n' + emit('litPt', litPt) + '\n' + emit('litEs', litEs) + '\n' + emit('litFr', litFr)
);

let same = 0;
const sameSamples = [];
for (const k of keys) {
  if (litPt[k] === litEn[k] && !skip(litEn[k])) {
    same++;
    if (sameSamples.length < 15) sameSamples.push(k);
  }
}
console.log({ keys: keys.length, ptStillEn: same, sameSamples });
