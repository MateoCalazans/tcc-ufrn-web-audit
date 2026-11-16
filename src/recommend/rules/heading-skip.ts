import { type No, nivelDoTitulo } from "../../analyze/semantics.js";
import type { Achado, Rule } from "../../shared/types.js";
import { type Element, evidenciaTag, locTag, posicao } from "../html.js";

/**
 * `heading-skip` (S15, ADR 015). Mesma definição de salto do índice (ADR 010,
 * item 4): um título é salto quando o nível é maior que o do título anterior
 * mais 1; o primeiro título não é comparado; subir de nível é permitido;
 * `role="heading"` + `aria-level` conta. Só recomenda: mudar o nível muda o
 * tamanho visual e a estrutura do documento, e a escolha do nível certo
 * depende do conteúdo.
 */

/** Elementos cujo conteúdo não entra na hierarquia (como no analisador). */
const FORA = "[hidden], template, svg, math";

export const headingSkip: Rule = {
  id: "heading-skip",
  dimensao: "semantica",
  severidade: "media",
  descricao: "Títulos não pulam níveis ao descer na hierarquia (h1 → h3, por exemplo).",
  avaliar({ html, $ }): Achado[] {
    const achados: Achado[] = [];
    let anterior: number | null = null;
    for (const el of $("body *").toArray() as Element[]) {
      const nivel = nivelDoTitulo(el as unknown as No);
      if (nivel === null || $(el as never).closest(FORA).length > 0) continue;
      if (anterior !== null && nivel > anterior + 1) {
        achados.push({
          dimensao: "semantica",
          severidade: "media",
          evidencia: evidenciaTag(html, el),
          posicao: posicao(locTag(el)),
          mensagem:
            `Título salta do nível ${anterior} para o nível ${nivel}: leitores de tela navegam pelos títulos ` +
            `e o salto sugere uma seção que falta. Usar h${anterior + 1} (e ajustar o tamanho no CSS) ` +
            "ou inserir o nível intermediário. Sem correção automática.",
          edicoes: [],
        });
      }
      anterior = nivel;
    }
    return achados;
  },
};
