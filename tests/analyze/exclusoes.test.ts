import { describe, expect, it } from "vitest";

import { EXCLUSOES_ANALISE, exclusaoDaAnalise } from "../../src/analyze/exclusoes.js";

/** Lista de exclusões da análise (ADR 009, item 4, e adendo da S10). */
describe("exclusaoDaAnalise", () => {
  it("exclui os 3 sites decididos pelo autor, com motivo", () => {
    expect(Object.keys(EXCLUSOES_ANALISE).sort()).toEqual([
      "comunica.ufrn.br",
      "enterpriseenrollment.ufrn.br",
      "pingifes.ufrn.br",
    ]);
    expect(exclusaoDaAnalise("pingifes.ufrn.br")?.motivo).toBe("login");
    expect(exclusaoDaAnalise("comunica.ufrn.br")?.motivo).toBe("nao-html");
    expect(exclusaoDaAnalise("enterpriseenrollment.ufrn.br")?.motivo).toBe("login");
  });

  it("site fora da lista não é excluído", () => {
    expect(exclusaoDaAnalise("3cnienssup.ufrn.br")).toBeNull();
  });
});
