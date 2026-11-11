import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { campos } from "../../src/analyze/semantics.js";

/** Indicador (8) da S11 (ADR 011, item 5). */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("campos", () => {
  it("label for, label ancestral, aria-label e aria-labelledby válido rotulam; placeholder e title não", () => {
    expect(campos(html("campos.html"))).toEqual({ total: 11, semLabel: 5, semLabelComPlaceholderOuTitle: 2 });
  });

  it("label for com id repetido rotula só o primeiro elemento", () => {
    expect(campos('<body><input id="a"><input id="a"><label for="a">A</label></body>').semLabel).toBe(1);
  });

  it("label for apontando para outro elemento não rotula o campo", () => {
    expect(campos('<body><span id="x"></span><label for="x">X</label><input></body>').semLabel).toBe(1);
  });

  it("tipos que não precisam de rótulo ficam fora do total", () => {
    const h = ["hidden", "submit", "button", "image", "reset"].map((t) => `<input type="${t}">`).join("");
    expect(campos(`<body>${h}</body>`)).toEqual({ total: 0, semLabel: 0, semLabelComPlaceholderOuTitle: 0 });
  });
});
