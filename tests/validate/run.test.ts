import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Result } from "lighthouse";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { LighthouseRunner } from "../../src/collect/lighthouse.js";
import {
  calcularDeltas,
  colunasValidacao,
  copiaEmDia,
  type ExecucaoValidacao,
  linhaValidacao,
  ordemDasExecucoes,
  resumirLighthouse,
  type ResultadoVariante,
  semanticaDoDom,
  validarSite,
} from "../../src/validate/run.js";
import { gravarSnapshot } from "../../src/validate/snapshot.js";
import { BLOQUEIO_DE_REDE } from "../../src/validate/verify.js";

const FIX = join("tests", "fixtures", "validate");
const META = { generatedAt: "2026-11-16T00:00:00.000Z", toolVersions: { node: "x", lighthouse: null, playwright: null }, gitCommit: null, gitDirty: false };

/** LHR mínimo: nota de performance e as métricas que `extrairMetricas` lê. */
function lhr(perf: number, lcp: number): Result {
  return {
    lighthouseVersion: "13.5.0",
    finalDisplayedUrl: "http://127.0.0.1/",
    categories: {
      performance: { score: perf / 100 },
      accessibility: { score: 0.8 },
      "best-practices": { score: 0.9 },
      seo: { score: 0.7 },
    },
    audits: {
      "largest-contentful-paint": { id: "largest-contentful-paint", score: null, numericValue: lcp },
      "first-contentful-paint": { id: "first-contentful-paint", score: null, numericValue: 1000 },
    },
    runWarnings: [],
    environment: { hostUserAgent: "HeadlessChrome/1.0", benchmarkIndex: 1000 },
  } as unknown as Result;
}

function execucao(n: number, perf: number | null, lcp = 2000): ExecucaoValidacao {
  return {
    n,
    startedAt: "",
    durationMs: 0,
    valida: perf !== null,
    erro: perf === null ? "falhou" : null,
    runtimeError: null,
    notas: { performance: perf, accessibility: 80, "best-practices": 90, seo: 70 },
    finalDisplayedUrl: null,
    mainDocumentUrl: null,
    lighthouseVersion: null,
    hostUserAgent: null,
    browserVersion: null,
    benchmarkIndex: null,
    runWarnings: [],
    metricas:
      perf === null
        ? null
        : { notas: { performance: perf, accessibility: 80, "best-practices": 90, seo: 70 }, fcpMs: 1000, lcpMs: lcp, tbtMs: 0, cls: 0, speedIndexMs: 1000, pesoTotalBytes: 100, requisicoes: 3, jsNaoUsadoBytes: null, cssNaoUsadoBytes: null },
  };
}

describe("ordemDasExecucoes", () => {
  it("intercala as variantes e alterna quem abre entre os sites", () => {
    expect(ordemDasExecucoes(0, 2)).toEqual([
      { variante: "original", n: 1 },
      { variante: "corrigido", n: 1 },
      { variante: "original", n: 2 },
      { variante: "corrigido", n: 2 },
    ]);
    expect(ordemDasExecucoes(1, 1)).toEqual([
      { variante: "corrigido", n: 1 },
      { variante: "original", n: 1 },
    ]);
    expect(ordemDasExecucoes(4)).toHaveLength(6);
  });
});

describe("resumirLighthouse", () => {
  it("usa as métricas da execução mediana pela nota e ignora as inválidas na variação", () => {
    const r = resumirLighthouse([execucao(1, 40, 3000), execucao(2, 60, 1000), execucao(3, 50, 2000)]);
    expect(r.mediana).toEqual({ criterio: "nota-performance", n: 3 });
    expect(r.metricas?.lcpMs).toBe(2000);
    expect(r.variacaoPerformance.amplitude).toBe(20);
    const s = resumirLighthouse([execucao(1, null), execucao(2, 70), execucao(3, 30)]);
    expect(s.mediana.n).toBe(3); // par: a de menor nota entre as duas do meio
    expect(s.variacaoPerformance.n).toBe(2);
  });
  it("sem execução válida: mediana e métricas nulas", () => {
    const r = resumirLighthouse([execucao(1, null)]);
    expect(r.mediana.n).toBeNull();
    expect(r.metricas).toBeNull();
  });
});

describe("semanticaDoDom", () => {
  it("calcula indicadores e índice; body sem elementos fica vazio, sem índice", () => {
    const ok = semanticaDoDom('<html lang="pt-BR"><head><title>x</title></head><body><header></header><main><h1>a</h1></main></body></html>', false);
    expect(ok.status).toBe("ok");
    expect(ok.indice?.subnotas.metadados).toBe(100);
    const vazio = semanticaDoDom("<html><body></body></html>", true);
    expect(vazio).toMatchObject({ status: "vazio", indice: null, networkidleTimeout: true });
  });
});

describe("calcularDeltas e linhaValidacao", () => {
  const variante = (perf: number | null, html: string): ResultadoVariante => ({
    urlLocal: "",
    execucoes: [],
    mediana: { criterio: "nota-performance", n: perf === null ? null : 1 },
    metricas: execucao(1, perf).metricas,
    variacaoPerformance: { n: 0, min: null, max: null, amplitude: null, media: null, desvioPadrao: null },
    semantica: semanticaDoDom(html, false),
    faltasNoServidor: [],
  });
  const o = variante(40, "<html><body><div><h1>a</h1></div></body></html>");
  const c = variante(55, '<html lang="pt-BR"><body><main><h1>a</h1></main></body></html>');

  it("delta = corrigido − original; falta de um lado dá null", () => {
    const d = calcularDeltas(o, c);
    expect(d.nota_performance).toEqual({ original: 40, corrigido: 55, delta: 15 });
    expect(d.sub_landmarks).toEqual({ original: 0, corrigido: 25, delta: 25 });
    expect(d.sub_metadados.delta).toBe(50);
    expect(calcularDeltas(o, variante(null, "<p>x</p>")).nota_performance).toEqual({ original: 40, corrigido: null, delta: null });
  });

  it("a linha do CSV tem uma célula por coluna", () => {
    const linha = linhaValidacao({
      siteId: "x.ufrn.br",
      contexto: { grupo: "estatico", tecnologia: "estatico", tipo: "outro" },
      recomendacoes: { total: 3, corrigidas: 2, corrigidasLlm: 0, llm: null },
      ordem: ordemDasExecucoes(1),
      variantes: { original: o, corrigido: c },
      deltas: calcularDeltas(o, c),
    });
    const cols = colunasValidacao();
    expect(linha).toHaveLength(cols.length);
    expect(linha[cols.indexOf("ordem")]).toBe("corrigido");
    expect(linha[cols.indexOf("nota_performance_delta")]).toBe("15");
    expect(linha[cols.indexOf("lcp_ms_original")]).toBe("2000");
  });
});

describe("validarSite (integração com a fixture da S17)", () => {
  let tmp: string;
  let browser: Browser;
  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), "validacao-"));
    copyFileSync(join(FIX, "processed", "fixed.html"), join(tmp, "fixed.html"));
    gravarSnapshot({ siteId: "exemplo.ufrn.br", dirRaw: join(FIX, "raw", "exemplo.ufrn.br"), dirProcessado: tmp, meta: META });
    browser = await chromium.launch({ args: [BLOQUEIO_DE_REDE] });
  });
  afterAll(async () => {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("copiaEmDia: cópia com corrigido.html e mais nova que o fixed.html", () => {
    expect(copiaEmDia(tmp)).toBe(true);
    const futuro = new Date(Date.now() + 60_000);
    utimesSync(join(tmp, "fixed.html"), futuro, futuro);
    expect(copiaEmDia(tmp)).toBe(false);
    expect(copiaEmDia(join(tmp, "nao-existe"))).toBe(false);
  });

  it("mede as duas variantes, intercaladas, com o bloqueio de rede, e grava validation.json", async () => {
    const chamadas: Array<{ url: string; extras: string[] | undefined }> = [];
    const notas = [50, 60, 40, 70, 45, 65]; // O, C, O, C, O, C (site na posição 0)
    const runner: LighthouseRunner = async (url, opts) => {
      chamadas.push({ url, extras: opts.chromeFlagsExtras });
      const r = lhr(notas[chamadas.length - 1]!, 1000 * chamadas.length);
      return { lhr: r, json: JSON.stringify(r), browserVersion: "1.0" };
    };
    const v = await validarSite({
      siteId: "exemplo.ufrn.br",
      posicao: 0,
      dirSnapshot: join(tmp, "snapshot"),
      dirSaida: tmp,
      meta: META,
      browser,
      runner,
      chromePath: "",
      userAgent: "TCC-teste",
      relogio: new Date("2026-11-09T12:00:00Z"),
      contexto: { grupo: "estatico", tecnologia: "estatico", tipo: "outro" },
      recomendacoes: { total: 1, corrigidas: 1, corrigidasLlm: 0, llm: null },
    });

    expect(chamadas).toHaveLength(6);
    expect(chamadas.every((c) => c.extras?.includes(BLOQUEIO_DE_REDE))).toBe(true);
    // Portas diferentes para as variantes, alternando O/C.
    expect(new Set(chamadas.map((c) => new URL(c.url).port)).size).toBe(2);
    expect(chamadas[0]!.url).toBe(v.variantes.original.urlLocal);
    expect(chamadas[1]!.url).toBe(v.variantes.corrigido.urlLocal);

    // Mediana pela nota: original 50/40/45 → 45 (3ª); corrigido 60/70/65 → 65 (3ª).
    expect(v.variantes.original.mediana.n).toBe(3);
    expect(v.deltas.nota_performance).toEqual({ original: 45, corrigido: 65, delta: 20 });

    // Semântica sobre o DOM local: o fixed.html da fixture acrescenta lang="pt-BR".
    expect(v.variantes.original.semantica?.indicadores.metadados.lang).toBeNull();
    expect(v.variantes.corrigido.semantica?.indicadores.metadados.lang).toBe("pt-BR");
    expect(v.deltas.sub_metadados.delta).toBe(50);

    for (const f of ["validation.json", "validacao/dom-original.html", "validacao/dom-corrigido.html", "validacao/lh-original-1.json", "validacao/lh-corrigido-3.json"]) {
      expect(existsSync(join(tmp, f))).toBe(true);
    }
    const gravado = JSON.parse(readFileSync(join(tmp, "validation.json"), "utf8"));
    expect(gravado.meta).toEqual(META);
    expect(gravado.parametros).toMatchObject({ execucoesPorVariante: 3, relogioLighthouse: "real", relogioSemantica: "2026-11-09T12:00:00.000Z" });
  }, 60_000);
});
