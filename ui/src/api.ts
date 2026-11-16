import type { LinhaCorpus, ResultadoAnalise, ResumoAnalise, SaldoLlm, SiteCorpus } from "./tipos";

/** Cliente do servidor da S20 (mesma origem: `/api`). */

export class ErroApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(caminho, init);
  const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
  if (!r.ok) throw new ErroApi(corpo?.erro ?? `erro ${r.status}`, r.status);
  return corpo as T;
}

const seg = encodeURIComponent;

export const api = {
  corpus: () => pedir<LinhaCorpus[]>("/api/corpus"),
  site: (id: string) => pedir<SiteCorpus>(`/api/corpus/${seg(id)}`),
  recomendarCorpus: (id: string) => pedir<{ id: string }>(`/api/corpus/${seg(id)}/recomendar`, { method: "POST" }),
  llm: () => pedir<SaldoLlm>("/api/llm"),
  analisar: (url: string, opcoes: { llm: boolean; vnu: boolean }) =>
    pedir<{ id: string; site: string }>("/api/analises", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, ...opcoes }),
    }),
  analises: () => pedir<ResumoAnalise[]>("/api/analises"),
  analise: (id: string) => pedir<ResumoAnalise>(`/api/analises/${seg(id)}`),
  resultado: (id: string) => pedir<ResultadoAnalise>(`/api/analises/${seg(id)}/resultado`),
};

export const urls = {
  eventos: (id: string) => `/api/analises/${seg(id)}/eventos`,
  screenshotAnalise: (id: string) => `/api/analises/${seg(id)}/screenshot`,
  screenshotCorpus: (id: string) => `/api/corpus/${seg(id)}/screenshot`,
  captura: (id: string, nome: string) => `/api/corpus/${seg(id)}/captura/${seg(nome)}`,
  telaFinal: (id: string, variante: "original" | "corrigido", versao: string) =>
    `/api/corpus/${seg(id)}/tela-final/${variante}?versao=${seg(versao)}`,
};
