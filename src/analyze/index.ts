import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { LH_RECORD } from "../collect/lighthouse.js";
import { readCsvObjects, writeCsv } from "../shared/csv.js";
import { createLogger } from "../shared/logger.js";
import { buildMeta } from "../shared/meta.js";
import { celula, COLUNAS, type ContextoCorpus, linhaDoDataset, montarMetricasSite } from "./dataset.js";
import { analisarPerformanceDoSite } from "./performance.js";
import { analisarSemanticaDoSite } from "./semantics.js";
import { opcoesVnu, prepararVnu, type Vnu } from "./vnu.js";

/**
 * Módulo 2 — Análise (S12, ADR 012). Lê só `data/raw/` (imutável, regra 8) e
 * `data/corpus.csv`; grava:
 *   - `data/processed/sites/<id>/metrics.json` (fora do git);
 *   - `data/processed/dataset.csv` + `data/processed/dataset.meta.json`.
 *
 * Uso: npm run analyze [-- --vnu [--vnu-jar <arquivo>] [--vnu-java <executável>]]
 */

const RAW = join("data", "raw");
const PROCESSED = join("data", "processed");
const CORPUS = join("data", "corpus.csv");

const log = createLogger("analyze");
const meta = buildMeta();
const optVnu = opcoesVnu(process.argv.slice(2), process.env);
const vnu: Vnu | undefined = optVnu === null ? undefined : prepararVnu(optVnu);
log.info("inicio", { meta, vnu: vnu === undefined ? "desligado" : vnu.disponivel ? { versao: vnu.versao, java: vnu.java } : vnu.motivo });

const contexto = new Map<string, ContextoCorpus>();
for (const r of readCsvObjects(CORPUS)) {
  contexto.set(r.id!, { tipo: r.tipo || null, tecnologia: r.tecnologia || null });
}

const linhas: string[][] = [];
let erros = 0;
const ids = readdirSync(RAW)
  .filter((id) => existsSync(join(RAW, id, "collect.json")))
  .sort();

for (const id of ids) {
  const dir = join(RAW, id);
  try {
    const semantica = analisarSemanticaDoSite(dir, meta, vnu);
    const performance = existsSync(join(dir, LH_RECORD)) ? analisarPerformanceDoSite(dir, meta) : null;
    const m = montarMetricasSite({ meta, performance, semantica, contexto: contexto.get(id) ?? { tipo: null, tecnologia: null } });
    const destino = join(PROCESSED, "sites", id);
    mkdirSync(destino, { recursive: true });
    writeFileSync(join(destino, "metrics.json"), JSON.stringify(m, null, 2) + "\n", "utf8");
    const linha = linhaDoDataset(m);
    linhas.push(COLUNAS.map((c) => celula(linha[c])));
    log.info("site", { id, conjuntoPrincipal: m.conjuntoPrincipal, indice: m.indice?.indice ?? null, vnu: semantica.vnu?.status ?? null });
  } catch (e) {
    erros++;
    log.error("site", { id, erro: (e as Error).message });
  }
}

writeCsv(join(PROCESSED, "dataset.csv"), [...COLUNAS], linhas);
const metaDataset = { meta, linhas: linhas.length, errosPorSite: erros, colunas: COLUNAS, fonte: { raw: RAW, corpus: CORPUS } };
writeFileSync(join(PROCESSED, "dataset.meta.json"), JSON.stringify(metaDataset, null, 2) + "\n", "utf8");
log.info("fim", { linhas: linhas.length, erros });
process.stderr.write(`[analyze] ${linhas.length} sites no dataset, ${erros} com erro (ver logs/).\n`);
