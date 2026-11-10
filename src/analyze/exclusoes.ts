import type { ExclusionReason } from "../shared/types.js";

/**
 * Sites do corpus que ficaram na coleta mas saem da análise (ADR 009, item 4;
 * decisão A do autor na S08). Os dados brutos ficam como estão (regra 8).
 */
export const EXCLUSOES_ANALISE: Readonly<Record<string, { motivo: ExclusionReason; detalhe: string }>> = {
  "pingifes.ufrn.br": {
    motivo: "login",
    detalhe: "meta refresh para a tela de login (regra 4); ver diário S05/S08",
  },
  "comunica.ufrn.br": {
    motivo: "nao-html",
    detalhe: "stream de áudio; Lighthouse NOT_HTML nas 3 execuções (diário S08)",
  },
  "enterpriseenrollment.ufrn.br": {
    motivo: "login",
    detalhe: "redireciona para o Intune da Microsoft e cai na tela de login do Azure (regra 4); ver diário S10",
  },
};

export function exclusaoDaAnalise(id: string): { motivo: ExclusionReason; detalhe: string } | null {
  return EXCLUSOES_ANALISE[id] ?? null;
}
