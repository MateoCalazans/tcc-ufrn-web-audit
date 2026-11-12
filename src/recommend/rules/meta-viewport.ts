import type { Achado, Rule } from "../../shared/types.js";
import { type Element, ehXhtml, evidenciaTag, locTag, posicao, quebraDeLinha } from "../html.js";

/**
 * `meta-viewport` (ADR 014). Sem `<meta name="viewport">` o navegador móvel
 * renderiza a página em ~980 px e a reduz: texto ilegível e layout de
 * desktop. Ausente → insere a meta padrão. Presente com `width` diferente de
 * `device-width` ou com zoom bloqueado → só recomenda.
 */
const CONTEUDO = "width=device-width, initial-scale=1";

/** `content` da meta viewport em pares chave → valor (minúsculos). */
export function lerViewport(content: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const parte of content.split(/[,;]/)) {
    const [k, v = ""] = parte.split("=").map((s) => s.trim().toLowerCase());
    if (k) m.set(k, v);
  }
  return m;
}

export const metaViewport: Rule = {
  id: "meta-viewport",
  dimensao: "performance",
  severidade: "alta",
  descricao: "A página declara <meta name=\"viewport\"> adequada a telas móveis, sem bloquear o zoom.",
  avaliar({ html, $ }): Achado[] {
    const meta = $("meta")
      .toArray()
      .find((m) => (m as Element).attribs.name?.trim().toLowerCase() === "viewport") as Element | undefined;

    if (meta === undefined) {
      // Depois da declaração de charset, se houver: inserir antes dela poderia
      // empurrá-la para fora dos 1024 bytes em que o navegador a procura.
      const charset = $("meta[charset], meta[http-equiv]")
        .toArray()
        .find((m) => (m as Element).attribs.charset !== undefined || (m as Element).attribs["http-equiv"]?.trim().toLowerCase() === "content-type") as Element | undefined;
      const ancora = [charset, $("head")[0] as Element | undefined, $("html")[0] as Element | undefined]
        .find((el) => el !== undefined && locTag(el) !== null);
      const loc = ancora === undefined ? null : locTag(ancora);
      const mensagem = `Não há <meta name="viewport">: no celular a página é desenhada como desktop e reduzida. Declarar content="${CONTEUDO}".`;
      if (ancora === undefined || loc === null) {
        return [{ dimensao: "performance", severidade: "alta", evidencia: "(sem <head> nem <html> no arquivo)", posicao: null, mensagem, edicoes: [] }];
      }
      const tag = `<meta name="viewport" content="${CONTEUDO}"${ehXhtml(html) ? " />" : ">"}`;
      return [{
        dimensao: "performance",
        severidade: "alta",
        evidencia: evidenciaTag(html, ancora),
        posicao: posicao(loc),
        mensagem,
        edicoes: [{ inicio: loc.endOffset, fim: loc.endOffset, texto: quebraDeLinha(html) + tag }],
      }];
    }

    const v = lerViewport(meta.attribs.content ?? "");
    const base = { dimensao: "performance" as const, evidencia: evidenciaTag(html, meta), posicao: posicao(locTag(meta)), edicoes: [] };
    const achados: Achado[] = [];
    if (v.get("width") !== "device-width") {
      achados.push({
        ...base,
        severidade: v.has("width") || v.has("initial-scale") ? "baixa" : "media",
        mensagem: `A meta viewport não usa width=device-width: a largura do layout não acompanha a tela. Recomendado: content="${CONTEUDO}".`,
      });
    }
    const maxScale = Number.parseFloat(v.get("maximum-scale") ?? "");
    if (["no", "0"].includes(v.get("user-scalable") ?? "") || (Number.isFinite(maxScale) && maxScale < 5)) {
      achados.push({
        ...base,
        severidade: "media",
        mensagem: "A meta viewport bloqueia ou limita o zoom (user-scalable=no ou maximum-scale < 5): quem tem baixa visão não consegue ampliar o texto. Remover essas diretivas.",
      });
    }
    return achados;
  },
};
