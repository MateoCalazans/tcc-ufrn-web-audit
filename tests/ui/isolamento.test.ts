import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { executorReal } from "../../src/ui/analise.js";

/**
 * ADR 017, decisão 1: o isolamento depende de os módulos gravarem relativo ao
 * cwd. Aqui roda o módulo 0 de verdade (normalização, offline, sem rede) por
 * meio do executor real, com o cwd numa pasta temporária, e confere que a saída
 * ficou lá e que os arquivos da raiz não mudaram.
 */
const raiz = resolve(".");
const cwd = mkdtempSync(join(tmpdir(), "ui-isolamento-"));

afterAll(() => rmSync(cwd, { recursive: true, force: true }));

describe("isolamento por cwd (módulo real)", () => {
  it("a triagem grava na pasta da análise, não na raiz do repositório", async () => {
    const vigiados = [join(raiz, "data", "interim", "normalized.csv"), join(raiz, "data", "corpus.csv")];
    const antes = vigiados.map((f) => (existsSync(f) ? statSync(f).mtimeMs : null));

    mkdirSync(join(cwd, "data", "input"), { recursive: true });
    writeFileSync(join(cwd, "data", "input", "registros-ufrn.txt"), "www.exemplo.com.br\n");
    const linhas: string[] = [];
    const codigo = await executorReal(raiz)(
      { nome: "triagem", modulo: "src/triage/index.ts", args: [] },
      cwd,
      (l) => linhas.push(l),
    );

    expect(codigo, linhas.join("\n")).toBe(0);
    const normalizado = readFileSync(join(cwd, "data", "interim", "normalized.csv"), "utf8");
    expect(normalizado).toContain("www.exemplo.com.br,exemplo.com.br,mantido");
    expect(readdirSync(join(cwd, "logs")).some((f) => f.startsWith("triage-"))).toBe(true);
    expect(vigiados.map((f) => (existsSync(f) ? statSync(f).mtimeMs : null))).toEqual(antes);
  }, 60_000);
});
