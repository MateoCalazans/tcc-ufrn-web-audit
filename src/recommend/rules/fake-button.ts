import { type No, roleExplicito } from "../../analyze/semantics.js";
import type { Achado, Rule } from "../../shared/types.js";
import { type Element, evidenciaTag, locTag, oculto, posicao } from "../html.js";

/**
 * `fake-button` (S15, ADR 015). Mesma definição de "interativo falso" do índice
 * (ADR 011, item 2): `div`/`span` com `onclick`, sem `role` (não vazio) e sem
 * `tabindex`. Não recebe foco pelo teclado e não é anunciado como botão.
 * Só recomenda: trocar por `<button>` muda o estilo (o navegador aplica o
 * visual de botão), e só o mantenedor sabe se a ação navega (→ `<a href>`).
 */

export const fakeButton: Rule = {
  id: "fake-button",
  dimensao: "semantica",
  severidade: "media",
  descricao: "Elementos clicáveis são <button>/<a>, não div/span com onclick.",
  avaliar({ html, $ }): Achado[] {
    const achados: Achado[] = [];
    for (const el of $("div[onclick], span[onclick]").toArray() as Element[]) {
      if (roleExplicito(el as unknown as No) !== null || el.attribs.tabindex !== undefined || oculto($, el)) continue;
      achados.push({
        dimensao: "semantica",
        severidade: "media",
        evidencia: evidenciaTag(html, el),
        posicao: posicao(locTag(el)),
        mensagem:
          `<${el.tagName}> com onclick não recebe foco pelo teclado nem é anunciado como botão. ` +
          'Usar <button type="button"> (ou <a href> se a ação navega) e ajustar o CSS. ' +
          'Se não puder trocar: role="button", tabindex="0" e tratar Enter e Espaço. Sem correção automática.',
        edicoes: [],
      });
    }
    return achados;
  },
};
