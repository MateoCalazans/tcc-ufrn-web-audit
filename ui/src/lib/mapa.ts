import type { LinhaCorpus } from "../tipos";
import { numero } from "./formato";

/**
 * Mapa do corpus: cada site do conjunto principal com nota de performance (x)
 * e índice de semântica (y). Sites sem um dos dois ficam fora do mapa e são
 * contados, para a legenda dizer quantos.
 */
export interface Ponto {
  id: string;
  performance: number;
  indice: number;
  tecnologia: string;
}

export interface DadosMapa {
  pontos: Ponto[];
  fora: number;
  medianaPerformance: number | null;
  medianaIndice: number | null;
}

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

export function dadosDoMapa(linhas: readonly LinhaCorpus[]): DadosMapa {
  const pontos: Ponto[] = [];
  let fora = 0;
  for (const l of linhas) {
    const performance = numero(l.nota_performance);
    const indice = numero(l.indice_semantica);
    if (l.conjunto_principal !== "true" || performance === null || indice === null) {
      fora++;
      continue;
    }
    pontos.push({ id: l.id, performance, indice, tecnologia: l.tecnologia ?? "" });
  }
  // ordem de montagem da animação: da pior para a melhor performance
  pontos.sort((a, b) => a.performance - b.performance || a.id.localeCompare(b.id));
  return {
    pontos,
    fora,
    medianaPerformance: mediana(pontos.map((p) => p.performance)),
    medianaIndice: mediana(pontos.map((p) => p.indice)),
  };
}

/** Geometria do SVG (viewBox fixo; o CSS escala). */
export interface Geometria {
  largura: number;
  altura: number;
  margem: { topo: number; direita: number; base: number; esquerda: number };
}

export const GEOMETRIA_GRANDE: Geometria = { largura: 1000, altura: 440, margem: { topo: 20, direita: 24, base: 52, esquerda: 64 } };
/** Telas estreitas (celular): perto de 1:1 na largura real, para o texto continuar legível. */
export const GEOMETRIA_ESTREITA: Geometria = { largura: 360, altura: 340, margem: { topo: 14, direita: 12, base: 42, esquerda: 44 } };
export const GEOMETRIA_MINI: Geometria = { largura: 420, altura: 260, margem: { topo: 14, direita: 14, base: 38, esquerda: 44 } };

/** Escala 0–100 → coordenadas do SVG. */
export function escala(g: Geometria) {
  const w = g.largura - g.margem.esquerda - g.margem.direita;
  const h = g.altura - g.margem.topo - g.margem.base;
  return {
    x: (v: number) => g.margem.esquerda + (Math.max(0, Math.min(100, v)) / 100) * w,
    y: (v: number) => g.margem.topo + (1 - Math.max(0, Math.min(100, v)) / 100) * h,
    base: g.margem.topo + h,
    topo: g.margem.topo,
    esquerda: g.margem.esquerda,
    direita: g.margem.esquerda + w,
  };
}
