import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type CheerioAPI, load } from "cheerio";

import type { MetaRefresh } from "../collect/page.js";
import type { Meta } from "../shared/types.js";
import { exclusaoDaAnalise } from "./exclusoes.js";
import type { ResultadoVnu, Vnu } from "./vnu.js";

/**
 * Indicadores de semântica HTML sobre o `rendered.html` (DOM serializado
 * após o `networkidle`, ADR 006).
 * Parte 1 (S10, ADR 010):
 *   (1) proporção div+span / total de elementos do `body`;
 *   (2) landmarks banner/navigation/main/contentinfo (HTML-AAM + `role`);
 *   (3) hierarquia de títulos: nº de h1 e nº de saltos.
 * Parte 2 (S11, ADR 011):
 *   (4) estrutura: article/section/aside/figure/ul/ol;
 *   (5) interativos falsos: div/span com onclick sem role nem tabindex;
 *   (6) metadados: lang, title, meta viewport, meta description;
 *   (7) img sem alt; (8) input sem label associado;
 *   (9) elementos obsoletos e tabelas de layout (heurística).
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

/** (4) Elementos de estrutura (ADR 011, item 1): contagem pela tag. */
export interface Estrutura {
  article: number;
  section: number;
  aside: number;
  figure: number;
  ul: number;
  ol: number;
}

/** (5) Interativos falsos (ADR 011, item 2). */
export interface InterativosFalsos {
  /** `div`/`span` com atributo `onclick`. */
  comOnclick: number;
  /** Desses, os sem `role` e sem `tabindex`. */
  falsos: number;
}

/** (6) Metadados do documento (ADR 011, item 3). */
export interface Metadados {
  /** Valor de `<html lang>` sem espaços nas pontas; `null` se ausente ou vazio. */
  lang: string | null;
  /** O primeiro `<title>` fora de `svg` tem texto. */
  temTitle: boolean;
  /** Nº de caracteres do texto do título (espaços normalizados); 0 sem título. */
  titleComprimento: number;
  temViewport: boolean;
  temDescription: boolean;
}

/** (7) Imagens (ADR 011, item 4). */
export interface Imagens {
  total: number;
  /** Sem o atributo `alt` (o indicador). */
  semAlt: number;
  /** Com `alt` vazio ou só espaços (decorativa; não é falha). */
  altVazio: number;
  /** Dos `semAlt`, os que têm `aria-label`, `aria-labelledby` ou `role` presentation/none (sensibilidade). */
  semAltComAlternativa: number;
}

/** (8) Campos de formulário `input` (ADR 011, item 5). */
export interface Campos {
  /** `input` que precisam de rótulo (sem os tipos hidden/submit/button/image/reset). */
  total: number;
  /** Sem `label` associado, `aria-label` nem `aria-labelledby` válido (o indicador). */
  semLabel: number;
  /** Dos `semLabel`, os que têm `placeholder` ou `title` (sensibilidade). */
  semLabelComPlaceholderOuTitle: number;
}

/** (9a) Elementos obsoletos (ADR 011, item 6). */
export interface Obsoletas {
  /** `font` + `center` + `marquee` (lista do roteiro, o indicador). */
  roteiro: number;
  /** Todos os elementos da lista do WHATWG §16.2 (inclui os 3 acima). */
  whatwg: number;
  /** Contagem por tag, só as que aparecem. */
  porTag: Record<string, number>;
}

/** (9b) Tabelas classificadas pela heurística de layout (ADR 011, item 7). */
export interface Tabelas {
  total: number;
  /** `role="presentation"`/`"none"`: o autor declarou que é de layout. */
  layoutDeclarada: number;
  /** Sem marcação de dados e com tabela aninhada ou bloco (`div`/`p`/`form`) nas células. */
  layoutHeuristica: number;
  /** Com `th`, `caption`, `thead` ou `role` table/grid/treegrid. */
  dados: number;
  /** Sem marcação de dados e sem sinal de layout. */
  indeterminada: number;
}

export interface IndicadoresSemanticosP2 {
  estrutura: Estrutura;
  interativosFalsos: InterativosFalsos;
  metadados: Metadados;
  imagens: Imagens;
  campos: Campos;
  obsoletas: Obsoletas;
  tabelas: Tabelas;
}

export type IndicadoresSemanticos = IndicadoresSemanticosP1 & IndicadoresSemanticosP2;

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
  indicadores: IndicadoresSemanticos | null;
  /** Validação HTML (ADR 011, item 8); `null` quando a flag `--vnu` não foi usada. */
  vnu: ResultadoVnu | null;
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
// (4) Estrutura
// --------------------------------------------------------------------------

const TAGS_ESTRUTURA = new Set<string>(["article", "section", "aside", "figure", "ul", "ol"]);

/** ADR 011, item 1: pela tag, sem `role`; ignora `hidden` (ADR 010, item 5). */
export function estrutura(doc: Doc): Estrutura {
  const $ = carregar(doc);
  const out: Estrutura = { article: 0, section: 0, aside: 0, figure: 0, ul: 0, ol: 0 };
  percorrer($, (n) => {
    const t = nome(n);
    if (TAGS_ESTRUTURA.has(t)) out[t as keyof Estrutura]++;
  });
  return out;
}

// --------------------------------------------------------------------------
// (5) Interativos falsos
// --------------------------------------------------------------------------

const tem = (n: No, attr: string): boolean => n.attribs?.[attr] !== undefined;
const naoVazio = (n: No, attr: string): boolean => (n.attribs?.[attr] ?? "").trim() !== "";

/** ADR 011, item 2: `div`/`span` com `onclick`, sem `role` (não vazio) e sem `tabindex`. */
export function interativosFalsos(doc: Doc): InterativosFalsos {
  const $ = carregar(doc);
  const out: InterativosFalsos = { comOnclick: 0, falsos: 0 };
  percorrer($, (n) => {
    const t = nome(n);
    if ((t !== "div" && t !== "span") || !tem(n, "onclick")) return;
    out.comOnclick++;
    if (roleExplicito(n) === null && !tem(n, "tabindex")) out.falsos++;
  });
  return out;
}

// --------------------------------------------------------------------------
// (6) Metadados
// --------------------------------------------------------------------------

const textoNormalizado = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Há `<meta name=X>` (nome sem diferenciar maiúsculas) com `content` não vazio? */
function temMetaComConteudo($: CheerioAPI, nomeMeta: string): boolean {
  return $("meta")
    .toArray()
    .some((el) => {
      const m = $(el);
      return (m.attr("name") ?? "").trim().toLowerCase() === nomeMeta && (m.attr("content") ?? "").trim() !== "";
    });
}

/** ADR 011, item 3. Olha o documento todo (inclusive o `head`). */
export function metadados(doc: Doc): Metadados {
  const $ = carregar(doc);
  const lang = ($("html").first().attr("lang") ?? "").trim();
  const titulo = $("title")
    .toArray()
    .find((el) => $(el).closest("svg").length === 0);
  const textoTitulo = titulo ? textoNormalizado($(titulo).text()) : "";
  return {
    lang: lang === "" ? null : lang,
    temTitle: textoTitulo !== "",
    titleComprimento: textoTitulo.length,
    temViewport: temMetaComConteudo($, "viewport"),
    temDescription: temMetaComConteudo($, "description"),
  };
}

// --------------------------------------------------------------------------
// (7) Imagens sem alt
// --------------------------------------------------------------------------

/** ADR 011, item 4: falha = `img` sem o atributo `alt`; `alt=""` é decorativa. */
export function imagens(doc: Doc): Imagens {
  const $ = carregar(doc);
  const out: Imagens = { total: 0, semAlt: 0, altVazio: 0, semAltComAlternativa: 0 };
  percorrer($, (n) => {
    if (nome(n) !== "img") return;
    out.total++;
    if (tem(n, "alt")) {
      if (!naoVazio(n, "alt")) out.altVazio++;
      return;
    }
    out.semAlt++;
    const r = roleExplicito(n);
    if (naoVazio(n, "aria-label") || naoVazio(n, "aria-labelledby") || r === "presentation" || r === "none") {
      out.semAltComAlternativa++;
    }
  });
  return out;
}

// --------------------------------------------------------------------------
// (8) input sem label
// --------------------------------------------------------------------------

/** Tipos de `input` que não precisam de `label` (ADR 011, item 5). */
const TIPOS_SEM_LABEL = new Set(["hidden", "submit", "button", "image", "reset"]);

/**
 * ADR 011, item 5. Rótulo válido: `<label for>` apontando para o `id` do campo
 * (o primeiro elemento com esse `id`, como faz o DOM), `label` ancestral,
 * `aria-label` não vazio ou `aria-labelledby` com ao menos um `id` existente.
 * `placeholder` e `title` não contam.
 */
export function campos(doc: Doc): Campos {
  const $ = carregar(doc);
  const primeiroPorId = new Map<string, unknown>();
  for (const el of $("[id]").toArray()) {
    const id = $(el).attr("id")!;
    if (!primeiroPorId.has(id)) primeiroPorId.set(id, el);
  }
  const rotuladosPorFor = new Set<unknown>();
  for (const el of $("label[for]").toArray()) {
    const alvo = primeiroPorId.get($(el).attr("for")!);
    if (alvo !== undefined) rotuladosPorFor.add(alvo);
  }
  const out: Campos = { total: 0, semLabel: 0, semLabelComPlaceholderOuTitle: 0 };
  percorrer($, (n) => {
    if (nome(n) !== "input") return;
    const tipo = (n.attribs?.type ?? "").trim().toLowerCase();
    if (TIPOS_SEM_LABEL.has(tipo)) return;
    out.total++;
    const labelledby = (n.attribs?.["aria-labelledby"] ?? "").trim().split(/\s+/).filter(Boolean);
    const rotulado =
      rotuladosPorFor.has(n) ||
      $(n as never).closest("label").length > 0 ||
      naoVazio(n, "aria-label") ||
      labelledby.some((id) => primeiroPorId.has(id));
    if (rotulado) return;
    out.semLabel++;
    if (naoVazio(n, "placeholder") || naoVazio(n, "title")) out.semLabelComPlaceholderOuTitle++;
  });
  return out;
}

// --------------------------------------------------------------------------
// (9a) Elementos obsoletos
// --------------------------------------------------------------------------

/** Elementos que o WHATWG (§16.2, "Non-conforming features") proíbe aos autores. */
export const OBSOLETAS_WHATWG: ReadonlySet<string> = new Set([
  "applet", "acronym", "bgsound", "dir", "frame", "frameset", "noframes", "isindex", "keygen", "listing",
  "menuitem", "nextid", "noembed", "param", "plaintext", "rb", "rtc", "strike", "xmp", "basefont", "big",
  "blink", "center", "font", "marquee", "multicol", "nobr", "spacer", "tt",
]);
const OBSOLETAS_ROTEIRO = new Set(["font", "center", "marquee"]);

/** ADR 011, item 6: elementos do `body`, ignorando `hidden` (ADR 010, item 5). */
export function obsoletas(doc: Doc): Obsoletas {
  const $ = carregar(doc);
  const out: Obsoletas = { roteiro: 0, whatwg: 0, porTag: {} };
  percorrer($, (n) => {
    const t = nome(n);
    if (!OBSOLETAS_WHATWG.has(t)) return;
    out.whatwg++;
    if (OBSOLETAS_ROTEIRO.has(t)) out.roteiro++;
    out.porTag[t] = (out.porTag[t] ?? 0) + 1;
  });
  return out;
}

// --------------------------------------------------------------------------
// (9b) Tabelas de layout (heurística)
// --------------------------------------------------------------------------

export type ClasseTabela = "layoutDeclarada" | "layoutHeuristica" | "dados" | "indeterminada";

const ROLES_DE_DADOS = new Set(["table", "grid", "treegrid"]);

/**
 * Heurística do ADR 011, item 7, aplicada em ordem:
 *   1. `role` presentation/none → layout declarada;
 *   2. `role` table/grid/treegrid → dados;
 *   3. `th`, `caption` ou `thead` da própria tabela (não de uma aninhada) → dados;
 *   4. tabela aninhada, ou `div`/`p`/`form` dentro das células → layout (heurística);
 *   5. senão → indeterminada.
 */
export function classificarTabela($: CheerioAPI, tabela: No): ClasseTabela {
  const r = roleExplicito(tabela);
  if (r === "presentation" || r === "none") return "layoutDeclarada";
  if (r !== null && ROLES_DE_DADOS.has(r)) return "dados";
  const t = $(tabela as never);
  const propria = (x: unknown) => $(x as never).closest("table").get(0) === (tabela as never);
  if (t.find("th, caption, thead").toArray().some(propria)) return "dados";
  if (t.find("table").length > 0) return "layoutHeuristica";
  if (t.find("td div, td p, td form, th div, th p, th form").length > 0) return "layoutHeuristica";
  return "indeterminada";
}

/** ADR 011, item 7: cada `table` visível (as aninhadas também) recebe uma classe. */
export function tabelas(doc: Doc): Tabelas {
  const $ = carregar(doc);
  const out: Tabelas = { total: 0, layoutDeclarada: 0, layoutHeuristica: 0, dados: 0, indeterminada: 0 };
  percorrer($, (n) => {
    if (nome(n) !== "table") return;
    out.total++;
    out[classificarTabela($, n)]++;
  });
  return out;
}

// --------------------------------------------------------------------------
// Site
// --------------------------------------------------------------------------

/** Os três indicadores sobre um HTML (um único parse). */
export function indicadoresSemanticosP1(html: string): IndicadoresSemanticosP1 {
  const $ = load(html);
  return { divSpan: proporcaoDivSpan($), landmarks: landmarks($), titulos: hierarquiaTitulos($) };
}

/** Os indicadores (1)–(9) sobre um HTML (um único parse). */
export function indicadoresSemanticos(html: string): IndicadoresSemanticos {
  const $ = load(html);
  return {
    divSpan: proporcaoDivSpan($),
    landmarks: landmarks($),
    titulos: hierarquiaTitulos($),
    estrutura: estrutura($),
    interativosFalsos: interativosFalsos($),
    metadados: metadados($),
    imagens: imagens($),
    campos: campos($),
    obsoletas: obsoletas($),
    tabelas: tabelas($),
  };
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
export function montarSemanticaSite(params: {
  meta: Meta;
  collect: CollectMinimo;
  html: string | null;
  vnu?: ResultadoVnu | null;
}): SemanticaSite {
  const { collect: c, html } = params;
  const renderFinalUrl = c.render?.finalUrl ?? null;
  const indicadores = html === null ? null : indicadoresSemanticos(html);
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
    vnu: params.vnu ?? null,
  };
}

/**
 * Lê `collect.json` e `rendered.html` de `data/raw/<id>/`. Com `vnu` (flag
 * `--vnu`, ADR 011, item 8), valida também o `rendered.html`.
 */
export function analisarSemanticaDoSite(dir: string, meta: Meta, vnu?: Vnu): SemanticaSite {
  const collect = JSON.parse(readFileSync(join(dir, "collect.json"), "utf8")) as CollectMinimo;
  const f = join(dir, "rendered.html");
  const html = existsSync(f) ? readFileSync(f, "utf8") : null;
  let resultadoVnu: ResultadoVnu | null = null;
  if (vnu !== undefined && html !== null) {
    resultadoVnu = vnu.disponivel ? vnu.validar(f) : { status: "indisponivel", motivo: vnu.motivo };
  }
  return montarSemanticaSite({ meta, collect, html, vnu: resultadoVnu });
}
