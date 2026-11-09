import { describe, expect, it } from "vitest";

import { formatCsv, parseCsv } from "../../src/shared/csv.js";

describe("csv", () => {
  it("ida e volta preserva vírgulas, aspas e quebras de linha", () => {
    const header = ["a", "b", "c"];
    const rows = [
      ["simples", "com, vírgula", 'com "aspas"'],
      ["", "linha\nquebrada", "301 https://x -> 200 https://y"],
    ];
    expect(parseCsv(formatCsv(header, rows))).toEqual([header, ...rows]);
  });

  it("aceita CRLF e campos vazios no fim", () => {
    expect(parseCsv("a,b\r\n1,\r\n")).toEqual([
      ["a", "b"],
      ["1", ""],
    ]);
  });
});
