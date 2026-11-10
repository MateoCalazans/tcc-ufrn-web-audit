import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hierarquiaTitulos, sequenciaDeTitulos } from "../../src/analyze/semantics.js";

/** Indicador (3) da S10 (ADR 010, 4a e 5). Fixtures escritas à mão. */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("hierarquiaTitulos", () => {
  it("hierarquia correta: 1 h1, nenhum salto", () => {
    expect(hierarquiaTitulos(html("titulos-ok.html"))).toEqual({
      total: 8,
      h1: 1,
      porNivel: [1, 3, 3, 1, 0, 0],
      saltos: 0,
      maiorSalto: 0,
      primeiroNivel: 1,
    });
  });

  it("conta só descidas de mais de 1 nível; o primeiro título e as subidas não contam", () => {
    const html_ = html("titulos-saltos.html");
    expect(sequenciaDeTitulos(html_)).toEqual([3, 1, 4, 2, 4, 5, 1, 3]);
    expect(hierarquiaTitulos(html_)).toEqual({
      total: 8,
      h1: 2,
      porNivel: [2, 1, 2, 2, 1, 0],
      saltos: 3,
      maiorSalto: 3,
      primeiroNivel: 3,
    });
  });

  it("role=heading e aria-level; role explícito anula hN; ignora hidden e svg", () => {
    const html_ = html("titulos-aria.html");
    expect(sequenciaDeTitulos(html_)).toEqual([1, 2, 4, 6]);
    expect(hierarquiaTitulos(html_)).toMatchObject({ total: 4, h1: 1, saltos: 2, maiorSalto: 2, porNivel: [1, 1, 0, 1, 0, 1] });
  });

  it("página sem títulos", () => {
    expect(hierarquiaTitulos(html("titulos-nenhum.html"))).toEqual({
      total: 0,
      h1: 0,
      porNivel: [0, 0, 0, 0, 0, 0],
      saltos: 0,
      maiorSalto: 0,
      primeiroNivel: null,
    });
  });

  it("aria-level acima de 6 entra no último balde de porNivel", () => {
    expect(hierarquiaTitulos('<body><div role="heading" aria-level="9">x</div></body>').porNivel).toEqual([0, 0, 0, 0, 0, 1]);
  });
});
