import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { escolherExecucao } from "../analyze/performance.js";
import { LH_RECORD, type LighthouseRecord, lhRunFile } from "../collect/lighthouse.js";
import { createLogger } from "../shared/logger.js";
import { buildMeta } from "../shared/meta.js";
import type { Har, LhrRegras } from "../shared/types.js";
import { codificar, decodificar } from "./encoding.js";
import { aplicarRegras } from "./engine.js";
import { REGRAS } from "./rules/index.js";

/**
 * Módulo 3 — Recomendação (S14, ADR 014). Lê `data/raw/<id>/` (imutável,
 * regra 8): `index.html` (bruto), `collect.json` (URL), `page.har` e, desde a
 * S15, o `lh<n>.json` da execução mediana (ADR 009). Grava em
 * `data/processed/sites/<id>/`: `recommendations.json`, `fixed.html`, `fix.diff`.
 *
 * Uso: npm run recommend -- --site <id> [--site <id> ...]
 */

const RAW = join("data", "raw");
const PROCESSED = join("data", "processed", "sites");

function sitesDosArgumentos(argv: string[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--site" && argv[i + 1] !== undefined) ids.push(argv[++i]!);
  }
  return ids;
}

const log = createLogger("recommend");
const ids = sitesDosArgumentos(process.argv.slice(2));
if (ids.length === 0) {
  process.stderr.write("Uso: npm run recommend -- --site <id> [--site <id> ...]\n");
  process.exit(1);
}

const meta = buildMeta();
meta.toolVersions.diff = (createRequire(import.meta.url)("diff/package.json") as { version: string }).version;
log.info("inicio", { meta, sites: ids, regras: REGRAS.map((r) => r.id) });

let erros = 0;
for (const id of ids) {
  const dir = join(RAW, id);
  try {
    const bruto = join(dir, "index.html");
    if (!existsSync(bruto)) throw new Error("sem index.html (HTML bruto) na coleta");
    const { url } = JSON.parse(readFileSync(join(dir, "collect.json"), "utf8")) as { url: string };
    const fonte = decodificar(readFileSync(bruto));
    const harPath = join(dir, "page.har");
    const har = existsSync(harPath) ? (JSON.parse(readFileSync(harPath, "utf8")) as Har) : undefined;

    // Relatório do Lighthouse da execução mediana (ADR 009); sem execução válida, as
    // regras que dependem dele não acusam nada.
    let lighthouse: LhrRegras | undefined;
    let lhArquivo: string | null = null;
    if (existsSync(join(dir, LH_RECORD))) {
      const { execucao } = escolherExecucao(JSON.parse(readFileSync(join(dir, LH_RECORD), "utf8")) as LighthouseRecord);
      if (execucao !== null && existsSync(join(dir, lhRunFile(execucao)))) {
        lhArquivo = lhRunFile(execucao);
        lighthouse = JSON.parse(readFileSync(join(dir, lhArquivo), "utf8")) as LhrRegras;
      }
    }

    const r = await aplicarRegras({ siteId: id, url, html: fonte.texto, har, lighthouse }, REGRAS);

    const destino = join(PROCESSED, id);
    mkdirSync(destino, { recursive: true });
    const saida = {
      meta,
      id,
      url,
      fonte: {
        html: "index.html",
        codificacao: fonte.codificacao,
        bom: fonte.bom,
        har: har !== undefined,
        lighthouse: lhArquivo,
        lighthouseVersion: lighthouse?.lighthouseVersion ?? null,
      },
      regras: REGRAS.map((x) => ({ id: x.id, dimensao: x.dimensao, descricao: x.descricao })),
      resumo: r.resumo,
      recommendations: r.recommendations,
    };
    writeFileSync(join(destino, "recommendations.json"), JSON.stringify(saida, null, 2) + "\n", "utf8");
    writeFileSync(join(destino, "fixed.html"), codificar(r.fixedHtml, fonte));
    writeFileSync(join(destino, "fix.diff"), codificar(r.diff, { ...fonte, bom: false }));
    log.info("site", { id, ...r.resumo });
    process.stderr.write(`[recommend] ${id}: ${r.resumo.total} recomendações, ${r.resumo.corrigidas} corrigidas.\n`);
  } catch (e) {
    erros++;
    log.error("site", { id, erro: (e as Error).message });
    process.stderr.write(`[recommend] ${id}: erro — ${(e as Error).message}\n`);
  }
}
log.info("fim", { sites: ids.length, erros });
