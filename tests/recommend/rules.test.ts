import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { aplicarRegras } from "../../src/recommend/engine.js";
import { htmlLang } from "../../src/recommend/rules/html-lang.js";
import { imgDimensions } from "../../src/recommend/rules/img-dimensions.js";
import { lerViewport, metaViewport } from "../../src/recommend/rules/meta-viewport.js";
import type { Har, Rule } from "../../src/shared/types.js";
import { entrada, gif, har, jpeg, png, redirecionamento, webpVp8x } from "./bytes.js";

const FIX = join("tests", "fixtures", "recommend");
const ler = (f: string) => readFileSync(join(FIX, f), "utf8");
const rodar = (regra: Rule, html: string, h?: Har) =>
  aplicarRegras({ siteId: "exemplo.ufrn.br", url: "https://exemplo.ufrn.br/", html, har: h }, [regra]);

describe("html-lang", () => {
  it("sem lang → insere lang=\"pt-BR\" na tag <html>", async () => {
    const r = await rodar(htmlLang, ler("html-lang/sem-lang.html"));
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0]).toMatchObject({ id: "html-lang-1", severidade: "alta", dimensao: "semantica", correcaoAutomatica: true, posicao: { linha: 2, coluna: 1 } });
    expect(r.fixedHtml).toBe(ler("html-lang/sem-lang.html").replace("<html>", '<html lang="pt-BR">'));
  });

  it("lang vazio → substitui só o atributo, mantendo os demais", async () => {
    const r = await rodar(htmlLang, ler("html-lang/lang-vazio.html"));
    expect(r.fixedHtml).toContain('<html lang="pt-BR" class="no-js">');
    expect(r.recommendations[0]!.correcaoAutomatica).toBe(true);
  });

  it("lang com sintaxe inválida → recomenda sem corrigir", async () => {
    const r = await rodar(htmlLang, ler("html-lang/lang-invalido.html"));
    expect(r.recommendations[0]).toMatchObject({ severidade: "media", correcaoAutomatica: false, edicoes: [] });
    expect(r.diff).toBe("");
  });

  it("lang válido de outro idioma → info, nunca sobrescreve", async () => {
    const r = await rodar(htmlLang, ler("html-lang/lang-en.html"));
    expect(r.recommendations[0]).toMatchObject({ severidade: "info", correcaoAutomatica: false });
    expect(r.fixedHtml).toBe(ler("html-lang/lang-en.html"));
  });

  it("lang português (qualquer caixa) → nada", async () => {
    expect((await rodar(htmlLang, ler("html-lang/lang-pt.html"))).recommendations).toEqual([]);
  });

  it("sem tag <html> no arquivo → recomenda, sem posição nem correção", async () => {
    const r = await rodar(htmlLang, ler("html-lang/sem-tag-html.html"));
    expect(r.recommendations[0]).toMatchObject({ posicao: null, correcaoAutomatica: false });
  });
});

describe("meta-viewport", () => {
  const META = '<meta name="viewport" content="width=device-width, initial-scale=1">';

  it("ausente → insere depois da declaração de charset", async () => {
    const html = ler("meta-viewport/sem-viewport.html");
    const r = await rodar(metaViewport, html);
    expect(r.recommendations[0]).toMatchObject({ severidade: "alta", dimensao: "performance", correcaoAutomatica: true });
    expect(r.fixedHtml).toBe(html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n${META}`));
  });

  it("charset via http-equiv também serve de âncora", async () => {
    const html = '<html><head><title>t</title><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head></html>';
    const r = await rodar(metaViewport, html);
    expect(r.fixedHtml).toBe(html.replace('ISO-8859-1">', `ISO-8859-1">\n${META}`));
  });

  it("sem charset → insere logo depois do <head>", async () => {
    const html = "<html><head><title>t</title></head></html>";
    expect((await rodar(metaViewport, html)).fixedHtml).toBe(`<html><head>\n${META}<title>t</title></head></html>`);
  });

  it("XHTML com CRLF → meta autofechada e quebra CRLF", async () => {
    const html = ler("meta-viewport/xhtml-crlf.html");
    const r = await rodar(metaViewport, html);
    expect(r.fixedHtml).toBe(html.replace("<head>", `<head>\r\n${META.replace(">", " />")}`));
  });

  it("sem <head> no arquivo → insere depois do <html>", async () => {
    const html = ler("meta-viewport/sem-head.html");
    const r = await rodar(metaViewport, html);
    expect(r.fixedHtml).toBe(html.replace('<html lang="pt-BR">', `<html lang="pt-BR">\n${META}`));
  });

  it("adequada → nada", async () => {
    expect((await rodar(metaViewport, ler("meta-viewport/viewport-ok.html"))).recommendations).toEqual([]);
  });

  it("zoom bloqueado → recomenda sem corrigir (nome com caixa diferente)", async () => {
    const r = await rodar(metaViewport, ler("meta-viewport/viewport-zoom.html"));
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0]).toMatchObject({ severidade: "media", correcaoAutomatica: false });
    expect(r.recommendations[0]!.mensagem).toMatch(/zoom/);
  });

  it("largura fixa → recomenda width=device-width, severidade baixa", async () => {
    const r = await rodar(metaViewport, ler("meta-viewport/viewport-largura-fixa.html"));
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0]).toMatchObject({ severidade: "baixa", correcaoAutomatica: false });
  });

  it("lerViewport aceita vírgula ou ponto e vírgula e normaliza a caixa", () => {
    expect([...lerViewport("Width=Device-Width; initial-scale = 1.0")]).toEqual([["width", "device-width"], ["initial-scale", "1.0"]]);
  });
});

describe("img-dimensions", () => {
  const B = "https://exemplo.ufrn.br/sub/";
  const HAR = har([
    entrada(`${B}logo.png`, png(200, 50), "image/png"),
    entrada("https://exemplo.ufrn.br/img/foto.jpg", jpeg(800, 600), "image/jpeg"),
    entrada(`${B}foto-girada.jpg`, jpeg(800, 600, 6), "image/jpeg"),
    entrada(`${B}banner.webp`, webpVp8x(1200, 400), "image/webp"),
    entrada(`${B}icone.svg`, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 16"></svg>', "image/svg+xml"),
    entrada(`${B}anim.gif`, gif(10, 10), "image/gif"),
    entrada(`${B}estilo.png`, png(10, 10), "image/png"),
    redirecionamento(`${B}redir.png`, "/final.png"),
    entrada("https://exemplo.ufrn.br/final.png", png(64, 32), "image/png"),
    entrada(`${B}desconhecido.bmp`, Buffer.from("BM\0\0\0\0\0\0"), "image/bmp"),
  ]);

  it("corrige, proporciona ou só recomenda conforme o caso", async () => {
    const html = ler("img-dimensions/imagens.html");
    const r = await rodar(imgDimensions, html, HAR);
    const porAlt = (alt: string) => r.recommendations.find((x) => x.evidencia.includes(`alt="${alt}"`));

    // anim.gif (width+height) e estilo.png (style com width e height) não geram recomendação.
    expect(r.recommendations).toHaveLength(12);
    expect(r.recommendations.map((x) => x.id)).toEqual(Array.from({ length: 12 }, (_, i) => `img-dimensions-${i + 1}`));

    expect(r.fixedHtml).toContain('<img src="logo.png" alt="Logo" width="200" height="50">');
    expect(r.fixedHtml).toContain('<img src="/img/foto.jpg" alt="Foto" class="x" width="800" height="600" />');
    expect(r.fixedHtml).toContain('<img src="foto-girada.jpg" alt="Girada" width="600" height="800">');
    expect(r.fixedHtml).toContain('<img src="banner.webp" width="300" alt="Banner" height="100">');
    expect(r.fixedHtml).toContain('<img src="icone.svg" height="20" alt="" width="40">');
    expect(r.fixedHtml).toContain('<img src="redir.png" alt="Redirecionada" width="64" height="32">');
    expect(r.fixedHtml).toContain('<IMG SRC="logo.png" width="200" height="50">');

    for (const alt of ["Lazy", "Fora do HAR", "Largura inválida", "BMP"]) {
      expect(porAlt(alt), alt).toMatchObject({ correcaoAutomatica: false, edicoes: [] });
    }
    expect(porAlt("Lazy")!.mensagem).toMatch(/data-src/);
    expect(porAlt("Fora do HAR")!.mensagem).toMatch(/HAR/);
    expect(porAlt("BMP")!.mensagem).toMatch(/não reconhecido/);
    expect(r.recommendations.find((x) => x.evidencia === '<img alt="Sem src">')).toMatchObject({ correcaoAutomatica: false });
    expect(r.resumo).toMatchObject({ total: 12, corrigidas: 7 });
  });

  it("sem HAR: nada é corrigido, exceto URI data:", async () => {
    const html = '<html><body><img src="a.png"><img src="data:image/gif;base64,R0lGODlhAwACAIAAAP///wAAACw="></body></html>';
    const r = await rodar(imgDimensions, html);
    expect(r.recommendations.map((x) => x.correcaoAutomatica)).toEqual([false, true]);
    expect(r.fixedHtml).toContain('width="3" height="2"');
  });

  it("<noscript> não gera recomendação (conteúdo é texto para o parser)", async () => {
    const r = await rodar(imgDimensions, '<html><body><noscript><img src="a.png"></noscript></body></html>');
    expect(r.recommendations).toEqual([]);
  });
});
