import { describe, expect, it } from "vitest";

import { headingSkip } from "../../src/recommend/rules/heading-skip.js";
import { ler, rodar } from "./comum.js";

describe("heading-skip", () => {
  it("um achado por salto para baixo de mais de um nível (ADR 010), só recomendação", async () => {
    const html = ler("heading-skip/titulos.html");
    const r = await rodar(headingSkip, html);
    expect(r.recommendations.map((x) => x.evidencia)).toEqual([
      "<h3>",
      '<div role="heading" aria-level="5">',
      "<h4>",
    ]);
    expect(r.recommendations[0]!.mensagem).toContain("nível 1 para o nível 3");
    expect(r.recommendations[1]!.mensagem).toContain("nível 2 para o nível 5");
    expect(r.recommendations[0]!.posicao).toEqual({ linha: 7, coluna: 1 });
    expect(r.recommendations.every((x) => !x.correcaoAutomatica && x.dimensao === "semantica" && x.severidade === "media")).toBe(true);
    expect(r.fixedHtml).toBe(html);
  });

  it("hierarquia sem saltos → nada", async () => {
    const html = '<!DOCTYPE html><html lang="pt-BR"><body><h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2></body></html>';
    expect((await rodar(headingSkip, html)).recommendations).toEqual([]);
  });
});
