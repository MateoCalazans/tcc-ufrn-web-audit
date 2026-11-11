import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { metadados } from "../../src/analyze/semantics.js";

/** Indicador (6) da S11 (ADR 011, item 3). */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("metadados", () => {
  it("lang sem espaços, title normalizado, name do meta sem diferenciar maiúsculas", () => {
    expect(metadados(html("metadados-completo.html"))).toEqual({
      lang: "pt-BR",
      temTitle: true,
      titleComprimento: "Portal da Unidade".length,
      temViewport: true,
      temDescription: true,
    });
  });

  it("title vazio, viewport sem content e title de svg não contam", () => {
    expect(metadados(html("metadados-ausentes.html"))).toEqual({
      lang: null,
      temTitle: false,
      titleComprimento: 0,
      temViewport: false,
      temDescription: false,
    });
  });

  it("lang vazio vira null", () => {
    expect(metadados('<html lang=""><head><title>x</title></head><body></body></html>').lang).toBeNull();
  });
});
