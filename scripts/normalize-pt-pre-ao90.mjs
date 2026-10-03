#!/usr/bin/env node
/**
 * Normalize PT-PT catalog strings to pre-1990 Orthographic Agreement spelling.
 * Only applies etymological c/p restorations via full-word whitelist (never bare ção→cção).
 */
import fs from 'fs';

/** pós-AO → pré-AO (lowercase). Applied with word boundaries; case preserved. */
const WORD_MAP = {
  // act-
  atual: 'actual',
  atuais: 'actuais',
  atualmente: 'actualmente',
  atualizar: 'actualizar',
  atualiza: 'actualiza',
  atualização: 'actualização',
  atualizações: 'actualizações',
  atualizado: 'actualizado',
  atualizada: 'actualizada',
  atualizados: 'actualizados',
  atualizadas: 'actualizadas',
  atualizando: 'actualizando',
  ativo: 'activo',
  ativa: 'activa',
  ativos: 'activos',
  ativas: 'activas',
  ativamente: 'activamente',
  ativar: 'activar',
  ativado: 'activado',
  ativada: 'activada',
  ativados: 'activados',
  ativadas: 'activadas',
  atividade: 'actividade',
  atividades: 'actividades',
  inativo: 'inactivo',
  inativa: 'inactiva',
  inativos: 'inactivos',
  inativas: 'inactivas',
  desativado: 'desactivado',
  desativada: 'desactivada',
  desativados: 'desactivados',
  desativadas: 'desactivadas',
  desativar: 'desactivar',
  interativo: 'interactivo',
  interativa: 'interactiva',
  interativos: 'interactivos',
  interativas: 'interactivas',
  interação: 'interacção',
  interações: 'interacções',
  // project / object
  projeto: 'projecto',
  projetos: 'projectos',
  projetar: 'projectar',
  projetado: 'projectado',
  projetada: 'projectada',
  objeto: 'objecto',
  objetos: 'objectos',
  objetivo: 'objectivo',
  objetivos: 'objectivos',
  objetiva: 'objectiva',
  objetivas: 'objectivas',
  objetivamente: 'objectivamente',
  // direc-
  direção: 'direcção',
  direções: 'direcções',
  diretor: 'director',
  diretora: 'directora',
  diretores: 'directores',
  diretoras: 'directoras',
  diretório: 'directório',
  diretórios: 'directórios',
  direto: 'directo',
  direta: 'directa',
  diretos: 'directos',
  diretas: 'directas',
  diretamente: 'directamente',
  diretriz: 'directriz',
  diretrizes: 'directrizes',
  // selec-
  seleção: 'selecção',
  seleções: 'selecções',
  selecionar: 'seleccionar',
  selecione: 'seleccione',
  selecionado: 'seleccionado',
  selecionada: 'seleccionada',
  selecionados: 'seleccionados',
  selecionadas: 'seleccionadas',
  selecionando: 'seleccionando',
  // colec-
  coleção: 'colecção',
  coleções: 'colecções',
  coletivo: 'colectivo',
  coletiva: 'colectiva',
  coletivos: 'colectivos',
  coletivas: 'colectivas',
  // correc-
  correção: 'correcção',
  correções: 'correcções',
  correto: 'correcto',
  correta: 'correcta',
  corretos: 'correctos',
  corretas: 'correctas',
  corretamente: 'correctamente',
  // inspec / protec / detec
  inspeção: 'inspecção',
  inspeções: 'inspecções',
  inspecionar: 'inspeccionar',
  proteção: 'protecção',
  proteções: 'protecções',
  detetor: 'detector',
  detetores: 'detectores',
  detetar: 'detectar',
  // excep / adop
  exceção: 'excepção',
  exceções: 'excepções',
  exceto: 'excepto',
  adoção: 'adopção',
  adoções: 'adopções',
  adotar: 'adoptar',
  adotado: 'adoptado',
  adotada: 'adoptada',
  adotados: 'adoptados',
  adotadas: 'adoptadas',
  // ópt-
  ótimo: 'óptimo',
  ótima: 'óptima',
  ótimos: 'óptimos',
  ótimas: 'óptimas',
  otimizar: 'optimizar',
  otimização: 'optimização',
  ótica: 'óptica',
  óticas: 'ópticas',
  // acção (standalone / compound prefixes only — full words)
  ação: 'acção',
  ações: 'acções',
  reação: 'reacção',
  reações: 'reacções',
  atração: 'atracção',
  atrações: 'atracções',
  distração: 'distracção',
  distrações: 'distracções',
  abstração: 'abstracção',
  abstrações: 'abstracções',
  fração: 'fracção',
  frações: 'fracções',
  facção: 'facção',
  transação: 'transacção',
  transações: 'transacções',
  contração: 'contracção',
  contrações: 'contracções',
  extração: 'extracção',
  extrações: 'extracções',
  redação: 'redacção',
  redações: 'redacções',
  tração: 'tracção',
  // sector / factor / facto / contacto / aspecto
  setor: 'sector',
  setores: 'sectores',
  setorial: 'sectorial',
  fator: 'factor',
  fatores: 'factores',
  fato: 'facto',
  fatos: 'factos',
  contato: 'contacto',
  contatos: 'contactos',
  contatar: 'contactar',
  aspeto: 'aspecto',
  aspetos: 'aspectos',
  // espect-
  espetáculo: 'espectáculo',
  espetáculos: 'espectáculos',
  espetacular: 'espectacular',
  espetador: 'espectador',
  espetadores: 'espectadores',
  // carácter
  caráter: 'carácter',
  // concepção / recepção / percepção
  conceção: 'concepção',
  conceções: 'concepções',
  receção: 'recepção',
  receções: 'recepções',
  perceção: 'percepção',
  perceções: 'percepções',
  // electr / electr
  eletrónico: 'electrónico',
  eletrónica: 'electrónica',
  eletrónicos: 'electrónicos',
  eletrónicas: 'electrónicas',
  eletrônico: 'electrónico',
  eletrônica: 'electrónica',
  eletrônicos: 'electrónicos',
  eletrônicas: 'electrónicas',
  elétrico: 'eléctrico',
  elétrica: 'eléctrica',
  elétricos: 'eléctricos',
  elétricas: 'eléctricas',
  eletricidade: 'electricidade',
  // arquitectura
  arquitetura: 'arquitectura',
  arquiteturas: 'arquitecturas',
  arquiteto: 'arquitecto',
  // efect / afect / respect / exact
  efetivo: 'efectivo',
  efetiva: 'efectiva',
  efetivos: 'efectivos',
  efetivas: 'efectivas',
  efetivamente: 'efectivamente',
  efetuar: 'efectuar',
  efetuado: 'efectuado',
  afetar: 'afectar',
  afetado: 'afectado',
  afetada: 'afectada',
  afeta: 'afecta',
  respetivo: 'respectivo',
  respetiva: 'respectiva',
  respetivos: 'respectivos',
  respetivas: 'respectivas',
  respetivamente: 'respectivamente',
  exato: 'exacto',
  exata: 'exacta',
  exatos: 'exactos',
  exatas: 'exactas',
  exatamente: 'exactamente',
  // inject / traject
  injeção: 'injecção',
  injeções: 'injecções',
  trajeto: 'trajecto',
  trajetos: 'trajectos',
  trajetória: 'trajectória',
  // europeu
  europeia: 'européia',
  europeias: 'européias',
  // other
  egito: 'egipto',
  teto: 'tecto',
  tetos: 'tectos',
  seção: 'secção',
  seções: 'secções',
  acionar: 'accionar',
  acionado: 'accionado',
};

const sorted = Object.keys(WORD_MAP).sort((a, b) => b.length - a.length);

function preserveCase(from, to) {
  if (from[0] === from[0].toUpperCase() && from.slice(1) === from.slice(1).toLowerCase()) {
    return to.charAt(0).toUpperCase() + to.slice(1);
  }
  if (from === from.toUpperCase() && from.length > 1) return to.toUpperCase();
  return to;
}

export function toPreAo90(text) {
  let out = text;
  for (const from of sorted) {
    const to = WORD_MAP[from];
    const re = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    out = out.replace(re, (m) => preserveCase(m, to));
  }
  return out;
}

function transformPtBlock(block) {
  return block.replace(/:\s*'((?:\\'|[^'])*)'/g, (_full, val) => {
    const raw = val.replace(/\\'/g, "'");
    const converted = toPreAo90(raw);
    return `: '${converted.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  });
}

function runCli() {
  const files = [
    'lib/i18n/commonCatalog.ts',
    'lib/i18n/navCatalog.ts',
    'lib/i18n/authCatalog.ts',
    'lib/i18n/chromeCatalog.ts',
    'lib/i18n/pagesCatalog.ts',
  ];

  let totalChanges = 0;
  for (const file of files) {
    let s = fs.readFileSync(file, 'utf8');
    const before = s;
    s = s.replace(/export const \w*Pt\w*(?:: [^=]+)? = \{[\s\S]*?\n\};/g, (block) => transformPtBlock(block));
    // pagesCatalog helper shape: export const pagesPt = pages({ ... });
    s = s.replace(/export const pagesPt = pages\(\{[\s\S]*?\n\}\);/g, (block) => transformPtBlock(block));
    if (s !== before) {
      fs.writeFileSync(file, s);
      totalChanges++;
      console.log('updated', file);
    } else {
      console.log('unchanged', file);
    }
  }

  // lit catalogs are JSON (keeps Next/SWC heap sane)
  const litPtPath = 'lib/i18n/locales/litPt.json';
  if (fs.existsSync(litPtPath)) {
    const litPt = JSON.parse(fs.readFileSync(litPtPath, 'utf8'));
    let changed = 0;
    for (const [k, v] of Object.entries(litPt)) {
      const next = toPreAo90(String(v));
      if (next !== v) {
        litPt[k] = next;
        changed++;
      }
    }
    if (changed > 0) {
      fs.writeFileSync(litPtPath, JSON.stringify(litPt, null, 0) + '\n');
      totalChanges++;
      console.log('updated', litPtPath, `(${changed} values)`);
    } else {
      console.log('unchanged', litPtPath);
    }
  }

  // Sanity: must NOT invent cç in organização/aplicação/etc.
  const bad =
    /\b(organizacç|aplicacç|aprovacç|administracç|informacç|alteracç|documentacç|notificacç|configuracç|integraçc|validaçc|operaçc|situaçc|duraçc|descriçc|traduçc|localizaçc|navegaçc|autenticaçc|autorizaçc)\w*/i;
  const goodSamples = [];
  for (const file of files) {
    const s = fs.readFileSync(file, 'utf8');
    const blocks = [...s.matchAll(/export const \w*Pt\w*(?:: [^=]+)? = \{([\s\S]*?)\n\};/g)];
    for (const b of blocks) {
      if (bad.test(b[1])) {
        console.error('BAD FORM in', file, b[1].match(bad)?.[0]);
        process.exitCode = 1;
      }
      for (const w of ['projectos', 'acção', 'activo', 'actual', 'seleccionar', 'organização', 'aplicações']) {
        if (b[1].includes(w)) goodSamples.push(`${file}:${w}`);
      }
    }
  }
  console.log('sample hits', [...new Set(goodSamples)].slice(0, 20));
  console.log('filesChanged', totalChanges);
}

import { pathToFileURL } from 'url';
const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli();
}
