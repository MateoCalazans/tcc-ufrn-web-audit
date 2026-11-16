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
      ],
    },
  },
});

describe("render-blocking-hint", () => {
  it("scripts listados pelo Lighthouse e presentes no HTML sem async/defer → só recomendação", async () => {
    const r = await rodar(renderBlockingHint, HTML, { lighthouse: LH });
    expect(r.recommendations.map((x) => x.evidencia)).toEqual([
      '<script src="/js/jquery.js">',
      '<script src="app.js?v=2">',
      '<script src="https://cdn.exemplo.com/lib.js#x">',
    ]);
    expect(r.recommendations.every((x) => !x.correcaoAutomatica && x.dimensao === "performance" && x.severidade === "media")).toBe(true);
    expect(r.recommendations[0]!.mensagem).toContain("450 ms");
    expect(r.recommendations[0]!.mensagem).toContain("defer");
    expect(r.fixedHtml).toBe(HTML);
  });

  it("sem relatório do Lighthouse → nada (não há evidência de bloqueio)", async () => {
    expect((await rodar(renderBlockingHint, HTML)).recommendations).toEqual([]);
  });

  it("auditoria aprovada ou sem itens → nada", async () => {
    const r = await rodar(renderBlockingHint, HTML, { lighthouse: lhr({ "render-blocking-insight": { score: 1, details: { items: [] } } }) });
    expect(r.recommendations).toEqual([]);
  });
});
