import { describe, expect, it } from "vitest";

import { obsoleteTags } from "../../src/recommend/rules/obsolete-tags.js";
import { ler, rodar } from "./comum.js";

const HTML = ler("obsolete-tags/obsoletas.html");

describe("obsolete-tags", () => {
  it("um achado por elemento obsoleto presente no arquivo (clones do parser não contam)", async () => {
    const r = await rodar(obsoleteTags, HTML);
    expect(r.recommendations.map((x) => x.evidencia)).toEqual([
      "<center>",
      '<font color="red">',
      '<FONT face="Times New Roman, serif" color="#00F">',
      '<font size="2">',
      '<font color="ff0000">',
      '<font color="blue" class="x">',
      '<font color="red">',
      "<marquee>",
      "<strike>",
      "<big>",
    ]);
    expect(r.recommendations.every((x) => x.dimensao === "semantica" && x.severidade === "baixa")).toBe(true);
  });

  it("<font> só com color/face válidos e com fechamento → <span style>", async () => {
    const r = await rodar(obsoleteTags, HTML);
    expect(r.recommendations.filter((x) => x.correcaoAutomatica).map((x) => x.evidencia)).toEqual([
      '<font color="red">',
      '<FONT face="Times New Roman, serif" color="#00F">',
    ]);
    expect(r.fixedHtml).toContain('<p><span style="color: red">Vermelho</span></p>');
    expect(r.fixedHtml).toContain(`<p><span style="color: #00F; font-family: 'Times New Roman', serif">Fonte</span></p>`);
  });

  it("<center>, size, cor legada, outros atributos e <font> sem fechamento → só recomendação", async () => {
    const r = await rodar(obsoleteTags, HTML);
    const fixed = r.fixedHtml;
    expect(fixed).toContain("<center>Centralizado</center>");
    expect(fixed).toContain('<font size="2">Pequeno</font>');
    expect(fixed).toContain('<font color="ff0000">Cor legada</font>');
    expect(fixed).toContain('<font color="blue" class="x">Com classe</font>');
    expect(fixed).toContain('<font color="red">Sem fechamento');
    expect(r.recommendations[0]!.mensagem).toMatch(/text-align/);
  });

  it("sem elementos obsoletos → nada", async () => {
    const html = '<!DOCTYPE html><html lang="pt-BR"><body><p><s>riscado</s> <code>tt</code></p></body></html>';
    expect((await rodar(obsoleteTags, html)).recommendations).toEqual([]);
  });
});
