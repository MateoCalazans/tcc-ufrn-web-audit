import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { LH_RECORD, type LighthouseRecord } from "./lighthouse.js";
import { type CollectRecord, FILES, siteDir } from "./page.js";

/**
 * Planejamento e resumo da coleta retomável (S07, ADR 008).
 *
 * Uma etapa está feita quando o seu registro (`collect.json` /
 * `lighthouse.json`) existe — ele é gravado por último. Uma etapa sem registro
 * é refeita do zero; um registro existente nunca é tocado (regra 8), mesmo com
 * `completo: false` (sites com falha não são tentados de novo).
 */
export const ETAPAS = ["page", "lighthouse"] as const;
export type Etapa = (typeof ETAPAS)[number];

const REGISTRO: Record<Etapa, string> = { page: FILES.record, lighthouse: LH_RECORD };

/** Situação de uma etapa num site. */
export type SituacaoEtapa = "pendente" | "completo" | "incompleto" | "ilegivel";

export interface EstadoSite {
  id: string;
  page: SituacaoEtapa;
  lighthouse: SituacaoEtapa;
  /** Motivos das falhas (sem repetição), ex.: `render:TimeoutError`. */
  motivos: string[];
}

// --------------------------------------------------------------------------
// Motivos (puros)
// --------------------------------------------------------------------------

/**
 * Reduz a mensagem de `describeError` a um código estável para agrupar:
 * `TypeError: fetch failed (ECONNREFUSED)` → `ECONNREFUSED`;
 * `Error: page.goto: net::ERR_NAME_NOT_RESOLVED at …` → `ERR_NAME_NOT_RESOLVED`;
 * `TimeoutError: page.goto: Timeout 30000ms exceeded.` → `TimeoutError`.
 */
export function codigoDoErro(msg: string): string {
  const har = msg.startsWith("har: ");
  const m = har ? msg.slice(5) : msg;
  const code = /\(([A-Z][A-Z0-9_]+)\)\s*$/.exec(m)?.[1] ?? /net::(ERR_[A-Z0-9_]+)/.exec(m)?.[1];
  const nome = /^([A-Za-z]+(?:Error)?):/.exec(m)?.[1];
  const base = code ?? nome ?? "desconhecido";
  return har ? `har-${base}` : base;
}

/** Motivos de falha de um `collect.json`. Vazio se completo. */
export function motivosPage(r: Pick<CollectRecord, "raw" | "render" | "arquivos" | "completo">): string[] {
  if (r.completo) return [];
  const motivos: string[] = [];
  if (!r.raw.ok) motivos.push(`bruto:${codigoDoErro(r.raw.error ?? "")}`);
  if (!r.render.ok) motivos.push(`render:${codigoDoErro(r.render.error ?? "")}`);
  // Arquivo ausente só é motivo próprio se a etapa que o produz deu certo.
  for (const [arquivo, existe] of Object.entries(r.arquivos)) {
    const etapaOk = arquivo === "raw" ? r.raw.ok : r.render.ok;
    if (!existe && etapaOk) motivos.push(`page:arquivo-ausente-${arquivo}`);
  }
  if (motivos.length === 0) motivos.push("page:incompleto");
  return [...new Set(motivos)];
}

/** Motivos de falha de um `lighthouse.json`. Vazio se completo. */
export function motivosLighthouse(r: Pick<LighthouseRecord, "execucoes" | "completo">): string[] {
  if (r.completo) return [];
  const motivos: string[] = [];
  for (const e of r.execucoes) {
    if (e.valida) continue;
    if (e.runtimeError) motivos.push(`lighthouse:${e.runtimeError.code}`);
    else if (e.erro) motivos.push(`lighthouse:${codigoDoErro(e.erro)}`);
    else motivos.push("lighthouse:sem-nota");
  }
  if (motivos.length === 0) motivos.push("lighthouse:incompleto");
  return [...new Set(motivos)];
}

// --------------------------------------------------------------------------
// Estado de um site (lê o disco)
// --------------------------------------------------------------------------

function lerRegistro<T>(file: string): { situacao: SituacaoEtapa; registro: T | null } {
  if (!existsSync(file)) return { situacao: "pendente", registro: null };
  try {
    const registro = JSON.parse(readFileSync(file, "utf8")) as T & { completo?: unknown };
    return { situacao: registro.completo === true ? "completo" : "incompleto", registro };
  } catch {
    return { situacao: "ilegivel", registro: null };
  }
}

export function estadoDoSite(rawDir: string, id: string): EstadoSite {
  const dir = siteDir(rawDir, id);
  const page = lerRegistro<CollectRecord>(join(dir, REGISTRO.page));
  const lh = lerRegistro<LighthouseRecord>(join(dir, REGISTRO.lighthouse));
  const motivos = [
    ...(page.situacao === "ilegivel" ? ["page:registro-ilegivel"] : []),
    ...(page.registro ? motivosPage(page.registro) : []),
    ...(lh.situacao === "ilegivel" ? ["lighthouse:registro-ilegivel"] : []),
    ...(lh.registro ? motivosLighthouse(lh.registro) : []),
  ];
  return { id, page: page.situacao, lighthouse: lh.situacao, motivos };
}

/** Etapas que ainda faltam rodar (na ordem), dentre as pedidas. */
export function etapasPendentes(estado: EstadoSite, pedidas: readonly Etapa[] = ETAPAS): Etapa[] {
  return ETAPAS.filter((e) => pedidas.includes(e) && estado[e] === "pendente");
}

/** Algum registro já existe (para exigir `--resume`). */
export const temRegistro = (estado: EstadoSite): boolean =>
  estado.page !== "pendente" || estado.lighthouse !== "pendente";

// --------------------------------------------------------------------------
// Resumo da coleta (puro, a partir dos estados)
// --------------------------------------------------------------------------

export interface ResumoColeta {
  sites: number;
  /** Todas as etapas pedidas com registro `completo: true`. */
  completos: number;
  /** Todas as etapas pedidas com registro, mas alguma com falha. */
  comFalha: number;
  /** Alguma etapa pedida ainda sem registro. */
  pendentes: number;
  /** Por etapa: quantos sites em cada situação. */
  porEtapa: Record<Etapa, Record<SituacaoEtapa, number>>;
  /** Quantos sites tiveram cada motivo (um site pode ter vários). */
  porMotivo: Record<string, number>;
}

export function resumirColeta(estados: EstadoSite[], pedidas: readonly Etapa[] = ETAPAS): ResumoColeta {
  const vazio = (): Record<SituacaoEtapa, number> => ({ pendente: 0, completo: 0, incompleto: 0, ilegivel: 0 });
  const resumo: ResumoColeta = {
    sites: estados.length,
    completos: 0,
    comFalha: 0,
    pendentes: 0,
    porEtapa: { page: vazio(), lighthouse: vazio() },
    porMotivo: {},
  };
  for (const s of estados) {
    for (const e of ETAPAS) resumo.porEtapa[e][s[e]]++;
    const situacoes = pedidas.map((e) => s[e]);
    if (situacoes.includes("pendente")) resumo.pendentes++;
    else if (situacoes.every((x) => x === "completo")) resumo.completos++;
    else resumo.comFalha++;
    for (const m of s.motivos) {
      if (!pedidas.includes(m.startsWith("lighthouse:") ? "lighthouse" : "page")) continue;
      resumo.porMotivo[m] = (resumo.porMotivo[m] ?? 0) + 1;
    }
  }
  resumo.porMotivo = Object.fromEntries(Object.entries(resumo.porMotivo).sort(([a, x], [b, y]) => y - x || a.localeCompare(b)));
  return resumo;
}

/** Tempo restante estimado pela média dos sites processados nesta execução. */
export function estimarRestanteS(duracoesMs: number[], restantes: number): number | null {
  if (duracoesMs.length === 0) return null;
  const media = duracoesMs.reduce((a, b) => a + b, 0) / duracoesMs.length;
  return Math.round((media * restantes) / 1000);
}
