import { describe, expect, it } from "vitest";

import { imgLazy } from "../../src/recommend/rules/img-lazy.js";
import { lcp, ler, lhr, rodar } from "./comum.js";

const HTML = ler("img-lazy/imagens.html");

describe("img-lazy", () => {
  it("a partir da 4ª <img>, sem loading nem data-src → insere loading=\"lazy\" logo depois do nome da tag", async () => {
    const r = await rodar(imgLazy, HTML, { lighthouse: lhr(lcp('<img src="/hero.jpg" alt="LCP tardio">')) });
    expect(r.recommendations.map((x) => x.evidencia)).toEqual([
      '<img src="a4.png" alt="4">',
      '<img src="a9.png" alt="9">',
      '<IMG SRC="a10.png">',
    ]);
    expect(r.recommendations.every((x) => x.correcaoAutomatica && x.dimensao === "performance" && x.severidade === "baixa")).toBe(true);
    expect(r.fixedHtml).toContain('<img loading="lazy" src="a4.png" alt="4">');
    expect(r.fixedHtml).toContain('<IMG loading="lazy" SRC="a10.png">');
    expect(r.fixedHtml).toContain('<img src="a3.png" alt="3">');
    expect(r.fixedHtml).toContain('<img src="/hero.jpg" alt="LCP tardio">');
    expect(r.fixedHtml).toContain('<noscript><img src="a11.png" alt="11"></noscript>');
  });

  it("sem Lighthouse, a imagem LCP não é conhecida e também recebe lazy", async () => {
    const r = await rodar(imgLazy, HTML);
    expect(r.recommendations).toHaveLength(4);
    expect(r.fixedHtml).toContain('<img loading="lazy" src="/hero.jpg" alt="LCP tardio">');
  });

  it("LCP casa pela URL resolvida, mesmo com o snippet truncado pelo Lighthouse", async () => {
    const r = await rodar(imgLazy, HTML, { lighthouse: lhr(lcp('<img src="https://exemplo.ufrn.br/he…" alt="LCP tardio">')) });
    expect(r.recommendations).toHaveLength(3);
  });

  it("LCP que não é <img> (background) não exclui nenhuma imagem", async () => {
    const r = await rodar(imgLazy, HTML, { lighthouse: lhr(lcp('<div class="hero" style="background-image: url(/hero.jpg)">')) });
    expect(r.recommendations).toHaveLength(4);
  });

  it("até 3 imagens → nada", async () => {
    const html = '<!DOCTYPE html><html lang="pt-BR"><body><img src="1.png"><img src="2.png"><img src="3.png"></body></html>';
    expect((await rodar(imgLazy, html)).recommendations).toEqual([]);
  });
});
