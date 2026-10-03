#!/usr/bin/env node
/**
 * Wrap remaining hardcoded UI English strings as t('lit.key'),
 * extend literalsCatalog, translate new keys (PT pré-AO90 / ES / FR).
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
  const r = /^\s*([A-Za-z_$][\w$]*)\s*:\s*'((?:\\'|[^'])*)'/gm;
  let x;
  while ((x = r.exec(m[1]))) map[x[1]] = x[2].replace(/\\'/g, "'");
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
  if (!s || s.length < 2 || s.length > 160) return false;
  if (/^https?:|^#|^\/|^[a-z]+([A-Z][a-z]+)+$/.test(s)) return false; // urls / camelCase ids
  if (/^[a-z0-9_\-./:]+$/.test(s)) return false; // codes
  if (/^\$\{/.test(s)) return false;
  if (!/[A-Za-z]{3,}/.test(s)) return false;
  // must look like English UI (starts with letter, has space or common words)
  if (!/^[A-Za-zÀ-ÿ]/.test(s)) return false;
  if (s.includes('{') || s.includes('`')) return false;
  return true;
}

function skipKeepEnglish(s) {
  return (
    /^(Myelin|OK|ID|API|CSV|PDF|JSON|SQL|AI|KPI|SLA|URL|Jira|GitHub|Outlook|OpenAI|Linux|Windows|Global|Auto|Admin|Kanban|Gantt|Sprint|Backlog|AVG|Est\.|Util\. %|Total:|total|Vertical|Horizontal)$/i.test(
      s
    ) ||
    /^gpt-|^o\d|^sk-|^smtp\.|^noreply@|^xxxxxxxx|^myaccount\.|^0\.00|^\d+$/i.test(s)
  );
}

const litEn = parseLit('litEn');
const litPt = parseLit('litPt');
const litEs = parseLit('litEs');
const litFr = parseLit('litFr');

const enToKey = new Map();
for (const [k, v] of Object.entries(litEn)) {
  if (!enToKey.has(v)) enToKey.set(v, k);
}

const usedKeys = new Set(Object.keys(litEn));
function ensureKey(english) {
  if (enToKey.has(english)) return enToKey.get(english);
  let base = slugKey(english);
  let key = base;
  let n = 2;
  while (usedKeys.has(key) && litEn[key] !== english) {
    key = `${base}${n++}`;
  }
  usedKeys.add(key);
  enToKey.set(english, key);
  litEn[key] = english;
  litPt[key] = english;
  litEs[key] = english;
  litFr[key] = english;
  return key;
}

const files = [...walk('app'), ...walk('components')].filter((f) => !f.includes(`${path.sep}docs${path.sep}`));

// Collect candidates from common UI patterns
const candidates = new Set();
const collectRes = [
  /\b(?:label|title|placeholder|message|heading|description|emptyMessage|confirmTitle|confirmMessage|ariaLabel|buttonLabel|header|tooltip)\s*[:=]\s*'((?:\\'|[^'])*)'/g,
  /\b(?:label|title|placeholder|message|heading|description|emptyMessage|confirmTitle|confirmMessage|ariaLabel|buttonLabel|header|tooltip)\s*[:=]\s*"((?:\\"|[^"])*)"/g,
  /\b(?:showToast|setError|setSuccess|setMessage)\(\s*'((?:\\'|[^'])*)'/g,
  /\b(?:showToast|setError|setSuccess|setMessage)\(\s*"((?:\\"|[^"])*)"/g,
  /\bshowAlert\(\s*'((?:\\'|[^'])*)'\s*,\s*'((?:\\'|[^'])*)'/g,
  /\bshowAlert\(\s*"((?:\\"|[^"])*)"\s*,\s*"((?:\\"|[^"])*)"/g,
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
  // JSX leftover
  const jsxRe = /(?<!=)>(\s*)([A-Z][A-Za-z][^<>{]{2,80}?)(\s*)</g;
  let m;
  while ((m = jsxRe.exec(s))) {
    const en = m[2].trim().replace(/&apos;/g, "'");
    if (looksUiEnglish(en) && !skipKeepEnglish(en)) candidates.add(en);
  }
}

console.log('candidates', candidates.size);
for (const en of candidates) ensureKey(en);

// Rewrite files
let fileCount = 0;
let replaceCount = 0;

function replaceQuoted(src, quote, en, key) {
  const lit = quote === "'" ? en.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : en.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const from = `${quote}${lit}${quote}`;
  const to = `t('lit.${key}')`;
  let count = 0;
  let out = '';
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf(from, i);
    if (idx < 0) {
      out += src.slice(i);
      break;
    }
    // Don't replace inside t('...') already or import paths
    const before = src.slice(Math.max(0, idx - 12), idx);
    if (/t\(\s*$/.test(before) || /from\s+$/.test(before) || /import\s+$/.test(before)) {
      out += src.slice(i, idx + from.length);
      i = idx + from.length;
      continue;
    }
    // Prefer UI contexts: look back ~80 chars for keywords or JSX >
    const ctx = src.slice(Math.max(0, idx - 100), idx);
    const uiCtx =
      /\b(label|title|placeholder|message|heading|description|emptyMessage|confirmTitle|confirmMessage|showToast|setError|setSuccess|setMessage|showAlert|header|tooltip|aria-label|ariaLabel)\b/.test(
        ctx
      ) ||
      />\s*$/.test(ctx) ||
      /\{\s*$/.test(ctx);
    if (!uiCtx) {
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

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  let local = 0;
  // Longer strings first to avoid partial issues
  const list = [...candidates].sort((a, b) => b.length - a.length);
  for (const en of list) {
    const key = enToKey.get(en);
    const a = replaceQuoted(s, "'", en, key);
    s = a.src;
    local += a.count;
    const b = replaceQuoted(s, '"', en, key);
    s = b.src;
    local += b.count;
  }
  // JSX text with entities
  s = s.replace(
    /(?<!=)>(\s*)You don&apos;t have permission to view the planning page\.(\s*)</g,
    `>$1{t('lit.youDontHavePermissionToViewThePlanningPage')}$2<`
  );
  if (local > 0) {
    if (!s.includes("from '@/lib/i18n/provider'") && !s.includes('from "@/lib/i18n/provider"')) {
      if (s.startsWith("'use client'") || s.startsWith('"use client"')) {
        const nl = s.indexOf('\n');
        s = s.slice(0, nl + 1) + "import { useI18n } from '@/lib/i18n/provider';\n" + s.slice(nl + 1);
      }
    }
    if (/\bt\('lit\./.test(s) && !/useI18n\s*\(/.test(s) && !/t as tPath/.test(s)) {
      // inject into first exported component
      s = s.replace(/(export default function \w+[^{]*\{)/, '$1\n  const { t } = useI18n();\n');
      if (!/useI18n\s*\(/.test(s)) {
        s = s.replace(/(export function \w+[^{]*\{)/, '$1\n  const { t } = useI18n();\n');
      }
    }
    fs.writeFileSync(f, s);
    fileCount++;
    replaceCount += local;
  }
}

console.log({ fileCount, replaceCount, catalogKeys: Object.keys(litEn).length });

// Translate keys where PT/ES/FR still equal EN
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

async function fill(lang, code, arr, target) {
  const CHUNK = 40;
  for (let i = 0; i < arr.length; i += CHUNK) {
    const chunk = arr.slice(i, i + CHUNK);
    const texts = chunk.map((k) => litEn[k]);
    try {
      const res = await translate(texts, { from: 'en', to: code });
      const out = Array.isArray(res) ? res : [res];
      chunk.forEach((k, idx) => {
        target[k] = out[idx].text;
      });
      console.log(lang, Math.min(i + CHUNK, arr.length), '/', arr.length);
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      console.error('fail', lang, e.message);
      for (const k of chunk) {
        try {
          const r = await translate(litEn[k], { from: 'en', to: code });
          target[k] = r.text;
          await new Promise((x) => setTimeout(x, 120));
        } catch {}
      }
    }
  }
}

await fill('pt', 'pt', missing.pt, litPt);
await fill('es', 'es', missing.es, litEs);
await fill('fr', 'fr', missing.fr, litFr);

// PT cleanup + pré-AO
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
for (const k of keys) if (litPt[k] === litEn[k] && !skip(litEn[k])) same++;
console.log({ keys: keys.length, ptStillEn: same, sample: litPt.activeProjects, save: litPt.saveChanges });
