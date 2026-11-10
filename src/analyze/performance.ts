import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CATEGORIES, type Category, LH_RECORD, type LighthouseRecord, lhRunFile } from "../collect/lighthouse.js";
import type { MetaRefresh } from "../collect/page.js";
import type { Meta } from "../shared/types.js";
import { exclusaoDaAnalise } from "./exclusoes.js";

/**
 * Métricas de performance por site (S09, ADR 009). Lê o `lighthouse.json` da
 * coleta, escolhe a execução mediana pela nota (ADR 007, 7a) e extrai as
 * métricas de um único relatório (`lh<n>.json`). Só leitura de `data/raw/`.
 */

// --------------------------------------------------------------------------
// Tipos
// --------------------------------------------------------------------------

/** Subconjunto do relatório do Lighthouse (LHR) que a análise lê. */
export interface LhrMinimo {
  finalDisplayedUrl?: string;
  runtimeError?: { code: string; message?: string };
  categories: Record<string, { score: number | null; auditRefs?: Array<{ id: string; weight?: number; group?: string }> }>;
  audits: Record<
    string,
    {
      id: string;
      title?: string;
      score: number | null;
      scoreDisplayMode?: string;
      numericValue?: number;
      details?: { type?: string; items?: unknown[]; overallSavingsBytes?: number };
    }
  >;
}

export interface MetricasPerformance {
  /** Notas 0–100 das 4 categorias (como no `lighthouse.json`). */
  notas: Record<Category, number | null>;
  fcpMs: number | null;
  lcpMs: number | null;
  tbtMs: number | null;
  cls: number | null;
  speedIndexMs: number | null;
  /** Peso total transferido (`total-byte-weight`). */
  pesoTotalBytes: number | null;
  /** Nº de requisições (itens de `network-requests`). */
  requisicoes: number | null;
  /** Economia estimada de `unused-javascript` / `unused-css-rules`. */
  jsNaoUsadoBytes: number | null;
  cssNaoUsadoBytes: number | null;
}

export interface AuditoriaComFalha {
  id: string;
  titulo: string | null;
  score: number;
  modo: string;
  /** Categorias em que a auditoria aparece. */
  categorias: Category[];
}

export type StatusPerformance = "completo" | "parcial" | "falha";

export interface PerformanceSite {
  meta: Meta;
  id: string;
  url: string;
  /** Proveniência da coleta (meta do `lighthouse.json`). */
  coleta: { collectedAt: string | null; gitCommit: string | null; toolVersions: Record<string, string | null> };
  /** `completo` = 3 válidas; `parcial` = 1–2; `falha` = 0 (ADR 009, 3a). */
  status: StatusPerformance;
  execucoesValidas: number;
  /** Códigos de `runtimeError`/erro das execuções inválidas, na ordem. */
  errosDasExecucoes: string[];
  /** `n` da execução usada (`lh<n>.json`); `null` em `falha`. */
  execucao: number | null;
  /** `n` que o `computeMedianRun` escolheria (sensibilidade, ADR 009). */
  nFcpTti: number | null;
  amplitudePerformance: number | null;
  finalDisplayedUrl: string | null;
  metaRefresh: boolean;
  /** Exclusão da análise (ADR 009, item 4), ou `null`. */
  exclusao: { motivo: string; detalhe: string } | null;
  metricas: MetricasPerformance | null;
  auditoriasComFalha: AuditoriaComFalha[] | null;
}

// --------------------------------------------------------------------------
// Funções puras
// --------------------------------------------------------------------------

/** Limiar do Lighthouse para mostrar uma auditoria como aprovada (ADR 009, 2a). */
export const LIMIAR_APROVACAO = 0.9;
const MODOS_COM_NOTA = new Set(["binary", "numeric", "metricSavings"]);

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

export function extrairMetricas(lhr: LhrMinimo): MetricasPerformance {
  const a = lhr.audits;
  const nv = (id: string) => num(a[id]?.numericValue);
  const notas = Object.fromEntries(
    CATEGORIES.map((c) => {
      const s = num(lhr.categories[c]?.score);
      return [c, s === null ? null : Math.round(s * 100)];
    }),
  ) as Record<Category, number | null>;
  const itens = a["network-requests"]?.details?.items;
  return {
    notas,
    fcpMs: nv("first-contentful-paint"),
    lcpMs: nv("largest-contentful-paint"),
    tbtMs: nv("total-blocking-time"),
    cls: nv("cumulative-layout-shift"),
    speedIndexMs: nv("speed-index"),
    pesoTotalBytes: nv("total-byte-weight"),
    requisicoes: Array.isArray(itens) ? itens.length : null,
    jsNaoUsadoBytes: num(a["unused-javascript"]?.details?.overallSavingsBytes),
    cssNaoUsadoBytes: num(a["unused-css-rules"]?.details?.overallSavingsBytes),
  };
}

/**
 * Grupos que o relatório do Lighthouse não lista como auditoria: `metrics`
 * (já entram como valores) e `hidden` (não aparecem no relatório; no LH 13,
 * TTI, max-potential-FID, `redirects`, `server-response-time`…).
 */
const GRUPOS_FORA = new Set(["metrics", "hidden"]);

/**
 * Auditorias com `score < 0.9` nos modos `binary`, `numeric` e
 * `metricSavings`, tirando as que só aparecem em `GRUPOS_FORA` (ADR 009, 2a).
 * Ordem: a do objeto `audits` do relatório.
 */
export function auditoriasComFalha(lhr: LhrMinimo): AuditoriaComFalha[] {
  const categoriasDe = new Map<string, Category[]>();
  const visiveis = new Set<string>();
  for (const c of CATEGORIES) {
    for (const ref of lhr.categories[c]?.auditRefs ?? []) {
      if (!GRUPOS_FORA.has(ref.group ?? "")) visiveis.add(ref.id);
      categoriasDe.set(ref.id, [...(categoriasDe.get(ref.id) ?? []), c]);
    }
  }
  const out: AuditoriaComFalha[] = [];
  for (const [id, au] of Object.entries(lhr.audits)) {
    const modo = au.scoreDisplayMode ?? "";
    const score = num(au.score);
    if (score === null || !MODOS_COM_NOTA.has(modo) || !visiveis.has(id)) continue;
    if (score >= LIMIAR_APROVACAO) continue;
    out.push({ id, titulo: au.title ?? null, score, modo, categorias: categoriasDe.get(id) ?? [] });
  }
  return out;
}

/** Status do site e execução usada, a partir do `lighthouse.json` (ADR 009, 3a). */
export function escolherExecucao(rec: Pick<LighthouseRecord, "execucoes" | "mediana">): {
  status: StatusPerformance;
  execucoesValidas: number;
  execucao: number | null;
  errosDasExecucoes: string[];
} {
  const validas = rec.execucoes.filter((e) => e.valida).length;
  const errosDasExecucoes = rec.execucoes
    .filter((e) => !e.valida)
    .map((e) => e.runtimeError?.code ?? e.erro ?? "sem-nota");
  const status: StatusPerformance = validas === 0 ? "falha" : validas >= rec.execucoes.length ? "completo" : "parcial";
  return { status, execucoesValidas: validas, execucao: validas === 0 ? null : rec.mediana.n, errosDasExecucoes };
}

/**
 * Junta tudo para um site. Recebe os arquivos já lidos: o `lighthouse.json`,
 * o relatório da execução escolhida (`null` em `falha`) e o `metaRefresh` do
 * `collect.json`.
 */
export function montarPerformanceSite(params: {
  meta: Meta;
  registro: LighthouseRecord;
  lhr: LhrMinimo | null;
  metaRefresh: MetaRefresh | null;
}): PerformanceSite {
  const { registro: rec, lhr } = params;
  const escolha = escolherExecucao(rec);
  if (escolha.execucao !== null && lhr === null) {
    throw new Error(`${rec.id}: falta o relatório lh${escolha.execucao}.json`);
  }
  const usado = escolha.execucao === null ? null : lhr;
  return {
    meta: params.meta,
    id: rec.id,
    url: rec.url,
    coleta: {
      collectedAt: rec.meta.collectedAt ?? null,
      gitCommit: rec.meta.gitCommit ?? null,
      toolVersions: { ...rec.meta.toolVersions },
    },
    ...escolha,
    nFcpTti: rec.mediana.nFcpTti,
    amplitudePerformance: rec.variacaoPerformance.amplitude,
    finalDisplayedUrl: usado?.finalDisplayedUrl ?? null,
    metaRefresh: params.metaRefresh !== null,
    exclusao: exclusaoDaAnalise(rec.id),
    metricas: usado ? extrairMetricas(usado) : null,
    auditoriasComFalha: usado ? auditoriasComFalha(usado) : null,
  };
}

// --------------------------------------------------------------------------
// Leitura de `data/raw/<id>/`
// --------------------------------------------------------------------------

const lerJson = <T>(f: string): T => JSON.parse(readFileSync(f, "utf8")) as T;

/** Lê `lighthouse.json`, `collect.json` e o `lh<n>.json` escolhido. */
export function analisarPerformanceDoSite(dir: string, meta: Meta): PerformanceSite {
  const registro = lerJson<LighthouseRecord>(join(dir, LH_RECORD));
  const collectPath = join(dir, "collect.json");
  const metaRefresh = existsSync(collectPath)
    ? (lerJson<{ metaRefresh?: MetaRefresh | null }>(collectPath).metaRefresh ?? null)
    : null;
  const { execucao } = escolherExecucao(registro);
  const lhr = execucao === null ? null : lerJson<LhrMinimo>(join(dir, lhRunFile(execucao)));
  return montarPerformanceSite({ meta, registro, lhr, metaRefresh });
}
