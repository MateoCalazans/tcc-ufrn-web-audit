import { describe, expect, it } from "vitest";

import { extrairTelaFinal, resumoValidacao, versoesValidacao } from "../../src/ui/validacao.js";

const bruto = (generatedAt: string, perf: [number, number]) => ({
  meta: { generatedAt, gitCommit: "abc1234", gitDirty: false },
  parametros: { execucoesPorVariante: 3, formFactor: "mobile", throttlingMethod: "simulate" },
  recomendacoes: { total: 27, corrigidas: 7, corrigidasLlm: 0 },
  variantes: {
    original: { mediana: { n: 2 }, execucoes: [{ valida: true }, { valida: true }, { valida: false }], variacaoPerformance: { n: 2, min: 64, max: 65, amplitude: 1 } },
    corrigido: { execucoes: [{ valida: true }, { valida: true }, { valida: true }], variacaoPerformance: { n: 3, min: 64, max: 66, amplitude: 2 } },
  },
  deltas: {
    nota_performance: { original: perf[0], corrigido: perf[1], delta: perf[1] - perf[0] },
    sub_interativos: { original: null, corrigido: null, delta: null },
  },
});

describe("resumoValidacao", () => {
  it("leva só o que a tela usa, com os deltas do arquivo", () => {
    const r = resumoValidacao(bruto("2026-11-16T18:36:05Z", [65, 66]), "v1.0", "validation-v1.0.json")!;
    expect(r).toMatchObject({
      versao: "v1.0",
      generatedAt: "2026-11-16T18:36:05Z",
      gitCommit: "abc1234",
      execucoesValidas: { original: 2, corrigido: 3 },
      variacao: { original: { amplitude: 1 }, corrigido: { min: 64, max: 66 } },
      deltas: { nota_performance: { delta: 1 }, sub_interativos: { delta: null } },
      medianas: { original: 2, corrigido: null },
    });
    expect(Object.keys(r)).not.toContain("variantes");
  });

  it("arquivo ausente ou inválido", () => {
    expect(resumoValidacao(null, "mais-recente", "validation.json")).toBeNull();
    expect(resumoValidacao("x", "mais-recente", "validation.json")).toBeNull();
  });
});

describe("versoesValidacao", () => {
  it("v1.0 e a mais recente quando são medições diferentes", () => {
    const v = versoesValidacao(bruto("2026-11-16T18:36:05Z", [65, 65]), bruto("2026-11-16T19:54:45Z", [65, 65]));
    expect(v.map((x) => x.versao)).toEqual(["v1.0", "mais-recente"]);
  });

  it("mesma medição nos dois arquivos: só a v1.0", () => {
    const v = versoesValidacao(bruto("2026-11-16T18:36:05Z", [65, 65]), bruto("2026-11-16T18:36:05Z", [65, 65]));
    expect(v.map((x) => x.versao)).toEqual(["v1.0"]);
  });

  it("site fora da amostra: só a mais recente; sem validação: nada", () => {
    expect(versoesValidacao(null, bruto("2026-11-16T19:54:45Z", [40, 42])).map((x) => x.versao)).toEqual(["mais-recente"]);
    expect(versoesValidacao(null, null)).toEqual([]);
  });
});

describe("extrairTelaFinal", () => {
  it("decodifica o data URI da auditoria final-screenshot", () => {
    const lhr = { audits: { "final-screenshot": { details: { type: "screenshot", data: `data:image/jpeg;base64,${Buffer.from("JPEG").toString("base64")}` } } } };
    const t = extrairTelaFinal(lhr)!;
    expect(t.tipo).toBe("image/jpeg");
    expect(t.bytes.toString()).toBe("JPEG");
  });

  it("sem a auditoria, ou com outro formato, não há imagem", () => {
    expect(extrairTelaFinal({ audits: {} })).toBeNull();
    expect(extrairTelaFinal(null)).toBeNull();
    expect(extrairTelaFinal({ audits: { "final-screenshot": { details: { data: "data:text/html;base64,PGI+" } } } })).toBeNull();
  });
});
