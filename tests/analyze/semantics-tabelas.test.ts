import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { load } from "cheerio";

import { classificarTabela, type No, tabelas } from "../../src/analyze/semantics.js";

/** Indicador (9b) da S11: heurística de tabela de layout (ADR 011, item 7). */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("tabelas", () => {
  it("classifica cada tabela da fixture (inclusive as aninhadas) e ignora hidden", () => {
    expect(tabelas(html("tabelas.html"))).toEqual({ total: 10, layoutDeclarada: 1, layoutHeuristica: 3, dados: 4, indeterminada: 2 });
  });

  it("classe de cada tabela pela ordem das regras", () => {
    const $ = load(html("tabelas.html"));
    const classe = (id: string) => classificarTabela($, $(`#${id}`).get(0) as unknown as No);
    expect(
      ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"].map(classe),
    ).toEqual([
      "layoutHeuristica", // aninhada
      "indeterminada", // só texto
      "layoutHeuristica", // div na célula
      "dados", // th (o p na célula não importa)
      "dados", // caption
      "layoutDeclarada", // role=presentation vale mais que o th
      "dados", // role=grid vale mais que o div
      "layoutHeuristica", // o th é da tabela de dentro
      "dados", // thead
      "indeterminada",
    ]);
  });
});
