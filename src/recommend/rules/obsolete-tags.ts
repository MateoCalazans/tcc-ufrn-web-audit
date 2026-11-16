import { OBSOLETAS_WHATWG } from "../../analyze/semantics.js";
import type { Achado, Edicao, Rule } from "../../shared/types.js";
import { type Element, evidenciaTag, locFim, locTag, posicao } from "../html.js";

/**
 * `obsolete-tags` (S15, ADR 015). Elementos que o WHATWG proíbe aos autores
 * (mesma lista do índice, `OBSOLETAS_WHATWG`, ADR 011). Corrige só o caso em
 * que a troca não muda a renderização: `<font>` apenas com `color` e/ou `face`
 * válidos em CSS, com tag de fechamento no arquivo → `<span style>`. O resto
 * (`<center>`, `<font size>`, cor em sintaxe legada, outros atributos) só
 * recomenda: `text-align: center` não centraliza blocos como o `<center>`, e
 * `size` não tem equivalente exato em CSS.
 */

const SUGESTAO: Record<string, string> = {
  center: "usar CSS (text-align: center para texto; margin-inline: auto para blocos).",
  font: "usar CSS (color, font-family, font-size) num elemento com significado ou num <span>.",
  basefont: "definir a fonte no CSS do body.",
  big: "usar CSS (font-size) ou <strong> se for ênfase.",
  tt: "usar <code>, <kbd> ou <samp> conforme o significado, ou CSS (font-family: monospace).",
  strike: "usar <s> (não é mais válido) ou <del> (removido do documento).",
  acronym: "usar <abbr title>.",
  dir: "usar <ul>.",
  marquee: "remover ou usar animação CSS que respeite prefers-reduced-motion.",
  blink: "remover; se necessário, animação CSS que respeite prefers-reduced-motion.",
  nobr: "usar CSS (white-space: nowrap).",
  applet: "remover (Java no navegador não é mais suportado) ou usar <object>/<embed>.",
  frame: "substituir o frameset por layout em CSS ou <iframe>.",
  frameset: "substituir por layout em CSS ou <iframe>.",
  noframes: "remover junto com o frameset.",
};

/** Cores nomeadas do CSS (CSS Color 4) — a sintaxe legada do `<font color>` aceita mais coisas. */
const CORES_NOMEADAS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown " +
    "burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
    "darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid " +
    "darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
    "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro " +
    "ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow " +
    "lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
    "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine " +
    "mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise " +
    "mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab " +
    "orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru " +
    "pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan " +
    "teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);

const GENERICAS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);

/** Valor CSS de `color`, ou `null` se só a sintaxe legada aceitaria (ex.: `ff0000` sem `#`). */
function corCss(v: string): string | null {
  const c = v.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  return CORES_NOMEADAS.has(c.toLowerCase()) ? c : null;
}

/** Valor CSS de `font-family`, ou `null` se algum nome tiver caracteres fora do seguro. */
function familiaCss(v: string): string | null {
  const nomes = v.split(",").map((n) => n.trim()).filter((n) => n !== "");
  if (nomes.length === 0 || nomes.some((n) => !/^[A-Za-z0-9 _-]+$/.test(n))) return null;
  return nomes
    .map((n) => (GENERICAS.has(n.toLowerCase()) || /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(n) ? n : `'${n}'`))
    .join(", ");
}

/** Edições `<font …>…</font>` → `<span style>…</span>`, ou o motivo para não corrigir. */
function corrigirFont(html: string, el: Element): Edicao[] | string {
  const nomes = Object.keys(el.attribs);
  if (nomes.length === 0 || nomes.some((n) => n !== "color" && n !== "face")) {
    return "Tem atributos além de color/face (size, class…): não há troca equivalente automática.";
  }
  const decl: string[] = [];
  if (el.attribs.color !== undefined) {
    const c = corCss(el.attribs.color);
    if (c === null) return `A cor "${el.attribs.color}" só vale na sintaxe legada do <font>: escrever em CSS à mão.`;
    decl.push(`color: ${c}`);
  }
  if (el.attribs.face !== undefined) {
    const f = familiaCss(el.attribs.face);
    if (f === null) return "Nome de fonte com caracteres que exigem revisão manual.";
    decl.push(`font-family: ${f}`);
  }
  const ini = locTag(el)!;
  const fim = locFim(el);
  if (fim === null || !/^<\/font\s*>$/i.test(html.slice(fim.startOffset, fim.endOffset))) {
    return "Sem </font> no arquivo (fechamento implícito): trocar à mão.";
  }
  return [
    { inicio: ini.startOffset, fim: ini.endOffset, texto: `<span style="${decl.join("; ")}">` },
    { inicio: fim.startOffset, fim: fim.endOffset, texto: "</span>" },
  ];
}

export const obsoleteTags: Rule = {
  id: "obsolete-tags",
  dimensao: "semantica",
  severidade: "baixa",
  descricao: "Sem elementos obsoletos do WHATWG (center, font, marquee…); <font> simples vira <span style>.",
  avaliar({ html, $ }): Achado[] {
    const achados: Achado[] = [];
    const vistos = new Set<number>();
    for (const el of $("*").toArray() as Element[]) {
      const tag = el.tagName.toLowerCase();
      if (!OBSOLETAS_WHATWG.has(tag)) continue;
      // O parser reabre elementos de formatação não fechados (ex.: <font> depois de
      // </p>) com clones que herdam a posição da tag original: um achado por tag
      // escrita no arquivo, não por clone.
      const loc = locTag(el);
      if (loc === null || vistos.has(loc.startOffset)) continue;
      vistos.add(loc.startOffset);
      const base = `<${tag}> é obsoleto no HTML (WHATWG): ${SUGESTAO[tag] ?? "remover ou trocar por CSS/elemento atual."}`;
      const correcao = tag === "font" ? corrigirFont(html, el) : null;
      const edicoes = Array.isArray(correcao) ? correcao : [];
      achados.push({
        dimensao: "semantica",
        severidade: "baixa",
        evidencia: evidenciaTag(html, el),
        posicao: posicao(loc),
        mensagem:
          edicoes.length > 0
            ? `${base} Trocado por <span style>, mesma aparência. Conferir CSS do site que mire "font".`
            : `${base}${typeof correcao === "string" ? " " + correcao : ""}`,
        edicoes,
      });
    }
    return achados;
  },
};
