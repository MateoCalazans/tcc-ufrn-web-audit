import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseAdr } from "../../src/evidencias/adrs.js";
import { parseDiario } from "../../src/evidencias/diarios.js";
import { modelosUsados, montarIndice, primeiraFrase } from "../../src/evidencias/indice.js";

const fx = (n: string) => readFileSync(join("tests", "fixtures", "evidencias", n), "utf8");
const diarios = [parseDiario(fx("diario-sem-registro.md"), "2026-10-19-s00.md"), parseDiario(fx("diario-completo.md"), "2026-11-16-s18b.md")];

describe("primeiraFrase", () => {
  it.each([
    ["fora do roteiro. É um pedido do autor.", "fora do roteiro"],
    ["S04 — concluída em 2026-11-09 sem a revisão", "S04 — concluída em 2026-11-09 sem a revisão"],
    [null, null],
  ])("%s", (e, esperado) => expect(primeiraFrase(e)).toBe(esperado));
});

describe("modelosUsados", () => {
  it("agrupa sessões por modelo", () => {
    const extra = parseDiario("# 2026-11-04 — S04: x\n\n**Ferramenta:** Claude Code (Opus 4.8 → Opus 5.5, troca) · **Duração:** 1h\n", "s04.md");
    expect(modelosUsados([...diarios, extra])).toEqual([
      { modelo: "Opus 4.8", sessoes: ["S00", "S04"] },
      { modelo: "Opus 5.5", sessoes: ["S18b", "S04"] },
    ]);
  });
});

describe("montarIndice", () => {
  const md = montarIndice({
    adrs: [parseAdr(fx("adr.md"), "014-motor.md")],
    adrsAusentes: ["017"],
    tags: [{ nome: "v1.0", commit: "eb3d69d", data: "2026-11-16", assunto: "v1.0: pipeline | completo" }],
    diarios,
    proveniencia: "Gerado em X no commit `abc`.",
  });

  it("lista ADRs, tags e diários com links relativos", () => {
    expect(md).toContain("| [014](../decisoes/014-motor.md) | Motor de regras e correções | 2026-11-12 |");
    expect(md).toContain("Números sem arquivo: ADR 017.");
    expect(md).toContain("| `v1.0` | `eb3d69d` | 2026-11-16 | v1.0: pipeline \\| completo |");
    expect(md).toContain("| [S18b](../diario/2026-11-16-s18b.md) | 2026-11-16 | Guarda de imagens (análise posterior) | fora do roteiro |");
  });

  it("percentuais sobre os itens com decisão registrada", () => {
    expect(md).toContain("8 itens na tabela de avaliação. Desses, 2 não têm decisão registrada (sessões S00");
    expect(md).toContain("- Aceito: 2 (33,3%)");
    expect(md).toContain("- Outro: 1 (16,7%)");
    expect(md).toContain("| **Total** | **8** | **2** | **1** | **1** | **1** | **2** | **1** |");
  });
});
