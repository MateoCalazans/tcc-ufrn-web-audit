import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { numerosAusentes, parseAdr } from "../../src/evidencias/adrs.js";

describe("parseAdr", () => {
  it("lê número, título, data, status e adendos", () => {
    const md = readFileSync(join("tests", "fixtures", "evidencias", "adr.md"), "utf8");
    expect(parseAdr(md, "014-motor.md")).toEqual({
      arquivo: "014-motor.md",
      numero: "014",
      titulo: "Motor de regras e correções",
      data: "2026-11-12",
      status: "proposto (validar com o orientador)",
      adendos: ["Adendo (S18b, 2026-11-16): guarda de renderização", "Adendo (S19): outro"],
    });
  });
});

describe("numerosAusentes", () => {
  it("aponta buracos na numeração", () => {
    expect(numerosAusentes(["001", "002", "004", "018", "016"])).toEqual([
      "003", "005", "006", "007", "008", "009", "010", "011", "012", "013", "014", "015", "017",
    ]);
    expect(numerosAusentes([])).toEqual([]);
  });
});
