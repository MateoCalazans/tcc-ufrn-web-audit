/**
 * Interface visual (S21): trecho "antes × depois" de cada correção automática.
 *
 * As edições de uma recomendação (ADR 014) são posições no `index.html` bruto.
 * Este módulo recorta, em volta delas, o trecho de origem e o mesmo trecho com
 * só as edições daquela recomendação aplicadas. É o que a tela mostra lado a
 * lado; o `fix.diff` continua sendo o artefato completo.
 */
import { aplicarEdicoes } from "../recommend/engine.js";
import type { Edicao, Recommendation } from "../shared/types.js";

export interface Trecho {
  /** Linha (1-based) do início do trecho no `index.html`. */
  linha: number;
  antes: string;
  depois: string;
  /** Se o trecho foi cortado antes do início ou depois do fim da linha. */
  cortadoInicio: boolean;
  cortadoFim: boolean;
}

/** Caracteres de contexto, no máximo, de cada lado das edições. */
export const MARGEM = 160;

/**
 * Trecho em volta das edições: vai até o começo e o fim das linhas tocadas,
 * limitado a {@link MARGEM} caracteres de cada lado (HTML minificado tem
 * linhas enormes). `null` se não há edição.
 */
export function trechoDaCorrecao(html: string, edicoes: readonly Edicao[], margem = MARGEM): Trecho | null {
  if (edicoes.length === 0) return null;
  const ini = Math.min(...edicoes.map((e) => e.inicio));
  const fim = Math.max(...edicoes.map((e) => e.fim));

  const inicioLinha = html.lastIndexOf("\n", ini - 1) + 1;
  const quebra = html.indexOf("\n", fim);
  let fimLinha = quebra < 0 ? html.length : quebra;
  if (fimLinha > fim && html[fimLinha - 1] === "\r") fimLinha--;

  const a = Math.max(inicioLinha, ini - margem);
  const b = Math.min(fimLinha, fim + margem);
  const recorte = html.slice(a, b);
  const locais = edicoes.map((e) => ({ inicio: e.inicio - a, fim: e.fim - a, texto: e.texto }));

  let linha = 1;
  for (let i = html.indexOf("\n"); i >= 0 && i < a; i = html.indexOf("\n", i + 1)) linha++;

  return {
    linha,
    antes: recorte,
    depois: aplicarEdicoes(recorte, locais),
    cortadoInicio: a > inicioLinha,
    cortadoFim: b < fimLinha,
  };
}

/** Trechos de todas as recomendações com correção automática, por id. */
export function trechosDasCorrecoes(html: string, recs: readonly Pick<Recommendation, "id" | "correcaoAutomatica" | "edicoes">[]): Record<string, Trecho> {
  const saida: Record<string, Trecho> = {};
  for (const r of recs) {
    if (!r.correcaoAutomatica) continue;
    const t = trechoDaCorrecao(html, r.edicoes);
    if (t) saida[r.id] = t;
  }
  return saida;
}
