import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { type MetricasSite, montarMetricasSite } from "../../src/analyze/dataset.js";
import { analisarPerformanceDoSite } from "../../src/analyze/performance.js";
import { montarSemanticaSite } from "../../src/analyze/semantics.js";
import { esc, num, pct } from "../../src/report/html.js";
import { media, mediana, noRecorteSemantico, panoramaHtml, resumirPanorama } from "../../src/report/panorama.js";
import { relatorioSite } from "../../src/report/site.js";
import type { Meta } from "../../src/shared/types.js";

/** Relatórios (S13). Reusa as fixtures da análise (S09–S12): o relatório lê o `metrics.json`. */
const META: Meta = {
  generatedAt: "2026-11-12T00:00:00.000Z",
  toolVersions: { node: "test", lighthouse: null, playwright: null },
  gitCommit: "abc123",
  gitDirty: false,
};
const PERF = join("tests", "fixtures", "analyze", "sites");
const HTML_OK = readFileSync(join("tests", "fixtures", "analyze", "semantics", "sites", "ok.exemplo.ufrn.br", "rendered.html"), "utf8");
const SEM_LANDMARKS = "<html lang='pt-BR'><head><title>x</title></head><body><div><h1>t</h1><p>a</p></div></body></html>";

function site(id: string, opts: { html?: string; perf?: string | null; tecnologia?: string } = {}): MetricasSite {
  const perf = opts.perf === undefined ? id : opts.perf;
  return montarMetricasSite({
    meta: META,
    performance: perf === null ? null : { ...analisarPerformanceDoSite(join(PERF, perf), META), id },
    semantica: montarSemanticaSite({ meta: META, collect: { id, url: `https://${id}/` }, html: opts.html ?? HTML_OK }),
    contexto: { tipo: "evento", tecnologia: opts.tecnologia ?? "wordpress" },
  });
}

describe("html", () => {
  it("escapa HTML e formata números em pt-BR", () => {
    expect(esc(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    expect(esc(null)).toBe("");
    expect(num(1234.567, 1)).toBe("1.234,6");
    expect(num(null)).toBe("—");
    expect(pct(1, 4)).toBe("25,0%");
    expect(pct(1, 0)).toBe("—");
  });
});

describe("mediana e média", () => {
  it("par, ímpar e vazio", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBeNull();
    expect(media([1, 2, 6])).toBe(3);
    expect(media([])).toBeNull();
  });
});

describe("resumirPanorama", () => {
  const sites = [
    site("a.ufrn.br", { perf: "3cnienssup.ufrn.br" }),
    site("b.ufrn.br", { perf: "3cnienssup.ufrn.br", html: SEM_LANDMARKS }),
    site("c.ufrn.br", { perf: "3cnienssup.ufrn.br", html: "<html><body></body></html>" }), // vazio
    site("d.ufrn.br", { perf: "proex.ufrn.br" }), // parcial: fora do principal
    site("e.ufrn.br", { perf: null }),
  ];
  const r = resumirPanorama(sites);

  it("conjuntos do ADR 013 (1c)", () => {
    expect(r.total).toBe(5);
    expect(r.conjuntoPrincipal).toBe(3);
    expect(r.recorteSemantico).toBe(2);
    expect(sites.map(noRecorteSemantico)).toEqual([true, true, false, false, false]);
  });

  it("sem main nem nav conta só no recorte semântico", () => {
    expect(r.semMainNemNav).toBe(1);
    expect(r.semMain).toBeGreaterThanOrEqual(1);
  });

  it("auditorias: frequência só no conjunto principal, em ordem decrescente", () => {
    const n = sites[0]!.performance!.auditoriasComFalha!.length;
    expect(n).toBeGreaterThan(0);
    expect(r.auditorias).toHaveLength(n);
    expect(r.auditorias.every((a) => a.sites === 3)).toBe(true);
    const ids = r.auditorias.map((a) => a.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("medianas usam os conjuntos certos", () => {
    expect(r.medianaPerformance).toBe(48);
    expect(r.medianaIndice).not.toBeNull();
  });
});

describe("relatorioSite", () => {
  it("tem notas, índice, auditorias, meta no rodapé e escapa o id", () => {
    const html = relatorioSite(site("3cnienssup.ufrn.br"), META);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<h1>3cnienssup.ufrn.br</h1>");
    expect(html).toContain("Índice de semântica:");
    expect(html).toContain("Auditorias com falha (23)");
    expect(html).toContain("commit abc123");
    expect(html).not.toContain("Fora do conjunto principal");
  });

  it("avisa quando está fora do conjunto principal, sem índice ou sem Lighthouse", () => {
    const fora = relatorioSite(site("x.ufrn.br", { perf: null, html: "<html><body></body></html>" }), META);
    expect(fora).toContain("Fora do conjunto principal");
    expect(fora).toContain("status vazio");
    expect(fora).toContain("Sem Lighthouse");
    expect(fora).toContain("Índice não calculado");
  });
});

describe("panoramaHtml", () => {
  it("lista todos os sites com link e o top 10", () => {
    const html = panoramaHtml([site("a.ufrn.br", { perf: "3cnienssup.ufrn.br" }), site("b.ufrn.br", { perf: null })], META);
    expect(html).toContain('href="sites/a.ufrn.br.html"');
    expect(html).toContain('href="sites/b.ufrn.br.html"');
    expect(html).toContain("10 auditorias que mais falham (conjunto principal, n = 1)");
    expect((html.match(/<code>/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });
});
