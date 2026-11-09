/**
 * Montagem do corpus (módulo 0, S04). Funções **puras**: juntam a normalização
 * (S02), a sondagem (S03) e a classificação (S04) em linhas de `corpus.csv`,
 * e produzem o relatório `docs/resultados/triagem.md` e a amostra de revisão
 * manual. O IO (ler CSVs/HTML, gravar arquivos) fica em `index.ts`.
 */

import { createHash } from "node:crypto";

import type { CorpusEntry, ExclusionReason, Meta } from "../shared/types.js";
import { detectTecnologia, detectTipo, extractTitle } from "./classify.js";
import type { Funnel, NormalizedRow } from "./normalize.js";

/** Linha do corpus: o contrato `CorpusEntry` + colunas de auditoria da classificação. */
export interface CorpusRow extends CorpusEntry {
  titulo: string;
  evidenciaTipo: string;
  evidenciaTecnologia: string;
  /** Problema de certificado contornado na sondagem (ex.: `cert-expirado`), ou `""`. */
  tlsInvalido: string;
}

export const CORPUS_HEADER = [
  "id",
  "url_original",
  "url_final",
  "status",
  "incluido",
  "motivo_exclusao",
  "tipo",
  "tecnologia",
  "data_triagem",
  "titulo",
  "evidencia_tipo",
  "evidencia_tecnologia",
  "tls_invalido",
];

export function corpusRowToCsv(r: CorpusRow): string[] {
  return [
    r.id,
    r.urlOriginal,
    r.urlFinal ?? "",
    r.status === null ? "" : String(r.status),
    String(r.incluido),
    r.motivoExclusao ?? "",
    r.tipo,
    r.tecnologia,
    r.dataTriagem,
    r.titulo,
    r.evidenciaTipo,
    r.evidenciaTecnologia,
    r.tlsInvalido,
  ];
}

/** Linha de `probed.csv` já lida (colunas como strings). */
export type ProbedCsvRow = Record<string, string>;

/**
 * Monta o corpus: uma linha por host **único** após a unificação (mantidos e
 * descartados por infraestrutura), na ordem da lista. Hosts mantidos mas
 * ausentes da sondagem (rodada com `--limit`) não entram — `buildCorpus`
 * devolve quantos ficaram de fora para o relatório avisar.
 *
 * Só os incluídos são classificados; excluídos ficam com `tipo`/`tecnologia`
 * vazios (não há HTML confiável — e, por robots, nem guardado).
 */
export function buildCorpus(params: {
  normalized: NormalizedRow[];
  probed: ProbedCsvRow[];
  htmlDe: (host: string) => string | null;
  dataTriagem: string;
}): { rows: CorpusRow[]; naoSondados: number } {
  const { normalized, probed, htmlDe, dataTriagem } = params;
  const sondaPorHost = new Map(probed.map((p) => [p["host"] ?? "", p]));
  const rows: CorpusRow[] = [];
  let naoSondados = 0;

  for (const n of normalized) {
    if (n.situacao === "unificado") continue;

    const base = {
      id: n.hostNormalizado,
      urlOriginal: n.linhaOriginal,
      dataTriagem,
      tipo: "",
      tecnologia: "",
      titulo: "",
      evidenciaTipo: "",
      evidenciaTecnologia: "",
      tlsInvalido: "",
    };

    if (n.situacao === "descartado") {
      rows.push({ ...base, urlFinal: null, status: null, incluido: false, motivoExclusao: "infra" });
      continue;
    }

    const p = sondaPorHost.get(n.hostNormalizado);
    if (p === undefined) {
      naoSondados++;
      continue;
    }

    const incluido = p["incluido"] === "true";
    const status = p["status"] ? Number(p["status"]) : null;
    const row: CorpusRow = {
      ...base,
      urlFinal: p["url_final"] || null,
      status,
      incluido,
      motivoExclusao: (p["motivo_exclusao"] || null) as ExclusionReason | null,
      tlsInvalido: p["tls_invalido"] ?? "",
    };

    if (incluido) {
      const html = htmlDe(n.hostNormalizado);
      if (html !== null) {
        const titulo = extractTitle(html);
        const tipo = detectTipo(n.hostNormalizado, titulo);
        const tec = detectTecnologia(html);
        row.titulo = titulo;
        row.tipo = tipo.valor;
        row.evidenciaTipo = tipo.evidencia;
        row.tecnologia = tec.valor;
        row.evidenciaTecnologia = tec.evidencia;
      } else {
        // Incluído sem HTML guardado: não classifica (não chuta).
        row.tipo = "outro";
        row.evidenciaTipo = "html indisponível";
        row.tecnologia = "";
        row.evidenciaTecnologia = "html indisponível";
      }
    }
    rows.push(row);
  }
  return { rows, naoSondados };
}

/** Contagem por chave, em ordem decrescente (empate: alfabética). */
export function contar(valores: string[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Amostra determinística de `n` incluídos para revisão manual: ordena pelo
 * SHA-1 do id (pseudoaleatório, reprodutível, sem semente a registrar).
 */
export function amostraRevisao(rows: CorpusRow[], n: number): CorpusRow[] {
  const hash = (id: string) => createHash("sha1").update(id).digest("hex");
  return rows
    .filter((r) => r.incluido)
    .map((r) => ({ r, h: hash(r.id) }))
    .sort((a, b) => a.h.localeCompare(b.h))
    .slice(0, n)
    .map((x) => x.r);
}

export const REVISAO_HEADER = [
  "id",
  "url_final",
  "titulo",
  "tipo",
  "evidencia_tipo",
  "tipo_correto",
  "tecnologia",
  "evidencia_tecnologia",
  "tecnologia_correta",
  "observacao",
];

export function revisaoRowToCsv(r: CorpusRow): string[] {
  return [r.id, r.urlFinal ?? "", r.titulo, r.tipo, r.evidenciaTipo, "", r.tecnologia, r.evidenciaTecnologia, "", ""];
}

function pct(n: number, total: number): string {
  return total === 0 ? "—" : `${((100 * n) / total).toFixed(1).replace(".", ",")}%`;
}

function tabela(titulo: string, pares: Array<[string, number]>, total: number): string {
  const linhas = pares.map(([k, v]) => `| ${k || "(vazio)"} | ${v} | ${pct(v, total)} |`);
  return [`| ${titulo} | n | % |`, "|---|---:|---:|", ...linhas, `| **total** | **${total}** | |`].join("\n");
}

/** Relatório `docs/resultados/triagem.md` (números vêm todos dos dados). */
export function renderTriagemMd(params: {
  funnel: Funnel;
  rows: CorpusRow[];
  naoSondados: number;
  dataTriagem: string;
  meta: Meta;
}): string {
  const { funnel, rows, naoSondados, dataTriagem, meta } = params;
  const sondados = rows.filter((r) => r.motivoExclusao !== "infra");
  const incluidos = rows.filter((r) => r.incluido);
  const excluidosSonda = sondados.filter((r) => !r.incluido);

  const out: string[] = [];
  out.push("# Resultados da triagem (módulo 0)");
  out.push("");
  out.push("> Gerado por `npm run triage -- --classify`. Não editar à mão: rode o comando de novo.");
  out.push("");
  out.push(`- **Data da sondagem:** ${dataTriagem}`);
  out.push(`- **Gerado em:** ${meta.generatedAt}`);
  out.push(`- **Commit:** \`${meta.gitCommit ?? "(sem git)"}\`${meta.gitDirty ? " (com alterações não commitadas)" : ""}`);
  out.push(`- **Node:** ${meta.toolVersions.node ?? "?"}`);
  if (naoSondados > 0) {
    out.push("");
    out.push(
      `> ⚠️ **Sondagem parcial:** ${naoSondados} host(s) mantidos na normalização não foram sondados ` +
        "(rodada com `--limit`). Estes números NÃO são do corpus completo.",
    );
  }
  out.push("");
  out.push("## Funil");
  out.push("");
  out.push("| Etapa | n |");
  out.push("|---|---:|");
  out.push(`| Linhas da lista | ${funnel.linhas} |`);
  out.push(`| Únicos (sem duplicata exata) | ${funnel.unicos} |`);
  out.push(`| Unificados (www / .edu.br / malformados) | ${funnel.unificados} |`);
  out.push(`| Após filtro de infraestrutura | ${funnel.aposFiltro} |`);
  out.push(`| Sondados | ${sondados.length} |`);
  out.push(`| **Incluídos no corpus** | **${incluidos.length}** |`);
  out.push("");
  const comTls = incluidos.filter((r) => r.tlsInvalido !== "");
  if (comTls.length > 0) {
    out.push(
      `Dos incluídos, **${comTls.length}** têm certificado TLS inválido (lidos sem verificar o certificado, ` +
        "pois o conteúdo é público e o navegador permite o acesso):",
    );
    out.push("");
    out.push(tabela("Problema de certificado", contar(comTls.map((r) => r.tlsInvalido)), comTls.length));
    out.push("");
  }
  out.push("## Exclusões na sondagem (ADR 002)");
  out.push("");
  out.push(tabela("Motivo", contar(excluidosSonda.map((r) => r.motivoExclusao ?? "")), excluidosSonda.length));
  out.push("");
  out.push("## Incluídos por tipo");
  out.push("");
  out.push(
    "Heurística de título + hostname (`src/triage/classify.ts`). `outro` = sem sinal claro (a heurística não chuta).",
  );
  out.push("");
  out.push(tabela("Tipo", contar(incluidos.map((r) => r.tipo)), incluidos.length));
  out.push("");
  out.push("## Incluídos por tecnologia");
  out.push("");
  out.push(
    "`estatico` = nenhuma assinatura de CMS ou framework JS detectada no HTML da página inicial " +
      "(não garante que o site seja estático). `outro-cms` = `meta generator` de outra ferramenta.",
  );
  out.push("");
  out.push(tabela("Tecnologia", contar(incluidos.map((r) => r.tecnologia)), incluidos.length));
  out.push("");
  out.push("## Tipo × tecnologia (incluídos)");
  out.push("");
  const tipos = contar(incluidos.map((r) => r.tipo)).map(([k]) => k);
  const tecs = contar(incluidos.map((r) => r.tecnologia)).map(([k]) => k);
  out.push(`| Tipo | ${tecs.join(" | ")} |`);
  out.push(`|---|${tecs.map(() => "---:").join("|")}|`);
  for (const t of tipos) {
    const cel = tecs.map((tec) => String(incluidos.filter((r) => r.tipo === t && r.tecnologia === tec).length));
    out.push(`| ${t} | ${cel.join(" | ")} |`);
  }
  out.push("");
  return out.join("\n");
}
