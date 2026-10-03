import fs from 'fs';

const LOCALE_FILES = {
  litEn: 'lib/i18n/locales/litEn.json',
  litPt: 'lib/i18n/locales/litPt.json',
  litEs: 'lib/i18n/locales/litEs.json',
  litFr: 'lib/i18n/locales/litFr.json',
};

export function readLitMaps() {
  const out = {};
  for (const [name, file] of Object.entries(LOCALE_FILES)) {
    out[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return out;
}

export function writeLitMaps({ litEn, litPt, litEs, litFr }) {
  const maps = { litEn, litPt, litEs, litFr };
  for (const [name, map] of Object.entries(maps)) {
    // Stable key order for diffs
    const keys = Object.keys(map).sort((a, b) => a.localeCompare(b));
    const ordered = {};
    for (const k of keys) ordered[k] = map[k];
    fs.writeFileSync(LOCALE_FILES[name], JSON.stringify(ordered, null, 0) + '\n');
  }
}

export { LOCALE_FILES };
