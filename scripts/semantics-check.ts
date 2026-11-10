/**
 * Verificação da S10: roda `analisarSemanticaDoSite` em todos os sites de
 * `data/raw/` e imprime contagens. Só leitura; não grava nada (o
 * `metrics.json`/`dataset.csv` ficam para a S12). O conjunto principal é o
 * da S09 (performance `completo` e não excluído, ADR 009).
 *
 * Uso: npx tsx scripts/semantics-check.ts
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { analisarPerformanceDoSite } from "../src/analyze/performance.js";
import { analisarSemanticaDoSite, type SemanticaSite } from "../src/analyze/semantics.js";
import { buildMeta } from "../src/shared/meta.js";

const RAW = join("data", "raw");
const meta = buildMeta();
const sites: SemanticaSite[] = [];
const principalIds = new Set<string>();
const erros: string[] = [];

for (const id of readdirSync(RAW).sort()) {
  const dir = join(RAW, id);
  if (!existsSync(join(dir, "collect.json"))) continue;
  try {
    sites.push(analisarSemanticaDoSite(dir, meta));
    if (existsSync(join(dir, "lighthouse.json"))) {
      const p = analisarPerformanceDoSite(dir, meta);
      if (p.status === "completo" && p.exclusao === null) principalIds.add(id);
    }
  } catch (e) {
    erros.push(`${id}: ${(e as Error).message}`);
  }
}

const contar = <T>(xs: T[]): Record<string, number> =>
  xs.reduce<Record<string, number>>((acc, x) => ((acc[String(x)] = (acc[String(x)] ?? 0) + 1), acc), {});
const quantis = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    return s[lo]! + (s[Math.ceil(i)]! - s[lo]!) * (i - lo);
  };
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { n: s.length, min: r(s[0]!), q1: r(q(0.25)), mediana: r(q(0.5)), q3: r(q(0.75)), max: r(s[s.length - 1]!) };
};

const principal = sites.filter((s) => principalIds.has(s.id));
const comInd = principal.filter((s) => s.indicadores !== null && s.status === "ok");
const ind = comInd.map((s) => s.indicadores!);

const out = {
  meta,
  sitesComCollectJson: sites.length,
  errosDeLeitura: erros,
  porStatus: contar(sites.map((s) => s.status)),
  semArquivoOuVazio: sites.filter((s) => s.status !== "ok").map((s) => `${s.id} (${s.status})`),
  metaRefresh: {
    total: sites.filter((s) => s.metaRefresh).length,
    renderedComRefresh: sites.filter((s) => s.renderedComRefresh).map((s) => s.id),
    renderedComRefreshSemMetaRefreshNoBruto: sites.filter((s) => s.renderedComRefresh && !s.metaRefresh).map((s) => s.id),
  },
  conjuntoPrincipal: principal.length,
  conjuntoPrincipalComIndicadores: comInd.length,
  conjuntoPrincipalComRenderedComRefresh: principal.filter((s) => s.renderedComRefresh).map((s) => s.id),
  noConjuntoPrincipal: {
    proporcaoDivSpan: quantis(ind.map((i) => i.divSpan.proporcao!).filter((x) => x !== null)),
    totalElementos: quantis(ind.map((i) => i.divSpan.total)),
    landmarks: {
      semBanner: ind.filter((i) => i.landmarks.banner === 0).length,
      semNavigation: ind.filter((i) => i.landmarks.navigation === 0).length,
      semContentinfo: ind.filter((i) => i.landmarks.contentinfo === 0).length,
      nMain: contar(ind.map((i) => i.landmarks.main)),
      comOs4: ind.filter((i) => i.landmarks.banner > 0 && i.landmarks.navigation > 0 && i.landmarks.main > 0 && i.landmarks.contentinfo > 0).length,
    },
    titulos: {
      nH1: contar(ind.map((i) => Math.min(i.titulos.h1, 3)).map((x) => (x === 3 ? "3+" : x))),
      semTitulos: ind.filter((i) => i.titulos.total === 0).length,
      saltos: quantis(ind.map((i) => i.titulos.saltos)),
      comPeloMenos1Salto: ind.filter((i) => i.titulos.saltos > 0).length,
      primeiroNivel: contar(ind.map((i) => i.titulos.primeiroNivel ?? "sem")),
    },
  },
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
