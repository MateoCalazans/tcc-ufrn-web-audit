/**
 * Gera as fixtures de `tests/fixtures/analyze/sites/` (S09) a partir da coleta
 * congelada em `data/raw/`. Só lê `data/raw/` (regra 8). Os relatórios do
 * Lighthouse são enxugados: ficam só os campos que `src/analyze/performance.ts`
 * lê (as auditorias inteiras, sem os `details` pesados).
 *
 * Uso: npx tsx scripts/fixture-performance.ts <id> [<id>...]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAW = join("data", "raw");
const OUT = join("tests", "fixtures", "analyze", "sites");

type Json = Record<string, any>;

/** Mantém de `details` só o que a análise usa. */
function reduzirDetails(id: string, d: Json | undefined): Json | undefined {
  if (!d) return undefined;
  if (id === "network-requests") {
    return { type: d.type, items: (d.items ?? []).map((i: Json) => ({ url: i.url, transferSize: i.transferSize })) };
  }
  if (typeof d.overallSavingsBytes === "number") {
    return { type: d.type, overallSavingsBytes: d.overallSavingsBytes };
  }
  return undefined;
}

export function reduzirLhr(lhr: Json): Json {
  const audits: Json = {};
  for (const [id, a] of Object.entries<Json>(lhr.audits ?? {})) {
    audits[id] = {
      id,
      title: a.title,
      score: a.score,
      scoreDisplayMode: a.scoreDisplayMode,
      numericValue: a.numericValue,
      numericUnit: a.numericUnit,
      details: reduzirDetails(id, a.details),
    };
  }
  const categories: Json = {};
  for (const [id, c] of Object.entries<Json>(lhr.categories ?? {})) {
    categories[id] = {
      id,
      score: c.score,
      auditRefs: (c.auditRefs ?? []).map((r: Json) => ({ id: r.id, weight: r.weight, group: r.group })),
    };
  }
  return {
    lighthouseVersion: lhr.lighthouseVersion,
    requestedUrl: lhr.requestedUrl,
    mainDocumentUrl: lhr.mainDocumentUrl,
    finalDisplayedUrl: lhr.finalDisplayedUrl,
    // Sem `errorStack`: traz caminhos locais e não é usado.
    runtimeError: lhr.runtimeError ? { code: lhr.runtimeError.code, message: lhr.runtimeError.message } : undefined,
    runWarnings: lhr.runWarnings,
    environment: { benchmarkIndex: lhr.environment?.benchmarkIndex },
    categories,
    audits,
  };
}

for (const id of process.argv.slice(2)) {
  const src = join(RAW, id);
  const dst = join(OUT, id);
  mkdirSync(dst, { recursive: true });
  writeFileSync(join(dst, "lighthouse.json"), readFileSync(join(src, "lighthouse.json")));
  const collect = JSON.parse(readFileSync(join(src, "collect.json"), "utf8"));
  writeFileSync(
    join(dst, "collect.json"),
    JSON.stringify({ meta: collect.meta, id: collect.id, url: collect.url, metaRefresh: collect.metaRefresh }, null, 2) + "\n",
  );
  for (const n of [1, 2, 3]) {
    const f = join(src, `lh${n}.json`);
    if (!existsSync(f)) continue;
    const lhr = JSON.parse(readFileSync(f, "utf8"));
    writeFileSync(join(dst, `lh${n}.json`), JSON.stringify(reduzirLhr(lhr), null, 1) + "\n");
  }
  process.stdout.write(`${id}\n`);
}
