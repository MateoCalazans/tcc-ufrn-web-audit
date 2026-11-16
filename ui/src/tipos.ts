/**
 * Formatos que as telas leem do servidor da S20. Espelham `metrics.json`
 * (ADR 012), `recommendations.json` (ADR 014) e os eventos da fila (ADR 017);
 * só os campos usados aqui.
 */

export type Severidade = "alta" | "media" | "baixa" | "info";
export type Dimensao = "performance" | "semantica";

export interface Recomendacao {
  id: string;
  regra: string;
  severidade: Severidade;
  dimensao: Dimensao;
  evidencia: string;
  posicao: { linha: number; coluna: number } | null;
  correcaoAutomatica: boolean;
  mensagem: string;
}

export interface DescricaoRegra {
  id: string;
  dimensao: Dimensao;
  descricao: string;
}

export interface Recomendacoes {
  regras?: DescricaoRegra[];
  resumo?: { total: number; corrigidas: number };
  llm?: { prompt?: string; modelo?: string } | null;
  recommendations?: Recomendacao[];
}

export interface Trecho {
  linha: number;
  antes: string;
  depois: string;
  cortadoInicio: boolean;
  cortadoFim: boolean;
}

export interface Metricas {
  meta?: { generatedAt?: string; gitCommit?: string | null; toolVersions?: Record<string, string> };
  id: string;
  url: string;
  contexto?: { tipo?: string; tecnologia?: string };
  conjuntoPrincipal?: boolean;
  performance?: {
    status?: string;
    execucoesValidas?: number;
    amplitudePerformance?: number | null;
    coleta?: { collectedAt?: string };
    metricas?: {
      notas?: Partial<Record<"performance" | "accessibility" | "best-practices" | "seo", number | null>>;
      fcpMs?: number | null;
      lcpMs?: number | null;
      tbtMs?: number | null;
      cls?: number | null;
      speedIndexMs?: number | null;
      pesoTotalBytes?: number | null;
      requisicoes?: number | null;
      jsNaoUsadoBytes?: number | null;
      cssNaoUsadoBytes?: number | null;
    } | null;
  } | null;
  semantica?: {
    status?: string;
    indicadores?: {
      divSpan?: { div: number; span: number; total: number; proporcao: number | null };
      landmarks?: { banner: number; navigation: number; main: number; contentinfo: number };
      titulos?: { total: number; h1: number; saltos: number; maiorSalto: number; primeiroNivel: number | null };
      estrutura?: Record<string, number>;
      interativosFalsos?: { comOnclick: number; falsos: number };
      metadados?: { lang: string | null; temTitle: boolean; titleComprimento: number; temViewport: boolean; temDescription: boolean };
      imagens?: { total: number; semAlt: number; altVazio: number };
      campos?: { total: number; semLabel: number };
      obsoletas?: { roteiro: number; whatwg: number };
      tabelas?: { total: number; layoutDeclarada: number; layoutHeuristica: number; dados: number };
    } | null;
    vnu?: { status?: string; erros?: number | null; avisos?: number | null } | null;
  } | null;
  indice?: {
    subnotas?: Record<string, number | null>;
    indice?: number | null;
    indicePesosIguais?: number | null;
  } | null;
}

/** Uma linha do `dataset.csv` (tudo texto, como no CSV). */
export type LinhaCorpus = Record<string, string> & { id: string };

export type Captura = "landmarks-original" | "landmarks-corrigido";

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

/** Resumo do `validation.json` (módulo 4), montado por `src/ui/validacao.ts`. */
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
  medianas: { original: number | null; corrigido: number | null };
}

export interface SiteCorpus {
  id: string;
  dataset: LinhaCorpus;
  metrics: Metricas | null;
  temScreenshot: boolean;
  /** Se há `index.html` bruto da coleta (sem ele, não há como recomendar). */
  temBruto: boolean;
  capturas: Captura[];
  validacoes?: ResumoValidacao[];
  recomendacao: {
    origem: "tcc" | "interface";
    analise?: string;
    recommendations: Recomendacoes | null;
    fixDiff: string | null;
    trechos: Record<string, Trecho>;
  } | null;
}

export type NomeEtapa = "triagem" | "sondagem" | "classificacao" | "coleta" | "analise" | "recomendacao";
export type Estado = "na-fila" | "rodando" | "concluida" | "excluida" | "recusada" | "falhou";

export type Evento =
  | { tipo: "estado"; estado: Estado; motivo?: string; em?: string }
  | { tipo: "etapa-inicio"; etapa: NomeEtapa; rotulo: string; em: string }
  | { tipo: "etapa-fim"; etapa: NomeEtapa; codigo: number; duracaoMs: number; em: string }
  | { tipo: "log"; etapa: NomeEtapa; linha: string; em: string };

export interface ResumoAnalise {
  id: string;
  tipo: "avulso" | "corpus";
  site: string;
  host?: string;
  estado: Estado;
  motivo?: string;
  criadaEm?: string;
  opcoes?: { llm: boolean; vnu: boolean; tetoUsd: number | null };
  /** Todos os eventos, no registro em disco ou na análise viva. */
  eventos?: Evento[];
}

export interface ResultadoAnalise {
  id: string;
  metrics: Metricas | null;
  recommendations: Recomendacoes | null;
  fixDiff: string | null;
  trechos: Record<string, Trecho>;
  temScreenshot: boolean;
}

export interface SaldoLlm {
  tetoUsd: number;
  gastoUsd?: number;
  saldoUsd: number;
}
