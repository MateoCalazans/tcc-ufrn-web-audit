import { describe, expect, it } from "vitest";

import { grupoDaTecnologia, type LinhaDataset, selecionarAmostra } from "../../src/validate/amostra.js";

const linha = (id: string, tecnologia: string, tipo: string, perf: number, indice: number, extra: Partial<LinhaDataset> = {}): LinhaDataset => ({
  id,
  tipo,
  tecnologia,
  conjunto_principal: "true",
  status_semantica: "ok",
  meta_refresh: "false",
  nota_performance: String(perf),
  indice_semantica: String(indice),
  ...extra,
});

const todos = () => true;

describe("grupoDaTecnologia", () => {
  it("junta joomla e outro-cms em outro (ADR 013)", () => {
    expect(grupoDaTecnologia("joomla")).toBe("outro");
    expect(grupoDaTecnologia("outro-cms")).toBe("outro");
    expect(grupoDaTecnologia("wordpress")).toBe("wordpress");
    expect(grupoDaTecnologia("desconhecida")).toBeNull();
  });
});

describe("selecionarAmostra", () => {
  it("conta cada inelegível por um único motivo, na ordem dos filtros", () => {
    const linhas = [
      linha("fora", "estatico", "outro", 10, 10, { conjunto_principal: "false" }),
      linha("vazio", "estatico", "outro", 10, 10, { status_semantica: "vazio" }),
      linha("refresh", "estatico", "outro", 10, 10, { meta_refresh: "true" }),
      linha("semnota", "estatico", "outro", 10, 10, { nota_performance: "" }),
      linha("semcopia", "estatico", "outro", 10, 10),
      linha("semcorrecao", "estatico", "outro", 10, 10),
      linha("ok", "estatico", "outro", 10, 10),
    ];
    const correcoes = new Map([["semcopia", 1], ["ok", 2]]);
    const s = selecionarAmostra({ linhas, correcoes, temCopiaLocal: (id) => id !== "semcopia", porGrupo: 3 });
    expect(s.inelegiveis).toMatchObject({
      "fora-do-conjunto-principal": 1,
      "semantica-nao-ok": 1,
      "meta-refresh": 1,
      "sem-nota-ou-indice": 1,
      "sem-copia-local": 1,
      "sem-correcao": 1,
    });
    expect(s.amostra.map((c) => c.id)).toEqual(["ok"]);
  });

  it("ordena pela soma dos postos entre os elegíveis, com desempate pelo id", () => {
    const linhas = [
      linha("b", "estatico", "outro", 50, 50),
      linha("a", "estatico", "outro", 50, 50),
      linha("pior", "estatico", "outro", 10, 20),
      linha("melhor", "estatico", "outro", 90, 90),
    ];
    const correcoes = new Map(linhas.map((l) => [l.id, 1]));
    const s = selecionarAmostra({ linhas, correcoes, temCopiaLocal: todos, porGrupo: 4 });
    expect(s.elegiveis.map((c) => c.id)).toEqual(["pior", "a", "b", "melhor"]);
    expect(s.elegiveis[0]).toMatchObject({ postoPerformance: 1, postoIndice: 1, somaPostos: 2 });
    expect(s.elegiveis[1]).toMatchObject({ postoPerformance: 2.5, somaPostos: 5 });
  });

  it("por grupo: o pior primeiro, depois tipos novos dentro da janela de 2 × k", () => {
    const linhas = [
      linha("w1", "wordpress", "evento", 10, 10),
      linha("w2", "wordpress", "evento", 20, 20),
      linha("w3", "wordpress", "unidade", 30, 30),
      linha("w4", "wordpress", "evento", 40, 40),
      // tipo novo, mas fora da janela (5º pior com k = 2): não entra
      linha("w5", "wordpress", "laboratorio", 90, 90),
      linha("j1", "joomla", "outro", 15, 15),
    ];
    const correcoes = new Map(linhas.map((l) => [l.id, 1]));
    const s = selecionarAmostra({ linhas, correcoes, temCopiaLocal: todos, porGrupo: 2 });
    expect(s.amostra.map((c) => [c.grupo, c.id, c.ordemNoGrupo])).toEqual([
      ["wordpress", "w1", 1],
      ["wordpress", "w3", 2],
      ["outro", "j1", 1],
    ]);
  });

  it("sites da lista de excluídos saem antes dos postos, e o próximo pior entra", () => {
    const linhas = [linha("login", "estatico", "outro", 5, 5), linha("x1", "estatico", "outro", 10, 10), linha("x2", "estatico", "outro", 20, 20)];
    const correcoes = new Map(linhas.map((l) => [l.id, 1]));
    const s = selecionarAmostra({ linhas, correcoes, temCopiaLocal: todos, porGrupo: 2, excluidos: new Map([["login", "login (regra 4)"]]) });
    expect(s.inelegiveis["excluido-na-validacao"]).toBe(1);
    expect(s.amostra.map((c) => c.id)).toEqual(["x1", "x2"]);
    expect(s.elegiveis[0]).toMatchObject({ id: "x1", postoPerformance: 1 });
  });

  it("sem tipo novo na janela, pega o pior restante", () => {
    const linhas = [linha("x1", "estatico", "outro", 10, 10), linha("x2", "estatico", "outro", 20, 20), linha("x3", "estatico", "outro", 30, 30)];
    const correcoes = new Map(linhas.map((l) => [l.id, 1]));
    const s = selecionarAmostra({ linhas, correcoes, temCopiaLocal: todos, porGrupo: 2 });
    expect(s.amostra.map((c) => c.id)).toEqual(["x1", "x2"]);
  });
});
