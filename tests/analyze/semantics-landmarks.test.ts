import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { landmarks } from "../../src/analyze/semantics.js";

/** Indicador (2) da S10 (ADR 010, 3a e 5). Fixtures escritas à mão. */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("landmarks", () => {
  it("header/footer dentro de article, section ou role=region não são banner/contentinfo", () => {
    expect(landmarks(html("landmarks-completo.html"))).toEqual({ banner: 1, navigation: 1, main: 1, contentinfo: 1 });
  });

  it("role explícito vale mais que o implícito; conta 2 main; ignora hidden", () => {
    expect(landmarks(html("landmarks-roles.html"))).toEqual({ banner: 1, navigation: 2, main: 2, contentinfo: 1 });
  });

  it("página só de divs não tem landmarks", () => {
    expect(landmarks(html("landmarks-nenhum.html"))).toEqual({ banner: 0, navigation: 0, main: 0, contentinfo: 0 });
  });

  it("header dentro de aside, nav ou main não é banner", () => {
    for (const pai of ["aside", "nav", "main"]) {
      expect(landmarks(`<body><${pai}><header>x</header><footer>y</footer></${pai}></body>`)).toMatchObject({ banner: 0, contentinfo: 0 });
    }
  });

  it("header dentro de div comum continua banner", () => {
    expect(landmarks("<body><div class=topo><header>x</header></div></body>").banner).toBe(1);
  });
});
