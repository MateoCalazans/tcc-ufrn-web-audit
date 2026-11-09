import { parseArgs } from "node:util";

import { chromium } from "playwright";

import { readCsvObjects } from "../shared/csv.js";
import { buildUserAgent, defaultLimiter } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";
import { buildMeta } from "../shared/meta.js";
import { collectLighthouse } from "./lighthouse.js";
import { collectPage, type SiteToCollect, sitesFromCorpus } from "./page.js";
import {
  type Etapa,
  ETAPAS,
  estadoDoSite,
  estimarRestanteS,
  etapasPendentes,
  type ResumoColeta,
  resumirColeta,
  temRegistro,
} from "./plan.js";

/**
 * Módulo 1 — Coleta retomável (S07, ADR 008).
 *
 *   npm run collect -- [--resume] [--limit N] [--site <id>] [--only page|lighthouse]
 *
 * Para cada site incluído de `data/corpus.csv`, um por vez, roda a etapa
 * `page` (ADR 006) e depois a `lighthouse` (ADR 007), gravando em
 * `data/raw/<id>/`. Etapas com registro (`collect.json` / `lighthouse.json`)
 * nunca são refeitas (regra 8); etapas sem registro (interrompidas) são
 * refeitas do zero. Se algum site selecionado já tiver registro, exige
 * `--resume`. Ctrl+C / SIGTERM: termina o site atual e para; o segundo sinal
 * aborta na hora.
 */
const CORPUS_PATH = "data/corpus.csv";
const RAW_DIR = "data/raw";

const log = createLogger("collect");

function out(msg: string): void {
  process.stderr.write(`[collect] ${msg}\n`);
}

function formatarS(s: number | null): string {
  if (s === null) return "?";
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

let parar = false;
function instalarSinais(): void {
  const handler = (sinal: NodeJS.Signals) => {
    if (parar) {
      log.error("abortado por sinal", { sinal });
      out(`${sinal} de novo: abortando agora (a etapa em andamento será refeita no --resume)`);
      process.exit(130);
    }
    parar = true;
    log.warn("parada pedida", { sinal });
    out(`${sinal}: termino o site atual e paro (de novo para abortar já)`);
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      limit: { type: "string" },
      site: { type: "string" },
      only: { type: "string" },
      resume: { type: "boolean", default: false },
    },
  });
  if (values.only !== undefined && !(ETAPAS as readonly string[]).includes(values.only)) {
    throw new Error(`--only ${values.only}: etapa desconhecida (disponíveis: ${ETAPAS.join(", ")})`);
  }
  const pedidas: readonly Etapa[] = values.only ? [values.only as Etapa] : ETAPAS;
  const limit = values.limit !== undefined ? Number.parseInt(values.limit, 10) : undefined;
  if (limit !== undefined && !(limit > 0)) throw new Error(`--limit inválido: ${values.limit}`);

  const sites = sitesFromCorpus(readCsvObjects(CORPUS_PATH), { limit, site: values.site });
  if (sites.length === 0) throw new Error("nenhum site incluído corresponde aos filtros");

  const jaComRegistro = sites.filter((s) => temRegistro(estadoDoSite(RAW_DIR, s.id))).length;
  if (jaComRegistro > 0 && !values.resume) {
    throw new Error(
      `${jaComRegistro} de ${sites.length} site(s) já têm registro em ${RAW_DIR}/. ` +
        "Use --resume para continuar a coleta (registros existentes não são refeitos) " +
        "ou apague as pastas antes de uma coleta nova.",
    );
  }

  instalarSinais();
  const userAgent = buildUserAgent();
  const chromePath = chromium.executablePath();
  const baseMeta = metaSemData();
  const filtros = { limit, site: values.site, only: values.only, resume: values.resume };
  log.info("inicio", { etapas: pedidas, sites: sites.length, jaComRegistro, ...filtros, toolVersions: baseMeta.toolVersions });
  out(
    `${sites.length} site(s), etapas ${pedidas.join(" + ")}, ${jaComRegistro} já com registro` +
      (baseMeta.gitDirty ? " — ATENÇÃO: working tree sujo (gitDirty: true)" : ""),
  );

  const execucao = { processados: 0, pulados: 0, errosInesperados: 0, interrompido: false };
  const duracoesMs: number[] = [];
  const t0 = Date.now();
  for (const [i, site] of sites.entries()) {
    if (parar) {
      execucao.interrompido = true;
      break;
    }
    const prefixo = `${i + 1}/${sites.length} ${site.id}`;
    const pendentes = etapasPendentes(estadoDoSite(RAW_DIR, site.id), pedidas);
    if (pendentes.length === 0) {
      execucao.pulados++;
      log.info("pulado: ja coletado", { id: site.id });
      continue;
    }
    const tSite = Date.now();
    for (const etapa of pendentes) {
      try {
        if (etapa === "page") await etapaPage(site, prefixo, userAgent, baseMeta);
        else await etapaLighthouse(site, prefixo, userAgent, chromePath, baseMeta);
      } catch (err) {
        // As etapas não deveriam lançar; se lançarem, registra e segue o lote.
        execucao.errosInesperados++;
        log.error("falha inesperada", { id: site.id, etapa, erro: String(err) });
        out(`${prefixo} ${etapa}: ERRO ${String(err)}`);
      }
    }
    execucao.processados++;
    duracoesMs.push(Date.now() - tSite);
    const restantes = sites.slice(i + 1).filter((s) => etapasPendentes(estadoDoSite(RAW_DIR, s.id), pedidas).length > 0).length;
    const etaS = estimarRestanteS(duracoesMs, restantes);
    log.info("progresso", { id: site.id, indice: i + 1, total: sites.length, siteMs: Date.now() - tSite, restantes, etaS });
    out(`${prefixo}: ${Math.round((Date.now() - tSite) / 1000)} s · faltam ${restantes} (~${formatarS(etaS)})`);
  }

  const duracaoS = Math.round((Date.now() - t0) / 1000);
  const resumo = resumirColeta(
    sites.map((s) => estadoDoSite(RAW_DIR, s.id)),
    pedidas,
  );
  log.info("fim", { etapas: pedidas, ...execucao, duracaoS, resumo });
  imprimirResumo(resumo, execucao, duracaoS);
  if (execucao.interrompido) process.exitCode = 130;
}

function imprimirResumo(
  r: ResumoColeta,
  e: { processados: number; pulados: number; errosInesperados: number; interrompido: boolean },
  duracaoS: number,
): void {
  out(
    `fim${e.interrompido ? " (interrompido)" : ""}: ${e.processados} processados e ${e.pulados} pulados nesta execução ` +
      `(${formatarS(duracaoS)}; ${e.errosInesperados} erros inesperados)`,
  );
  out(`corpus selecionado (${r.sites} sites): ${r.completos} completos, ${r.comFalha} com falha, ${r.pendentes} pendentes`);
  for (const etapa of ETAPAS) {
    const p = r.porEtapa[etapa];
    out(`  ${etapa}: ${p.completo} completos, ${p.incompleto} incompletos, ${p.ilegivel} ilegíveis, ${p.pendente} pendentes`);
  }
  const motivos = Object.entries(r.porMotivo);
  if (motivos.length > 0) {
    out("  falhas por motivo (sites):");
    for (const [m, n] of motivos) out(`    ${n}  ${m}`);
  }
}

/** Etapa `page` (ADR 006): um Chromium por site, fechado antes do Lighthouse (ADR 008). */
async function etapaPage(
  site: SiteToCollect,
  prefixo: string,
  userAgent: string,
  base: ReturnType<typeof metaSemData>,
): Promise<void> {
  const browser = await chromium.launch();
  try {
    const baseMeta = { ...base, toolVersions: { ...base.toolVersions, chromium: browser.version() } };
    const r = await collectPage(site, { rawDir: RAW_DIR, browser, userAgent, baseMeta, limiter: defaultLimiter });
    const fields = {
      id: site.id,
      completo: r.completo,
      rawStatus: r.raw.status,
      rawErro: r.raw.error,
      renderStatus: r.render.status,
      renderErro: r.render.error,
      networkidleTimeout: r.render.networkidleTimeout,
      durationMs: r.render.durationMs + r.raw.durationMs,
      chromium: browser.version(),
    };
    (r.completo ? log.info : log.warn)("site coletado", fields);
    out(
      `${prefixo} page: ${r.completo ? "ok" : "INCOMPLETO"} (bruto ${r.raw.status ?? r.raw.error}, ` +
        `render ${r.render.status ?? r.render.error}${r.render.networkidleTimeout ? ", networkidle-timeout" : ""})`,
    );
  } finally {
    await browser.close();
  }
}

/** Etapa `lighthouse` (ADR 007): 3 execuções, um Chrome novo por execução. */
async function etapaLighthouse(
  site: SiteToCollect,
  prefixo: string,
  userAgent: string,
  chromePath: string,
  baseMeta: ReturnType<typeof metaSemData>,
): Promise<void> {
  const r = await collectLighthouse(site, { rawDir: RAW_DIR, userAgent, chromePath, baseMeta, limiter: defaultLimiter });
  const notas = r.execucoes.map((e) => e.notas.performance ?? e.runtimeError?.code ?? e.erro);
  const fields = {
    id: site.id,
    completo: r.completo,
    notasPerformance: notas,
    mediana: r.mediana.n,
    medianaFcpTti: r.mediana.nFcpTti,
    variacao: r.variacaoPerformance,
    chromium: r.meta.toolVersions.chromium,
  };
  (r.completo ? log.info : log.warn)("site medido", fields);
  out(
    `${prefixo} lighthouse: ${r.completo ? "ok" : "INCOMPLETO"} (performance ${notas.join("/")}, ` +
      `mediana lh${r.mediana.n ?? "-"}, amplitude ${r.variacaoPerformance.amplitude ?? "-"})`,
  );
}

function metaSemData() {
  const { generatedAt: _ignorado, ...base } = buildMeta();
  return base;
}

main().catch((err: unknown) => {
  log.error("abortado", { erro: String(err) });
  out(`abortado: ${String(err)}`);
  process.exitCode = 1;
});
