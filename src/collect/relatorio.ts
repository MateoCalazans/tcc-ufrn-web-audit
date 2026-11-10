import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Meta } from "../shared/types.js";
import { LH_RECORD, type LighthouseRecord } from "./lighthouse.js";
import { type CollectRecord, FILES, siteDir } from "./page.js";
import { type EstadoSite, estadoDoSite, resumirColeta } from "./plan.js";

/**
 * Relatório da coleta (S08): `docs/resultados/coleta.md`, calculado só a
 * partir de `data/raw/` (os registros), nunca dos logs. A leitura do disco
 * fica em `lerColeta`; a montagem do Markdown é pura (`montarRelatorioColeta`).
 */

/** Campos dos registros usados no relatório (todos opcionais: registro pode faltar ou ser ilegível). */
export interface SiteColeta {
  estado: EstadoSite;
  page: Partial<Pick<CollectRecord, "meta" | "metaRefresh">> | null;
  lighthouse: Partial<Pick<LighthouseRecord, "meta" | "execucoes" | "mediana" | "variacaoPerformance">> | null;
}

function lerJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function lerColeta(rawDir: string, ids: string[]): SiteColeta[] {
  return ids.map((id) => {
    const dir = siteDir(rawDir, id);
    return {
      estado: estadoDoSite(rawDir, id),
      page: lerJson<CollectRecord>(join(dir, FILES.record)),
      lighthouse: lerJson<LighthouseRecord>(join(dir, LH_RECORD)),
    };
  });
}

// --------------------------------------------------------------------------
// Agregações (puras)
// --------------------------------------------------------------------------

/** Início = menor `collectedAt`; fim = maior `startedAt + durationMs` das execuções do Lighthouse. */
export function periodoDaColeta(sites: SiteColeta[]): { inicio: string | null; fim: string | null; duracaoS: number | null } {
  const inicios: number[] = [];
  const fins: number[] = [];
  for (const s of sites) {
    for (const at of [s.page?.meta?.collectedAt, s.lighthouse?.meta?.collectedAt]) {
      if (at) inicios.push(Date.parse(at));
    }
    for (const e of s.lighthouse?.execucoes ?? []) {
      if (e.startedAt) fins.push(Date.parse(e.startedAt) + (e.durationMs ?? 0));
    }
  }
  if (inicios.length === 0) return { inicio: null, fim: null, duracaoS: null };
  const inicio = Math.min(...inicios);
  const fim = fins.length > 0 ? Math.max(...fins) : Math.max(...inicios);
  return {
    inicio: new Date(inicio).toISOString(),
    fim: new Date(fim).toISOString(),
    duracaoS: Math.round((fim - inicio) / 1000),
  };
}

/** Conta valores distintos (ordem: mais frequente primeiro, depois alfabética). */
export function contarDistintos(valores: string[]): Array<[string, number]> {
  const c = new Map<string, number>();
  for (const v of valores) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
}

function metas(sites: SiteColeta[]) {
  return sites.flatMap((s) => [s.page?.meta, s.lighthouse?.meta]).filter((m) => m !== undefined && m !== null);
}

/** `commit (gitDirty)` de cada registro, para provar que a coleta saiu de um tree limpo. */
export function commitsDaColeta(sites: SiteColeta[]): Array<[string, number]> {
  return contarDistintos(metas(sites).map((m) => `${m.gitCommit ?? "(sem git)"}${m.gitDirty ? " (gitDirty: true)" : ""}`));
}

/** Versões de ferramenta por registro, ex.: `chromium 156.0.8078.4`. */
export function versoesDaColeta(sites: SiteColeta[]): Array<[string, number]> {
  return contarDistintos(
    metas(sites).flatMap((m) =>
      Object.entries(m.toolVersions ?? {})
        .filter(([, v]) => v !== null)
        .map(([k, v]) => `${k} ${v}`),
    ),
  );
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface VariacaoLighthouse {
  /** Sites com amplitude calculada (2+ execuções válidas). */
  n: number;
  medianaAmplitude: number | null;
  maxAmplitude: number | null;
  /** Sites com amplitude ≥ 10 pontos. */
  amplitude10oumais: number;
  /** Sites em que a mediana pela nota e a do `computeMedianRun` (FCP/TTI) diferem. */
  medianasDiferentes: number;
  /** Sites com as duas medianas definidas. */
  comAsDuasMedianas: number;
}

export function variacaoLighthouse(sites: SiteColeta[]): VariacaoLighthouse {
  const amps: number[] = [];
  let diferentes = 0;
  let comAsDuas = 0;
  for (const s of sites) {
    const a = s.lighthouse?.variacaoPerformance?.amplitude;
    if (typeof a === "number") amps.push(a);
    const m = s.lighthouse?.mediana;
    if (m && m.n !== null && m.nFcpTti !== null && m.n !== undefined && m.nFcpTti !== undefined) {
      comAsDuas++;
      if (m.n !== m.nFcpTti) diferentes++;
    }
  }
  return {
    n: amps.length,
    medianaAmplitude: mediana(amps),
    maxAmplitude: amps.length > 0 ? Math.max(...amps) : null,
    amplitude10oumais: amps.filter((a) => a >= 10).length,
    medianasDiferentes: diferentes,
    comAsDuasMedianas: comAsDuas,
  };
}

// --------------------------------------------------------------------------
// Markdown (puro)
// --------------------------------------------------------------------------

function formatarDuracao(s: number | null): string {
  if (s === null) return "?";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}min` : `${m}min${String(s % 60).padStart(2, "0")}s`;
}

const pct = (n: number, total: number): string =>
  total === 0 ? "—" : `${((100 * n) / total).toFixed(1).replace(".", ",")}%`;

export function montarRelatorioColeta(params: { sites: SiteColeta[]; meta: Meta; comando: string }): string {
  const { sites, meta, comando } = params;
  const resumo = resumirColeta(sites.map((s) => s.estado));
  const periodo = periodoDaColeta(sites);
  const v = variacaoLighthouse(sites);
  const comRefresh = sites.filter((s) => s.page?.metaRefresh != null).length;
  const comFalha = sites.filter((s) => s.estado.motivos.length > 0 || s.estado.page !== "completo" || s.estado.lighthouse !== "completo");

  const out: string[] = [];
  out.push("# Resultados da coleta (módulo 1)");
  out.push("");
  out.push(`> Gerado por \`${comando}\` a partir de \`data/raw/\`. Não editar à mão: rode o comando de novo.`);
  out.push("");
  out.push(`- **Gerado em:** ${meta.generatedAt}`);
  out.push(`- **Commit do relatório:** \`${meta.gitCommit ?? "(sem git)"}\`${meta.gitDirty ? " (com alterações não commitadas)" : ""}`);
  out.push(`- **Início da coleta:** ${periodo.inicio ?? "?"} (primeiro \`collectedAt\`)`);
  out.push(`- **Fim da coleta:** ${periodo.fim ?? "?"} (fim da última execução do Lighthouse)`);
  out.push(`- **Duração (início → fim):** ${formatarDuracao(periodo.duracaoS)}`);
  out.push("");
  out.push("## Proveniência dos registros");
  out.push("");
  out.push("Cada site tem até 2 registros (`collect.json` e `lighthouse.json`).");
  out.push("");
  out.push("| Commit da coleta | registros |");
  out.push("|---|---:|");
  for (const [c, n] of commitsDaColeta(sites)) out.push(`| \`${c}\` | ${n} |`);
  out.push("");
  out.push("| Ferramenta | registros |");
  out.push("|---|---:|");
  for (const [t, n] of versoesDaColeta(sites)) out.push(`| ${t} | ${n} |`);
  out.push("");
  out.push("## Resumo");
  out.push("");
  out.push("| Situação | sites | % |");
  out.push("|---|---:|---:|");
  out.push(`| Completos (page + lighthouse) | ${resumo.completos} | ${pct(resumo.completos, resumo.sites)} |`);
  out.push(`| Com falha | ${resumo.comFalha} | ${pct(resumo.comFalha, resumo.sites)} |`);
  out.push(`| Pendentes | ${resumo.pendentes} | ${pct(resumo.pendentes, resumo.sites)} |`);
  out.push(`| **Total (incluídos no corpus)** | **${resumo.sites}** | |`);
  out.push("");
  out.push("| Etapa | completos | incompletos | ilegíveis | pendentes |");
  out.push("|---|---:|---:|---:|---:|");
  for (const [etapa, p] of Object.entries(resumo.porEtapa)) {
    out.push(`| ${etapa} | ${p.completo} | ${p.incompleto} | ${p.ilegivel} | ${p.pendente} |`);
  }
  out.push("");
  out.push("## Falhas por motivo (ADR 008)");
  out.push("");
  const motivos = Object.entries(resumo.porMotivo);
  if (motivos.length === 0) {
    out.push("Nenhuma falha.");
  } else {
    out.push("Um site pode ter mais de um motivo. Sites com falha não foram tentados de novo.");
    out.push("");
    out.push("| Motivo | sites |");
    out.push("|---|---:|");
    for (const [m, n] of motivos) out.push(`| \`${m}\` | ${n} |`);
    out.push("");
    out.push("| Site | page | lighthouse | motivos |");
    out.push("|---|---|---|---|");
    for (const s of comFalha) {
      out.push(`| ${s.estado.id} | ${s.estado.page} | ${s.estado.lighthouse} | ${s.estado.motivos.map((m) => `\`${m}\``).join(", ")} |`);
    }
  }
  out.push("");
  out.push("## Lighthouse: variação entre as 3 execuções");
  out.push("");
  out.push("| Indicador | valor |");
  out.push("|---|---:|");
  out.push(`| Sites com amplitude calculada | ${v.n} |`);
  out.push(`| Mediana da amplitude (pontos) | ${v.medianaAmplitude ?? "—"} |`);
  out.push(`| Maior amplitude (pontos) | ${v.maxAmplitude ?? "—"} |`);
  out.push(`| Sites com amplitude ≥ 10 pontos | ${v.amplitude10oumais} |`);
  out.push(
    `| Mediana pela nota ≠ \`computeMedianRun\` (FCP/TTI) | ${v.medianasDiferentes} de ${v.comAsDuasMedianas} |`,
  );
  out.push("");
  out.push("## Outros");
  out.push("");
  out.push(`- Sites com \`<meta http-equiv="refresh">\` no HTML bruto: **${comRefresh}** (tratamento na análise, S10).`);
  out.push("");
  return out.join("\n");
}
