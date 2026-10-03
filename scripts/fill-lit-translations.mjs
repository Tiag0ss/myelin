#!/usr/bin/env node
/**
 * Fill missing litPt/litEs/litFr values (still equal to English) via google-translate-api-x.
 * Updates lib/i18n/literalsCatalog.ts in place.
 */
import fs from 'fs';
import translate from 'google-translate-api-x';

const catalogPath = 'lib/i18n/literalsCatalog.ts';
const src = fs.readFileSync(catalogPath, 'utf8');

function parseBlock(name) {
  const m = src.match(new RegExp(`export const ${name}: LiteralMap = \\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`block ${name} missing`);
  const map = {};
  const r = /^\s*([A-Za-z_$][A-Za-z0-9_$]*|'((?:\\'|[^'])*)')\s*:\s*'((?:\\'|[^'])*)'/gm;
  let x;
  while ((x = r.exec(m[1]))) {
    const key = x[2] != null ? x[2].replace(/\\'/g, "'") : x[1];
    map[key] = x[3].replace(/\\'/g, "'");
  }
  return map;
}

const litEn = parseBlock('litEn');
const litPt = parseBlock('litPt');
const litEs = parseBlock('litEs');
const litFr = parseBlock('litFr');
const keys = Object.keys(litEn);

function skip(s) {
  if (!s || s.length <= 1) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(s)) return true;
  if (/^[0-9]+([.,][0-9]+)?%?$/.test(s)) return true;
  if (/^Ctrl\+/i.test(s)) return true;
  if (s === 'Myelin' || s === 'OK' || s === 'ID' || s === 'API' || s === 'CSV' || s === 'PDF') return true;
  return false;
}

const targets = {
  pt: { map: litPt, code: 'pt', missing: [] },
  es: { map: litEs, code: 'es', missing: [] },
  fr: { map: litFr, code: 'fr', missing: [] },
};

for (const key of keys) {
  const en = litEn[key];
  for (const lang of Object.keys(targets)) {
    if (skip(en)) {
      targets[lang].map[key] = en;
      continue;
    }
    if (!targets[lang].map[key] || targets[lang].map[key] === en) {
      targets[lang].missing.push(key);
    }
  }
}

console.log({
  keys: keys.length,
  missingPt: targets.pt.missing.length,
  missingEs: targets.es.missing.length,
  missingFr: targets.fr.missing.length,
});

async function translateBatch(texts, to) {
  // google-translate-api-x supports array
  const res = await translate(texts, { from: 'en', to, forceBatch: false });
  if (Array.isArray(res)) return res.map((r) => r.text);
  return [res.text];
}

const CHUNK = 40;
for (const lang of ['pt', 'es', 'fr']) {
  const miss = targets[lang].missing;
  for (let i = 0; i < miss.length; i += CHUNK) {
    const chunkKeys = miss.slice(i, i + CHUNK);
    const texts = chunkKeys.map((k) => litEn[k]);
    try {
      const out = await translateBatch(texts, targets[lang].code);
      chunkKeys.forEach((k, idx) => {
        targets[lang].map[k] = out[idx] || litEn[k];
      });
      console.log(lang, Math.min(i + CHUNK, miss.length), '/', miss.length);
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.error('fail', lang, i, e.message);
      await new Promise((r) => setTimeout(r, 2000));
      // retry once smaller
      for (const k of chunkKeys) {
        try {
          const r = await translate(litEn[k], { from: 'en', to: targets[lang].code });
          targets[lang].map[k] = r.text;
          await new Promise((x) => setTimeout(x, 150));
        } catch (e2) {
          console.error('skip', k, e2.message);
        }
      }
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
  const lines = keys.map((k) => {
    const left = isIdent(k) ? k : `'${esc(k)}'`;
    return `  ${left}: '${esc(map[k] ?? litEn[k])}',`;
  });
  return `export const ${name}: LiteralMap = {\n${lines.join('\n')}\n};\n`;
}

const header =
  `/** Key-based UI literals. Use t('lit.someKey') — never English source strings as keys. */\n` +
  `export type LiteralMap = Record<string, string>;\n\n`;

fs.writeFileSync(
  catalogPath,
  header +
    emit('litEn', litEn) +
    '\n' +
    emit('litPt', targets.pt.map) +
    '\n' +
    emit('litEs', targets.es.map) +
    '\n' +
    emit('litFr', targets.fr.map)
);

let same = { pt: 0, es: 0, fr: 0 };
for (const k of keys) {
  const en = litEn[k];
  if (targets.pt.map[k] === en && !skip(en)) same.pt++;
  if (targets.es.map[k] === en && !skip(en)) same.es++;
  if (targets.fr.map[k] === en && !skip(en)) same.fr++;
}
console.log('stillEqualEn', same);
console.log('wrote', catalogPath);
