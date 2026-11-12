import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { MetricasSite } from "../analyze/dataset.js";
import { createLogger } from "../shared/logger.js";
import { buildMeta } from "../shared/meta.js";
import { panoramaHtml, resumirPanorama } from "./panorama.js";
import { relatorioSite } from "./site.js";

/**
 * Relatórios (S13). Lê só os `metrics.json` do módulo 2
 * (`data/processed/sites/<id>/`) e grava, em `reports/` (fora do git):
 *   - `reports/sites/<id>.html` — um por site;
 *   - `reports/index.html` — panorama;
 *   - `reports/meta.json` — meta (regra 10) e o resumo do panorama.
 *
 * Uso: npm run report
 */

const SITES = join("data", "processed", "sites");
const OUT = "reports";

const log = createLogger("report");
const meta = buildMeta();
log.info("inicio", { meta });

if (!existsSync(SITES)) {
  process.stderr.write(`[report] ${SITES} não existe: rode \`npm run analyze\` antes.\n`);
  process.exit(1);
}

const sites: MetricasSite[] = [];
let erros = 0;
for (const id of readdirSync(SITES).sort()) {
  const f = join(SITES, id, "metrics.json");
  if (!existsSync(f)) continue;
  try {
    sites.push(JSON.parse(readFileSync(f, "utf8")) as MetricasSite);
  } catch (e) {
    erros++;
    log.error("site", { id, erro: (e as Error).message });
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "sites"), { recursive: true });
for (const m of sites) {
  try {
    writeFileSync(join(OUT, "sites", `${m.id}.html`), relatorioSite(m, meta), "utf8");
  } catch (e) {
    erros++;
    log.error("site", { id: m.id, erro: (e as Error).message });
  }
}
writeFileSync(join(OUT, "index.html"), panoramaHtml(sites, meta), "utf8");
const resumo = resumirPanorama(sites);
writeFileSync(
  join(OUT, "meta.json"),
  JSON.stringify({ meta, fonte: SITES, sites: sites.length, erros, resumo: { ...resumo, auditorias: resumo.auditorias.slice(0, 10) } }, null, 2) + "\n",
  "utf8",
);

log.info("fim", { sites: sites.length, erros });
process.stderr.write(`[report] ${sites.length} relatórios + panorama em ${OUT}/, ${erros} com erro (ver logs/).\n`);
