import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { proporcaoDivSpan } from "../../src/analyze/semantics.js";

/** Indicador (1) da S10 (ADR 010, 2a). Fixtures escritas à mão. */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const html = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("proporcaoDivSpan", () => {
  it("conta só elementos do body, sem script/style/noscript/template nem o interior de svg", () => {
    expect(proporcaoDivSpan(html("divspan-basico.html"))).toEqual({ div: 2, span: 2, total: 10, proporcao: 0.4 });
  });

  it("body sem elementos contáveis: total 0 e proporção null", () => {
    expect(proporcaoDivSpan(html("divspan-vazio.html"))).toEqual({ div: 0, span: 0, total: 0, proporcao: null });
  });

  it("página só de divs tem proporção 1", () => {
    const r = proporcaoDivSpan(html("landmarks-nenhum.html"));
    expect(r.div).toBe(4);
    expect(r.total).toBe(5); // 4 div + 1 a
    expect(r.proporcao).toBeCloseTo(0.8, 10);
  });

  it("não conta head nem o próprio body", () => {
    expect(proporcaoDivSpan("<html><head><meta charset=utf-8><title>t</title></head><body><p>x</p></body></html>").total).toBe(1);
  });

  it("aceita fragmento (o parser cria o body)", () => {
    expect(proporcaoDivSpan("<div><span></span></div><p></p>")).toEqual({ div: 1, span: 1, total: 3, proporcao: 2 / 3 });
  });
});
