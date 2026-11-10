import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lerColeta, montarRelatorioColeta } from "../src/collect/relatorio.js";
import { sitesFromCorpus } from "../src/collect/page.js";
import { readCsvObjects } from "../src/shared/csv.js";
import { createLogger } from "../src/shared/logger.js";
import { buildMeta } from "../src/shared/meta.js";

/**
 * Relatório da coleta (S08): lê `data/raw/` para todos os incluídos de
 * `data/corpus.csv` e grava `docs/resultados/coleta.md`. Só lê os brutos
 * (regra 8); pode ser rodado quantas vezes quiser.
 *
 *   npm run collect:report
 */
const CORPUS_PATH = "data/corpus.csv";
const RAW_DIR = "data/raw";
const OUT = "docs/resultados/coleta.md";

const log = createLogger("collect-report");

const ids = sitesFromCorpus(readCsvObjects(CORPUS_PATH)).map((s) => s.id);
const md = montarRelatorioColeta({
  sites: lerColeta(RAW_DIR, ids),
  meta: buildMeta(),
  comando: "npm run collect:report",
});
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md, "utf8");
log.info("relatorio gravado", { arquivo: OUT, sites: ids.length });
process.stderr.write(`[collect-report] ${OUT} (${ids.length} sites)\n`);
