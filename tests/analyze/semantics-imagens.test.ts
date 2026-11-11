import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { imagens } from "../../src/analyze/semantics.js";

/** Indicador (7) da S11 (ADR 011, item 4). */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("imagens", () => {
  it("só a falta do atributo alt é falha; alt vazio é decorativa; ignora hidden", () => {
    expect(imagens(html("imagens.html"))).toEqual({ total: 7, semAlt: 4, altVazio: 2, semAltComAlternativa: 2 });
  });

  it("página sem imagens", () => {
    expect(imagens("<body><p>x</p></body>")).toEqual({ total: 0, semAlt: 0, altVazio: 0, semAltComAlternativa: 0 });
  });
});
