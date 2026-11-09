import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  decodeEntities,
  detectTecnologia,
  detectTipo,
  extractGenerator,
  extractTitle,
  foldText,
} from "../../src/triage/classify.js";

const fixture = (nome: string): string =>
  readFileSync(join(import.meta.dirname, "..", "fixtures", "triage", nome), "utf8");

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

describe("decodeEntities / foldText", () => {
  it("decodifica entidades nomeadas, acentuadas e numéricas", () => {
    expect(decodeEntities("P&oacute;s-Gradua&ccedil;&atilde;o &amp; Pesquisa &#8211; &#x41;")).toBe(
      "Pós-Graduação & Pesquisa – A",
    );
  });

  it("mantém entidades desconhecidas", () => {
    expect(decodeEntities("a &foo; b")).toBe("a &foo; b");
  });

  it("dobra caixa, acentos e espaços", () => {
    expect(foldText("  Pró-Reitoria   de  Extensão ")).toBe("pro-reitoria de extensao");
  });
});

describe("extractTitle", () => {
  it("extrai, decodifica e colapsa espaços", () => {
    expect(extractTitle(fixture("wordpress.html"))).toBe(
      "Programa de Pós-Graduação em Engenharia de Software – UFRN",
    );
    expect(extractTitle(fixture("estatico.html"))).toBe("NEAD");
  });

  it("sem <title> devolve vazio", () => {
    expect(extractTitle("<html><body>x</body></html>")).toBe("");
  });
});

describe("extractGenerator", () => {
  it("lê o generator em qualquer ordem de atributos e caixa", () => {
    expect(extractGenerator(fixture("wordpress.html"))).toBe("WordPress 6.4.2");
    expect(extractGenerator(fixture("drupal.html"))).toBe("Drupal 9 (https://www.drupal.org)");
  });

  it("ignora outras metas", () => {
    expect(extractGenerator('<meta name="description" content="WordPress">')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tecnologia
// ---------------------------------------------------------------------------

describe("detectTecnologia", () => {
  it.each([
    ["wordpress.html", "wordpress"],
    ["joomla.html", "joomla"],
    ["drupal.html", "drupal"],
    ["react-spa.html", "framework-js"],
    ["estatico.html", "estatico"],
  ])("%s → %s", (arquivo, esperado) => {
    expect(detectTecnologia(fixture(arquivo)).valor).toBe(esperado);
  });

  it("CMS vence framework JS (tema WordPress com <div id=app>)", () => {
    const r = detectTecnologia(fixture("wordpress.html"));
    expect(r.valor).toBe("wordpress");
    expect(r.evidencia).toBe("generator: WordPress 6.4.2");
  });

  it("WordPress sem generator é pego por wp-content", () => {
    const r = detectTecnologia('<link href="/wp-content/themes/x/style.css">');
    expect(r).toEqual({ valor: "wordpress", evidencia: "wp-content/wp-includes" });
  });

  it("generator de outra ferramenta → outro-cms", () => {
    const r = detectTecnologia('<meta name="generator" content="Plone - http://plone.com">');
    expect(r.valor).toBe("outro-cms");
  });

  it("não acusa Joomla por menção em texto", () => {
    expect(detectTecnologia("<p>Curso de Joomla para iniciantes</p>").valor).toBe("estatico");
  });

  it("reconhece next/angular/vue", () => {
    expect(detectTecnologia('<div id="__next"></div>').evidencia).toBe("next.js");
    expect(detectTecnologia('<app-root ng-version="17.0.0"></app-root>').evidencia).toBe("angular");
    expect(detectTecnologia('<div id="app"></div>').evidencia).toBe("vue");
  });
});

// ---------------------------------------------------------------------------
// Tipo de site
// ---------------------------------------------------------------------------

describe("detectTipo", () => {
  it.each([
    ["ppgsw.ufrn.br", "Programa de Pós-Graduação em Engenharia de Software", "pos-graduacao"],
    ["x.ufrn.br", "Mestrado Profissional em Letras", "pos-graduacao"],
    ["lse.ufrn.br", "Laboratório de Sistemas Embarcados", "laboratorio"],
    ["dimap.ufrn.br", "Departamento de Informática e Matemática Aplicada | DIMAp", "departamento"],
    ["cb.ufrn.br", "Centro de Biociências", "unidade"],
    ["proex.ufrn.br", "Pró-Reitoria de Extensão", "unidade"],
    ["bczm.ufrn.br", "Biblioteca Central Zila Mamede", "unidade"],
    ["cientec.ufrn.br", "Semana de Ciência, Tecnologia e Cultura", "evento"],
    ["x.ufrn.br", "XII Congresso Brasileiro de Software", "evento"],
    ["x.ufrn.br", "Projeto Rondon UFRN", "projeto"],
  ])("%s + %j → %s", (host, titulo, esperado) => {
    expect(detectTipo(host, titulo).valor).toBe(esperado);
  });

  it("prioridade resolve títulos compostos", () => {
    // evento > departamento
    expect(detectTipo("x.ufrn.br", "Semana Acadêmica do Departamento de Física").valor).toBe("evento");
    // laboratório > departamento
    expect(detectTipo("x.ufrn.br", "Laboratório X - Departamento de Química").valor).toBe("laboratorio");
    // pós > unidade
    expect(detectTipo("x.ufrn.br", "PPGEd - Centro de Educação").valor).toBe("pos-graduacao");
    expect(detectTipo("x.ufrn.br", "Pós-Graduação em Educação - Centro de Educação").valor).toBe(
      "pos-graduacao",
    );
  });

  it("usa o hostname quando o título não decide", () => {
    expect(detectTipo("ppgem.ufrn.br", "Início").valor).toBe("pos-graduacao");
    expect(detectTipo("labcomp.ufrn.br", "").valor).toBe("laboratorio");
    expect(detectTipo("sbsi2019.ufrn.br", "Home").valor).toBe("evento");
  });

  it("sem sinal → outro (não chuta)", () => {
    expect(detectTipo("nead.ufrn.br", "NEAD")).toEqual({ valor: "outro", evidencia: "nenhuma palavra-chave" });
    expect(detectTipo("xyz.ufrn.br", "")).toEqual({ valor: "outro", evidencia: "sem título" });
    // "Núcleo" é ambíguo (unidade suplementar? grupo de pesquisa?) — fica como outro
    expect(detectTipo("x.ufrn.br", "Núcleo de Educação da Infância").valor).toBe("outro");
  });

  it("não confunde 'ppg' com hosts que só começam com 'p'", () => {
    expect(detectTipo("portal.ufrn.br", "Portal").valor).toBe("outro");
  });
});
