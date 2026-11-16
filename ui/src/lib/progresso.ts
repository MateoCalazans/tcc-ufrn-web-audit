import type { Estado, Evento, NomeEtapa } from "../tipos";

/** Mesmos rótulos de `src/ui/pipeline.ts` (um teste confere). */
export const ROTULO_ETAPA: Record<NomeEtapa, string> = {
  triagem: "Triagem (normalização)",
  sondagem: "Triagem (DNS, HTTP e robots.txt)",
  classificacao: "Triagem (classificação)",
  coleta: "Coleta (página + Lighthouse 3×)",
  analise: "Análise",
  recomendacao: "Recomendação",
};

/** Planos da fila (`planoAvulso` e `planoCorpus`, ADR 017). */
export const PLANO: Record<"avulso" | "corpus", readonly NomeEtapa[]> = {
  avulso: ["triagem", "sondagem", "classificacao", "coleta", "analise", "recomendacao"],
  corpus: ["recomendacao"],
};

export type SituacaoEtapa = "pendente" | "rodando" | "concluida" | "falhou" | "pulada";

export interface LinhaProgresso {
  etapa: NomeEtapa;
  rotulo: string;
  situacao: SituacaoEtapa;
  duracaoMs: number | null;
}

export interface Progresso {
  estado: Estado | "desconhecido";
  motivo: string | null;
  etapas: LinhaProgresso[];
  logs: string[];
}

export const TERMINAIS: readonly string[] = ["concluida", "excluida", "recusada", "falhou", "desconhecido"];

export const ROTULO_ESTADO: Record<Estado | "desconhecido", string> = {
  "na-fila": "Na fila",
  rodando: "Rodando",
  concluida: "Concluída",
  excluida: "Site excluído pela triagem",
  recusada: "Recusada",
  falhou: "Falhou",
  desconhecido: "Estado desconhecido",
};

export const ROTULO_SITUACAO: Record<SituacaoEtapa, string> = {
  pendente: "pendente",
  rodando: "rodando",
  concluida: "concluída",
  falhou: "falhou",
  pulada: "não executada",
};

/**
 * Eventos a mostrar. Para uma análise de outra execução do servidor, o SSE só
 * manda o estado final; as etapas vêm então do registro em disco
 * (`analise.json`), que guarda todos os eventos.
 */
export function eventosParaMostrar(sse: readonly Evento[], registro: readonly Evento[] | undefined): readonly Evento[] {
  if (sse.some((e) => e.tipo !== "estado") || !registro || registro.length === 0) return sse;
  return registro;
}

/** Reduz os eventos da fila ao estado de cada etapa do plano. */
export function progresso(tipo: "avulso" | "corpus", eventos: readonly Evento[]): Progresso {
  const linhas = new Map<NomeEtapa, LinhaProgresso>(
    PLANO[tipo].map((etapa) => [etapa, { etapa, rotulo: ROTULO_ETAPA[etapa], situacao: "pendente", duracaoMs: null }]),
  );
  let estado: Progresso["estado"] = "na-fila";
  let motivo: string | null = null;
  const logs: string[] = [];

  for (const e of eventos) {
    if (e.tipo === "estado") {
      estado = e.estado;
      motivo = e.motivo ?? null;
    } else if (e.tipo === "log") {
      logs.push(`[${e.etapa}] ${e.linha}`);
    } else {
      const l = linhas.get(e.etapa) ?? { etapa: e.etapa, rotulo: ROTULO_ETAPA[e.etapa], situacao: "pendente" as const, duracaoMs: null };
      if (e.tipo === "etapa-inicio") {
        l.situacao = "rodando";
      } else {
        l.situacao = e.codigo === 0 ? "concluida" : "falhou";
        l.duracaoMs = e.duracaoMs;
      }
      linhas.set(e.etapa, l);
    }
  }
  // Análise encerrada: o que não rodou não vai rodar.
  if (TERMINAIS.includes(estado)) {
    for (const l of linhas.values()) if (l.situacao === "pendente" || l.situacao === "rodando") l.situacao = "pulada";
  }
  return { estado, motivo, etapas: [...linhas.values()], logs };
}
