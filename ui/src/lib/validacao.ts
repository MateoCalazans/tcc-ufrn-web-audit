import type { Comparativo, ResumoValidacao } from "../tipos";
import { fmtBytes, fmtCls, fmtIndice, fmtInteiro, fmtMs } from "./formato";

/** Sentido em que a métrica melhora. */
export type Sentido = "maior" | "menor";

export interface LinhaMetrica {
  chave: string;
  rotulo: string;
  sentido: Sentido;
  fmt: (v: number | null) => string;
  /** Formata o delta, com sinal. */
  fmtDelta: (v: number) => string;
}

const sinal = (v: number, f: (x: number) => string) => (v > 0 ? `+${f(v)}` : v < 0 ? `−${f(-v)}` : f(0));

const nota = (rotulo: string, chave: string): LinhaMetrica => ({
  chave,
  rotulo,
  sentido: "maior",
  fmt: fmtInteiro,
  fmtDelta: (v) => sinal(v, fmtInteiro),
});
const tempo = (rotulo: string, chave: string): LinhaMetrica => ({
  chave,
  rotulo,
  sentido: "menor",
  fmt: fmtMs,
  fmtDelta: (v) => sinal(v, fmtMs),
});

/** Grupos da tabela, na ordem da tela. As chaves são as de `deltas` no `validation.json`. */
export const GRUPOS_VALIDACAO: Array<{ titulo: string; linhas: LinhaMetrica[] }> = [
  {
    titulo: "Notas do Lighthouse",
    linhas: [
      nota("Performance", "nota_performance"),
      nota("Acessibilidade", "nota_accessibility"),
      nota("Boas práticas", "nota_best_practices"),
      nota("SEO", "nota_seo"),
    ],
  },
  {
    titulo: "Métricas de carregamento",
    linhas: [
      tempo("First Contentful Paint", "fcp_ms"),
      tempo("Largest Contentful Paint", "lcp_ms"),
      tempo("Total Blocking Time", "tbt_ms"),
      tempo("Speed Index", "speed_index_ms"),
      { chave: "cls", rotulo: "Cumulative Layout Shift", sentido: "menor", fmt: fmtCls, fmtDelta: (v) => sinal(v, fmtCls) },
      { chave: "peso_total_bytes", rotulo: "Peso transferido", sentido: "menor", fmt: fmtBytes, fmtDelta: (v) => sinal(v, fmtBytes) },
      { chave: "requisicoes", rotulo: "Requisições", sentido: "menor", fmt: fmtInteiro, fmtDelta: (v) => sinal(v, fmtInteiro) },
    ],
  },
  {
    titulo: "Semântica",
    linhas: [
      { chave: "indice_semantica", rotulo: "Índice de semântica", sentido: "maior", fmt: fmtIndice, fmtDelta: (v) => sinal(v, fmtIndice) },
      {
        chave: "indice_semantica_pesos_iguais",
        rotulo: "Índice com pesos iguais",
        sentido: "maior",
        fmt: fmtIndice,
        fmtDelta: (v) => sinal(v, fmtIndice),
      },
    ],
  },
];

export type Efeito = "melhorou" | "piorou" | "igual" | "sem-dado";

export const ROTULO_EFEITO: Record<Efeito, string> = {
  melhorou: "melhorou",
  piorou: "piorou",
  igual: "igual",
  "sem-dado": "sem dado",
};

/** Melhorou ou piorou pelo sentido da métrica. Delta exatamente 0 é igual. */
export function efeito(c: Comparativo | undefined, sentido: Sentido): Efeito {
  if (!c || c.delta === null) return "sem-dado";
  if (c.delta === 0) return "igual";
  return (c.delta > 0) === (sentido === "maior") ? "melhorou" : "piorou";
}

/**
 * Se a mudança na nota de performance fica dentro da variação entre as 3
 * execuções de cada variante (a maior amplitude das duas). Só um aviso de
 * leitura: o teste estatístico é o do ADR 004, no conjunto da amostra.
 */
export function dentroDaVariacao(v: ResumoValidacao): boolean | null {
  const d = v.deltas.nota_performance?.delta;
  const a = Math.max(v.variacao.original?.amplitude ?? -1, v.variacao.corrigido?.amplitude ?? -1);
  if (d === null || d === undefined || a < 0) return null;
  return Math.abs(d) <= a;
}

/** Contagem de efeitos nas métricas da tabela, para o resumo no topo. */
export function contarEfeitos(v: ResumoValidacao): Record<Efeito, number> {
  const c: Record<Efeito, number> = { melhorou: 0, piorou: 0, igual: 0, "sem-dado": 0 };
  for (const g of GRUPOS_VALIDACAO) for (const l of g.linhas) c[efeito(v.deltas[l.chave], l.sentido)]++;
  return c;
}
