/** Key-based UI literals. Data lives in ./locales/*.json (keeps Next/SWC heap sane). */
import litEnJson from './locales/litEn.json';
import litPtJson from './locales/litPt.json';
import litEsJson from './locales/litEs.json';
import litFrJson from './locales/litFr.json';

export type LiteralMap = Record<string, string>;

export const litEn: LiteralMap = litEnJson as LiteralMap;
export const litPt: LiteralMap = litPtJson as LiteralMap;
export const litEs: LiteralMap = litEsJson as LiteralMap;
export const litFr: LiteralMap = litFrJson as LiteralMap;
