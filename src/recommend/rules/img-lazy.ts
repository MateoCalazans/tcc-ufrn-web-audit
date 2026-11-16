import type { Achado, LhrRegras, Rule } from "../../shared/types.js";
import { type Element, evidenciaTag, inserirAtributoAposNome, locTag, posicao, resolverUrl, urlBase } from "../html.js";
import { ATRIBUTOS_LAZY } from "./img-dimensions.js";

/**
 * `img-lazy` (S15, ADR 015). Imagem fora da primeira dobra baixada junto com
 * o resto disputa banda com o que aparece primeiro. `loading="lazy"` adia o
 * download até a imagem se aproximar da área visível.
 *
 * A coleta não guarda a posição de cada imagem (o Lighthouse 13 não tem mais
 * a auditoria `offscreen-images`), então "fora da dobra" é uma heurística:
 * as {@link IMAGENS_PROTEGIDAS} primeiras `<img>` na ordem do documento nunca
 * recebem `lazy`, nem a imagem LCP apontada pelo Lighthouse
 * (`lcp-discovery-insight`), porque `lazy` nelas atrasa o LCP.
 */

/** Primeiras `<img>` do documento que nunca recebem `lazy` (ADR 015). */
export const IMAGENS_PROTEGIDAS = 3;

/** Trecho de `src` da imagem LCP: URL inteira ou prefixo (o Lighthouse trunca com `…`). */
interface SrcLcp {
  url: string;
  prefixo: boolean;
}

/** `src` da imagem LCP segundo o Lighthouse, ou `null` se o LCP não for `<img>`. */
export function srcDaImagemLcp(lhr: LhrRegras | undefined, base: string): SrcLcp | null {
  const itens = lhr?.audits["lcp-discovery-insight"]?.details?.items ?? [];
  for (const it of itens) {
    const no = it as { type?: string; snippet?: string };
    if (no.type !== "node" || typeof no.snippet !== "string" || !/^<img\b/i.test(no.snippet)) continue;
    const m = /\ssrc="([^"]*)"/i.exec(no.snippet);
    if (!m) return null;
    const bruto = m[1]!.replace(/&amp;/g, "&");
    const corte = bruto.indexOf("…");
    const url = resolverUrl(corte >= 0 ? bruto.slice(0, corte) : bruto, base);
    return url === null ? null : { url, prefixo: corte >= 0 };
  }
  return null;
}

export const imgLazy: Rule = {
  id: "img-lazy",
  dimensao: "performance",
  severidade: "baixa",
  descricao: `<img> depois das ${IMAGENS_PROTEGIDAS} primeiras do documento usa loading="lazy" (exceto a imagem LCP).`,
  avaliar({ html, $, url, lighthouse }): Achado[] {
    const base = urlBase($, url);
    const lcp = srcDaImagemLcp(lighthouse, base);
    const ehLcp = (src: string | undefined): boolean => {
      if (lcp === null || !src) return false;
      const u = resolverUrl(src, base);
      return u !== null && (lcp.prefixo ? u.startsWith(lcp.url) : u === lcp.url);
    };

    const achados: Achado[] = [];
    ($("img").toArray() as Element[]).forEach((el, i) => {
      const a = el.attribs;
      if (i < IMAGENS_PROTEGIDAS || a.loading !== undefined) return;
      if (ATRIBUTOS_LAZY.some((x) => a[x] !== undefined) || ehLcp(a.src)) return;
      const loc = locTag(el);
      if (loc === null) return;
      achados.push({
        dimensao: "performance",
        severidade: "baixa",
        evidencia: evidenciaTag(html, el),
        posicao: posicao(loc),
        mensagem:
          `${i + 1}ª <img> do documento, provavelmente fora da primeira dobra: acrescentado loading="lazy" ` +
          "para adiar o download. Se a imagem aparecer na primeira tela, remover o atributo.",
        edicoes: [inserirAtributoAposNome(el, loc, "loading", "lazy")],
      });
    });
    return achados;
  },
};
