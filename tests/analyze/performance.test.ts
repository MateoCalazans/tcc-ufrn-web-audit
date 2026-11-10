import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { LighthouseRecord } from "../../src/collect/lighthouse.js";
import {
  analisarPerformanceDoSite,
  auditoriasComFalha,
  escolherExecucao,
  extrairMetricas,
  type LhrMinimo,
  montarPerformanceSite,
} from "../../src/analyze/performance.js";
import type { Meta } from "../../src/shared/types.js";

/**
 * Fixtures reais, enxugadas da coleta congelada de 2026-11-09 por
 * `scripts/fixture-performance.ts`:
 *   - 3cnienssup.ufrn.br — 3 válidas (41/48/52), mediana n=2;
 *   - proex.ufrn.br      — só a 3ª válida (NO_NAVSTART nas outras);
 *   - fmu.ufrn.br        — NO_FCP nas 3;
 *   - acervus.ufrn.br    — meta refresh; mediana n=1, nFcpTti=2.
 */
const SITES = join("tests", "fixtures", "analyze", "sites");
const dir = (id: string) => join(SITES, id);
const ler = <T>(...p: string[]): T => JSON.parse(readFileSync(join(...p), "utf8")) as T;

const META: Meta = {
  generatedAt: "2026-11-10T00:00:00.000Z",
  toolVersions: { node: "test", lighthouse: "13.5.0", playwright: null },
  gitCommit: null,
  gitDirty: false,
};

describe("extrairMetricas", () => {
  it("extrai notas e métricas da execução mediana (3cnienssup, lh2)", () => {
    const m = extrairMetricas(ler<LhrMinimo>(SITES, "3cnienssup.ufrn.br", "lh2.json"));
    expect(m.notas).toEqual({ performance: 48, accessibility: 91, "best-practices": 69, seo: 92 });
    expect(m.fcpMs).toBeCloseTo(3761.249, 2);
    expect(m.lcpMs).toBeCloseTo(6563.145, 2);
    expect(m.tbtMs).toBe(108);
    expect(m.cls).toBeCloseTo(0.24145, 4);
    expect(m.speedIndexMs).toBeCloseTo(9870.344, 2);
    expect(m.pesoTotalBytes).toBe(3989357);
    expect(m.requisicoes).toBe(163);
    expect(m.jsNaoUsadoBytes).toBe(0);
    expect(m.cssNaoUsadoBytes).toBe(25564);
  });

  it("devolve null para auditoria ausente, sem quebrar", () => {
    const m = extrairMetricas({ categories: { performance: { score: 0.5 } }, audits: {} });
    expect(m.notas.performance).toBe(50);
    expect(m.notas.seo).toBeNull();
    expect(m.lcpMs).toBeNull();
    expect(m.requisicoes).toBeNull();
    expect(m.jsNaoUsadoBytes).toBeNull();
  });
});

describe("auditoriasComFalha", () => {
  const lhr = ler<LhrMinimo>(SITES, "3cnienssup.ufrn.br", "lh2.json");
  const falhas = auditoriasComFalha(lhr);
  const ids = falhas.map((f) => f.id);

  it("lista score < 0.9 fora dos grupos metrics/hidden (23 no 3cnienssup)", () => {
    expect(falhas).toHaveLength(23);
    expect(falhas.every((f) => f.score < 0.9)).toBe(true);
    expect(ids).toEqual(expect.arrayContaining(["unused-css-rules", "link-name", "meta-description", "total-byte-weight"]));
  });

  it("não lista métricas (grupo metrics) nem auditorias ocultas (hidden)", () => {
    for (const id of ["first-contentful-paint", "largest-contentful-paint", "cumulative-layout-shift", "speed-index"]) {
      expect(ids).not.toContain(id);
    }
    for (const id of ["interactive", "server-response-time", "layout-shifts"]) expect(ids).not.toContain(id);
  });

  it("registra modo e categorias", () => {
    expect(falhas.find((f) => f.id === "link-name")).toMatchObject({ modo: "binary", score: 0, categorias: ["accessibility"] });
    expect(falhas.find((f) => f.id === "total-byte-weight")).toMatchObject({ modo: "metricSavings", categorias: ["performance"] });
  });

  it("ignora informative, manual, notApplicable e score 0.9", () => {
    const sintetico: LhrMinimo = {
      categories: {
        performance: {
          score: 1,
          auditRefs: ["a", "b", "c", "d", "e"].map((id) => ({ id, group: "diagnostics" })),
        },
      },
      audits: {
        a: { id: "a", score: 0, scoreDisplayMode: "informative" },
        b: { id: "b", score: 0, scoreDisplayMode: "manual" },
        c: { id: "c", score: null, scoreDisplayMode: "notApplicable" },
        d: { id: "d", score: 0.9, scoreDisplayMode: "numeric" },
        e: { id: "e", score: 0.89, scoreDisplayMode: "numeric" },
        fora: { id: "fora", score: 0, scoreDisplayMode: "binary" },
      },
    };
    expect(auditoriasComFalha(sintetico).map((f) => f.id)).toEqual(["e"]);
  });
});

describe("escolherExecucao", () => {
  it("completo: 3 válidas, usa a mediana pela nota", () => {
    const r = escolherExecucao(ler<LighthouseRecord>(SITES, "3cnienssup.ufrn.br", "lighthouse.json"));
    expect(r).toEqual({ status: "completo", execucoesValidas: 3, execucao: 2, errosDasExecucoes: [] });
  });

  it("parcial: 1 válida (proex)", () => {
    const r = escolherExecucao(ler<LighthouseRecord>(SITES, "proex.ufrn.br", "lighthouse.json"));
    expect(r).toEqual({ status: "parcial", execucoesValidas: 1, execucao: 3, errosDasExecucoes: ["NO_NAVSTART", "NO_NAVSTART"] });
  });

  it("falha: 0 válidas (fmu, NO_FCP)", () => {
    const r = escolherExecucao(ler<LighthouseRecord>(SITES, "fmu.ufrn.br", "lighthouse.json"));
    expect(r).toEqual({ status: "falha", execucoesValidas: 0, execucao: null, errosDasExecucoes: ["NO_FCP", "NO_FCP", "NO_FCP"] });
  });

  it("execução inválida sem runtimeError nem erro vira sem-nota", () => {
    const rec = ler<LighthouseRecord>(SITES, "fmu.ufrn.br", "lighthouse.json");
    const semNota = { ...rec, execucoes: rec.execucoes.map((e) => ({ ...e, runtimeError: null, erro: null })) };
    expect(escolherExecucao(semNota).errosDasExecucoes).toEqual(["sem-nota", "sem-nota", "sem-nota"]);
  });
});

describe("analisarPerformanceDoSite", () => {
  it("site completo: proveniência, sensibilidade e métricas", () => {
    const s = analisarPerformanceDoSite(dir("3cnienssup.ufrn.br"), META);
    expect(s.meta).toBe(META);
    expect(s.coleta.gitCommit).toBe("3b2ba91cb6f9f1312623d7e4c6e0889ec053e2e5");
    expect(s.coleta.toolVersions.lighthouse).toBe("13.5.0");
    expect(s).toMatchObject({ status: "completo", execucao: 2, nFcpTti: 2, amplitudePerformance: 11, metaRefresh: false, exclusao: null });
    expect(s.metricas?.notas.performance).toBe(48);
    expect(s.auditoriasComFalha).toHaveLength(23);
  });

  it("site parcial mantém as métricas da única válida", () => {
    const s = analisarPerformanceDoSite(dir("proex.ufrn.br"), META);
    expect(s.status).toBe("parcial");
    expect(s.metricas?.notas.performance).toBe(48);
    expect(s.metricas?.cssNaoUsadoBytes).toBe(714150);
    expect(s.auditoriasComFalha).toHaveLength(21);
  });

  it("site com falha: métricas nulas e motivo", () => {
    const s = analisarPerformanceDoSite(dir("fmu.ufrn.br"), META);
    expect(s).toMatchObject({ status: "falha", execucao: null, metricas: null, auditoriasComFalha: null, finalDisplayedUrl: null });
    expect(s.errosDasExecucoes).toEqual(["NO_FCP", "NO_FCP", "NO_FCP"]);
  });

  it("meta refresh: marca a flag e registra a URL medida (destino)", () => {
    const s = analisarPerformanceDoSite(dir("acervus.ufrn.br"), META);
    expect(s.metaRefresh).toBe(true);
    expect(s.finalDisplayedUrl).toBe("https://acervus.ufrn.br/acervus-publico/");
    expect(s).toMatchObject({ execucao: 1, nFcpTti: 2 });
    // 19 com score < 0.9 − 4 métricas − 4 hidden (mpfid, interactive, redirects, layout-shifts).
    expect(s.auditoriasComFalha).toHaveLength(11);
  });

  it("aplica as exclusões da análise (ADR 009, item 4)", () => {
    const registro = ler<LighthouseRecord>(SITES, "fmu.ufrn.br", "lighthouse.json");
    const s = montarPerformanceSite({ meta: META, registro: { ...registro, id: "comunica.ufrn.br" }, lhr: null, metaRefresh: null });
    expect(s.exclusao).toMatchObject({ motivo: "nao-html" });
  });

  it("acusa relatório faltando quando há execução válida", () => {
    const registro = ler<LighthouseRecord>(SITES, "3cnienssup.ufrn.br", "lighthouse.json");
    expect(() => montarPerformanceSite({ meta: META, registro, lhr: null, metaRefresh: null })).toThrow(/lh2\.json/);
  });
});
