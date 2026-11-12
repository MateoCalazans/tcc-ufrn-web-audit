import type { MetricasSite } from "../analyze/dataset.js";
import type { Meta } from "../shared/types.js";
import { esc, num, pagina, pct, tabela } from "./html.js";

/**
 * Panorama geral (S13): descritivas do corpus e tabela de todos os sites, com
 * link para o relatório de cada um. Os testes estatísticos ficam no notebook
 * `analysis/diagnostico.ipynb` (ADR 013); aqui só há contagens e medianas.
 * Funções puras.
 */

export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function media(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

const definidos = (xs: Array<number | null | undefined>): number[] =>
  xs.filter((x): x is number => typeof x === "number" && !Number.isNaN(x));

/** Recorte semântico do ADR 013 (1c): conjunto principal com semântica `ok` e índice não nulo. */
export function noRecorteSemantico(m: MetricasSite): boolean {
  return m.conjuntoPrincipal && m.semantica.status === "ok" && m.indice?.indice != null;
}

export interface AuditoriaFrequente {
  id: string;
  titulo: string | null;
  categorias: string[];
  sites: number;
}

export interface ResumoPanorama {
  total: number;
  conjuntoPrincipal: number;
  recorteSemantico: number;
  comRefreshNoRecorte: number;
  semMainNemNav: number;
  semMain: number;
  medianaPerformance: number | null;
  medianaAcessibilidade: number | null;
  medianaIndice: number | null;
  mediaProporcaoDivSpan: number | null;
  medianaProporcaoDivSpan: number | null;
  /** Sites do conjunto principal que falham em cada auditoria (ADR 013, 4b), em ordem decrescente. */
  auditorias: AuditoriaFrequente[];
}

export function resumirPanorama(sites: MetricasSite[]): ResumoPanorama {
  const principal = sites.filter((m) => m.conjuntoPrincipal);
  const sem = principal.filter(noRecorteSemantico);
  const lm = (m: MetricasSite) => m.semantica.indicadores!.landmarks;

  const cont = new Map<string, AuditoriaFrequente>();
  for (const m of principal) {
    for (const a of m.performance?.auditoriasComFalha ?? []) {
      const c = cont.get(a.id) ?? { id: a.id, titulo: a.titulo, categorias: a.categorias, sites: 0 };
      c.sites++;
      cont.set(a.id, c);
    }
  }
  const proporcoes = definidos(sem.map((m) => m.semantica.indicadores!.divSpan.proporcao));

  return {
    total: sites.length,
    conjuntoPrincipal: principal.length,
    recorteSemantico: sem.length,
    comRefreshNoRecorte: sem.filter((m) => m.semantica.renderedComRefresh).length,
    semMainNemNav: sem.filter((m) => lm(m).main === 0 && lm(m).navigation === 0).length,
    semMain: sem.filter((m) => lm(m).main === 0).length,
    medianaPerformance: mediana(definidos(principal.map((m) => m.performance?.metricas?.notas.performance))),
    medianaAcessibilidade: mediana(definidos(principal.map((m) => m.performance?.metricas?.notas.accessibility))),
    medianaIndice: mediana(definidos(sem.map((m) => m.indice?.indice))),
    mediaProporcaoDivSpan: media(proporcoes),
    medianaProporcaoDivSpan: mediana(proporcoes),
    auditorias: [...cont.values()].sort((a, b) => b.sites - a.sites || a.id.localeCompare(b.id)),
  };
}

const td = (v: number | null | undefined, casas = 0) => `<span class="n">${num(v, casas)}</span>`;

export function panoramaHtml(sites: MetricasSite[], meta: Meta): string {
  const r = resumirPanorama(sites);
  const resumo = tabela(
    ["Medida", "Valor"],
    [
      ["Sites no dataset", td(r.total)],
      ["Conjunto principal (performance completa, sem exclusão)", td(r.conjuntoPrincipal)],
      ["Recorte semântico (principal com índice)", `${td(r.recorteSemantico)} (${r.comRefreshNoRecorte} com stub de meta refresh)`],
      ["Sem main", `${r.semMain} (${pct(r.semMain, r.recorteSemantico)})`],
      ["Sem main nem nav", `${r.semMainNemNav} (${pct(r.semMainNemNav, r.recorteSemantico)})`],
      ["Proporção div+span: média / mediana", `${num(r.mediaProporcaoDivSpan, 3)} / ${num(r.medianaProporcaoDivSpan, 3)}`],
      ["Mediana da nota de performance", td(r.medianaPerformance)],
      ["Mediana da nota de acessibilidade", td(r.medianaAcessibilidade)],
      ["Mediana do índice de semântica", td(r.medianaIndice, 1)],
    ],
  );
  const top = tabela(
    ["#", "Auditoria", "Categoria", "Sites", "%"],
    r.auditorias.slice(0, 10).map((a, i) => [
      td(i + 1),
      `<code>${esc(a.id)}</code><br>${esc(a.titulo ?? "")}`,
      esc(a.categorias.join(", ")),
      td(a.sites),
      pct(a.sites, r.conjuntoPrincipal),
    ]),
  );
  const linhas = [...sites]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => [
      `<a href="sites/${esc(m.id)}.html">${esc(m.id)}</a>`,
      esc(m.contexto.tecnologia ?? "—"),
      m.conjuntoPrincipal ? "sim" : "não",
      td(m.performance?.metricas?.notas.performance),
      td(m.performance?.metricas?.notas.accessibility),
      td(m.indice?.indice, 1),
    ]);
  const corpo = [
    "<h1>Panorama — sites públicos da UFRN</h1>",
    "<p>Descritivas do corpus. Os testes estatísticos estão no notebook <code>analysis/diagnostico.ipynb</code> (ADR 013).</p>",
    "<h2>Resumo</h2>",
    resumo,
    `<h2>10 auditorias que mais falham (conjunto principal, n = ${r.conjuntoPrincipal})</h2>`,
    top,
    `<h2>Sites (${r.total})</h2>`,
    tabela(["Site", "Tecnologia", "Conjunto principal", "Performance", "Acessibilidade", "Índice"], linhas),
  ].join("\n");
  return pagina("Panorama — auditoria dos sites da UFRN", corpo, meta);
}
