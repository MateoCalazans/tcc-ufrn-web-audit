/**
 * Verificação da S10/S11: roda `analisarSemanticaDoSite` em todos os sites de
 * `data/raw/` e imprime contagens. Só leitura; não grava nada (o
 * `metrics.json`/`dataset.csv` ficam para a S12). O conjunto principal é o
 * da S09 (performance `completo` e não excluído, ADR 009).
 *
 * Uso: npx tsx scripts/semantics-check.ts [--vnu [--vnu-jar <arquivo>]]
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { analisarPerformanceDoSite } from "../src/analyze/performance.js";
import { analisarSemanticaDoSite, type SemanticaSite } from "../src/analyze/semantics.js";
import { opcoesVnu, prepararVnu, type Vnu } from "../src/analyze/vnu.js";
import { buildMeta } from "../src/shared/meta.js";

const RAW = join("data", "raw");
const meta = buildMeta();
const sites: SemanticaSite[] = [];
const principalIds = new Set<string>();
const erros: string[] = [];
const optVnu = opcoesVnu(process.argv.slice(2), process.env);
const vnu: Vnu | undefined = optVnu === null ? undefined : prepararVnu(optVnu);

for (const id of readdirSync(RAW).sort()) {
  const dir = join(RAW, id);
  if (!existsSync(join(dir, "collect.json"))) continue;
  try {
    sites.push(analisarSemanticaDoSite(dir, meta, vnu));
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
    estrutura: Object.fromEntries(
      (["article", "section", "aside", "figure", "ul", "ol"] as const).map((t) => [
        t,
        { sitesComPeloMenos1: ind.filter((i) => i.estrutura[t] > 0).length, porSite: quantis(ind.map((i) => i.estrutura[t])) },
      ]),
    ),
    interativosFalsos: {
      sitesComPeloMenos1: ind.filter((i) => i.interativosFalsos.falsos > 0).length,
      porSite: quantis(ind.map((i) => i.interativosFalsos.falsos)),
      sitesComOnclick: ind.filter((i) => i.interativosFalsos.comOnclick > 0).length,
    },
    metadados: {
      semLang: ind.filter((i) => i.metadados.lang === null).length,
      lang: contar(ind.map((i) => (i.metadados.lang ?? "sem").toLowerCase())),
      semTitle: ind.filter((i) => !i.metadados.temTitle).length,
      semViewport: ind.filter((i) => !i.metadados.temViewport).length,
      semDescription: ind.filter((i) => !i.metadados.temDescription).length,
    },
    imagens: {
      sitesComImagem: ind.filter((i) => i.imagens.total > 0).length,
      sitesComPeloMenos1SemAlt: ind.filter((i) => i.imagens.semAlt > 0).length,
      totalImg: ind.reduce((a, i) => a + i.imagens.total, 0),
      totalSemAlt: ind.reduce((a, i) => a + i.imagens.semAlt, 0),
      totalAltVazio: ind.reduce((a, i) => a + i.imagens.altVazio, 0),
      totalSemAltComAlternativa: ind.reduce((a, i) => a + i.imagens.semAltComAlternativa, 0),
      proporcaoSemAltPorSite: quantis(ind.filter((i) => i.imagens.total > 0).map((i) => i.imagens.semAlt / i.imagens.total)),
    },
    campos: {
      sitesComCampo: ind.filter((i) => i.campos.total > 0).length,
      sitesComPeloMenos1SemLabel: ind.filter((i) => i.campos.semLabel > 0).length,
      totalCampos: ind.reduce((a, i) => a + i.campos.total, 0),
      totalSemLabel: ind.reduce((a, i) => a + i.campos.semLabel, 0),
      totalSemLabelComPlaceholderOuTitle: ind.reduce((a, i) => a + i.campos.semLabelComPlaceholderOuTitle, 0),
    },
    obsoletas: {
      sitesComRoteiro: ind.filter((i) => i.obsoletas.roteiro > 0).length,
      sitesComWhatwg: ind.filter((i) => i.obsoletas.whatwg > 0).length,
      porTag: ind.reduce<Record<string, number>>((acc, i) => {
        for (const [t, n] of Object.entries(i.obsoletas.porTag)) acc[t] = (acc[t] ?? 0) + n;
        return acc;
      }, {}),
      sitesPorTag: ind.reduce<Record<string, number>>((acc, i) => {
        for (const t of Object.keys(i.obsoletas.porTag)) acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {}),
    },
    tabelas: {
      sitesComTabela: ind.filter((i) => i.tabelas.total > 0).length,
      sitesComLayout: ind.filter((i) => i.tabelas.layoutDeclarada + i.tabelas.layoutHeuristica > 0).length,
      sitesComLayoutHeuristica: ind.filter((i) => i.tabelas.layoutHeuristica > 0).length,
      totais: (["total", "layoutDeclarada", "layoutHeuristica", "dados", "indeterminada"] as const).reduce<Record<string, number>>(
        (acc, k) => ((acc[k] = ind.reduce((a, i) => a + i.tabelas[k], 0)), acc),
        {},
      ),
    },
  },
  vnu: vnu === undefined ? "flag --vnu não usada" : vnu.disponivel ? { versao: vnu.versao, status: contar(sites.map((s) => s.vnu?.status ?? "sem-arquivo")) } : { indisponivel: vnu.motivo },
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
