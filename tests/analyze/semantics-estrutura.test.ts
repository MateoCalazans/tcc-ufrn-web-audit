import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { estrutura } from "../../src/analyze/semantics.js";

/** Indicador (4) da S11 (ADR 011, item 1). Fixtures escritas à mão. */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("estrutura", () => {
  it("conta pela tag, sem role, e ignora hidden", () => {
    expect(estrutura(html("estrutura.html"))).toEqual({ article: 1, section: 2, aside: 1, figure: 1, ul: 2, ol: 1 });
  });

  it("página só de divs tem tudo zero", () => {
    expect(estrutura(html("landmarks-nenhum.html"))).toEqual({ article: 0, section: 0, aside: 0, figure: 0, ul: 0, ol: 0 });
  });

  it("ignora o que está dentro de template e noscript", () => {
    expect(estrutura("<body><template><ul></ul></template><noscript><ol></ol></noscript></body>")).toMatchObject({ ul: 0, ol: 0 });
  });
});
