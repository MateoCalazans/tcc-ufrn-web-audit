import { readFileSync } from "node:fs";
import { join } from "node:path";

import { applyPatch } from "diff";
import { describe, expect, it } from "vitest";

import { codificar, decodificar } from "../../src/recommend/encoding.js";
import { aplicarEdicoes, aplicarRegras, conflitam } from "../../src/recommend/engine.js";
import { REGRAS } from "../../src/recommend/rules/index.js";
import type { Achado, Rule } from "../../src/shared/types.js";
import { entrada, har, png } from "./bytes.js";

const SITE = join("tests", "fixtures", "recommend", "site");

/** Regra de teste que devolve achados fixos. */
const regraFixa = (id: string, achados: Achado[]): Rule => ({
  id, dimensao: "semantica", severidade: "baixa", descricao: "teste", avaliar: () => achados,
});
const achado = (inicio: number, fim: number, texto: string): Achado => ({
  dimensao: "semantica", severidade: "baixa", evidencia: "x", posicao: null, mensagem: "m", edicoes: [{ inicio, fim, texto }],
});

describe("motor", () => {
  it("site de exemplo com as 3 regras → fixed.html esperado, diff aplicável", async () => {
    const html = readFileSync(join(SITE, "index.html"), "utf8");
    const r = await aplicarRegras(
      { siteId: "exemplo.ufrn.br", url: "https://exemplo.ufrn.br/", html, har: har([entrada("https://exemplo.ufrn.br/logo.png", png(320, 96), "image/png")]) },
      REGRAS,
    );
    expect(r.fixedHtml).toBe(readFileSync(join(SITE, "fixed.esperado.html"), "utf8"));
    expect(r.recommendations.map((x) => x.id)).toEqual(["html-lang-1", "meta-viewport-1", "img-dimensions-1"]);
    expect(r.resumo).toEqual({
      total: 3,
      corrigidas: 3,
      porRegra: { "html-lang": { total: 1, corrigidas: 1 }, "meta-viewport": { total: 1, corrigidas: 1 }, "img-dimensions": { total: 1, corrigidas: 1 } },
      porDimensao: { performance: 2, semantica: 1 },
    });
    expect(r.diff.startsWith("--- a/index.html\n+++ b/fixed.html\n")).toBe(true);
    expect(applyPatch(html, r.diff)).toBe(r.fixedHtml);
  });

  it("é determinístico", async () => {
    const html = readFileSync(join(SITE, "index.html"), "utf8");
    const e = { siteId: "s", url: "https://s/", html };
    expect(await aplicarRegras(e, REGRAS)).toEqual(await aplicarRegras(e, REGRAS));
  });

  it("sem achados → HTML idêntico e diff vazio", async () => {
    const html = "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body></body></html>";
    const r = await aplicarRegras({ siteId: "s", url: "https://s/", html }, REGRAS);
    expect(r).toMatchObject({ fixedHtml: html, diff: "", recommendations: [] });
  });

  it("conflito: vence a regra anterior; a outra fica sem correção e explica", async () => {
    const html = "abcdef";
    const r = await aplicarRegras({ siteId: "s", url: "https://s/", html }, [
      regraFixa("a", [achado(1, 3, "X")]),
      regraFixa("b", [achado(2, 4, "Y"), achado(4, 4, "Z")]),
    ]);
    expect(r.fixedHtml).toBe("aXdZef");
    expect(r.recommendations[1]).toMatchObject({ id: "b-1", correcaoAutomatica: false, edicoes: [] });
    expect(r.recommendations[1]!.mensagem).toMatch(/conflita com a-1/);
    expect(r.recommendations[2]).toMatchObject({ id: "b-2", correcaoAutomatica: true });
  });

  it("edição fora do texto é erro da regra", async () => {
    await expect(aplicarRegras({ siteId: "s", url: "https://s/", html: "abc" }, [regraFixa("a", [achado(2, 9, "X")])])).rejects.toThrow(/fora do texto/);
  });

  it("conflitam: cruzamento e inserção no mesmo ponto", () => {
    expect(conflitam({ inicio: 0, fim: 2, texto: "" }, { inicio: 2, fim: 2, texto: "" })).toBe(false);
    expect(conflitam({ inicio: 1, fim: 3, texto: "" }, { inicio: 2, fim: 5, texto: "" })).toBe(true);
    expect(conflitam({ inicio: 2, fim: 2, texto: "a" }, { inicio: 2, fim: 2, texto: "b" })).toBe(true);
    expect(conflitam({ inicio: 2, fim: 2, texto: "a" }, { inicio: 2, fim: 4, texto: "b" })).toBe(true);
  });

  it("aplicarEdicoes usa as posições do texto original", () => {
    expect(aplicarEdicoes("0123456789", [{ inicio: 2, fim: 2, texto: "A" }, { inicio: 5, fim: 7, texto: "B" }])).toBe("01A234B789");
  });
});

describe("codificação", () => {
  it("UTF-8 com BOM: decodifica sem BOM e devolve os mesmos bytes", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("<p>ação</p>", "utf8")]);
    const t = decodificar(bytes);
    expect(t).toEqual({ texto: "<p>ação</p>", codificacao: "utf-8", bom: true });
    expect(codificar(t.texto, t).equals(bytes)).toBe(true);
  });

  it("bytes que não são UTF-8 → latin1, ida e volta byte a byte, inserção ASCII preserva o resto", () => {
    const bytes = Buffer.from([0x3c, 0x70, 0x3e, 0x61, 0xe7, 0xe3, 0x6f, 0x3c, 0x2f, 0x70, 0x3e]); // <p>açăo</p> em latin1
    const t = decodificar(bytes);
    expect(t.codificacao).toBe("latin1");
    expect(codificar(t.texto, t).equals(bytes)).toBe(true);
    const corrigido = codificar(t.texto.replace("<p>", '<p lang="pt-BR">'), t);
    expect(corrigido.subarray(corrigido.length - 8).equals(bytes.subarray(3))).toBe(true);
  });
});
