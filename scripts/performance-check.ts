/**
 * Verificação da S09: roda `analisarPerformanceDoSite` em todos os sites de
 * `data/raw/` e imprime contagens. Só leitura; não grava nada (o
 * `metrics.json`/`dataset.csv` ficam para a S12).
 *
 * Uso: npx tsx scripts/performance-check.ts
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { analisarPerformanceDoSite, type PerformanceSite } from "../src/analyze/performance.js";
import { buildMeta } from "../src/shared/meta.js";

const RAW = join("data", "raw");
const meta = buildMeta();
const sites: PerformanceSite[] = [];
const erros: string[] = [];
const semRegistro: string[] = [];

for (const id of readdirSync(RAW).sort()) {
  const dir = join(RAW, id);
  if (!existsSync(join(dir, "lighthouse.json"))) {
    if (existsSync(join(dir, "collect.json"))) semRegistro.push(id);
    continue;
  }
  try {
    sites.push(analisarPerformanceDoSite(dir, meta));
  } catch (e) {
    erros.push(`${id}: ${(e as Error).message}`);
  }
}

const contar = <T>(xs: T[]): Record<string, number> =>
  xs.reduce<Record<string, number>>((acc, x) => ((acc[String(x)] = (acc[String(x)] ?? 0) + 1), acc), {});
const mediana = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const principal = sites.filter((s) => s.status === "completo" && s.exclusao === null);
const nulos = (k: keyof NonNullable<PerformanceSite["metricas"]>) =>
  sites.filter((s) => s.metricas !== null && s.metricas[k] === null).length;

const out = {
  meta,
  sitesComLighthouseJson: sites.length,
  semLighthouseJson: semRegistro,
  errosDeLeitura: erros,
  porStatus: contar(sites.map((s) => s.status)),
  errosDasExecucoesEmFalha: contar(sites.filter((s) => s.status === "falha").flatMap((s) => [...new Set(s.errosDasExecucoes)])),
  parciais: sites.filter((s) => s.status === "parcial").map((s) => s.id),
  excluidos: sites.filter((s) => s.exclusao).map((s) => `${s.id} (${s.status}, ${s.exclusao!.motivo})`),
  metaRefresh: { total: sites.filter((s) => s.metaRefresh).length, porStatus: contar(sites.filter((s) => s.metaRefresh).map((s) => s.status)) },
  conjuntoPrincipal: principal.length,
  execucaoDiferenteDeNFcpTti: sites.filter((s) => s.execucao !== null && s.nFcpTti !== null && s.execucao !== s.nFcpTti).length,
  comMetricas: sites.filter((s) => s.metricas).length,
  metricasNulasEntreOsComMetricas: Object.fromEntries(
    (["fcpMs", "lcpMs", "tbtMs", "cls", "speedIndexMs", "pesoTotalBytes", "requisicoes", "jsNaoUsadoBytes", "cssNaoUsadoBytes"] as const).map((k) => [k, nulos(k)]),
  ),
  notaPerformanceNula: sites.filter((s) => s.metricas && s.metricas.notas.performance === null).length,
  medianasNoConjuntoPrincipal: {
    performance: mediana(principal.map((s) => s.metricas!.notas.performance!).filter((x) => x !== null)),
    lcpMs: mediana(principal.map((s) => s.metricas!.lcpMs).filter((x): x is number => x !== null)),
    auditoriasComFalha: mediana(principal.map((s) => s.auditoriasComFalha!.length)),
  },
  auditoriasMaisFrequentes: Object.entries(contar(principal.flatMap((s) => s.auditoriasComFalha!.map((a) => a.id))))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10),
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
