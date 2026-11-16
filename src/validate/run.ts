import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Browser } from "playwright";

import { calcularIndice, type IndiceSite, type Subnota, SUBNOTAS } from "../analyze/indice.js";
import { extrairMetricas, type LhrMinimo, type MetricasPerformance } from "../analyze/performance.js";
import { type IndicadoresSemanticos, indicadoresSemanticos } from "../analyze/semantics.js";
import {
  type LighthouseRunner,
  LH_RUNS,
  medianRunByScore,
  type RunSummary,
  summarizeRun,
  variacao,
  type Variacao,
} from "../collect/lighthouse.js";
import { MOBILE_SCREEN, NAV_TIMEOUT_MS, NETWORKIDLE_TIMEOUT_MS } from "../collect/page.js";
import type { Meta } from "../shared/types.js";
import { servirSnapshot, type Variante } from "./server.js";
import { ARQ_MANIFESTO, DIR_SNAPSHOT } from "./snapshot.js";
import { BLOQUEIO_DE_REDE } from "./verify.js";

/**
 * Antes/depois de um site (S18, ADR 004). As duas cópias locais (ADR 018) são
 * servidas pelo mesmo servidor, cada uma na sua porta, com a rede externa
 * bloqueada no Chrome. Para cada variante:
 *   - Lighthouse 3× (perfil do ADR 007, Chrome novo por execução); as
 *     execuções das duas variantes são intercaladas (O, C, O, C…), e a
 *     variante que abre alterna entre os sites;
 *   - métricas da execução mediana pela nota (ADR 007/009);
 *   - semântica: indicadores do módulo 2 (ADR 010/011) e índice (ADR 003)
 *     sobre o DOM renderizado da cópia local, com os parâmetros da coleta.
 * Deltas: corrigido − original.
 */

export const VARIANTES: readonly Variante[] = ["original", "corrigido"];
export const DIR_VALIDACAO = "validacao";
export const ARQ_VALIDACAO = "validation.json";

// --------------------------------------------------------------------------
// Funções puras
// --------------------------------------------------------------------------

/**
 * Ordem das 2 × `n` execuções: intercaladas, começando pela original nos
 * sites de posição par (0, 2, …) e pela corrigida nos ímpares. Cada execução
 * leva o número dela dentro da variante (1..n).
 */
export function ordemDasExecucoes(posicaoDoSite: number, n = LH_RUNS): Array<{ variante: Variante; n: number }> {
  const [a, b] = posicaoDoSite % 2 === 0 ? (["original", "corrigido"] as const) : (["corrigido", "original"] as const);
  const out: Array<{ variante: Variante; n: number }> = [];
  for (let k = 1; k <= n; k++) out.push({ variante: a, n: k }, { variante: b, n: k });
  return out;
}

export interface ExecucaoValidacao extends RunSummary {
  /** Métricas desta execução (para a sensibilidade à escolha da mediana); `null` sem relatório. */
  metricas: MetricasPerformance | null;
}

export interface Semantica {
  /** O `body` tem elementos? (status `ok` do módulo 2; `vazio` caso contrário). */
  status: "ok" | "vazio";
  indicadores: IndicadoresSemanticos;
  indice: IndiceSite | null;
  networkidleTimeout: boolean;
}

export interface ResultadoVariante {
  urlLocal: string;
  execucoes: ExecucaoValidacao[];
  mediana: { criterio: "nota-performance"; n: number | null };
  /** Métricas da execução mediana; `null` sem execução válida. */
  metricas: MetricasPerformance | null;
  variacaoPerformance: Variacao;
  semantica: Semantica | null;
  /** URLs pedidas ao servidor sem correspondência na cópia (404). */
  faltasNoServidor: string[];
}

export function resumirLighthouse(execucoes: ExecucaoValidacao[]): Pick<ResultadoVariante, "mediana" | "metricas" | "variacaoPerformance"> {
  const n = medianRunByScore(execucoes);
  return {
    mediana: { criterio: "nota-performance", n },
    metricas: n === null ? null : (execucoes.find((e) => e.n === n)?.metricas ?? null),
    variacaoPerformance: variacao(execucoes.filter((e) => e.valida).map((e) => e.notas.performance)),
  };
}

export function semanticaDoDom(html: string, networkidleTimeout: boolean): Semantica {
  const indicadores = indicadoresSemanticos(html);
  return {
    status: indicadores.divSpan.total === 0 ? "vazio" : "ok",
    indicadores,
    indice: calcularIndice(indicadores),
    networkidleTimeout,
  };
}

type ValorDe = (r: ResultadoVariante) => number | null;
const SUBNOTAS_DESFECHOS = Object.fromEntries(
  SUBNOTAS.map((s) => [`sub_${s}`, (r: ResultadoVariante) => r.semantica?.indice?.subnotas[s] ?? null]),
) as Record<`sub_${Subnota}`, ValorDe>;

/** Desfechos comparados (nome da coluna → valor de uma variante). */
export const DESFECHOS = {
  nota_performance: (r) => r.metricas?.notas.performance ?? null,
  nota_accessibility: (r) => r.metricas?.notas.accessibility ?? null,
  nota_best_practices: (r) => r.metricas?.notas["best-practices"] ?? null,
  nota_seo: (r) => r.metricas?.notas.seo ?? null,
  fcp_ms: (r) => r.metricas?.fcpMs ?? null,
  lcp_ms: (r) => r.metricas?.lcpMs ?? null,
  tbt_ms: (r) => r.metricas?.tbtMs ?? null,
  cls: (r) => r.metricas?.cls ?? null,
  speed_index_ms: (r) => r.metricas?.speedIndexMs ?? null,
  peso_total_bytes: (r) => r.metricas?.pesoTotalBytes ?? null,
  requisicoes: (r) => r.metricas?.requisicoes ?? null,
  indice_semantica: (r) => r.semantica?.indice?.indice ?? null,
  indice_semantica_pesos_iguais: (r) => r.semantica?.indice?.indicePesosIguais ?? null,
  ...SUBNOTAS_DESFECHOS,
} satisfies Record<string, ValorDe>;
export type Desfecho = keyof typeof DESFECHOS;

export interface Comparativo {
  original: number | null;
  corrigido: number | null;
  /** corrigido − original; `null` se faltar um dos lados. */
  delta: number | null;
}

export function calcularDeltas(original: ResultadoVariante, corrigido: ResultadoVariante): Record<Desfecho, Comparativo> {
  const out = {} as Record<Desfecho, Comparativo>;
  for (const [k, f] of Object.entries(DESFECHOS) as Array<[Desfecho, (r: ResultadoVariante) => number | null]>) {
    const o = f(original);
    const c = f(corrigido);
    out[k] = { original: o, corrigido: c, delta: o === null || c === null ? null : c - o };
  }
  return out;
}

/** Colunas do `validation.csv`: identificação + original/corrigido/delta de cada desfecho. */
export const COLUNAS_CONTEXTO = ["id", "grupo", "tecnologia", "tipo", "correcoes", "correcoes_llm", "ordem", "faltas_original", "faltas_corrigido", "amplitude_original", "amplitude_corrigido"] as const;
export function colunasValidacao(): string[] {
  return [...COLUNAS_CONTEXTO, ...Object.keys(DESFECHOS).flatMap((k) => [`${k}_original`, `${k}_corrigido`, `${k}_delta`])];
}

const cel = (v: number | string | null | undefined): string => (v === null || v === undefined ? "" : String(v));

export function linhaValidacao(v: Pick<ValidacaoSite, "siteId" | "contexto" | "recomendacoes" | "ordem" | "variantes" | "deltas">): string[] {
  return [
    v.siteId,
    cel(v.contexto.grupo),
    cel(v.contexto.tecnologia),
    cel(v.contexto.tipo),
    cel(v.recomendacoes.corrigidas),
    cel(v.recomendacoes.corrigidasLlm),
    v.ordem[0]!.variante,
    cel(v.variantes.original.faltasNoServidor.length),
    cel(v.variantes.corrigido.faltasNoServidor.length),
    cel(v.variantes.original.variacaoPerformance.amplitude),
    cel(v.variantes.corrigido.variacaoPerformance.amplitude),
    ...Object.keys(DESFECHOS).flatMap((k) => {
      const d = v.deltas[k as Desfecho];
      return [cel(d.original), cel(d.corrigido), cel(d.delta)];
    }),
  ];
}

// --------------------------------------------------------------------------
// Execução (navegador, Lighthouse, disco)
// --------------------------------------------------------------------------

export interface ValidacaoSite {
  meta: Meta;
  siteId: string;
  contexto: { grupo: string | null; tecnologia: string | null; tipo: string | null };
  /** Resumo do `recommendations.json` usado para o `fixed.html`. */
  recomendacoes: { total: number | null; corrigidas: number | null; corrigidasLlm: number | null; llm: unknown };
  parametros: {
    execucoesPorVariante: number;
    formFactor: "mobile";
    throttlingMethod: "simulate";
    chromeFlagsExtras: string[];
    userAgent: string;
    relogioSemantica: string | null;
    relogioLighthouse: "real";
  };
  ordem: Array<{ variante: Variante; n: number }>;
  variantes: Record<Variante, ResultadoVariante>;
  deltas: Record<Desfecho, Comparativo>;
}

/** DOM renderizado da cópia local, com os parâmetros da coleta (S05/ADR 006) e o relógio da coleta. */
export async function renderizarDom(browser: Browser, url: string, userAgent: string, relogio: Date | null): Promise<{ html: string; networkidleTimeout: boolean }> {
  const context = await browser.newContext({
    viewport: { width: MOBILE_SCREEN.width, height: MOBILE_SCREEN.height },
    deviceScaleFactor: MOBILE_SCREEN.deviceScaleFactor,
    isMobile: MOBILE_SCREEN.isMobile,
    hasTouch: MOBILE_SCREEN.hasTouch,
    userAgent,
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    if (relogio) await page.clock.setFixedTime(relogio);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    let networkidleTimeout = false;
    try {
      await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS });
    } catch (err) {
      if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
      networkidleTimeout = true;
    }
    return { html: await page.content(), networkidleTimeout };
  } finally {
    await context.close();
  }
}

export interface OpcoesValidacao {
  siteId: string;
  posicao: number;
  dirSnapshot: string;
  dirSaida: string;
  meta: Meta;
  browser: Browser;
  runner: LighthouseRunner;
  chromePath: string;
  userAgent: string;
  relogio: Date | null;
  contexto: ValidacaoSite["contexto"];
  recomendacoes: ValidacaoSite["recomendacoes"];
  execucoes?: number;
  aoExecutar?: (variante: Variante, n: number, nota: number | null) => void;
}

export async function validarSite(o: OpcoesValidacao): Promise<ValidacaoSite> {
  const total = o.execucoes ?? LH_RUNS;
  const dirLh = join(o.dirSaida, DIR_VALIDACAO);
  mkdirSync(dirLh, { recursive: true });
  const servidores = {
    original: await servirSnapshot(o.dirSnapshot, "original"),
    corrigido: await servirSnapshot(o.dirSnapshot, "corrigido"),
  };
  try {
    // Semântica: um DOM por variante.
    const semantica = {} as Record<Variante, Semantica>;
    for (const v of VARIANTES) {
      const { html, networkidleTimeout } = await renderizarDom(o.browser, servidores[v].urlPagina, o.userAgent, o.relogio);
      writeFileSync(join(dirLh, `dom-${v}.html`), html, "utf8");
      semantica[v] = semanticaDoDom(html, networkidleTimeout);
    }

    // Lighthouse: execuções intercaladas.
    const ordem = ordemDasExecucoes(o.posicao, total);
    const execucoes: Record<Variante, ExecucaoValidacao[]> = { original: [], corrigido: [] };
    for (const { variante, n } of ordem) {
      const startedAt = new Date().toISOString();
      const t0 = performance.now();
      try {
        const out = await o.runner(servidores[variante].urlPagina, {
          userAgent: o.userAgent,
          tlsInvalido: false,
          chromePath: o.chromePath,
          chromeFlagsExtras: [BLOQUEIO_DE_REDE],
        });
        writeFileSync(join(dirLh, `lh-${variante}-${n}.json`), out.json, "utf8");
        const resumo = summarizeRun(n, startedAt, Math.round(performance.now() - t0), { lhr: out.lhr, browserVersion: out.browserVersion });
        execucoes[variante].push({ ...resumo, metricas: resumo.valida ? extrairMetricas(out.lhr as unknown as LhrMinimo) : null });
        o.aoExecutar?.(variante, n, resumo.notas.performance);
      } catch (err) {
        execucoes[variante].push({ ...summarizeRun(n, startedAt, Math.round(performance.now() - t0), { erro: err instanceof Error ? err.message : String(err) }), metricas: null });
        o.aoExecutar?.(variante, n, null);
      }
    }

    const variantes = Object.fromEntries(
      VARIANTES.map((v) => [
        v,
        {
          urlLocal: servidores[v].urlPagina,
          execucoes: execucoes[v],
          ...resumirLighthouse(execucoes[v]),
          semantica: semantica[v],
          faltasNoServidor: [...new Set(servidores[v].faltas)],
        } satisfies ResultadoVariante,
      ]),
    ) as Record<Variante, ResultadoVariante>;

    const r: ValidacaoSite = {
      meta: o.meta,
      siteId: o.siteId,
      contexto: o.contexto,
      recomendacoes: o.recomendacoes,
      parametros: {
        execucoesPorVariante: total,
        formFactor: "mobile",
        throttlingMethod: "simulate",
        chromeFlagsExtras: [BLOQUEIO_DE_REDE],
        userAgent: o.userAgent,
        relogioSemantica: o.relogio?.toISOString() ?? null,
        relogioLighthouse: "real",
      },
      ordem,
      variantes,
      deltas: calcularDeltas(variantes.original, variantes.corrigido),
    };
    writeFileSync(join(o.dirSaida, ARQ_VALIDACAO), JSON.stringify(r, null, 2) + "\n", "utf8");
    return r;
  } finally {
    await servidores.original.fechar();
    await servidores.corrigido.fechar();
  }
}

/**
 * A cópia local em `dirProcessado/snapshot/` está em dia? Existe, tem a
 * variante corrigida e é mais nova que o `fixed.html`. Se sim, o `run` a
 * reaproveita em vez de refazê-la (refazer apaga a verificação da S17).
 */
export function copiaEmDia(dirProcessado: string): boolean {
  const manifesto = join(dirProcessado, DIR_SNAPSHOT, ARQ_MANIFESTO);
  const fixed = join(dirProcessado, "fixed.html");
  if (!existsSync(manifesto) || !existsSync(fixed) || !existsSync(join(dirProcessado, DIR_SNAPSHOT, "corrigido.html"))) return false;
  return statSync(manifesto).mtimeMs >= statSync(fixed).mtimeMs;
}

/** Resumo do `recommendations.json` (módulo 3). */
export function resumoRecomendacoes(dirProcessado: string): ValidacaoSite["recomendacoes"] {
  const f = join(dirProcessado, "recommendations.json");
  if (!existsSync(f)) return { total: null, corrigidas: null, corrigidasLlm: null, llm: null };
  const r = JSON.parse(readFileSync(f, "utf8")) as {
    resumo?: { total?: number; corrigidas?: number; porRegra?: Record<string, { corrigidas: number }> };
    llm?: unknown;
  };
  return {
    total: r.resumo?.total ?? null,
    corrigidas: r.resumo?.corrigidas ?? null,
    corrigidasLlm: r.resumo?.porRegra?.["landmarks-llm"]?.corrigidas ?? 0,
    llm: r.llm ?? null,
  };
}
