import { describe, expect, it } from "vitest";

import { aplicarEdicoes } from "../../src/recommend/engine.js";
import { trechoDaCorrecao, trechosDasCorrecoes } from "../../src/ui/trechos.js";

describe("trechoDaCorrecao", () => {
  const html = "<html>\n<body>\n<img src=a.png>\n<p>fim</p>\n</body>\n</html>\n";
  const pos = html.indexOf(">", html.indexOf("<img"));

  it("recorta a linha tocada e aplica só as edições daquela recomendação", () => {
    const t = trechoDaCorrecao(html, [{ inicio: pos, fim: pos, texto: ' width="1" height="1"' }]);
    expect(t).toEqual({
      linha: 3,
      antes: "<img src=a.png>",
      depois: '<img src=a.png width="1" height="1">',
      cortadoInicio: false,
      cortadoFim: false,
    });
  });

  it("corta linhas longas (HTML minificado) com a margem, nos dois lados", () => {
    const longo = "x".repeat(500) + "<img>" + "y".repeat(500);
    const i = longo.indexOf("<img") + 4;
    const t = trechoDaCorrecao(longo, [{ inicio: i, fim: i, texto: " loading=lazy" }], 10)!;
    expect(t.antes).toBe("x".repeat(6) + "<img>" + "y".repeat(9));
    expect(t.depois).toBe("x".repeat(6) + "<img loading=lazy>" + "y".repeat(9));
    expect(t).toMatchObject({ linha: 1, cortadoInicio: true, cortadoFim: true });
  });

  it("várias linhas e substituição (font → span), sem levar o \\r do CRLF", () => {
    const crlf = "<p>\r\n<font>a</font>\r\n<b>x</b>\r\n";
    const ini = crlf.indexOf("<font>");
    const fim = crlf.indexOf("</font>");
    const t = trechoDaCorrecao(crlf, [
      { inicio: ini, fim: ini + 6, texto: "<span>" },
      { inicio: fim, fim: fim + 7, texto: "</span>" },
    ])!;
    expect(t.linha).toBe(2);
    expect(t.antes).toBe("<font>a</font>");
    expect(t.depois).toBe("<span>a</span>");
  });

  it("sem edição não há trecho", () => {
    expect(trechoDaCorrecao(html, [])).toBeNull();
  });

  it("o trecho 'depois' é um pedaço do fixed.html quando só há aquela correção", () => {
    const e = [{ inicio: pos, fim: pos, texto: " alt=\"\"" }];
    const t = trechoDaCorrecao(html, e)!;
    expect(aplicarEdicoes(html, e)).toContain(t.depois);
  });
});

describe("trechosDasCorrecoes", () => {
  it("só as recomendações com correção automática, por id", () => {
    const html = "<img><img>";
    const r = trechosDasCorrecoes(html, [
      { id: "img-lazy-1", correcaoAutomatica: true, edicoes: [{ inicio: 4, fim: 4, texto: " a" }] },
      { id: "img-lazy-2", correcaoAutomatica: false, edicoes: [] },
    ]);
    expect(Object.keys(r)).toEqual(["img-lazy-1"]);
    expect(r["img-lazy-1"]!.depois).toBe("<img a><img>");
  });
});
