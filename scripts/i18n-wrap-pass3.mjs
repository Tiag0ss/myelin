#!/usr/bin/env node
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

const litEn = parseLit('litEn');
const litPt = parseLit('litPt');
const litEs = parseLit('litEs');
const litFr = parseLit('litFr');
const enToKey = new Map(Object.entries(litEn).map(([k, v]) => [v, k]));
const usedKeys = new Set(Object.keys(litEn));

// Prefer common.* for these
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
};

function ensureKey(english) {
  if (COMMON_MAP[english]) return null; // signal common
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

// Collect from targeted attrs + known leftover object names
const ATTRS = ['emptyText', 'confirmLabel', 'cancelLabel', 'placeholder', 'subtitle', 'aria-label'];
const candidates = new Set([
  'Time Entries',
  'Projects',
  'Task Allocations',
  'Tickets',
  'Dynamic Query Builder',
  'Time Entries + Call Records',
  'Description',
  'View Permissions',
  'Task Management',
  'Time Tracking',
  'Administration',
  'Customer Management',
  'Ticket Management',
  'Expense Management',
  'Recalculate Parent Hours',
  'Reassign from Planning',
  'Update Due Dates from Planning',
  'Sync Parent Status from Children',
  'Clear All Planning',
  'Suggested:',
  'h/day',
  'Hours/day (suggested)',
  'Start typing...',
  'No options available',
]);

for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const attr of ATTRS) {
    const re = new RegExp(`\\b${attr}=["']([^"']+)["']`, 'g');
    let m;
    while ((m = re.exec(s))) {
      const v = m[1].trim();
      if (!v || /^https?:|^#|^\d|^Ctrl/i.test(v)) continue;
      if (/^(Jira|GitHub|Gitea|Myelin|OK|Kanban|Gantt|Sprint)$/i.test(v)) continue;
      candidates.add(v);
    }
  }
  // name: 'English' in report/permission utilities
  const re2 = /\bname:\s*['"]([A-Z][^'"\n]{2,80})['"]/g;
  let m;
  while ((m = re2.exec(s))) {
    if (/^(Jira|GitHub|Myelin)$/.test(m[1])) continue;
    candidates.add(m[1]);
  }
}

for (const en of candidates) {
  if (!COMMON_MAP[en]) ensureKey(en);
}

let fileCount = 0;
let replaceCount = 0;

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;

  for (const attr of ATTRS) {
    const re = new RegExp(`\\b${attr}=["']([^"']+)["']`, 'g');
    s = s.replace(re, (full, raw) => {
      const v = raw.trim();
      if (!candidates.has(v) && !COMMON_MAP[v]) return full;
      if (/^(Jira|GitHub|Gitea|Myelin|OK|Kanban|Gantt|Sprint)$/i.test(v)) return full;
      const p = pathFor(v);
      replaceCount++;
      return `${attr}={t('${p}')}`;
    });
  }

  // name: 'X' -> name: t('...')
  s = s.replace(/\bname:\s*['"]([^'"\n]+)['"]/g, (full, raw) => {
    if (!candidates.has(raw)) return full;
    const p = pathFor(raw);
    replaceCount++;
    return `name: t('${p}')`;
  });

  // Specific planning leftovers
  s = s.replace(
    />Suggested:\s*\{([^}]+)\}\s*h\/day</g,
    `>{t('lit.suggested')}: {$1} {t('lit.hDay')}<`
  );
  s = s.replace(
    />h\/day</g,
    `>{t('lit.hDay')}<`
  );
  s = s.replace(
    /Suggested:\s*\{([^}]+)\}\s*h\/day/g,
    `{t('lit.suggested')}: {$1} {t('lit.hDay')}`
  );

  if (s !== before) {
    if (!s.includes("from '@/lib/i18n/provider'") && /\bt\('lit\.|\bt\('common\./.test(s)) {
      if (s.startsWith("'use client'") || s.startsWith('"use client"')) {
        const nl = s.indexOf('\n');
        s = s.slice(0, nl + 1) + "import { useI18n } from '@/lib/i18n/provider';\n" + s.slice(nl + 1);
      }
    }
    fs.writeFileSync(f, s);
    fileCount++;
  }
}

console.log({ candidates: candidates.size, fileCount, replaceCount, keys: Object.keys(litEn).length });

// Translate new/missing
const missing = { pt: [], es: [], fr: [] };
for (const [k, en] of Object.entries(litEn)) {
  if (/^(Jira|GitHub|OpenAI|Gitea|Bitbucket|Zoom|Google Meet|PROJ|Base JQL|Status|Util\. %|Est\.|total|Windows|Linux)/i.test(en)) continue;
  if (/^https?:|^gpt-|^vAI_|^o\d|^sk-|^smtp|^noreply|^xxxxxxxx|^myaccount/i.test(en)) continue;
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
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.error('fail', lang, e.message);
      for (const k of chunk) {
        try {
          const r = await translate(litEn[k], { from: 'en', to: code });
          target[k] = r.text;
          await new Promise((x) => setTimeout(x, 100));
        } catch {}
      }
    }
  }
}

await fill('pt', 'pt', missing.pt, litPt);
await fill('es', 'es', missing.es, litEs);
await fill('fr', 'fr', missing.fr, litFr);

// Manual curated PT for short UI bits
Object.assign(litPt, {
  hDay: 'h/dia',
  suggested: 'Sugerido',
  startTyping: litPt.startTyping?.includes('digit') ? litPt.startTyping : 'Comece a escrever...',
});
if (litEn.startTyping || litEn.startTyping2) {
  /* keep */
}
// ensure keys from slug
for (const [en, keyHint] of [
  ['h/day', 'hDay'],
  ['Suggested:', 'suggested'],
  ['Start typing...', 'startTyping'],
]) {
  const k = enToKey.get(en) || keyHint;
  if (litEn[k] == null && litEn[keyHint] == null) {
    litEn[k] = en;
  }
}

for (const k of Object.keys(litEn)) {
  let pt = litPt[k] || litEn[k];
  pt = String(pt)
    .replace(/Você não tem/g, 'Não tem')
    .replace(/\busuários?\b/gi, (m) => (/s$/i.test(m) ? 'utilizadores' : 'utilizador'))
    .replace(/\barquivos?\b/gi, (m) => (/s$/i.test(m) ? 'ficheiros' : 'ficheiro'))
    .replace(/\bsalvar\b/gi, 'guardar')
    .replace(/\bSalvar\b/g, 'Guardar')
    .replace(/\bdeletar\b/gi, 'eliminar')
    .replace(/\s{2,}/g, ' ')
    .trim();
  litPt[k] = toPreAo90(pt);
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function isIdent(k) {
  return /^[A-Za-z_$][\w$]*$/.test(k);
}
const keys = Object.keys(litEn).sort((a, b) => a.localeCompare(b));
function emit(name, obj) {
  return `export const ${name}: LiteralMap = {\n${keys
    .map((k) => `  ${isIdent(k) ? k : `'${esc(k)}'`}: '${esc(obj[k] ?? litEn[k])}',`)
    .join('\n')}\n};\n`;
}
const header =
  `/** Key-based UI literals. Use t('lit.someKey'). PT-PT uses pre-1990 orthography. */\n` +
  `export type LiteralMap = Record<string, string>;\n\n`;
fs.writeFileSync(
  'lib/i18n/literalsCatalog.ts',
  header + emit('litEn', litEn) + '\n' + emit('litPt', litPt) + '\n' + emit('litEs', litEs) + '\n' + emit('litFr', litFr)
);
console.log('wrote catalog', keys.length);
