/**
 * Interface (S21): resumo do `validation.json` (módulo 4) para a tela.
 * Só leitura: cópia local original × cópia local corrigida (regra 7). A tela
 * não recalcula nada; os deltas vêm do próprio arquivo.
 */

export interface Comparativo {
  original: number | null;
  corrigido: number | null;
  delta: number | null;
}

export interface Variacao {
  n: number;
  min: number | null;
  max: number | null;
  amplitude: number | null;
}

export interface ResumoValidacao {
  versao: "v1.0" | "mais-recente";
  arquivo: string;
  generatedAt: string | null;
  gitCommit: string | null;
  gitDirty: boolean | null;
  parametros: { execucoesPorVariante: number | null; formFactor: string | null; throttlingMethod: string | null };
  recomendacoes: { total: number | null; corrigidas: number | null; corrigidasLlm: number | null };
  execucoesValidas: { original: number; corrigido: number };
  variacao: { original: Variacao | null; corrigido: Variacao | null };
  deltas: Record<string, Comparativo>;
  /** Execução mediana de cada variante (`lh-<variante>-<n>.json` na pasta da versão). */
  medianas: { original: number | null; corrigido: number | null };
}

/** Pasta dos relatórios de cada versão, dentro de `data/processed/sites/<site>/`. */
export const PASTA_VERSAO: Record<ResumoValidacao["versao"], string> = { "v1.0": "validacao-v1.0", "mais-recente": "validacao" };
export const ARQUIVO_VERSAO: Record<ResumoValidacao["versao"], string> = { "v1.0": "validation-v1.0.json", "mais-recente": "validation.json" };

/**
 * Imagem da auditoria `final-screenshot` de um relatório do Lighthouse: a
 * primeira tela do celular no fim do carregamento (não a página inteira).
 */
export function extrairTelaFinal(lhr: unknown): { tipo: string; bytes: Buffer } | null {
  const data = (lhr as { audits?: Record<string, { details?: { data?: unknown } }> } | null)?.audits?.["final-screenshot"]?.details?.data;
  if (typeof data !== "string") return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!m) return null;
  return { tipo: m[1]!, bytes: Buffer.from(m[2]!, "base64") };
}

type Bruto = Record<string, any>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function variacao(v: Bruto | undefined): Variacao | null {
  if (!v || typeof v !== "object") return null;
  return { n: num(v.n) ?? 0, min: num(v.min), max: num(v.max), amplitude: num(v.amplitude) };
}

function validas(variante: Bruto | undefined): number {
  const ex = variante?.execucoes;
  return Array.isArray(ex) ? ex.filter((e: Bruto) => e?.valida === true).length : 0;
}

export function resumoValidacao(json: unknown, versao: ResumoValidacao["versao"], arquivo: string): ResumoValidacao | null {
  if (!json || typeof json !== "object") return null;
  const v = json as Bruto;
  const deltas: Record<string, Comparativo> = {};
  for (const [k, d] of Object.entries((v.deltas ?? {}) as Record<string, Bruto>)) {
    deltas[k] = { original: num(d?.original), corrigido: num(d?.corrigido), delta: num(d?.delta) };
  }
  return {
    versao,
    arquivo,
    generatedAt: typeof v.meta?.generatedAt === "string" ? v.meta.generatedAt : null,
    gitCommit: typeof v.meta?.gitCommit === "string" ? v.meta.gitCommit : null,
    gitDirty: typeof v.meta?.gitDirty === "boolean" ? v.meta.gitDirty : null,
    parametros: {
      execucoesPorVariante: num(v.parametros?.execucoesPorVariante),
      formFactor: typeof v.parametros?.formFactor === "string" ? v.parametros.formFactor : null,
      throttlingMethod: typeof v.parametros?.throttlingMethod === "string" ? v.parametros.throttlingMethod : null,
    },
    recomendacoes: {
      total: num(v.recomendacoes?.total),
      corrigidas: num(v.recomendacoes?.corrigidas),
      corrigidasLlm: num(v.recomendacoes?.corrigidasLlm),
    },
    execucoesValidas: { original: validas(v.variantes?.original), corrigido: validas(v.variantes?.corrigido) },
    variacao: { original: variacao(v.variantes?.original?.variacaoPerformance), corrigido: variacao(v.variantes?.corrigido?.variacaoPerformance) },
    deltas,
    medianas: { original: num(v.variantes?.original?.mediana?.n), corrigido: num(v.variantes?.corrigido?.mediana?.n) },
  };
}

/**
 * Versões a mostrar: a da `v1.0` (resultado principal, quando o site está na
 * amostra) e a mais recente (`validation.json`). Se as duas forem a mesma
 * medição (mesmo `generatedAt`), fica só a da `v1.0`.
 */
export function versoesValidacao(v10: unknown, atual: unknown): ResumoValidacao[] {
  const a = resumoValidacao(v10, "v1.0", ARQUIVO_VERSAO["v1.0"]);
  const b = resumoValidacao(atual, "mais-recente", ARQUIVO_VERSAO["mais-recente"]);
  if (a && b && a.generatedAt !== null && a.generatedAt === b.generatedAt) return [a];
  return [a, b].filter((x): x is ResumoValidacao => x !== null);
}
