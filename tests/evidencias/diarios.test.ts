import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { categorizar, extrairAvaliacoes, parseDiario, resumirUso } from "../../src/evidencias/diarios.js";

const fx = (n: string) => readFileSync(join("tests", "fixtures", "evidencias", n), "utf8");

describe("categorizar", () => {
  it.each([
    ["Aceito", "aceito"],
    ["Aceito (parâmetros e HAR com corpos)", "aceito"],
    ["Aceito (inferido)", "aceito-inferido"],
    ["Alterado", "alterado"],
    ["Rejeitado (proposta de registro)", "rejeitado"],
    ["?", "nao-registrado"],
    ["", "nao-registrado"],
    ["Talvez", "outro"],
  ])("%s → %s", (entrada, esperado) => {
    expect(categorizar(entrada)).toBe(esperado);
  });
});

describe("parseDiario", () => {
  it("lê cabeçalho e só a tabela de avaliação", () => {
    const d = parseDiario(fx("diario-completo.md"), "2026-11-16-s18b.md");
    expect(d.data).toBe("2026-11-16");
    expect(d.sessao).toBe("S18b");
    expect(d.titulo).toBe("Guarda de imagens (análise posterior)");
    expect(d.objetivo).toBe("Corrigir a distorção de imagens.");
    expect(d.ferramenta).toBe("Claude Code (Opus 5.5)");
    expect(d.sessaoDoRoteiro).toBe("fora do roteiro.");
    expect(d.avaliacoes.map((a) => a.categoria)).toEqual([
      "aceito",
      "aceito-inferido",
      "alterado",
      "rejeitado",
      "aceito",
      "outro",
    ]);
  });

  it("diário sem tabela de avaliação devolve lista vazia", () => {
    expect(extrairAvaliacoes("# 2026-01-01 — S99: x\n\n## Resultados\n| a | b |\n|---|---|\n| 1 | 2 |\n")).toEqual([]);
  });
});

describe("resumirUso", () => {
  it("soma por categoria e aponta sessões sem registro", () => {
    const r = resumirUso([
      parseDiario(fx("diario-sem-registro.md"), "s00.md"),
      parseDiario(fx("diario-completo.md"), "s18b.md"),
    ]);
    expect(r.sessoes).toBe(2);
    expect(r.itens).toBe(8);
    expect(r.total).toEqual({
      aceito: 2,
      "aceito-inferido": 1,
      alterado: 1,
      rejeitado: 1,
      "nao-registrado": 2,
      outro: 1,
    });
    expect(r.sessoesSemRegistro).toEqual(["S00"]);
    expect(r.porSessao[1]).toMatchObject({ sessao: "S18b", itens: 6 });
  });
});
