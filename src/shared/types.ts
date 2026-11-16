/**
 * Tipos compartilhados do pipeline. RASCUNHO da S00 — cada módulo vai refinar
 * e estender estes tipos nas fases seguintes (triagem, análise, recomendação).
 * Mantidos juntos aqui para servir de contrato entre os módulos.
 */

import type { CheerioAPI } from "cheerio";

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

/**
 * Edição pontual sobre o texto do HTML de entrada (ADR 014): troca
 * `html.slice(inicio, fim)` por `texto`. Inserção = `inicio === fim`.
 */
export interface Edicao {
  inicio: number;
  fim: number;
  texto: string;
}

/** Posição no HTML de entrada (1-based), para o mantenedor achar o trecho. */
export interface Posicao {
  linha: number;
  coluna: number;
}

export interface Recommendation {
  /** `<regra>-<n>`, determinístico na ordem do documento. */
  id: string;
  /** id da regra que a gerou. */
  regra: string;
  severidade: Severidade;
  dimensao: Dimensao;
  /** trecho/seletor que embasa a recomendação. */
  evidencia: string;
  /** `null` quando o trecho não existe no arquivo (tag inferida pelo parser). */
  posicao: Posicao | null;
  /** se a correção foi aplicada no `fixed.html`. */
  correcaoAutomatica: boolean;
  mensagem: string;
  /** edições aplicadas (vazio se `correcaoAutomatica` é `false`). */
  edicoes: Edicao[];
}

/** O que uma regra devolve; o motor atribui `id` e `regra`. */
export type Achado = Omit<Recommendation, "id" | "regra" | "correcaoAutomatica">;

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
   * Avalia o HTML e devolve os achados. Função pura em relação à entrada: não
   * escreve em disco nem muta o documento. A correção, se houver, vem como
   * `edicoes` sobre `contexto.html` (ADR 014).
   */
  avaliar(contexto: RuleContext): Achado[] | Promise<Achado[]>;
}

export interface RuleContext {
  siteId: string;
  /** URL da página (para resolver URLs relativas). */
  url: string;
  /** HTML de entrada: `index.html`, o bruto (ADR 014). */
  html: string;
  /** Documento parseado com posições de origem (`sourceCodeLocationInfo`). */
  $: CheerioAPI;
  /** HAR da coleta, se existir. */
  har?: Har;
  /** Relatório do Lighthouse da execução mediana (ADR 009), se houver execução válida. */
  lighthouse?: LhrRegras;
}

/** Subconjunto do relatório do Lighthouse usado pelas regras (S15). */
export interface LhrRegras {
  lighthouseVersion?: string;
  audits: Record<string, { score: number | null; details?: { items?: unknown[] } }>;
}

/** Subconjunto do HAR 1.2 usado pelas regras. */
export interface Har {
  log: {
    entries: Array<{
      request: { url: string };
      response: {
        status: number;
        redirectURL?: string;
        content: { mimeType?: string; text?: string; encoding?: string };
      };
    }>;
  };
}
