import type { Achado, Rule } from "../../shared/types.js";
import { type Element, evidenciaTag, locTag, posicao, resolverUrl, urlBase } from "../html.js";

/**
 * `render-blocking-hint` (S15, ADR 015 e adendo). A evidência vem do
 * Lighthouse: os itens da auditoria `render-blocking-insight` da execução
 * mediana (ADR 009). Cada URL listada que aparece no HTML bruto gera uma
 * recomendação:
 *   - `<script src>` sem `async`/`defer` e que não é módulo;
 *   - `<link rel="stylesheet" href>` (adendo da S15: no conjunto principal, a
 *     maioria dos recursos bloqueantes listados é CSS).
 * Sem relatório do Lighthouse, não há evidência e a regra não acusa nada.
 *
 * Só recomenda: `defer` muda a ordem de execução em relação a scripts inline
 * e quebra `document.write`; adiar uma folha de estilo exige saber qual CSS é
 * crítico para a primeira tela. Nos dois casos é preciso conhecer o site.
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

/** `true` se o `rel` contém o token `stylesheet` (sem diferenciar maiúsculas). */
function ehFolhaDeEstilo(el: Element): boolean {
  return el.tagName === "link" && (el.attribs.rel ?? "").toLowerCase().split(/\s+/).includes("stylesheet");
}

/** `true` se é um script clássico síncrono (sem `async`/`defer`, não módulo). */
function ehScriptSincrono(el: Element): boolean {
  const a = el.attribs;
  return el.tagName === "script" && a.async === undefined && a.defer === undefined && (a.type ?? "").trim().toLowerCase() !== "module";
}

const CONSELHO_SCRIPT =
  "Se não for necessário para o primeiro conteúdo, acrescentar defer (mantém a ordem entre scripts) " +
  "ou async (independente). Sem correção automática: conferir scripts inline que dependam dele e document.write.";

const CONSELHO_CSS =
  "Levar para dentro do HTML (<style>) só o CSS da primeira tela e carregar o restante sem bloquear; " +
  'folha que não é para tela usa o atributo media (ex.: media="print"); folha de outra página ou ' +
  "componente não usado aqui pode sair. Sem correção automática: exige saber qual CSS é crítico.";

export const renderBlockingHint: Rule = {
  id: "render-blocking-hint",
  dimensao: "performance",
  severidade: "media",
  descricao: "Scripts e folhas de estilo que o Lighthouse aponta como bloqueantes são adiados quando não são críticos.",
  avaliar({ html, $, url, lighthouse }): Achado[] {
    const itens = new Map<string, ItemBloqueio>();
    for (const i of itensDoLighthouse(lighthouse?.audits["render-blocking-insight"])) {
      const u = resolverUrl(i.url, i.url);
      if (u !== null) itens.set(u, i);
    }
    if (itens.size === 0) return [];
    const base = urlBase($, url);

    const achados: Achado[] = [];
    for (const el of $("script[src], link[href]").toArray() as Element[]) {
      const css = ehFolhaDeEstilo(el);
      if (!css && !ehScriptSincrono(el)) continue;
      const alvo = resolverUrl((css ? el.attribs.href : el.attribs.src)!, base);
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
          `${css ? "Folha de estilo" : "Script"} bloqueia a renderização segundo o Lighthouse` +
          `${custo.length > 0 ? ` (${custo.join(", ")})` : ""}. ${css ? CONSELHO_CSS : CONSELHO_SCRIPT}`,
        edicoes: [],
      });
    }
    return achados;
  },
};
