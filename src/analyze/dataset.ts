import type { Meta } from "../shared/types.js";
import { calcularIndice, type IndiceSite, SUBNOTAS } from "./indice.js";
import type { PerformanceSite } from "./performance.js";
import type { SemanticaSite } from "./semantics.js";

/**
 * Junta performance, semântica e índice de um site (S12, ADR 012) e gera a
 * linha do `dataset.csv`. Funções puras: quem lê e grava é `index.ts`.
 */

export interface ContextoCorpus {
  tipo: string | null;
  tecnologia: string | null;
}

export interface MetricasSite {
  meta: Meta;
  id: string;
  url: string;
  contexto: ContextoCorpus;
  /** Performance `completo` e sem exclusão (ADR 009; ADR 012, item 2). */
  conjuntoPrincipal: boolean;
  /** `null` se o site não tem `lighthouse.json`. */
  performance: Omit<PerformanceSite, "meta"> | null;
  semantica: Omit<SemanticaSite, "meta">;
  indice: IndiceSite | null;
}

const semMeta = <T extends { meta: Meta }>(x: T): Omit<T, "meta"> => {
  const { meta: _meta, ...resto } = x;
  return resto;
};

export function montarMetricasSite(params: {
  meta: Meta;
  performance: PerformanceSite | null;
  semantica: SemanticaSite;
  contexto: ContextoCorpus;
}): MetricasSite {
  const { performance: p, semantica: s } = params;
  return {
    meta: params.meta,
    id: s.id,
    url: s.url,
    contexto: params.contexto,
    conjuntoPrincipal: p !== null && p.status === "completo" && p.exclusao === null && s.exclusao === null,
    performance: p === null ? null : semMeta(p),
    semantica: semMeta(s),
    indice: calcularIndice(s.indicadores),
  };
}

// --------------------------------------------------------------------------
// Linha do CSV
// --------------------------------------------------------------------------

type Valor = string | number | boolean | null | undefined;

/** `divSpan` → `sub_div_span`. */
const colunaDaSubnota = <S extends string>(s: S) => `sub_${s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}` as const;

/** Ordem fixa das colunas do `dataset.csv`. */
export const COLUNAS = [
  // identificação e contexto
  "id", "url", "tipo", "tecnologia",
  // conjuntos e flags
  "conjunto_principal", "exclusao_motivo", "status_performance", "status_semantica",
  "meta_refresh", "rendered_com_refresh", "collected_at",
  // performance (ADR 009)
  "nota_performance", "nota_accessibility", "nota_best_practices", "nota_seo",
  "fcp_ms", "lcp_ms", "tbt_ms", "cls", "speed_index_ms", "peso_total_bytes", "requisicoes",
  "js_nao_usado_bytes", "css_nao_usado_bytes", "n_auditorias_falha",
  "lh_execucoes_validas", "lh_execucao", "lh_n_fcp_tti", "lh_amplitude_performance",
  // semântica parte 1 (ADR 010)
  "elementos_body", "div", "span", "proporcao_div_span",
  "lm_banner", "lm_navigation", "lm_main", "lm_contentinfo",
  "titulos_total", "titulos_h1", "titulos_saltos", "titulos_maior_salto", "titulos_primeiro_nivel",
  // semântica parte 2 (ADR 011)
  "article", "section", "aside", "figure", "ul", "ol",
  "onclick_div_span", "interativos_falsos",
  "lang", "tem_title", "title_comprimento", "tem_viewport", "tem_description",
  "img_total", "img_sem_alt", "img_alt_vazio", "img_sem_alt_com_alternativa",
  "campos_total", "campos_sem_label", "campos_sem_label_com_placeholder_ou_title",
  "obsoletas_roteiro", "obsoletas_whatwg", "obsoletas_por_tag",
  "tabelas_total", "tabelas_layout_declarada", "tabelas_layout_heuristica", "tabelas_dados", "tabelas_indeterminada",
  // vnu (ADR 011, item 8)
  "vnu_status", "vnu_erros", "vnu_avisos",
  // índice (ADR 003)
  ...SUBNOTAS.map(colunaDaSubnota),
  "indice_semantica", "indice_semantica_pesos_iguais",
] as const;
export type Coluna = (typeof COLUNAS)[number];

const arred = (x: number | null | undefined, casas = 4): number | null =>
  x === null || x === undefined ? null : Math.round(x * 10 ** casas) / 10 ** casas;

export function linhaDoDataset(m: MetricasSite): Record<Coluna, Valor> {
  const p = m.performance;
  const pm = p?.metricas ?? null;
  const s = m.semantica;
  const i = s.indicadores;
  const vnu = s.vnu;
  const sub = m.indice?.subnotas ?? null;
  const linha: Partial<Record<Coluna, Valor>> = {
    id: m.id,
    url: m.url,
    tipo: m.contexto.tipo,
    tecnologia: m.contexto.tecnologia,
    conjunto_principal: m.conjuntoPrincipal,
    exclusao_motivo: p?.exclusao?.motivo ?? s.exclusao?.motivo ?? null,
    status_performance: p?.status ?? "sem-lighthouse",
    status_semantica: s.status,
    meta_refresh: s.metaRefresh,
    rendered_com_refresh: s.renderedComRefresh,
    collected_at: s.coleta.collectedAt,
    nota_performance: pm?.notas.performance,
    nota_accessibility: pm?.notas.accessibility,
    nota_best_practices: pm?.notas["best-practices"],
    nota_seo: pm?.notas.seo,
    fcp_ms: pm?.fcpMs,
    lcp_ms: pm?.lcpMs,
    tbt_ms: pm?.tbtMs,
    cls: pm?.cls,
    speed_index_ms: pm?.speedIndexMs,
    peso_total_bytes: pm?.pesoTotalBytes,
    requisicoes: pm?.requisicoes,
    js_nao_usado_bytes: pm?.jsNaoUsadoBytes,
    css_nao_usado_bytes: pm?.cssNaoUsadoBytes,
    n_auditorias_falha: p?.auditoriasComFalha?.length,
    lh_execucoes_validas: p?.execucoesValidas,
    lh_execucao: p?.execucao,
    lh_n_fcp_tti: p?.nFcpTti,
    lh_amplitude_performance: p?.amplitudePerformance,
    vnu_status: vnu?.status ?? null,
    vnu_erros: vnu?.status === "ok" ? vnu.erros : null,
    vnu_avisos: vnu?.status === "ok" ? vnu.avisos : null,
    indice_semantica: arred(m.indice?.indice ?? null, 2),
    indice_semantica_pesos_iguais: arred(m.indice?.indicePesosIguais ?? null, 2),
  };
  for (const k of SUBNOTAS) linha[colunaDaSubnota(k) as Coluna] = arred(sub?.[k] ?? null, 2);
  if (i !== null) {
    Object.assign(linha, {
      elementos_body: i.divSpan.total,
      div: i.divSpan.div,
      span: i.divSpan.span,
      proporcao_div_span: arred(i.divSpan.proporcao),
      lm_banner: i.landmarks.banner,
      lm_navigation: i.landmarks.navigation,
      lm_main: i.landmarks.main,
      lm_contentinfo: i.landmarks.contentinfo,
      titulos_total: i.titulos.total,
      titulos_h1: i.titulos.h1,
      titulos_saltos: i.titulos.saltos,
      titulos_maior_salto: i.titulos.maiorSalto,
      titulos_primeiro_nivel: i.titulos.primeiroNivel,
      ...i.estrutura,
      onclick_div_span: i.interativosFalsos.comOnclick,
      interativos_falsos: i.interativosFalsos.falsos,
      lang: i.metadados.lang,
      tem_title: i.metadados.temTitle,
      title_comprimento: i.metadados.titleComprimento,
      tem_viewport: i.metadados.temViewport,
      tem_description: i.metadados.temDescription,
      img_total: i.imagens.total,
      img_sem_alt: i.imagens.semAlt,
      img_alt_vazio: i.imagens.altVazio,
      img_sem_alt_com_alternativa: i.imagens.semAltComAlternativa,
      campos_total: i.campos.total,
      campos_sem_label: i.campos.semLabel,
      campos_sem_label_com_placeholder_ou_title: i.campos.semLabelComPlaceholderOuTitle,
      obsoletas_roteiro: i.obsoletas.roteiro,
      obsoletas_whatwg: i.obsoletas.whatwg,
      obsoletas_por_tag: Object.entries(i.obsoletas.porTag)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([t, n]) => `${t}:${n}`)
        .join(";"),
      tabelas_total: i.tabelas.total,
      tabelas_layout_declarada: i.tabelas.layoutDeclarada,
      tabelas_layout_heuristica: i.tabelas.layoutHeuristica,
      tabelas_dados: i.tabelas.dados,
      tabelas_indeterminada: i.tabelas.indeterminada,
    });
  }
  return Object.fromEntries(COLUNAS.map((c) => [c, linha[c] ?? null])) as Record<Coluna, Valor>;
}

/** Valor → texto do CSV: `null` vira vazio, booleano vira `true`/`false`. */
export function celula(v: Valor): string {
  if (v === null || v === undefined) return "";
  return String(v);
}
