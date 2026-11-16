import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as chromeLauncher from "chrome-launcher";
import lighthouse, { type Flags, type Result } from "lighthouse";
import { computeMedianRun } from "lighthouse/core/lib/median-run.js";

import { defaultLimiter, type HostLimiter } from "../shared/http.js";
import { describeError, type CollectMeta, siteDir, type SiteToCollect } from "./page.js";

/**
 * Medição com o Lighthouse (S06, ADR 007). Para cada site grava em
 * `data/raw/<id>/`:
 *   - `lh1.json`..`lh3.json` — relatórios completos (LHR), um por execução;
 *   - `lighthouse.json`      — meta, parâmetros, notas das 3 execuções,
 *                              execução mediana e variação da performance.
 * Cada execução usa um Chrome novo (perfil temporário, sem cache). Um site e
 * um Chrome por vez. O `lighthouse.json` é gravado por último e marca o site
 * como medido (regra 8: não é sobrescrito).
 */

// --------------------------------------------------------------------------
// Parâmetros (ADR 007)
// --------------------------------------------------------------------------

export const LH_RUNS = 3;
export const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
export type Category = (typeof CATEGORIES)[number];

export const LH_RECORD = "lighthouse.json";
export const lhRunFile = (n: number): string => `lh${n}.json`;

/**
 * Flags do Chrome: headless; nosso User-Agent no navegador inteiro (regra 2 —
 * o `emulatedUserAgent` do Lighthouse não vale para o fetch do `robots.txt`
 * da auditoria de SEO); ignora certificado só nos sites `tls_invalido`
 * (ADR 005/007).
 */
export function chromeFlags(site: Pick<SiteToCollect, "tlsInvalido">, userAgent: string): string[] {
  const flags = ["--headless", "--no-first-run", "--no-default-browser-check", `--user-agent=${userAgent}`];
  if (site.tlsInvalido) flags.push("--ignore-certificate-errors");
  return flags;
}

/**
 * Configurações do Lighthouse. `formFactor`, `throttlingMethod` e a
 * emulação de tela ficam no padrão mobile; `formFactor` e `throttlingMethod`
 * são explícitos para aparecerem nos relatórios mesmo se o padrão mudar.
 */
export function lighthouseFlags(userAgent: string, port?: number): Flags {
  return {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: [...CATEGORIES],
    formFactor: "mobile",
    throttlingMethod: "simulate",
    // Regra 2: nosso User-Agent identificado, e não o móvel do Lighthouse.
    emulatedUserAgent: userAgent,
  };
}

// --------------------------------------------------------------------------
// Execução real (Chrome + Lighthouse)
// --------------------------------------------------------------------------

export interface RunOutput {
  lhr: Result;
  /** Relatório JSON exatamente como o Lighthouse o serializou. */
  json: string;
  /** Versão exata do Chrome (`/json/version`); o User-Agent vem reduzido (`156.0.0.0`). */
  browserVersion: string | null;
}

export interface RunnerOptions {
  userAgent: string;
  tlsInvalido: boolean;
  /** Executável do Chromium (o do Playwright, ADR 007). */
  chromePath: string;
  /** Flags acrescentadas às de `chromeFlags` (S18: bloqueio de rede na cópia local, ADR 004). */
  chromeFlagsExtras?: string[];
}

export type LighthouseRunner = (url: string, opts: RunnerOptions) => Promise<RunOutput>;

/** Uma execução do Lighthouse num Chrome novo, encerrado ao fim. */
export const runLighthouse: LighthouseRunner = async (url, opts) => {
  const chrome = await chromeLauncher.launch({
    chromePath: opts.chromePath,
    chromeFlags: [...chromeFlags(opts, opts.userAgent), ...(opts.chromeFlagsExtras ?? [])],
    logLevel: "silent",
  });
  try {
    const browserVersion = await fetch(`http://127.0.0.1:${chrome.port}/json/version`)
      .then((r) => r.json() as Promise<{ Browser?: string }>)
      .then((v) => chromeVersionFrom(v.Browser ?? null))
      .catch(() => null);
    const result = await lighthouse(url, lighthouseFlags(opts.userAgent, chrome.port));
    if (!result) throw new Error("lighthouse não devolveu resultado");
    const json = Array.isArray(result.report) ? (result.report[0] ?? "") : result.report;
    return { lhr: result.lhr, json, browserVersion };
  } finally {
    chrome.kill();
  }
};

// --------------------------------------------------------------------------
// Resumo das execuções (puro)
// --------------------------------------------------------------------------

export interface RunSummary {
  /** 1, 2 ou 3 (igual ao `lhN.json`). */
  n: number;
  startedAt: string;
  durationMs: number;
  /** Tem nota de performance e nenhum `runtimeError`. */
  valida: boolean;
  /** Erro ao executar (exceção) — nesse caso não há `lhN.json`. */
  erro: string | null;
  runtimeError: { code: string; message: string } | null;
  /** Notas 0–100 (como o Lighthouse exibe); `null` se ausente. */
  notas: Record<Category, number | null>;
  finalDisplayedUrl: string | null;
  mainDocumentUrl: string | null;
  lighthouseVersion: string | null;
  hostUserAgent: string | null;
  /** Versão exata do Chrome usado nesta execução. */
  browserVersion: string | null;
  benchmarkIndex: number | null;
  /** Aviso do Lighthouse (ex.: página redirecionou, sem viewport). */
  runWarnings: string[];
}

const nota = (lhr: Result, cat: Category): number | null => {
  const s = lhr.categories[cat]?.score;
  return typeof s === "number" ? Math.round(s * 100) : null;
};

export function summarizeRun(
  n: number,
  startedAt: string,
  durationMs: number,
  out: { lhr: Result; browserVersion?: string | null } | { erro: string },
): RunSummary {
  if ("erro" in out) {
    return {
      n,
      startedAt,
      durationMs,
      valida: false,
      erro: out.erro,
      runtimeError: null,
      notas: { performance: null, accessibility: null, "best-practices": null, seo: null },
      finalDisplayedUrl: null,
      mainDocumentUrl: null,
      lighthouseVersion: null,
      hostUserAgent: null,
      browserVersion: null,
      benchmarkIndex: null,
      runWarnings: [],
    };
  }
  const { lhr } = out;
  const notas = Object.fromEntries(CATEGORIES.map((c) => [c, nota(lhr, c)])) as Record<Category, number | null>;
  const runtimeError = lhr.runtimeError ? { code: lhr.runtimeError.code, message: lhr.runtimeError.message } : null;
  return {
    n,
    startedAt,
    durationMs,
    valida: runtimeError === null && notas.performance !== null,
    erro: null,
    runtimeError,
    notas,
    finalDisplayedUrl: lhr.finalDisplayedUrl ?? null,
    mainDocumentUrl: lhr.mainDocumentUrl ?? null,
    lighthouseVersion: lhr.lighthouseVersion ?? null,
    hostUserAgent: lhr.environment?.hostUserAgent ?? null,
    browserVersion: out.browserVersion ?? null,
    benchmarkIndex: lhr.environment?.benchmarkIndex ?? null,
    runWarnings: (lhr.runWarnings ?? []).map(String),
  };
}

/**
 * Execução mediana pela nota de performance, entre as válidas (ADR 007, 7a).
 * Ordena por nota (estável: empate fica com a execução mais antiga) e pega a
 * do meio; com número par de válidas, a de menor nota entre as duas do meio.
 * Devolve o `n` da execução, ou `null` sem execuções válidas.
 */
export function medianRunByScore(runs: RunSummary[]): number | null {
  const validas = runs.filter((r) => r.valida && r.notas.performance !== null);
  if (validas.length === 0) return null;
  const ordenadas = [...validas].sort((a, b) => (a.notas.performance ?? 0) - (b.notas.performance ?? 0));
  return ordenadas[Math.floor((ordenadas.length - 1) / 2)]!.n;
}

/**
 * Execução que o próprio Lighthouse escolheria (`computeMedianRun`: mais
 * próxima da mediana de FCP e TTI) — ADR 007, 7b, só para comparação.
 */
export function medianRunByFcpTti(lhrs: Array<{ n: number; lhr: Result }>): number | null {
  const com = lhrs.filter(({ lhr }) =>
    ["first-contentful-paint", "interactive"].every((a) => Number.isFinite(lhr.audits[a]?.numericValue)),
  );
  if (com.length === 0) return null;
  const escolhido = computeMedianRun(com.map((x) => x.lhr));
  return com.find((x) => x.lhr === escolhido)?.n ?? null;
}

export interface Variacao {
  /** Quantas notas entraram no cálculo. */
  n: number;
  min: number | null;
  max: number | null;
  /** max − min, em pontos (0–100). */
  amplitude: number | null;
  media: number | null;
  /** Desvio-padrão amostral (n − 1); `null` com menos de 2 notas. */
  desvioPadrao: number | null;
}

export function variacao(notas: Array<number | null>): Variacao {
  const xs = notas.filter((x): x is number => x !== null);
  if (xs.length === 0) return { n: 0, min: null, max: null, amplitude: null, media: null, desvioPadrao: null };
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const media = xs.reduce((s, x) => s + x, 0) / xs.length;
  const desvioPadrao =
    xs.length < 2 ? null : Math.sqrt(xs.reduce((s, x) => s + (x - media) ** 2, 0) / (xs.length - 1));
  const r = (x: number) => Math.round(x * 100) / 100;
  return { n: xs.length, min, max, amplitude: max - min, media: r(media), desvioPadrao: desvioPadrao === null ? null : r(desvioPadrao) };
}

/** Versão a partir de `HeadlessChrome/156.0.8078.4` (campo `Browser` do `/json/version`). */
export function chromeVersionFrom(hostUserAgent: string | null): string | null {
  return /(?:HeadlessChrome|Chrome)\/([\d.]+)/.exec(hostUserAgent ?? "")?.[1] ?? null;
}

// --------------------------------------------------------------------------
// Registro (`lighthouse.json`)
// --------------------------------------------------------------------------

export interface LighthouseRecord {
  meta: CollectMeta;
  id: string;
  url: string;
  tlsInvalido: boolean;
  parametros: {
    userAgent: string;
    execucoes: number;
    categorias: readonly Category[];
    formFactor: "mobile";
    throttlingMethod: "simulate";
    chromeFlags: string[];
    chromeNovoPorExecucao: true;
  };
  execucoes: RunSummary[];
  mediana: {
    criterio: "nota-performance";
    /** `n` da execução mediana (arquivo `lh<n>.json`); `null` sem válidas. */
    n: number | null;
    notas: Record<Category, number | null> | null;
    /** `n` que o `computeMedianRun` do Lighthouse escolheria (FCP/TTI). */
    nFcpTti: number | null;
  };
  /** Variação da nota de performance entre as execuções válidas. */
  variacaoPerformance: Variacao;
  /** Todas as execuções válidas e todos os `lhN.json` gravados. */
  completo: boolean;
}

export function buildLighthouseRecord(params: {
  meta: CollectMeta;
  site: SiteToCollect;
  userAgent: string;
  runs: RunSummary[];
  nFcpTti: number | null;
  arquivosGravados: number;
  /** Execuções previstas (padrão `LH_RUNS`). */
  total?: number;
}): LighthouseRecord {
  const total = params.total ?? LH_RUNS;
  const { runs } = params;
  const n = medianRunByScore(runs);
  const mediana = n === null ? null : runs.find((r) => r.n === n)!;
  return {
    meta: params.meta,
    id: params.site.id,
    url: params.site.url,
    tlsInvalido: params.site.tlsInvalido,
    parametros: {
      userAgent: params.userAgent,
      execucoes: total,
      categorias: CATEGORIES,
      formFactor: "mobile",
      throttlingMethod: "simulate",
      chromeFlags: chromeFlags(params.site, params.userAgent),
      chromeNovoPorExecucao: true,
    },
    execucoes: runs,
    mediana: { criterio: "nota-performance", n, notas: mediana?.notas ?? null, nFcpTti: params.nFcpTti },
    variacaoPerformance: variacao(runs.filter((r) => r.valida).map((r) => r.notas.performance)),
    completo: runs.length === total && runs.every((r) => r.valida) && params.arquivosGravados === total,
  };
}

// --------------------------------------------------------------------------
// Orquestração de um site
// --------------------------------------------------------------------------

/** Regra 8: site com `lighthouse.json` já foi medido e não é tocado de novo. */
export function alreadyMeasured(rawDir: string, id: string): boolean {
  return existsSync(join(siteDir(rawDir, id), LH_RECORD));
}

export interface CollectLighthouseOptions {
  rawDir: string;
  userAgent: string;
  chromePath: string;
  /** Meta sem `collectedAt` e sem a versão do Chromium (lida dos relatórios). */
  baseMeta: Omit<CollectMeta, "collectedAt">;
  limiter?: HostLimiter;
  /** Injetável para testes; padrão: `runLighthouse`. */
  runner?: LighthouseRunner;
  /** Padrão: `LH_RUNS` (3). */
  runs?: number;
}

/**
 * Mede um site `runs` vezes, em sequência; cada execução passa pelo
 * limitador (≥ 2 s entre inícios no mesmo host). Não lança: falhas ficam no
 * registro. Grava o `lighthouse.json` por último.
 */
export async function collectLighthouse(
  site: SiteToCollect,
  options: CollectLighthouseOptions,
): Promise<LighthouseRecord> {
  const dir = siteDir(options.rawDir, site.id);
  mkdirSync(dir, { recursive: true });
  const limiter = options.limiter ?? defaultLimiter;
  const runner = options.runner ?? runLighthouse;
  const total = options.runs ?? LH_RUNS;
  const collectedAt = new Date().toISOString();
  const host = new URL(site.url).host;

  const runs: RunSummary[] = [];
  const lhrs: Array<{ n: number; lhr: Result }> = [];
  let arquivosGravados = 0;
  for (let n = 1; n <= total; n++) {
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    try {
      const out = await limiter.schedule(host, () =>
        runner(site.url, { userAgent: options.userAgent, tlsInvalido: site.tlsInvalido, chromePath: options.chromePath }),
      );
      writeFileSync(join(dir, lhRunFile(n)), out.json, "utf8");
      arquivosGravados++;
      lhrs.push({ n, lhr: out.lhr });
      runs.push(
        summarizeRun(n, startedAt, Math.round(performance.now() - t0), { lhr: out.lhr, browserVersion: out.browserVersion }),
      );
    } catch (err) {
      runs.push(summarizeRun(n, startedAt, Math.round(performance.now() - t0), { erro: describeError(err) }));
    }
  }

  let nFcpTti: number | null = null;
  try {
    nFcpTti = medianRunByFcpTti(lhrs.filter(({ n }) => runs.find((r) => r.n === n)?.valida));
  } catch {
    nFcpTti = null;
  }
  const chromium = runs.find((r) => r.browserVersion)?.browserVersion ?? null;
  const lighthouseVersion = runs.find((r) => r.lighthouseVersion)?.lighthouseVersion ?? null;
  const record = buildLighthouseRecord({
    meta: {
      collectedAt,
      ...options.baseMeta,
      toolVersions: {
        ...options.baseMeta.toolVersions,
        chromium: chromium ?? options.baseMeta.toolVersions.chromium ?? null,
        lighthouse: lighthouseVersion ?? options.baseMeta.toolVersions.lighthouse,
      },
    },
    site,
    userAgent: options.userAgent,
    runs,
    nFcpTti,
    arquivosGravados,
    total,
  });
  writeFileSync(join(dir, LH_RECORD), JSON.stringify(record, null, 2) + "\n", "utf8");
  return record;
}
