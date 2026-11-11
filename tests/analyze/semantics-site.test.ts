import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { analisarSemanticaDoSite, temMetaRefreshAtivo } from "../../src/analyze/semantics.js";
import type { Meta } from "../../src/shared/types.js";

/**
 * Leitura de `data/raw/<id>/` (S10, ADR 010, 1a). Sites sintéticos:
 *   - ok.exemplo      — meta refresh no bruto; rendered.html já é o destino;
 *   - stub.exemplo    — rendered.html ainda é o stub com meta refresh;
 *   - vazio.exemplo   — rendered.html sem elementos;
 *   - sem-arquivo.exemplo — sem rendered.html.
 */
const SITES = join("tests", "fixtures", "analyze", "semantics", "sites");
const META: Meta = {
  generatedAt: "2026-11-10T00:00:00.000Z",
  toolVersions: { node: "test", lighthouse: null, playwright: null, cheerio: "1.2.0" },
  gitCommit: null,
  gitDirty: false,
};
const site = (id: string) => analisarSemanticaDoSite(join(SITES, id), META);

describe("analisarSemanticaDoSite", () => {
  it("destino já renderizado: metaRefresh sim, renderedComRefresh não", () => {
    const s = site("ok.exemplo.ufrn.br");
    expect(s).toMatchObject({
      id: "ok.exemplo.ufrn.br",
      status: "ok",
      metaRefresh: true,
      renderedComRefresh: false,
      renderFinalUrl: "https://ok.exemplo.ufrn.br/portal",
      exclusao: null,
    });
    expect(s.coleta.gitCommit).toBe("3b2ba91cb6f9f1312623d7e4c6e0889ec053e2e5");
    expect(s.coleta.toolVersions.chromium).toBe("156.0.8078.4");
    expect(s.meta.toolVersions.cheerio).toBe("1.2.0");
    expect(s.indicadores?.divSpan).toEqual({ div: 1, span: 1, total: 9, proporcao: 2 / 9 });
    expect(s.indicadores?.landmarks).toEqual({ banner: 1, navigation: 1, main: 1, contentinfo: 1 });
    expect(s.indicadores?.titulos).toMatchObject({ total: 2, h1: 1, saltos: 1, maiorSalto: 2 });
    // Parte 2 (S11, ADR 011) entra no mesmo objeto.
    expect(s.indicadores?.metadados).toEqual({
      lang: "pt-BR",
      temTitle: true,
      titleComprimento: 6,
      temViewport: false,
      temDescription: false,
    });
    expect(s.indicadores?.estrutura).toEqual({ article: 0, section: 0, aside: 0, figure: 0, ul: 0, ol: 0 });
    expect(s.indicadores?.obsoletas.whatwg).toBe(0);
    expect(s.vnu).toBeNull();
  });

  it("com --vnu e Java incompatível, cada site leva o motivo e a análise segue", () => {
    const s = analisarSemanticaDoSite(join(SITES, "ok.exemplo.ufrn.br"), META, { disponivel: false, motivo: "Java 8 < 17 (exigido pelo vnu.jar)" });
    expect(s.vnu).toEqual({ status: "indisponivel", motivo: "Java 8 < 17 (exigido pelo vnu.jar)" });
    expect(s.indicadores).not.toBeNull();
  });

  it("com --vnu disponível, valida o rendered.html; sem arquivo, vnu fica null", () => {
    const arquivos: string[] = [];
    const vnu = { disponivel: true as const, versao: "x", validar: (f: string) => (arquivos.push(f), { status: "ok" as const, versao: "x", erros: 3, avisos: 0 }) };
    expect(analisarSemanticaDoSite(join(SITES, "ok.exemplo.ufrn.br"), META, vnu).vnu).toMatchObject({ erros: 3 });
    expect(arquivos).toEqual([join(SITES, "ok.exemplo.ufrn.br", "rendered.html")]);
    expect(analisarSemanticaDoSite(join(SITES, "sem-arquivo.exemplo.ufrn.br"), META, vnu).vnu).toBeNull();
  });

  it("stub de redirecionamento: renderedComRefresh sim, indicadores do stub", () => {
    const s = site("stub.exemplo.ufrn.br");
    expect(s).toMatchObject({ status: "ok", metaRefresh: true, renderedComRefresh: true });
    expect(s.indicadores?.divSpan.proporcao).toBe(1);
  });

  it("rendered.html sem elementos: status vazio", () => {
    const s = site("vazio.exemplo.ufrn.br");
    expect(s.status).toBe("vazio");
    expect(s.indicadores?.divSpan.proporcao).toBeNull();
  });

  it("sem rendered.html: status sem-arquivo e indicadores null", () => {
    const s = site("sem-arquivo.exemplo.ufrn.br");
    expect(s).toMatchObject({ status: "sem-arquivo", indicadores: null, renderedComRefresh: false });
  });
});

describe("temMetaRefreshAtivo", () => {
  it("detecta refresh no head, sem diferenciar caixa", () => {
    expect(temMetaRefreshAtivo('<head><meta HTTP-EQUIV="Refresh" content="0;url=/x"></head><body></body>')).toBe(true);
  });

  it("ignora refresh dentro de noscript (só vale com JS desligado)", () => {
    const html = '<head><noscript><meta http-equiv="Refresh" content="0; URL=https://login.exemplo/jsdisabled" /></noscript></head><body><p>x</p></body>';
    expect(temMetaRefreshAtivo(html)).toBe(false);
  });

  it("sem refresh", () => {
    expect(temMetaRefreshAtivo('<head><meta charset="utf-8"></head><body></body>')).toBe(false);
  });
});
