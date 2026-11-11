import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { celula, COLUNAS, linhaDoDataset, montarMetricasSite } from "../../src/analyze/dataset.js";
import { analisarPerformanceDoSite } from "../../src/analyze/performance.js";
import { montarSemanticaSite } from "../../src/analyze/semantics.js";
import type { Meta } from "../../src/shared/types.js";

/** Montagem do dataset (S12, ADR 012). Performance das fixtures da S09; semântica de HTML escrito aqui. */
const META: Meta = {
  generatedAt: "2026-11-11T00:00:00.000Z",
  toolVersions: { node: "test", lighthouse: null, playwright: null },
  gitCommit: null,
  gitDirty: false,
};
const PERF = join("tests", "fixtures", "analyze", "sites");
const HTML = readFileSync(join("tests", "fixtures", "analyze", "semantics", "sites", "ok.exemplo.ufrn.br", "rendered.html"), "utf8");
const CTX = { tipo: "evento", tecnologia: "wordpress" };

const semantica = (id: string, html: string | null = HTML) =>
  montarSemanticaSite({ meta: META, collect: { id, url: `https://${id}/` }, html });
const site = (id: string, opts: { semPerf?: boolean; html?: string | null } = {}) =>
  montarMetricasSite({
    meta: META,
    performance: opts.semPerf ? null : analisarPerformanceDoSite(join(PERF, id), META),
    semantica: semantica(id, opts.html === undefined ? HTML : opts.html),
    contexto: CTX,
  });

describe("montarMetricasSite", () => {
  it("performance completa e sem exclusão → conjunto principal; meta só no topo", () => {
    const m = site("3cnienssup.ufrn.br");
    expect(m.conjuntoPrincipal).toBe(true);
    expect(m.meta).toBe(META);
    expect(m.performance).not.toHaveProperty("meta");
    expect(m.semantica).not.toHaveProperty("meta");
    expect(m.indice?.indice).not.toBeNull();
  });

  it("parcial, falha ou sem lighthouse → fora do conjunto principal", () => {
    expect(site("proex.ufrn.br").conjuntoPrincipal).toBe(false);
    expect(site("fmu.ufrn.br").conjuntoPrincipal).toBe(false);
    expect(site("3cnienssup.ufrn.br", { semPerf: true }).conjuntoPrincipal).toBe(false);
  });

  it("site excluído da análise (ADR 009) fica fora mesmo com performance completa", () => {
    const m = montarMetricasSite({
      meta: META,
      performance: { ...analisarPerformanceDoSite(join(PERF, "3cnienssup.ufrn.br"), META), exclusao: { motivo: "login", detalhe: "x" } },
      semantica: semantica("pingifes.ufrn.br"),
      contexto: CTX,
    });
    expect(m.conjuntoPrincipal).toBe(false);
  });

  it("body vazio → índice null", () => {
    expect(site("3cnienssup.ufrn.br", { html: "<html><body></body></html>" }).indice).toBeNull();
  });
});

describe("linhaDoDataset", () => {
  it("tem todas as colunas, na ordem, e nenhuma a mais", () => {
    const l = linhaDoDataset(site("3cnienssup.ufrn.br"));
    expect(Object.keys(l)).toEqual([...COLUNAS]);
    expect(new Set(COLUNAS).size).toBe(COLUNAS.length);
  });

  it("brutos de performance, semântica e índice", () => {
    const l = linhaDoDataset(site("3cnienssup.ufrn.br"));
    expect(l).toMatchObject({
      id: "3cnienssup.ufrn.br",
      tipo: "evento",
      tecnologia: "wordpress",
      conjunto_principal: true,
      status_performance: "completo",
      status_semantica: "ok",
      nota_performance: 48,
      n_auditorias_falha: 23,
      lh_execucao: 2,
      elementos_body: 9,
      proporcao_div_span: 0.2222,
      lm_main: 1,
      titulos_saltos: 1,
      lang: "pt-BR",
      img_total: 0,
      sub_landmarks: 100,
      sub_titulos: 50,
      sub_imagens: null,
      vnu_status: null,
    });
    expect(l.sub_div_span).toBe(77.78);
    expect(COLUNAS.filter((c) => c.startsWith("sub_"))).toEqual([
      "sub_landmarks", "sub_titulos", "sub_imagens", "sub_campos", "sub_div_span", "sub_metadados", "sub_interativos", "sub_obsoletos",
    ]);
    expect(l.indice_semantica).toBe(81.2);
    expect(l.indice_semantica_pesos_iguais).toBe(85.56);
  });

  it("falha de performance: métricas vazias, semântica presente", () => {
    const l = linhaDoDataset(site("fmu.ufrn.br"));
    expect(l).toMatchObject({ status_performance: "falha", nota_performance: null, n_auditorias_falha: null, lm_main: 1 });
  });

  it("sem lighthouse e sem rendered.html", () => {
    const l = linhaDoDataset(site("x.ufrn.br", { semPerf: true, html: null }));
    expect(l).toMatchObject({ status_performance: "sem-lighthouse", status_semantica: "sem-arquivo", elementos_body: null, indice_semantica: null });
  });
});

describe("celula", () => {
  it("null vira vazio; booleano e número viram texto", () => {
    expect([null, undefined, true, false, 0, 1.5, "a"].map(celula)).toEqual(["", "", "true", "false", "0", "1.5", "a"]);
  });
});
