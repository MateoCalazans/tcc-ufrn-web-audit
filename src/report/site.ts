import type { MetricasSite } from "../analyze/dataset.js";
import { PESOS_PROPOSTOS, SUBNOTAS } from "../analyze/indice.js";
import type { Meta } from "../shared/types.js";
import { esc, num, pagina, tabela } from "./html.js";

/**
 * Relatório HTML de um site (S13): notas, indicadores, subnotas do índice e
 * auditorias com falha. Lê só o `metrics.json` do módulo 2. Função pura.
 */

const n = (v: number | null | undefined, casas = 0) => `<span class="n">${num(v, casas)}</span>`;
const simNao = (v: boolean) => (v ? "sim" : "não");

function avisos(m: MetricasSite): string[] {
  const a: string[] = [];
  if (!m.conjuntoPrincipal) a.push("Fora do conjunto principal (ADR 009/012): não entra nas estatísticas do diagnóstico.");
  const exc = m.performance?.exclusao ?? m.semantica.exclusao;
  if (exc) a.push(`Excluído da análise: ${exc.motivo} (${exc.detalhe}).`);
  if (m.semantica.renderedComRefresh)
    a.push("O DOM renderizado é o stub de meta refresh, não a página de destino (ADR 010).");
  if (m.semantica.status !== "ok") a.push(`Semântica com status ${m.semantica.status}: sem índice (ADR 012).`);
  return a;
}

function secaoPerformance(m: MetricasSite): string {
  const p = m.performance;
  if (p === null) return "<h2>Performance</h2>\n<p>Sem Lighthouse para este site.</p>";
  const cab = `<p>Status: ${esc(p.status)} · execuções válidas: ${p.execucoesValidas} de 3 · execução usada: lh${esc(p.execucao ?? "—")} · amplitude da nota: ${num(p.amplitudePerformance)}</p>`;
  if (p.metricas === null) return `<h2>Performance</h2>\n${cab}`;
  const mt = p.metricas;
  const notas = tabela(
    ["Performance", "Acessibilidade", "Boas práticas", "SEO"],
    [[n(mt.notas.performance), n(mt.notas.accessibility), n(mt.notas["best-practices"]), n(mt.notas.seo)]],
  );
  const metricas = tabela(
    ["Métrica", "Valor"],
    [
      ["FCP (ms)", n(mt.fcpMs)],
      ["LCP (ms)", n(mt.lcpMs)],
      ["TBT (ms)", n(mt.tbtMs)],
      ["CLS", n(mt.cls, 3)],
      ["Speed Index (ms)", n(mt.speedIndexMs)],
      ["Peso total (KiB)", n(mt.pesoTotalBytes === null ? null : mt.pesoTotalBytes / 1024)],
      ["Requisições", n(mt.requisicoes)],
      ["JS não usado (KiB)", n(mt.jsNaoUsadoBytes === null ? null : mt.jsNaoUsadoBytes / 1024)],
      ["CSS não usado (KiB)", n(mt.cssNaoUsadoBytes === null ? null : mt.cssNaoUsadoBytes / 1024)],
    ],
  );
  return `<h2>Performance (Lighthouse, mobile, mediana de 3)</h2>\n${cab}\n${notas}\n${metricas}`;
}

function secaoAuditorias(m: MetricasSite): string {
  const a = m.performance?.auditoriasComFalha;
  if (!a || a.length === 0) return "<h2>Auditorias com falha</h2>\n<p>Nenhuma.</p>";
  const linhas = [...a]
    .sort((x, y) => x.categorias.join().localeCompare(y.categorias.join()) || x.id.localeCompare(y.id))
    .map((x) => [esc(x.categorias.join(", ")), `<code>${esc(x.id)}</code>`, esc(x.titulo ?? ""), n(x.score, 2)]);
  return `<h2>Auditorias com falha (${a.length})</h2>\n${tabela(["Categoria", "Auditoria", "Título", "Score"], linhas)}`;
}

function secaoSemantica(m: MetricasSite): string {
  const i = m.semantica.indicadores;
  if (i === null) return "<h2>Semântica</h2>\n<p>Sem indicadores.</p>";
  const lm = i.landmarks;
  const ind = tabela(
    ["Indicador", "Valor"],
    [
      ["Elementos no body", n(i.divSpan.total)],
      ["div + span (proporção)", `${n(i.divSpan.div + i.divSpan.span)} (${num(i.divSpan.proporcao, 3)})`],
      ["Landmarks: banner / navigation / main / contentinfo", `${lm.banner} / ${lm.navigation} / ${lm.main} / ${lm.contentinfo}`],
      ["Títulos: total / h1 / saltos", `${i.titulos.total} / ${i.titulos.h1} / ${i.titulos.saltos}`],
      ["lang", esc(i.metadados.lang ?? "ausente")],
      ["title / viewport / description", `${simNao(i.metadados.temTitle)} / ${simNao(i.metadados.temViewport)} / ${simNao(i.metadados.temDescription)}`],
      ["Imagens: total / sem alt", `${i.imagens.total} / ${i.imagens.semAlt}`],
      ["Campos: total / sem rótulo", `${i.campos.total} / ${i.campos.semLabel}`],
      ["Interativos falsos (de elementos com onclick)", `${i.interativosFalsos.falsos} de ${i.interativosFalsos.comOnclick}`],
      ["Elementos obsoletos (roteiro / WHATWG)", `${i.obsoletas.roteiro} / ${i.obsoletas.whatwg}`],
      ["Tabelas de layout (declarada / heurística)", `${i.tabelas.layoutDeclarada} / ${i.tabelas.layoutHeuristica}`],
      ["vnu: erros / avisos", m.semantica.vnu?.status === "ok" ? `${num(m.semantica.vnu.erros)} / ${num(m.semantica.vnu.avisos)}` : esc(m.semantica.vnu?.status ?? "—")],
    ],
  );
  const idx = m.indice;
  const sub =
    idx === null
      ? "<p>Índice não calculado.</p>"
      : `<p><strong>Índice de semântica: ${num(idx.indice, 1)}</strong> (pesos iguais: ${num(idx.indicePesosIguais, 1)})</p>\n` +
        tabela(
          ["Subnota", "Peso", "Nota (0–100)"],
          SUBNOTAS.map((s) => [esc(s), n(PESOS_PROPOSTOS[s]), idx.subnotas[s] === null ? "N/A" : n(idx.subnotas[s], 1)]),
        );
  return `<h2>Semântica HTML</h2>\n${ind}\n<h3>Índice (ADR 003)</h3>\n${sub}`;
}

export function relatorioSite(m: MetricasSite, meta: Meta): string {
  const av = avisos(m);
  const corpo = [
    `<p><a href="../index.html">← Panorama</a></p>`,
    `<h1>${esc(m.id)}</h1>`,
    `<p><a href="${esc(m.url)}">${esc(m.url)}</a> · tipo: ${esc(m.contexto.tipo ?? "—")} · tecnologia: ${esc(m.contexto.tecnologia ?? "—")}</p>`,
    av.length ? `<div class="aviso"><ul>${av.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "",
    secaoPerformance(m),
    secaoSemantica(m),
    secaoAuditorias(m),
  ]
    .filter(Boolean)
    .join("\n");
  return pagina(`${m.id} — relatório`, corpo, meta);
}
