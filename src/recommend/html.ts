import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

import type { Edicao, Posicao } from "../shared/types.js";

/**
 * Utilitários das regras de recomendação (ADR 014). Tudo trabalha com as
 * posições de origem do parse5: as correções são edições no texto original,
 * nunca reserialização do documento.
 */

/** Elemento mínimo da árvore do cheerio (domhandler), sem depender do pacote. */
export interface Element {
  tagName: string;
  attribs: Record<string, string>;
}

/** Localização de uma tag de abertura no texto de origem. */
export interface LocTag {
  startOffset: number;
  endOffset: number;
  startLine: number;
  startCol: number;
  attrs?: Record<string, { startOffset: number; endOffset: number }>;
}

/** Parseia com posições de origem. */
export function parsear(html: string): CheerioAPI {
  // `sourceCodeLocationInfo` é repassado ao parse5; o tipo do cheerio não o expõe.
  return cheerio.load(html, { sourceCodeLocationInfo: true } as Parameters<typeof cheerio.load>[1]);
}

/** Tag de abertura no arquivo, ou `null` se o parser a inferiu (não existe no texto). */
export function locTag(el: Element): LocTag | null {
  const loc = (el as Element & { sourceCodeLocation?: { startTag?: LocTag } | null }).sourceCodeLocation;
  return loc?.startTag ?? null;
}

export function posicao(loc: LocTag | null): Posicao | null {
  return loc === null ? null : { linha: loc.startLine, coluna: loc.startCol };
}

const MAX_EVIDENCIA = 200;

/** Trecho da tag de abertura no texto original (truncado), ou `<nome>` se inferida. */
export function evidenciaTag(html: string, el: Element): string {
  const loc = locTag(el);
  if (loc === null) return `<${el.tagName}> (inferido pelo parser, ausente no arquivo)`;
  const t = html.slice(loc.startOffset, loc.endOffset).replace(/\s+/g, " ");
  return t.length > MAX_EVIDENCIA ? t.slice(0, MAX_EVIDENCIA - 1) + "…" : t;
}

/**
 * Edição que acrescenta ` nome="valor"` à tag: logo depois do último
 * atributo, ou do nome da tag se não houver atributos. Assim `/>` e espaços
 * finais ficam intocados.
 */
export function inserirAtributo(el: Element, loc: LocTag, nome: string, valor: string): Edicao {
  const fins = Object.values(loc.attrs ?? {}).map((a) => a.endOffset);
  const pos = fins.length > 0 ? Math.max(...fins) : loc.startOffset + 1 + el.tagName.length;
  return { inicio: pos, fim: pos, texto: ` ${nome}="${valor}"` };
}

/**
 * Edição que acrescenta ` nome="valor"` logo depois do nome da tag. Usada
 * quando outra regra já insere depois do último atributo da mesma tag: duas
 * inserções no mesmo ponto conflitam no motor (ADR 014).
 */
export function inserirAtributoAposNome(el: Element, loc: LocTag, nome: string, valor: string): Edicao {
  const pos = loc.startOffset + 1 + el.tagName.length;
  return { inicio: pos, fim: pos, texto: ` ${nome}="${valor}"` };
}

/** Tag de fechamento no arquivo, ou `null` se implícita (o parser a inferiu). */
export function locFim(el: Element): { startOffset: number; endOffset: number } | null {
  const loc = (el as Element & { sourceCodeLocation?: { endTag?: { startOffset: number; endOffset: number } } | null })
    .sourceCodeLocation;
  return loc?.endTag ?? null;
}

/** `true` se o elemento ou um ancestral tem `hidden` (ADR 010, item 5). */
export function oculto($: CheerioAPI, el: Element): boolean {
  return $(el as never).closest("[hidden]").length > 0;
}

/** URL base do documento: `<base href>` resolvido contra a URL da página. */
export function urlBase($: CheerioAPI, url: string): string {
  const href = ($("base[href]")[0] as Element | undefined)?.attribs.href;
  try {
    return href === undefined ? url : new URL(href, url).href;
  } catch {
    return url; // base inválido: usa a URL da página
  }
}

/** URL absoluta sem fragmento, ou `null` se não for resolvível. */
export function resolverUrl(ref: string, base: string): string | null {
  try {
    const u = new URL(ref.trim(), base);
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

/** Quebra de linha predominante do arquivo (para inserções de linha inteira). */
export function quebraDeLinha(html: string): string {
  return html.includes("\r\n") ? "\r\n" : "\n";
}

/** `true` se o documento declara XHTML (inserções usam `/>`). */
export function ehXhtml(html: string): boolean {
  return /<!doctype[^>]*xhtml/i.test(html.slice(0, 1000));
}
