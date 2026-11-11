import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { obsoletas } from "../../src/analyze/semantics.js";

/** Indicador (9a) da S11 (ADR 011, item 6). */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("obsoletas", () => {
  it("font/center/marquee no indicador do roteiro; lista do WHATWG à parte; b/i/u não são obsoletos", () => {
    expect(obsoletas(html("obsoletas.html"))).toEqual({
      roteiro: 4,
      whatwg: 8,
      porTag: { center: 1, font: 2, marquee: 1, big: 1, strike: 1, tt: 1, acronym: 1 },
    });
  });

  it("página moderna não tem obsoletos", () => {
    expect(obsoletas(html("estrutura.html"))).toEqual({ roteiro: 0, whatwg: 0, porTag: {} });
  });
});
