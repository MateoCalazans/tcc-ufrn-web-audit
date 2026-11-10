import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type CheerioAPI, load } from "cheerio";

import type { MetaRefresh } from "../collect/page.js";
import type { Meta } from "../shared/types.js";
import { exclusaoDaAnalise } from "./exclusoes.js";

/**
 * Indicadores de semântica HTML, parte 1 (S10, ADR 010), sobre o
 * `rendered.html` (DOM serializado após o `networkidle`, ADR 006):
 *   (1) proporção div+span / total de elementos do `body`;
 *   (2) landmarks banner/navigation/main/contentinfo (HTML-AAM + `role`);
 *   (3) hierarquia de títulos: nº de h1 e nº de saltos.
 * Análise estática: sem CSS computado (ADR 010, item 5). Só leitura de `data/raw/`.
 */

// --------------------------------------------------------------------------
// Tipos
// --------------------------------------------------------------------------

export interface DivSpan {
  div: number;
  span: number;
  /** Elementos contados no denominador (ADR 010, 2a). */
  total: number;
  /** (div + span) / total; `null` se `total` = 0. */
  proporcao: number | null;
}

export interface Landmarks {
  banner: number;
  navigation: number;
  /** Nº de `main` (a especificação permite um só visível). */
  main: number;
  contentinfo: number;
}

export interface Titulos {
  /** Títulos contados (`h1`–`h6` e `role="heading"`). */
  total: number;
  /** Títulos de nível 1 (`h1` ou `aria-level="1"`). */
  h1: number;
  /** Contagem por nível, índice 0 = nível 1 … índice 5 = nível 6+. */
  porNivel: [number, number, number, number, number, number];
  /** Nº de títulos que descem mais de 1 nível em relação ao anterior. */
  saltos: number;
  /** Maior descida entre dois títulos seguidos (0 se não houver salto). */
  maiorSalto: number;
  /** Nível do primeiro título; `null` sem títulos. */
  primeiroNivel: number | null;
}

export interface IndicadoresSemanticosP1 {
  divSpan: DivSpan;
  landmarks: Landmarks;
  titulos: Titulos;
}

/** `ok`; `vazio` = sem nenhum elemento no `body`; `sem-arquivo` = sem `rendered.html`. */
export type StatusSemantica = "ok" | "vazio" | "sem-arquivo";

export interface SemanticaSite {
  meta: Meta;
  id: string;
  url: string;
  /** Proveniência da coleta (meta do `collect.json`). */
  coleta: { collectedAt: string | null; gitCommit: string | null; toolVersions: Record<string, string | null> };
  status: StatusSemantica;
  /** URL final do navegador na coleta renderizada. */
  renderFinalUrl: string | null;
  renderedBytes: number | null;
  /** O HTML bruto tem meta refresh (`collect.json`). */
  metaRefresh: boolean;
  /** O `rendered.html` ainda tem meta refresh: é o stub, não o destino (ADR 010, 1a). */
  renderedComRefresh: boolean;
  exclusao: { motivo: string; detalhe: string } | null;
  indicadores: IndicadoresSemanticosP1 | null;
}

// --------------------------------------------------------------------------
// Percurso do DOM
// --------------------------------------------------------------------------

/** Nó mínimo da árvore do cheerio (domhandler), sem depender do pacote. */
export interface No {
  type: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: No[];
}

type Doc = string | CheerioAPI;
const carregar = (d: Doc): CheerioAPI => (typeof d === "string" ? load(d) : d);

function corpo($: CheerioAPI): No | null {
  return ($("body").get(0) as unknown as No | undefined) ?? null;
}

const ehElemento = (n: No): boolean => n.type === "tag" || n.type === "script" || n.type === "style";
const nome = (n: No): string => (n.name ?? "").toLowerCase();

/** Primeiro token do atributo `role`, em minúsculas; `null` se ausente/vazio. */
export function roleExplicito(n: No): string | null {
  const r = (n.attribs?.role ?? "").trim().toLowerCase().split(/\s+/)[0];
  return r ? r : null;
}

/** Filhos-elemento de `n`, na ordem do documento. */
const filhos = (n: No): No[] => (n.children ?? []).filter(ehElemento);

/** Elementos que não entram em nenhuma contagem, nem eles nem o que estiver dentro. */
const IGNORADOS = new Set(["script", "style", "template", "noscript"]);
/** Contam como 1 elemento, mas o conteúdo (não-HTML) não conta. */
const FOLHAS = new Set(["svg", "math"]);

// --------------------------------------------------------------------------
// (1) Proporção div+span
// --------------------------------------------------------------------------

/** ADR 010, 2a: elementos dentro do `body`, sem `script/style/template/noscript` e sem o interior de `svg/math`. */
export function proporcaoDivSpan(doc: Doc): DivSpan {
  const $ = carregar(doc);
  const out = { div: 0, span: 0, total: 0 };
  const visitar = (n: No) => {
    for (const f of filhos(n)) {
      const t = nome(f);
      if (IGNORADOS.has(t)) continue;
      out.total++;
      if (t === "div") out.div++;
      else if (t === "span") out.span++;
      if (!FOLHAS.has(t)) visitar(f);
    }
  };
  const body = corpo($);
  if (body) visitar(body);
  return { ...out, proporcao: out.total === 0 ? null : (out.div + out.span) / out.total };
}

// --------------------------------------------------------------------------
// Percurso com contexto (landmarks e títulos)
// --------------------------------------------------------------------------

/** Tags e roles que tiram `header`/`footer` do papel de landmark (HTML-AAM). */
const TAGS_SECIONADORAS = new Set(["article", "aside", "main", "nav", "section"]);
const ROLES_SECIONADORAS = new Set(["article", "complementary", "main", "navigation", "region"]);

/**
 * Visita os elementos visíveis do `body` em ordem, informando se há um
 * ancestral secionador. Pula `hidden` (e o interior), `script/style/template/
 * noscript` e o interior de `svg/math` (ADR 010, itens 2a e 5).
 */
function percorrer($: CheerioAPI, visita: (n: No, dentroDeSecao: boolean) => void): void {
  const ir = (n: No, dentroDeSecao: boolean) => {
    for (const f of filhos(n)) {
      const t = nome(f);
      if (IGNORADOS.has(t) || f.attribs?.hidden !== undefined) continue;
      visita(f, dentroDeSecao);
      if (FOLHAS.has(t)) continue;
      const r = roleExplicito(f);
      ir(f, dentroDeSecao || TAGS_SECIONADORAS.has(t) || (r !== null && ROLES_SECIONADORAS.has(r)));
    }
  };
  const body = corpo($);
  if (body) ir(body, false);
}

// --------------------------------------------------------------------------
// (2) Landmarks
// --------------------------------------------------------------------------

type Landmark = keyof Landmarks;

/** Papel de landmark de um elemento (ADR 010, 3a); `null` se não for um dos 4. */
export function papelLandmark(n: No, dentroDeSecao: boolean): Landmark | null {
  const r = roleExplicito(n);
  if (r !== null) {
    return r === "banner" || r === "navigation" || r === "main" || r === "contentinfo" ? r : null;
  }
  switch (nome(n)) {
    case "nav":
      return "navigation";
    case "main":
      return "main";
    case "header":
      return dentroDeSecao ? null : "banner";
    case "footer":
      return dentroDeSecao ? null : "contentinfo";
    default:
      return null;
  }
}

export function landmarks(doc: Doc): Landmarks {
  const $ = carregar(doc);
  const out: Landmarks = { banner: 0, navigation: 0, main: 0, contentinfo: 0 };
  percorrer($, (n, dentro) => {
    const p = papelLandmark(n, dentro);
    if (p) out[p]++;
  });
  return out;
}

// --------------------------------------------------------------------------
// (3) Hierarquia de títulos
// --------------------------------------------------------------------------

/** Nível do título (ADR 010, 4a); `null` se o elemento não for título. */
export function nivelDoTitulo(n: No): number | null {
  const t = nome(n);
  const tag = /^h([1-6])$/.exec(t);
  const r = roleExplicito(n);
  const ehTitulo = r === "heading" || (tag !== null && r === null);
  if (!ehTitulo) return null;
  const al = (n.attribs?.["aria-level"] ?? "").trim();
  if (/^\d+$/.test(al) && Number(al) >= 1) return Number(al);
  return tag ? Number(tag[1]) : 2;
}

/** Níveis dos títulos na ordem do documento. */
export function sequenciaDeTitulos(doc: Doc): number[] {
  const $ = carregar(doc);
  const niveis: number[] = [];
  percorrer($, (n) => {
    const nv = nivelDoTitulo(n);
    if (nv !== null) niveis.push(nv);
  });
  return niveis;
}

export function hierarquiaTitulos(doc: Doc): Titulos {
  const niveis = sequenciaDeTitulos(doc);
  const porNivel: Titulos["porNivel"] = [0, 0, 0, 0, 0, 0];
  let saltos = 0;
  let maiorSalto = 0;
  niveis.forEach((nv, i) => {
    porNivel[Math.min(nv, 6) - 1]!++;
    if (i === 0) return;
    const descida = nv - niveis[i - 1]!;
    if (descida > 1) {
      saltos++;
      maiorSalto = Math.max(maiorSalto, descida);
    }
  });
  return { total: niveis.length, h1: porNivel[0], porNivel, saltos, maiorSalto, primeiroNivel: niveis[0] ?? null };
}

// --------------------------------------------------------------------------
// Site
// --------------------------------------------------------------------------

/** Os três indicadores sobre um HTML (um único parse). */
export function indicadoresSemanticosP1(html: string): IndicadoresSemanticosP1 {
  const $ = load(html);
  return { divSpan: proporcaoDivSpan($), landmarks: landmarks($), titulos: hierarquiaTitulos($) };
}

/**
 * O DOM tem uma `<meta http-equiv="refresh">` que o navegador (com JS) segue?
 * Ignora as que estão dentro de `<noscript>` (ex.: `enterpriseenrollment`,
 * cujo refresh só vale com JS desligado).
 */
export function temMetaRefreshAtivo(doc: Doc): boolean {
  const $ = carregar(doc);
  return $("meta")
    .toArray()
    .some((el) => {
      const m = $(el);
      return (m.attr("http-equiv") ?? "").trim().toLowerCase() === "refresh" && m.closest("noscript").length === 0;
    });
}

/** Subconjunto do `collect.json` que a análise semântica lê. */
export interface CollectMinimo {
  meta?: { collectedAt?: string; gitCommit?: string | null; toolVersions?: Record<string, string | null> };
  id: string;
  url: string;
  metaRefresh?: MetaRefresh | null;
  render?: { finalUrl?: string | null; renderedBytes?: number | null } | null;
}

/** Junta tudo para um site; `html` = conteúdo do `rendered.html` (`null` se não existe). */
export function montarSemanticaSite(params: { meta: Meta; collect: CollectMinimo; html: string | null }): SemanticaSite {
  const { collect: c, html } = params;
  const renderFinalUrl = c.render?.finalUrl ?? null;
  const indicadores = html === null ? null : indicadoresSemanticosP1(html);
  const status: StatusSemantica = indicadores === null ? "sem-arquivo" : indicadores.divSpan.total === 0 ? "vazio" : "ok";
  return {
    meta: params.meta,
    id: c.id,
    url: c.url,
    coleta: {
      collectedAt: c.meta?.collectedAt ?? null,
      gitCommit: c.meta?.gitCommit ?? null,
      toolVersions: { ...(c.meta?.toolVersions ?? {}) },
    },
    status,
    renderFinalUrl,
    renderedBytes: c.render?.renderedBytes ?? null,
    metaRefresh: (c.metaRefresh ?? null) !== null,
    renderedComRefresh: html !== null && temMetaRefreshAtivo(html),
    exclusao: exclusaoDaAnalise(c.id),
    indicadores,
  };
}

/** Lê `collect.json` e `rendered.html` de `data/raw/<id>/`. */
export function analisarSemanticaDoSite(dir: string, meta: Meta): SemanticaSite {
  const collect = JSON.parse(readFileSync(join(dir, "collect.json"), "utf8")) as CollectMinimo;
  const f = join(dir, "rendered.html");
  const html = existsSync(f) ? readFileSync(f, "utf8") : null;
  return montarSemanticaSite({ meta, collect, html });
}
