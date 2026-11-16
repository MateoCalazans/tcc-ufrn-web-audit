import { describe, expect, it } from "vitest";

import { PESOS_PROPOSTOS } from "../../src/analyze/indice.js";
import { REGRAS } from "../../src/recommend/rules/index.js";
import { ROTULO_ETAPA as ROTULO_SERVIDOR, planoAvulso, planoCorpus } from "../../src/ui/pipeline.js";
import { SUBNOTAS } from "../src/componentes/Indicadores";
import { PLANO, ROTULO_ETAPA } from "../src/lib/progresso";
import { REFERENCIA_REGRA } from "../src/lib/recomendacoes";

/** O que as telas copiam do pipeline tem de continuar igual ao pipeline. */
describe("paridade com o pipeline", () => {
  it("rótulos e planos das etapas (ADR 017)", () => {
    expect(ROTULO_ETAPA).toEqual(ROTULO_SERVIDOR);
    expect(PLANO.avulso).toEqual(planoAvulso({ id: "x.ufrn.br", llm: false, vnu: false, tetoUsd: 0 }).map((e) => e.nome));
    expect(PLANO.corpus).toEqual(planoCorpus("x.ufrn.br").map((e) => e.nome));
  });

  it("pesos das subnotas (ADR 003)", () => {
    expect(Object.fromEntries(SUBNOTAS.map(([k, , p]) => [k, p]))).toEqual(PESOS_PROPOSTOS);
  });

  it("toda regra tem referência", () => {
    expect(Object.keys(REFERENCIA_REGRA).sort()).toEqual([...REGRAS.map((r) => r.id), "landmarks-llm"].sort());
  });
});
