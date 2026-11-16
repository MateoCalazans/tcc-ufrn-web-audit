import { describe, expect, it } from "vitest";

import { renderBlockingHint } from "../../src/recommend/rules/render-blocking-hint.js";
import { ler, lhr, rodar } from "./comum.js";

const HTML = ler("render-blocking-hint/scripts.html");
const LH = lhr({
  "render-blocking-insight": {
    score: 0,
    details: {
      items: [
        { url: "https://exemplo.ufrn.br/css/estilo.css", totalBytes: 1000, wastedMs: 300 },
        { url: "https://exemplo.ufrn.br/js/jquery.js", totalBytes: 90000, wastedMs: 450 },
        { url: "https://exemplo.ufrn.br/sub/app.js?v=2", totalBytes: 2000 },
        { url: "https://cdn.exemplo.com/lib.js", totalBytes: 5000, wastedMs: 120 },
        { url: "https://exemplo.ufrn.br/js/injetado.js", totalBytes: 100 },
        { url: "https://cdn.exemplo.com/fonte.css", totalBytes: 800 },
      ],
    },
  },
});

describe("render-blocking-hint", () => {
  it("scripts e folhas de estilo listados pelo Lighthouse e presentes no HTML → só recomendação, na ordem do documento", async () => {
    const r = await rodar(renderBlockingHint, HTML, { lighthouse: LH });
    expect(r.recommendations.map((x) => x.evidencia)).toEqual([
      '<link rel="stylesheet" href="/css/estilo.css">',
      '<link rel="STYLESHEET" href="https://cdn.exemplo.com/fonte.css">',
      '<script src="/js/jquery.js">',
      '<script src="app.js?v=2">',
      '<script src="https://cdn.exemplo.com/lib.js#x">',
    ]);
    expect(r.recommendations.every((x) => !x.correcaoAutomatica && x.dimensao === "performance" && x.severidade === "media")).toBe(true);
    expect(r.fixedHtml).toBe(HTML);
  });

  it("mensagem conforme o tipo: defer/async para script, CSS crítico/media para folha de estilo", async () => {
    const r = await rodar(renderBlockingHint, HTML, { lighthouse: LH });
    const css = r.recommendations[0]!.mensagem;
    const js = r.recommendations[2]!.mensagem;
    expect(css).toContain("Folha de estilo");
    expect(css).toContain("300 ms");
    expect(css).toContain("media");
    expect(js).toContain("Script");
    expect(js).toContain("450 ms");
    expect(js).toContain("defer");
  });

  it("sem relatório do Lighthouse → nada (não há evidência de bloqueio)", async () => {
    expect((await rodar(renderBlockingHint, HTML)).recommendations).toEqual([]);
  });

  it("auditoria aprovada ou sem itens → nada", async () => {
    const r = await rodar(renderBlockingHint, HTML, { lighthouse: lhr({ "render-blocking-insight": { score: 1, details: { items: [] } } }) });
    expect(r.recommendations).toEqual([]);
  });
});
