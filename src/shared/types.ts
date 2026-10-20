/**
 * Tipos compartilhados do pipeline. RASCUNHO da S00 — cada módulo vai refinar
 * e estender estes tipos nas fases seguintes (triagem, análise, recomendação).
 * Mantidos juntos aqui para servir de contrato entre os módulos.
 */

/** Metadados obrigatórios em toda saída JSON (regra 10 do CLAUDE.md). */
export interface Meta {
  /** ISO 8601, UTC, momento da geração. */
  generatedAt: string;
  /** Versões das ferramentas relevantes; `null` quando não instalada/detectável. */
  toolVersions: ToolVersions;
  /** HEAD atual, ou `null` fora de um repositório git. */
  gitCommit: string | null;
  /** `true` se havia alterações não commitadas ao gerar (reprodutibilidade). */
  gitDirty: boolean;
}

export interface ToolVersions {
  node: string | null;
  lighthouse: string | null;
  playwright: string | null;
  [tool: string]: string | null;
}

// ---------------------------------------------------------------------------
// Módulo 0 — Triagem
// ---------------------------------------------------------------------------

export type ExclusionReason =
  | "infra"
  | "dns"
  | "timeout"
  | "4xx"
  | "5xx"
  | "nao-html"
  | "login"
  | "pagina-padrao"
  | "duplicata-redirect"
  | "robots";

/** Uma linha do corpus (`data/corpus.csv`). */
export interface CorpusEntry {
  /** hostname normalizado, sem `www.` (ex.: `ppgsw.ufrn.br`). */
  id: string;
  urlOriginal: string;
  urlFinal: string | null;
  status: number | null;
  incluido: boolean;
  motivoExclusao: ExclusionReason | null;
  tipo: string;
  tecnologia: string;
  dataTriagem: string;
}

// ---------------------------------------------------------------------------
// Módulo 2 — Análise
// ---------------------------------------------------------------------------

/** Métricas por site (`metrics.json`). Indicadores brutos + índice (regra 9). */
export interface SiteMetrics {
  id: string;
  url: string;
  meta: Meta;
  performance: Record<string, number | null>;
  semantica: Record<string, number | null>;
  /** Índice composto de semântica, 0–100 (ver ADR 003). */
  indiceSemantica: number | null;
}

// ---------------------------------------------------------------------------
// Módulo 3 — Recomendação
// ---------------------------------------------------------------------------

export type Severidade = "info" | "baixa" | "media" | "alta";
export type Dimensao = "performance" | "semantica";

export interface Recommendation {
  id: string;
  /** id da regra que a gerou. */
  regra: string;
  severidade: Severidade;
  dimensao: Dimensao;
  /** trecho/seletor que embasa a recomendação. */
  evidencia: string;
  /** se a regra consegue aplicar a correção automaticamente. */
  correcaoAutomatica: boolean;
  mensagem: string;
}

/**
 * Contrato de uma regra de recomendação (um arquivo por regra em
 * `src/recommend/rules/`). Assíncrona para permitir regras que usem LLM.
 */
export interface Rule {
  id: string;
  dimensao: Dimensao;
  severidade: Severidade;
  /** Descrição curta do que a regra verifica. */
  descricao: string;
  /**
   * Avalia o HTML e devolve as recomendações encontradas. Função pura em
   * relação à entrada: não escreve em disco nem muta o HTML recebido.
   */
  avaliar(contexto: RuleContext): Recommendation[] | Promise<Recommendation[]>;
}

export interface RuleContext {
  siteId: string;
  /** HTML (bruto ou renderizado, conforme a regra). */
  html: string;
}
