import type { Achado, Har, Rule } from "../../shared/types.js";
import { type Element, evidenciaTag, inserirAtributo, locTag, posicao } from "../html.js";
import { type Dimensoes, dimensoesDaImagem } from "../image-size.js";

/**
 * `img-dimensions` (ADR 014). `<img>` sem `width`/`height` não reserva espaço
 * antes do download: o conteúdo abaixo "pula" quando a imagem chega (CLS).
 * Corrige com as dimensões intrínsecas do arquivo, lidas do HAR da coleta
 * (ou da URI `data:`). Sem o arquivo, imagem com carregamento tardio ou
 * atributo não numérico → só recomenda.
 */

/** Atributos de bibliotecas de carregamento tardio por script (o `src` é provisório). */
export const ATRIBUTOS_LAZY = ["data-src", "data-srcset", "data-lazy-src", "data-original"];
const MAX_REDIRECTS = 5;

/** Declarações de um `style` inline (propriedade → valor, minúsculos). */
function estilos(style: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of (style ?? "").split(";")) {
    const i = d.indexOf(":");
    if (i > 0) m.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim().toLowerCase());
  }
  return m;
}

/** Tamanho já definido no `style` inline (largura e altura explícitas, ou `aspect-ratio`). */
function dimensionadaPorEstilo(style: string | undefined): boolean {
  const s = estilos(style);
  const explicito = (p: string) => s.has(p) && s.get(p) !== "auto" && s.get(p) !== "";
  return (explicito("width") && explicito("height")) || explicito("aspect-ratio");
}

function inteiro(v: string | undefined): number | null {
  const m = v === undefined ? null : /^\s*(\d+)\s*(px)?\s*$/i.exec(v);
  return m ? Number(m[1]) : null;
}

/** Bytes de uma URI `data:` (base64 ou percent-encoded). */
function bytesDataUri(uri: string): Buffer | null {
  const m = /^data:([^,]*),(.*)$/s.exec(uri);
  if (!m) return null;
  try {
    return m[1]!.endsWith(";base64") ? Buffer.from(m[2]!, "base64") : Buffer.from(decodeURIComponent(m[2]!), "utf8");
  } catch {
    return null;
  }
}

/** Corpo da resposta no HAR para a URL, seguindo redirecionamentos. */
export function bytesNoHar(har: Har | undefined, url: string): Buffer | null {
  if (har === undefined) return null;
  let alvo = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const entradas = har.log.entries.filter((e) => semFragmento(e.request.url) === alvo);
    const ok = entradas.find((e) => e.response.status >= 200 && e.response.status < 300 && e.response.content.text);
    if (ok !== undefined) {
      const c = ok.response.content;
      return Buffer.from(c.text!, c.encoding === "base64" ? "base64" : "utf8");
    }
    const redir = entradas.find((e) => e.response.status >= 300 && e.response.status < 400 && e.response.redirectURL);
    if (redir === undefined) return null;
    alvo = semFragmento(new URL(redir.response.redirectURL!, alvo).href);
  }
  return null;
}

function semFragmento(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

export const imgDimensions: Rule = {
  id: "img-dimensions",
  dimensao: "performance",
  severidade: "media",
  descricao: "Toda <img> declara width e height, para o navegador reservar o espaço antes do download.",
  avaliar({ html, $, url, har }): Achado[] {
    const baseHref = ($("base[href]")[0] as Element | undefined)?.attribs.href;
    let base = url;
    try {
      if (baseHref !== undefined) base = new URL(baseHref, url).href;
    } catch { /* base inválido: usa a URL da página */ }

    const achados: Achado[] = [];
    for (const el of $("img").toArray() as Element[]) {
      const a = el.attribs;
      const w = a.width;
      const h = a.height;
      if ((w !== undefined && h !== undefined) || dimensionadaPorEstilo(a.style)) continue;
      const src = a.src?.trim();
      const loc = locTag(el);
      const recomendar = (motivo: string): Achado => ({
        dimensao: "performance",
        severidade: "media",
        evidencia: evidenciaTag(html, el),
        posicao: posicao(loc),
        mensagem: `<img> sem width e height: a página se desloca quando a imagem carrega (CLS). ${motivo}`,
        edicoes: [],
      });

      if (!src) { achados.push(recomendar("Sem src: declarar as dimensões à mão.")); continue; }
      if (ATRIBUTOS_LAZY.some((x) => a[x] !== undefined)) {
        achados.push(recomendar("Carregamento tardio por script (data-src): o src é provisório, declarar as dimensões da imagem final à mão."));
        continue;
      }
      let bytes: Buffer | null = null;
      if (src.toLowerCase().startsWith("data:")) bytes = bytesDataUri(src);
      else {
        try { bytes = bytesNoHar(har, semFragmento(new URL(src, base).href)); } catch { bytes = null; }
      }
      const d: Dimensoes | null = bytes === null ? null : dimensoesDaImagem(bytes);
      if (d === null) {
        achados.push(recomendar(bytes === null ? "O arquivo não está no HAR da coleta: declarar as dimensões à mão." : "Formato de imagem não reconhecido: declarar as dimensões à mão."));
        continue;
      }
      if (loc === null) { achados.push(recomendar(`Declarar width="${d.largura}" height="${d.altura}".`)); continue; }

      const largura = w === undefined ? null : inteiro(w);
      const altura = h === undefined ? null : inteiro(h);
      if ((w !== undefined && largura === null) || (h !== undefined && altura === null)) {
        achados.push(recomendar(`O atributo presente não é um número inteiro; o arquivo tem ${d.largura}×${d.altura}.`));
        continue;
      }
      const edicoes = [];
      let texto: string;
      if (largura !== null) {
        const alt = Math.round((largura * d.altura) / d.largura);
        edicoes.push(inserirAtributo(el, loc, "height", String(alt)));
        texto = `height="${alt}" (proporcional ao width="${largura}" e ao arquivo ${d.largura}×${d.altura})`;
      } else if (altura !== null) {
        const lar = Math.round((altura * d.largura) / d.altura);
        edicoes.push(inserirAtributo(el, loc, "width", String(lar)));
        texto = `width="${lar}" (proporcional ao height="${altura}" e ao arquivo ${d.largura}×${d.altura})`;
      } else {
        edicoes.push({ ...inserirAtributo(el, loc, "width", String(d.largura)), texto: ` width="${d.largura}" height="${d.altura}"` });
        texto = `width="${d.largura}" height="${d.altura}" (dimensões do arquivo, ${d.formato})`;
      }
      achados.push({ ...recomendar(`Acrescentado ${texto}. Garantir height: auto no CSS para não distorcer.`), edicoes });
    }
    return achados;
  },
};
