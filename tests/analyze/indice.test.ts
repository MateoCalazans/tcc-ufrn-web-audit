import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  agregar,
  calcularIndice,
  calcularSubnotas,
  PESOS_IGUAIS,
  PESOS_PROPOSTOS,
  postos,
  spearman,
  type Subnotas,
} from "../../src/analyze/indice.js";
import { indicadoresSemanticos } from "../../src/analyze/semantics.js";

/** Índice de semântica (S12, ADR 003). Valores esperados calculados à mão. */
const FIX = join("tests", "fixtures", "analyze", "semantics");
const ind = (html: string) => indicadoresSemanticos(html);
const doArquivo = (...p: string[]) => ind(readFileSync(join(FIX, ...p), "utf8"));

describe("calcularSubnotas", () => {
  // ok.exemplo: 4 landmarks; h1 → h3 (1 salto em 1 comparação); div+span 2/9; lang e title; sem img/input/onclick.
  const sub = calcularSubnotas(doArquivo("sites", "ok.exemplo.ufrn.br", "rendered.html"));

  it("site de exemplo, subnota por subnota", () => {
    expect(sub.landmarks).toBe(100);
    expect(sub.titulos).toBe(50);
    expect(sub.divSpan).toBeCloseTo((100 * 7) / 9, 10);
    expect(sub.metadados).toBe(100);
    expect(sub.obsoletos).toBe(100);
  });

  it("sem img, input ou onclick: N/A (null), não 100", () => {
    expect(sub).toMatchObject({ imagens: null, campos: null, interativos: null });
  });

  it("landmarks: main só conta se for exatamente 1", () => {
    const um = '<body><header>a</header><nav>b</nav><main>c</main><footer>d</footer></body>';
    const dois = '<body><header>a</header><nav>b</nav><main>c</main><main>e</main><footer>d</footer></body>';
    expect(calcularSubnotas(ind(um)).landmarks).toBe(100);
    expect(calcularSubnotas(ind(dois)).landmarks).toBe(75);
    expect(calcularSubnotas(ind("<body><div>x</div></body>")).landmarks).toBe(0);
  });

  it("títulos: sem títulos 0; um h1 só 100; um h2 só 50; saltos por comparação", () => {
    expect(calcularSubnotas(ind("<body><p>x</p></body>")).titulos).toBe(0);
    expect(calcularSubnotas(ind("<body><h1>x</h1></body>")).titulos).toBe(100);
    expect(calcularSubnotas(ind("<body><h2>x</h2></body>")).titulos).toBe(50);
    // h1 h2 h4 h5: 1 salto em 3 comparações; 1 h1.
    expect(calcularSubnotas(ind("<body><h1>a</h1><h2>b</h2><h4>c</h4><h5>d</h5></body>")).titulos).toBeCloseTo(50 + 50 * (2 / 3), 10);
    // dois h1, sem salto: só a 2ª parcela.
    expect(calcularSubnotas(ind("<body><h1>a</h1><h1>b</h1></body>")).titulos).toBe(50);
  });

  it("imagens e campos: proporção das que não falham", () => {
    expect(calcularSubnotas(doArquivo("imagens.html")).imagens).toBeCloseTo((100 * 3) / 7, 10);
    expect(calcularSubnotas(doArquivo("campos.html")).campos).toBeCloseTo((100 * 6) / 11, 10);
  });

  it("interativos falsos, metadados e obsoletos/layout", () => {
    expect(calcularSubnotas(doArquivo("interativos.html")).interativos).toBeCloseTo((100 * 2) / 5, 10);
    expect(calcularSubnotas(doArquivo("metadados-ausentes.html")).metadados).toBe(0);
    expect(calcularSubnotas(doArquivo("obsoletas.html")).obsoletos).toBe(50);
    expect(calcularSubnotas(doArquivo("tabelas.html")).obsoletos).toBe(50);
    expect(calcularSubnotas(ind("<body><center><table><tr><td><table></table></td></tr></table></center></body>")).obsoletos).toBe(0);
  });
});

describe("agregar", () => {
  const todas = (v: number | null): Subnotas => ({
    landmarks: v, titulos: v, imagens: v, campos: v, divSpan: v, metadados: v, interativos: v, obsoletos: v,
  });

  it("pesos propostos somam 100", () => {
    expect(Object.values(PESOS_PROPOSTOS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("renormaliza os pesos sem as subnotas N/A", () => {
    const s: Subnotas = { ...todas(100), imagens: null, campos: 0 };
    // (100 × (100 − 15 − 15) + 0 × 15) / (100 − 15)
    expect(agregar(s, PESOS_PROPOSTOS)).toBeCloseTo((100 * 70) / 85, 10);
    expect(agregar(s, PESOS_IGUAIS)).toBeCloseTo((100 * 6) / 7, 10);
  });

  it("tudo N/A → null", () => {
    expect(agregar(todas(null), PESOS_PROPOSTOS)).toBeNull();
  });
});

describe("calcularIndice", () => {
  it("site de exemplo: índice proposto e com pesos iguais", () => {
    const r = calcularIndice(doArquivo("sites", "ok.exemplo.ufrn.br", "rendered.html"))!;
    const div = (100 * 7) / 9;
    expect(r.indice).toBeCloseTo((20 * 100 + 20 * 50 + 10 * div + 10 * 100 + 5 * 100) / 65, 10);
    expect(r.indicePesosIguais).toBeCloseTo((100 + 50 + div + 100 + 100) / 5, 10);
  });

  it("sem indicadores ou body vazio → null", () => {
    expect(calcularIndice(null)).toBeNull();
    expect(calcularIndice(doArquivo("divspan-vazio.html"))).toBeNull();
  });
});

describe("spearman", () => {
  it("postos com empate pela média", () => {
    expect(postos([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(postos([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("monotônica → 1; invertida → −1; constante → null", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 400])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
    expect(spearman([1, 2, 3], [5, 5, 5])).toBeNull();
  });

  it("caso com empate conferido à mão", () => {
    // postos x = [1,2,3,4,5] (desvios −2,−1,0,1,2); postos y = [1,2.5,2.5,5,4] (desvios −2,−.5,−.5,2,1)
    // Σdxdy = 4 + .5 + 0 + 2 + 2 = 8,5; Σdx² = 10; Σdy² = 9,5.
    expect(spearman([1, 2, 3, 4, 5], [1, 2, 2, 9, 7])).toBeCloseTo(8.5 / Math.sqrt(10 * 9.5), 12);
  });
});
