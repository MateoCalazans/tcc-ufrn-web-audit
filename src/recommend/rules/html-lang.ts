import type { Achado, Rule } from "../../shared/types.js";
import { type Element, evidenciaTag, inserirAtributo, locTag, posicao } from "../html.js";

/**
 * `html-lang` (ADR 014): o `<html>` deve declarar o idioma principal
 * (WCAG 2.2, 3.1.1). Sem `lang` ou com `lang` vazio → corrige para `pt-BR`.
 * `lang` já declarado nunca é sobrescrito.
 */
const IDIOMA = "pt-BR";

/** Sintaxe BCP 47 simplificada: subtag primária de 2–3 letras + subtags de 1–8. */
const BCP47 = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i;

export const htmlLang: Rule = {
  id: "html-lang",
  dimensao: "semantica",
  severidade: "alta",
  descricao: "O elemento <html> declara o idioma da página (atributo lang).",
  avaliar({ html, $ }): Achado[] {
    const el = $("html")[0] as Element | undefined;
    if (el === undefined) return [];
    const loc = locTag(el);
    const base = { dimensao: "semantica" as const, evidencia: evidenciaTag(html, el), posicao: posicao(loc) };
    const lang = el.attribs.lang;

    if (lang === undefined || lang.trim() === "") {
      const mensagem = `O <html> ${lang === undefined ? "não tem o atributo lang" : "tem lang vazio"}: leitores de tela não sabem em que idioma ler a página. Declarar lang="${IDIOMA}".`;
      if (loc === null) {
        return [{ ...base, severidade: "alta", mensagem: `${mensagem} O arquivo não tem a tag <html> explícita: acrescentá-la à mão.`, edicoes: [] }];
      }
      const attr = loc.attrs?.lang;
      const edicao = attr !== undefined
        ? { inicio: attr.startOffset, fim: attr.endOffset, texto: `lang="${IDIOMA}"` }
        : inserirAtributo(el, loc, "lang", IDIOMA);
      return [{ ...base, severidade: "alta", mensagem, edicoes: [edicao] }];
    }

    const valor = lang.trim();
    if (!BCP47.test(valor)) {
      return [{ ...base, severidade: "media", mensagem: `lang="${valor}" não é uma etiqueta de idioma válida (BCP 47); para português do Brasil, usar "${IDIOMA}".`, edicoes: [] }];
    }
    if (valor.split("-")[0]!.toLowerCase() !== "pt") {
      return [{ ...base, severidade: "info", mensagem: `lang="${valor}" declara um idioma diferente do português: conferir se é o idioma principal da página.`, edicoes: [] }];
    }
    return [];
  },
};
