import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { interativosFalsos } from "../../src/analyze/semantics.js";

/** Indicador (5) da S11 (ADR 011, item 2). */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("interativosFalsos", () => {
  it("div/span com onclick sem role nem tabindex; role vazio conta como sem role", () => {
    expect(interativosFalsos(html("interativos.html"))).toEqual({ comOnclick: 5, falsos: 3 });
  });

  it("onclick em a/button não entra", () => {
    expect(interativosFalsos('<body><a onclick="x()">a</a><button onclick="y()">b</button></body>')).toEqual({ comOnclick: 0, falsos: 0 });
  });

  it("atributo em maiúsculas (onClick) também conta", () => {
    expect(interativosFalsos('<body><div onClick="x()">a</div></body>')).toEqual({ comOnclick: 1, falsos: 1 });
  });
});
