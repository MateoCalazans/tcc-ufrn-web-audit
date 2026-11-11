import type { IndicadoresSemanticos } from "./semantics.js";

/**
 * Índice de semântica HTML (S12, ADR 003): 8 subnotas de 0 a 100 com
 * normalização absoluta, agregadas por média ponderada; subnotas que não se
 * aplicam (N/A = `null`) saem da média e os pesos são renormalizados.
 * Funções puras.
 */

export const SUBNOTAS = [
  "landmarks",
  "titulos",
  "imagens",
  "campos",
  "divSpan",
  "metadados",
  "interativos",
  "obsoletos",
] as const;
export type Subnota = (typeof SUBNOTAS)[number];
export type Subnotas = Record<Subnota, number | null>;
export type Pesos = Record<Subnota, number>;

/** Pesos propostos (ADR 003). Soma 100. */
export const PESOS_PROPOSTOS: Pesos = {
  landmarks: 20,
  titulos: 20,
  imagens: 15,
  campos: 15,
  divSpan: 10,
  metadados: 10,
  interativos: 5,
  obsoletos: 5,
};

/** Pesos iguais (sensibilidade, ADR 003). */
export const PESOS_IGUAIS: Pesos = Object.fromEntries(SUBNOTAS.map((s) => [s, 1])) as Pesos;

const se = (c: boolean, pontos: number): number => (c ? pontos : 0);
/** 100 × (1 − falhas/total); `null` (N/A) se `total` = 0. */
const proporcaoBoa = (falhas: number, total: number): number | null => (total === 0 ? null : 100 * (1 - falhas / total));

/** As 8 subnotas da tabela do ADR 003. */
export function calcularSubnotas(i: IndicadoresSemanticos): Subnotas {
  const l = i.landmarks;
  const t = i.titulos;
  const titulos =
    t.total === 0 ? 0 : se(t.h1 === 1, 50) + (t.total === 1 ? 50 : 50 * (1 - t.saltos / (t.total - 1)));
  return {
    landmarks: se(l.banner > 0, 25) + se(l.navigation > 0, 25) + se(l.main === 1, 25) + se(l.contentinfo > 0, 25),
    titulos,
    imagens: proporcaoBoa(i.imagens.semAlt, i.imagens.total),
    campos: proporcaoBoa(i.campos.semLabel, i.campos.total),
    divSpan: i.divSpan.proporcao === null ? null : 100 * (1 - i.divSpan.proporcao),
    metadados: se(i.metadados.lang !== null, 50) + se(i.metadados.temTitle, 50),
    interativos: proporcaoBoa(i.interativosFalsos.falsos, i.interativosFalsos.comOnclick),
    obsoletos:
      se(i.obsoletas.roteiro === 0, 50) + se(i.tabelas.layoutDeclarada + i.tabelas.layoutHeuristica === 0, 50),
  };
}

/** Média ponderada das subnotas que se aplicam; `null` se nenhuma se aplica. */
export function agregar(s: Subnotas, pesos: Pesos): number | null {
  let soma = 0;
  let somaPesos = 0;
  for (const k of SUBNOTAS) {
    const v = s[k];
    if (v === null) continue;
    soma += pesos[k] * v;
    somaPesos += pesos[k];
  }
  return somaPesos === 0 ? null : soma / somaPesos;
}

export interface IndiceSite {
  subnotas: Subnotas;
  /** Pesos propostos (ADR 003). */
  indice: number | null;
  /** Pesos iguais (sensibilidade). */
  indicePesosIguais: number | null;
}

/** `null` quando não há indicadores ou o `body` não tem elementos (status `vazio`/`sem-arquivo`). */
export function calcularIndice(i: IndicadoresSemanticos | null): IndiceSite | null {
  if (i === null || i.divSpan.total === 0) return null;
  const subnotas = calcularSubnotas(i);
  return { subnotas, indice: agregar(subnotas, PESOS_PROPOSTOS), indicePesosIguais: agregar(subnotas, PESOS_IGUAIS) };
}

// --------------------------------------------------------------------------
// Sensibilidade: Spearman entre dois rankings
// --------------------------------------------------------------------------

/** Postos de 1 a n, com média dos postos em caso de empate. */
export function postos(xs: number[]): number[] {
  const ordem = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array<number>(xs.length);
  for (let a = 0; a < ordem.length; ) {
    let b = a;
    while (b + 1 < ordem.length && ordem[b + 1]!.v === ordem[a]!.v) b++;
    const medio = (a + b) / 2 + 1;
    for (let k = a; k <= b; k++) r[ordem[k]!.i] = medio;
    a = b + 1;
  }
  return r;
}

/** Correlação de Pearson; `null` com menos de 2 pares ou variância zero. */
export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 2 || n !== y.length) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < n; k++) {
    const dx = x[k]! - mx;
    const dy = y[k]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/** ρ de Spearman = Pearson dos postos (com empates pela média). */
export function spearman(x: number[], y: number[]): number | null {
  return pearson(postos(x), postos(y));
}
