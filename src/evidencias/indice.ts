/**
 * Montagem do `docs/artigo/indice-evidencias.md` (S19): ADRs, tags, diário e
 * resumo do uso do Claude. Puro: recebe os objetos já lidos e devolve Markdown.
 */
import type { Adr } from "./adrs.js";
import { type CategoriaDecisao, type Diario, type ResumoUso, resumirUso } from "./diarios.js";

export interface TagInfo {
  nome: string;
  commit: string;
  data: string;
  assunto: string;
}

export interface EntradaIndice {
  adrs: Adr[];
  adrsAusentes: string[];
  tags: TagInfo[];
  diarios: Diario[];
  /** Linha de proveniência (data, commit, comando). */
  proveniencia: string;
}

export const ROTULOS: Record<CategoriaDecisao, string> = {
  aceito: "Aceito",
  "aceito-inferido": "Aceito (inferido)",
  alterado: "Alterado",
  rejeitado: "Rejeitado",
  "nao-registrado": "Não registrado",
  outro: "Outro",
};

const ORDEM: CategoriaDecisao[] = ["aceito", "aceito-inferido", "alterado", "rejeitado", "nao-registrado", "outro"];

/** Escapa `|` dentro de células de tabela. */
function cel(s: string | null | undefined): string {
  return (s ?? "—").replace(/\|/g, "\\|");
}

/** Primeira frase, sem o ponto final (a coluna do índice é curta). */
export function primeiraFrase(s: string | null): string | null {
  if (s === null) return null;
  return s.split(/\.\s/)[0]!.replace(/\.$/, "").trim();
}

function pct(n: number, total: number): string {
  if (total === 0) return "—";
  return `${((100 * n) / total).toFixed(1).replace(".", ",")}%`;
}

/** Modelos citados no campo "Ferramenta" dos diários, com as sessões em que aparecem. */
export function modelosUsados(diarios: Diario[]): Array<{ modelo: string; sessoes: string[] }> {
  const mapa = new Map<string, string[]>();
  for (const d of diarios) {
    const m = /Claude Code \(([^)]*)\)/.exec(d.ferramenta ?? "");
    if (!m) continue;
    for (const nome of m[1]!.match(/(?:Opus|Sonnet|Haiku|Fable)\s+\d+(?:\.\d+)?/g) ?? []) {
      const l = mapa.get(nome) ?? [];
      l.push(d.sessao ?? d.arquivo);
      mapa.set(nome, l);
    }
  }
  return [...mapa].map(([modelo, sessoes]) => ({ modelo, sessoes }));
}

export function tabelaResumoUso(r: ResumoUso): string {
  const cats = ORDEM.filter((c) => c !== "outro" || r.total.outro > 0);
  const linhas = [
    `| Sessão | Itens | ${cats.map((c) => ROTULOS[c]).join(" | ")} |`,
    `|---|---|${cats.map(() => "---").join("|")}|`,
    ...r.porSessao.map((s) => `| ${s.sessao} | ${s.itens} | ${cats.map((c) => s.contagem[c]).join(" | ")} |`),
    `| **Total** | **${r.itens}** | ${cats.map((c) => `**${r.total[c]}**`).join(" | ")} |`,
    `| % do total | | ${cats.map((c) => pct(r.total[c], r.itens)).join(" | ")} |`,
  ];
  return linhas.join("\n");
}

export function montarIndice(e: EntradaIndice): string {
  const r = resumirUso(e.diarios);
  const avaliados = r.itens - r.total["nao-registrado"];
  const s: string[] = [];
  s.push("# Índice de evidências");
  s.push("");
  s.push("> Gerado por `npx tsx scripts/indice-evidencias.ts`. Não editar à mão: rodar o script de novo.");
  s.push(`> ${e.proveniencia}`);
  s.push("");
  s.push("Lista das decisões (ADRs), dos marcos de código (tags) e das entradas do diário,");
  s.push("com o resumo do uso do Claude Code tirado das tabelas \"Avaliação do que o Claude produziu\".");
  s.push("A ligação objetivo → evidência está em [rastreabilidade.md](rastreabilidade.md).");
  s.push("");

  s.push(`## ADRs (${e.adrs.length})`);
  s.push("");
  s.push("| ADR | Título | Data | Status | Adendos |");
  s.push("|---|---|---|---|---|");
  for (const a of e.adrs) {
    s.push(
      `| [${cel(a.numero)}](../decisoes/${a.arquivo}) | ${cel(a.titulo)} | ${cel(a.data)} | ${cel(a.status)} | ${a.adendos.length > 0 ? cel(a.adendos.join("; ")) : "—"} |`,
    );
  }
  if (e.adrsAusentes.length > 0) {
    s.push("");
    s.push(`Números sem arquivo: ${e.adrsAusentes.map((n) => `ADR ${n}`).join(", ")}.`);
  }
  s.push("");

  s.push(`## Tags (${e.tags.length})`);
  s.push("");
  s.push("| Tag | Commit | Data | Mensagem |");
  s.push("|---|---|---|---|");
  for (const t of e.tags) s.push(`| \`${t.nome}\` | \`${t.commit}\` | ${t.data} | ${cel(t.assunto)} |`);
  s.push("");

  s.push(`## Diário (${e.diarios.length} entradas)`);
  s.push("");
  s.push("| Sessão | Data | Título | Sessão do roteiro | Ferramenta | Itens avaliados |");
  s.push("|---|---|---|---|---|---|");
  for (const d of e.diarios) {
    s.push(
      `| [${cel(d.sessao)}](../diario/${d.arquivo}) | ${cel(d.data)} | ${cel(d.titulo)} | ${cel(primeiraFrase(d.sessaoDoRoteiro))} | ${cel(d.ferramenta)} | ${d.avaliacoes.length} |`,
    );
  }
  s.push("");

  s.push("## Uso do Claude Code (declaração de uso de IA)");
  s.push("");
  s.push(
    `${r.sessoes} sessões com diário, ${r.itens} itens na tabela de avaliação. ` +
      `Desses, ${r.total["nao-registrado"]} não têm decisão registrada ` +
      `(${r.sessoesSemRegistro.length > 0 ? `sessões ${r.sessoesSemRegistro.join(", ")}, com \`?\` na coluna` : "nenhuma sessão"}); ` +
      `os percentuais abaixo sobre os ${avaliados} itens com decisão registrada:`,
  );
  s.push("");
  for (const c of ORDEM) {
    if (c === "nao-registrado" || (c === "outro" && r.total.outro === 0)) continue;
    s.push(`- ${ROTULOS[c]}: ${r.total[c]} (${pct(r.total[c], avaliados)})`);
  }
  s.push("");
  s.push(
    "\"Aceito (inferido)\" é o item que o autor não comentou na sessão; a aceitação foi registrada pelo Claude por inferência e fica separada da aceitação explícita.",
  );
  s.push("");
  const modelos = modelosUsados(e.diarios);
  if (modelos.length > 0) {
    s.push(`Modelos registrados no campo "Ferramenta": ${modelos.map((m) => `${m.modelo} (${m.sessoes.join(", ")})`).join("; ")}.`);
    s.push("");
  }
  s.push(tabelaResumoUso(r));
  s.push("");
  return s.join("\n");
}
