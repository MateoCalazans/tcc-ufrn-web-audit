import type { Recomendacao, Severidade } from "../tipos";

export const ORDEM_SEVERIDADE: readonly Severidade[] = ["alta", "media", "baixa", "info"];

export const ROTULO_SEVERIDADE: Record<Severidade, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  info: "Informativa",
};

export const ROTULO_DIMENSAO = { performance: "Performance", semantica: "Semântica" } as const;

/**
 * Referência de cada regra: o ADR que a define no repositório. Normas externas
 * (WCAG, eMAG, WHATWG) ficam nos ADRs, onde estão marcadas como citadas de
 * memória e a conferir; a tela não repete o que ainda não foi verificado.
 */
export const REFERENCIA_REGRA: Record<string, { adr: string; arquivo: string }> = {
  "html-lang": { adr: "ADR 014", arquivo: "docs/decisoes/014-motor-de-regras-e-correcoes.md" },
  "meta-viewport": { adr: "ADR 014", arquivo: "docs/decisoes/014-motor-de-regras-e-correcoes.md" },
  "img-dimensions": { adr: "ADR 014", arquivo: "docs/decisoes/014-motor-de-regras-e-correcoes.md" },
  "img-lazy": { adr: "ADR 015", arquivo: "docs/decisoes/015-regras-da-s15-e-criterio-de-escolha.md" },
  "obsolete-tags": { adr: "ADR 015", arquivo: "docs/decisoes/015-regras-da-s15-e-criterio-de-escolha.md" },
  "heading-skip": { adr: "ADR 015", arquivo: "docs/decisoes/015-regras-da-s15-e-criterio-de-escolha.md" },
  "fake-button": { adr: "ADR 015", arquivo: "docs/decisoes/015-regras-da-s15-e-criterio-de-escolha.md" },
  "render-blocking-hint": { adr: "ADR 015", arquivo: "docs/decisoes/015-regras-da-s15-e-criterio-de-escolha.md" },
  "landmarks-llm": { adr: "ADR 016", arquivo: "docs/decisoes/016-llm-para-landmarks.md" },
};

export interface GrupoSeveridade {
  severidade: Severidade;
  itens: Recomendacao[];
}

/**
 * Agrupa por severidade (alta → informativa), sem grupos vazios. Dentro do
 * grupo, as com correção automática vêm antes; depois, a ordem do documento
 * (o id já é determinístico, ADR 014).
 */
export function agruparPorSeveridade(recs: readonly Recomendacao[]): GrupoSeveridade[] {
  return ORDEM_SEVERIDADE.map((severidade) => ({
    severidade,
    itens: recs
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.severidade === severidade)
      .sort((a, b) => Number(b.r.correcaoAutomatica) - Number(a.r.correcaoAutomatica) || a.i - b.i)
      .map(({ r }) => r),
  })).filter((g) => g.itens.length > 0);
}

export interface GrupoRegra {
  regra: string;
  dimensao: Recomendacao["dimensao"];
  itens: Recomendacao[];
  corrigidas: number;
}

/** Dentro de uma severidade, uma linha por regra, na ordem em que a regra aparece primeiro. */
export function agruparPorRegra(itens: readonly Recomendacao[]): GrupoRegra[] {
  const grupos = new Map<string, GrupoRegra>();
  for (const r of itens) {
    const g = grupos.get(r.regra) ?? { regra: r.regra, dimensao: r.dimensao, itens: [], corrigidas: 0 };
    g.itens.push(r);
    if (r.correcaoAutomatica) g.corrigidas++;
    grupos.set(r.regra, g);
  }
  return [...grupos.values()];
}

/**
 * Começo do motivo, para a linha recolhida: até o primeiro ponto final que
 * fecha uma frase, ou até `max` caracteres, cortando numa palavra.
 */
export function resumoMensagem(mensagem: string, max = 120): string {
  const fim = mensagem.search(/\.(\s|$)/);
  const frase = fim >= 0 ? mensagem.slice(0, fim + 1) : mensagem;
  if (frase.length <= max) return frase;
  const corte = frase.lastIndexOf(" ", max);
  return `${frase.slice(0, corte > max / 2 ? corte : max).trimEnd()}…`;
}

export interface Segmento {
  texto: string;
  tipo: "igual" | "removido" | "inserido";
}

/**
 * Diferença por caracteres entre o trecho antes e o depois, em dois lados:
 * prefixo e sufixo comuns ficam iguais e o miolo é o que mudou. As correções
 * do motor são inserções ou trocas pontuais (ADR 014), então isso basta.
 * Com mais de uma edição no trecho, o miolo cobre da primeira à última.
 */
export function diferencaLadoALado(antes: string, depois: string): { antes: Segmento[]; depois: Segmento[] } {
  let p = 0;
  while (p < antes.length && p < depois.length && antes[p] === depois[p]) p++;
  let s = 0;
  while (s < antes.length - p && s < depois.length - p && antes[antes.length - 1 - s] === depois[depois.length - 1 - s]) s++;
  const lado = (t: string, tipo: "removido" | "inserido"): Segmento[] =>
    [
      { texto: t.slice(0, p), tipo: "igual" as const },
      { texto: t.slice(p, t.length - s), tipo },
      { texto: t.slice(t.length - s), tipo: "igual" as const },
    ].filter((x) => x.texto !== "");
  return { antes: lado(antes, "removido"), depois: lado(depois, "inserido") };
}

/** Linhas do `fix.diff` com o tipo de cada uma, para colorir. */
export function linhasDoDiff(diff: string): Array<{ texto: string; tipo: "cabecalho" | "bloco" | "removida" | "inserida" | "contexto" }> {
  return diff
    .replace(/\n$/, "")
    .split("\n")
    .map((texto) => {
      if (texto.startsWith("---") || texto.startsWith("+++")) return { texto, tipo: "cabecalho" as const };
      if (texto.startsWith("@@")) return { texto, tipo: "bloco" as const };
      if (texto.startsWith("-")) return { texto, tipo: "removida" as const };
      if (texto.startsWith("+")) return { texto, tipo: "inserida" as const };
      return { texto, tipo: "contexto" as const };
    });
}
