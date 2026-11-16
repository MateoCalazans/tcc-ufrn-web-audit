import type { Achado, Rule } from "../../shared/types.js";
import { type Element, evidenciaTag, locTag, posicao, resolverUrl, urlBase } from "../html.js";

/**
 * `render-blocking-hint` (S15, ADR 015). A evidência vem do Lighthouse: os
 * itens da auditoria `render-blocking-insight` da execução mediana (ADR 009).
 * Cada URL de script listada que aparece no HTML bruto como `<script src>` sem
 * `async`/`defer` (e que não é módulo) gera uma recomendação. Folhas de estilo
 * da mesma auditoria ficam fora (escopo do roteiro: scripts). Sem relatório do
 * Lighthouse, não há evidência e a regra não acusa nada.
 *
 * Só recomenda: `defer` muda a ordem de execução em relação a scripts inline
 * e quebra `document.write`, e saber se o script é crítico exige o código.
 */

interface ItemBloqueio {
  url: string;
  totalBytes?: number;
  wastedMs?: number;
}

function itensDoLighthouse(audit: { score: number | null; details?: { items?: unknown[] } } | undefined): ItemBloqueio[] {
  if (audit === undefined || audit.score === 1) return [];
  return (audit.details?.items ?? []).filter(
    (i): i is ItemBloqueio => typeof (i as ItemBloqueio).url === "string",
  );
}

export const renderBlockingHint: Rule = {
  id: "render-blocking-hint",
  dimensao: "performance",
  severidade: "media",
  descricao: "Scripts que o Lighthouse aponta como bloqueantes usam defer/async quando não são críticos.",
  avaliar({ html, $, url, lighthouse }): Achado[] {
    const itens = new Map<string, ItemBloqueio>();
    for (const i of itensDoLighthouse(lighthouse?.audits["render-blocking-insight"])) {
      const u = resolverUrl(i.url, i.url);
      if (u !== null) itens.set(u, i);
    }
    if (itens.size === 0) return [];
    const base = urlBase($, url);

    const achados: Achado[] = [];
    for (const el of $("script[src]").toArray() as Element[]) {
      const a = el.attribs;
      if (a.async !== undefined || a.defer !== undefined || (a.type ?? "").trim().toLowerCase() === "module") continue;
      const alvo = resolverUrl(a.src!, base);
      const item = alvo === null ? undefined : itens.get(alvo);
      if (item === undefined) continue;
      const custo = [
        item.wastedMs !== undefined ? `${Math.round(item.wastedMs)} ms de bloqueio` : null,
        item.totalBytes !== undefined ? `${(item.totalBytes / 1024).toFixed(1)} KiB` : null,
      ].filter((x) => x !== null);
      achados.push({
        dimensao: "performance",
        severidade: "media",
        evidencia: evidenciaTag(html, el),
        posicao: posicao(locTag(el)),
        mensagem:
          `Script bloqueia a renderização segundo o Lighthouse${custo.length > 0 ? ` (${custo.join(", ")})` : ""}. ` +
          "Se não for necessário para o primeiro conteúdo, acrescentar defer (mantém a ordem entre scripts) " +
          "ou async (independente). Sem correção automática: conferir scripts inline que dependam dele e document.write.",
        edicoes: [],
      });
    }
    return achados;
  },
};
