import { parseArgs } from "node:util";

import { chromium } from "playwright";

import { readCsvObjects } from "../shared/csv.js";
import { buildUserAgent, defaultLimiter } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";
import { buildMeta } from "../shared/meta.js";
import { alreadyCollected, collectPage, sitesFromCorpus } from "./page.js";

/**
 * Módulo 1 — Coleta (S05: só a etapa `page`; Lighthouse entra na S06 e a
 * orquestração retomável na S07).
 *
 *   npm run collect -- [--limit N] [--site <id>] [--only page]
 *
 * Lê os incluídos de `data/corpus.csv` e grava em `data/raw/<id>/`. Sites já
 * coletados (com `collect.json`) são pulados — dados brutos são imutáveis.
 * Sites são processados um de cada vez (ADR 006).
 */
const CORPUS_PATH = "data/corpus.csv";
const RAW_DIR = "data/raw";
const ETAPAS = ["page"] as const;

const log = createLogger("collect");

function out(msg: string): void {
  process.stderr.write(`[collect] ${msg}\n`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      limit: { type: "string" },
      site: { type: "string" },
      only: { type: "string" },
    },
  });
  const only = values.only ?? "page";
  if (!(ETAPAS as readonly string[]).includes(only)) {
    throw new Error(`--only ${only}: etapa desconhecida (disponíveis: ${ETAPAS.join(", ")})`);
  }
  const limit = values.limit !== undefined ? Number.parseInt(values.limit, 10) : undefined;
  if (limit !== undefined && !(limit > 0)) throw new Error(`--limit inválido: ${values.limit}`);

  const userAgent = buildUserAgent();
  const sites = sitesFromCorpus(readCsvObjects(CORPUS_PATH), { limit, site: values.site });
  if (sites.length === 0) throw new Error("nenhum site incluído corresponde aos filtros");

  const browser = await chromium.launch();
  const { generatedAt: _ignorado, ...base } = buildMeta();
  const baseMeta = { ...base, toolVersions: { ...base.toolVersions, chromium: browser.version() } };
  log.info("inicio", { etapa: only, sites: sites.length, limit, site: values.site, toolVersions: baseMeta.toolVersions });
  out(`${sites.length} site(s), etapa ${only}, Chromium ${browser.version()}`);

  const resumo = { completos: 0, incompletos: 0, pulados: 0 };
  const t0 = Date.now();
  try {
    for (const [i, site] of sites.entries()) {
      const prefixo = `${i + 1}/${sites.length} ${site.id}`;
      if (alreadyCollected(RAW_DIR, site.id)) {
        resumo.pulados++;
        log.info("pulado: ja coletado", { id: site.id });
        out(`${prefixo}: já coletado, pulado`);
        continue;
      }
      try {
        const r = await collectPage(site, { rawDir: RAW_DIR, browser, userAgent, baseMeta, limiter: defaultLimiter });
        if (r.completo) resumo.completos++;
        else resumo.incompletos++;
        const fields = {
          id: site.id,
          completo: r.completo,
          rawStatus: r.raw.status,
          rawErro: r.raw.error,
          renderStatus: r.render.status,
          renderErro: r.render.error,
          networkidleTimeout: r.render.networkidleTimeout,
          durationMs: r.render.durationMs + r.raw.durationMs,
        };
        (r.completo ? log.info : log.warn)("site coletado", fields);
        out(
          `${prefixo}: ${r.completo ? "ok" : "INCOMPLETO"} (bruto ${r.raw.status ?? r.raw.error}, ` +
            `render ${r.render.status ?? r.render.error}${r.render.networkidleTimeout ? ", networkidle-timeout" : ""})`,
        );
      } catch (err) {
        // collectPage não deveria lançar; se lançar, registra e segue o lote.
        resumo.incompletos++;
        log.error("falha inesperada", { id: site.id, erro: String(err) });
        out(`${prefixo}: ERRO ${String(err)}`);
      }
    }
  } finally {
    await browser.close();
  }
  const duracaoS = Math.round((Date.now() - t0) / 1000);
  log.info("fim", { ...resumo, duracaoS });
  out(`fim: ${resumo.completos} completos, ${resumo.incompletos} incompletos, ${resumo.pulados} pulados (${duracaoS} s)`);
}

main().catch((err: unknown) => {
  log.error("abortado", { erro: String(err) });
  out(`abortado: ${String(err)}`);
  process.exitCode = 1;
});
