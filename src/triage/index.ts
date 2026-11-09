import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import pLimit from "p-limit";

import { readCsvObjects, writeCsv } from "../shared/csv.js";
import { createLogger } from "../shared/logger.js";
import { buildMeta } from "../shared/meta.js";
import {
  amostraRevisao,
  buildCorpus,
  contar,
  CORPUS_HEADER,
  corpusRowToCsv,
  renderTriagemMd,
  REVISAO_HEADER,
  revisaoRowToCsv,
} from "./corpus.js";
import { normalizeHost, normalizeList, parseLines, type NormalizedRow } from "./normalize.js";
import { createRealProbeDeps, probeHost, type ProbeDeps, type ProbeResult } from "./probe.js";

/**
 * Módulo 0 — Triagem. Três modos:
 *   - padrão (`npm run triage`): normalização da lista (S02).
 *   - `--probe` (`npm run triage -- --probe [--limit N]`): sondagem DNS/HTTP/
 *     robots dos hosts mantidos (S03), gravando `data/interim/probed.csv` e o
 *     HTML dos incluídos em `data/interim/triage-html/` (S04).
 *   - `--classify` (`npm run triage -- --classify`): classificação e corpus
 *     (S04) — **offline**, lê só os arquivos da sondagem. Grava
 *     `data/corpus.csv`, `docs/resultados/triagem.md` e a amostra de revisão.
 * Caminhos relativos à raiz (os scripts rodam a partir dela via `npm run`).
 */
const INPUT_PATH = "data/input/registros-ufrn.txt";
const NORMALIZED_PATH = "data/interim/normalized.csv";
const PROBED_PATH = "data/interim/probed.csv";
const PROBED_META_PATH = "data/interim/probed.meta.json";
const HTML_DIR = "data/interim/triage-html";
const CORPUS_PATH = "data/corpus.csv";
const TRIAGEM_MD_PATH = "docs/resultados/triagem.md";
const REVISAO_PATH = "docs/resultados/revisao-classificacao.csv";
const TAMANHO_AMOSTRA_REVISAO = 30;
const REVISAO_RESSONDAGEM_PATH = "docs/resultados/revisao-ressondagem.csv";

const htmlPath = (host: string) => join(HTML_DIR, `${host}.html.gz`);

// --------------------------------------------------------------------------
// Modo normalização (S02)
// --------------------------------------------------------------------------

const NORM_HEADER = ["linha_original", "host_normalizado", "situacao", "motivo", "detalhe"];

function normRow(r: NormalizedRow): string[] {
  return [r.linhaOriginal, r.hostNormalizado, r.situacao, r.motivo, r.detalhe];
}

function runNormalize(): void {
  const log = createLogger("triage");

  const text = readFileSync(INPUT_PATH, "utf8");
  const lines = parseLines(text);
  const { rows, funnel } = normalizeList(lines);

  writeCsv(NORMALIZED_PATH, NORM_HEADER, rows.map(normRow));

  const descartados = rows.filter((r) => r.situacao === "descartado").length;
  const unificadosRows = rows.filter((r) => r.situacao === "unificado").length;

  log.info("normalização concluída", {
    input: INPUT_PATH,
    output: NORMALIZED_PATH,
    funnel,
    descartadosInfra: descartados,
    linhasUnificadas: unificadosRows,
  });

  const out = process.stdout;
  out.write(`Normalização da lista — ${INPUT_PATH}\n`);
  out.write(`  linhas         ${funnel.linhas}\n`);
  out.write(`  únicos         ${funnel.unicos}\t(-${funnel.linhas - funnel.unicos} duplicatas exatas)\n`);
  out.write(
    `  unificados     ${funnel.unificados}\t(-${funnel.unicos - funnel.unificados} por www/edu.br/malformados)\n`,
  );
  out.write(
    `  após filtro    ${funnel.aposFiltro}\t(-${funnel.unificados - funnel.aposFiltro} de infraestrutura)\n`,
  );
  out.write(`CSV gravado em ${NORMALIZED_PATH}\n`);
}

// --------------------------------------------------------------------------
// Modo sondagem (S03)
// --------------------------------------------------------------------------

const PROBE_HEADER = [
  "host",
  "incluido",
  "motivo_exclusao",
  "detalhe",
  "url_final",
  "status",
  "scheme",
  "cadeia_redirects",
  "tls_invalido",
];

function probeRow(r: ProbeResult): string[] {
  return [
    r.host,
    String(r.incluido),
    r.motivoExclusao ?? "",
    r.detalhe,
    r.urlFinal ?? "",
    r.status === null ? "" : String(r.status),
    r.scheme ?? "",
    r.redirectChain.map((h) => `${h.status} ${h.to}`).join(" -> "),
    r.tlsInvalido,
  ];
}

/** Host final normalizado de uma URL, ou `null` se inválida. */
function hostFinalDe(url: string | null): string | null {
  if (!url) return null;
  try {
    return normalizeHost(new URL(url).host);
  } catch {
    return null;
  }
}

/** Hosts a sondar: os `mantido` da normalização, na ordem de entrada. */
function keptHosts(): string[] {
  const text = readFileSync(INPUT_PATH, "utf8");
  const { rows } = normalizeList(parseLines(text));
  return rows.filter((r) => r.situacao === "mantido").map((r) => r.hostNormalizado);
}

/**
 * Marca como `duplicata-redirect` os hosts que, após redirects, caem num host
 * final já incluído por outra entrada. O primeiro a ocupar um host final vence;
 * os seguintes viram duplicata. Opera sobre os resultados já sondados.
 * `donosIniciais` (host final → host) pré-ocupa destinos — usado na
 * ressondagem, em que os incluídos da rodada anterior têm precedência.
 */
function resolveDuplicates(results: ProbeResult[], donosIniciais = new Map<string, string>()): void {
  const donoPorHostFinal = new Map(donosIniciais);
  for (const r of results) {
    if (!r.incluido) continue;
    const hostFinal = hostFinalDe(r.urlFinal);
    if (hostFinal === null) continue;
    const dono = donoPorHostFinal.get(hostFinal);
    if (dono === undefined) {
      donoPorHostFinal.set(hostFinal, r.host);
    } else if (dono !== r.host) {
      r.incluido = false;
      r.motivoExclusao = "duplicata-redirect";
      r.detalhe = `mesmo destino de ${dono} (${hostFinal})`;
    }
  }
}

/** Sonda uma lista de hosts com concorrência 2, logando cada um. */
async function probeMany(hosts: string[], deps: ProbeDeps): Promise<ProbeResult[]> {
  const log = createLogger("triage");
  const out = process.stdout;
  // Concorrência global de 2 (o HostLimiter interno também espaça por host).
  const gate = pLimit(2);
  let feitos = 0;
  return Promise.all(
    hosts.map((host) =>
      gate(async () => {
        const r = await probeHost(host, deps);
        feitos++;
        if (feitos % 10 === 0 || feitos === hosts.length) {
          out.write(`  ${feitos}/${hosts.length} sondados\n`);
        }
        log.info("host sondado", {
          host,
          incluido: r.incluido,
          motivo: r.motivoExclusao,
          detalhe: r.detalhe,
          urlFinal: r.urlFinal,
          status: r.status,
          tlsInvalido: r.tlsInvalido,
        });
        return r;
      }),
    ),
  );
}

/** Grava o HTML (gzip) dos incluídos — insumo offline da classificação. */
function gravarHtml(results: ProbeResult[]): number {
  mkdirSync(HTML_DIR, { recursive: true });
  let n = 0;
  for (const r of results) {
    if (!r.incluido || r.html === null) continue;
    writeFileSync(htmlPath(r.host), gzipSync(r.html));
    n++;
  }
  return n;
}

/** Imprime e loga o resumo por veredito de um conjunto de linhas do CSV. */
function resumo(titulo: string, linhas: Array<{ incluido: boolean; motivo: string; tls: string }>): void {
  const log = createLogger("triage");
  const out = process.stdout;
  const incluidos = linhas.filter((l) => l.incluido).length;
  const tls = linhas.filter((l) => l.incluido && l.tls !== "").length;
  const porMotivo = contar(linhas.filter((l) => !l.incluido).map((l) => l.motivo || "(sem motivo)"));

  log.info(titulo, { total: linhas.length, incluidos, incluidosTlsInvalido: tls, porMotivo: Object.fromEntries(porMotivo) });

  out.write(`\n${titulo}\n`);
  out.write(`  sondados       ${linhas.length}\n`);
  out.write(`  incluídos      ${incluidos}${tls > 0 ? ` (${tls} com certificado inválido)` : ""}\n`);
  for (const [motivo, n] of porMotivo) out.write(`  excluído ${motivo.padEnd(18)} ${n}\n`);
}

async function runProbe(limit: number | null, deps: ProbeDeps): Promise<void> {
  const out = process.stdout;

  let hosts = keptHosts();
  if (limit !== null) hosts = hosts.slice(0, limit);

  out.write(`Sondagem — ${hosts.length} host(s)${limit !== null ? ` (--limit ${limit})` : ""}\n`);
  const results = await probeMany(hosts, deps);

  resolveDuplicates(results);
  writeCsv(PROBED_PATH, PROBE_HEADER, results.map(probeRow));

  // A pasta de HTML é recriada a cada sondagem completa para não misturar rodadas.
  rmSync(HTML_DIR, { recursive: true, force: true });
  const htmlGravados = gravarHtml(results);

  const collectedAt = new Date().toISOString();
  writeFileSync(
    PROBED_META_PATH,
    `${JSON.stringify({ meta: { ...buildMeta(), collectedAt }, total: results.length, limit, htmlGravados, ressondagens: [] }, null, 2)}\n`,
    "utf8",
  );

  resumo(
    "Resumo da sondagem",
    results.map((r) => ({ incluido: r.incluido, motivo: r.motivoExclusao ?? "", tls: r.tlsInvalido })),
  );
  out.write(`CSV gravado em ${PROBED_PATH}; HTML de ${htmlGravados} incluído(s) em ${HTML_DIR}/\n`);
}

const REVISAO_RESSONDAGEM_HEADER = [
  "host",
  "incluido_agora",
  "motivo_exclusao",
  "causa",
  "tls_invalido",
  "url_final",
  "abriu_no_navegador",
  "rede_do_teste",
  "observacao",
];

/**
 * Ressonda só os hosts excluídos por `motivo` na rodada anterior e mescla o
 * resultado no `probed.csv` (os demais hosts ficam intactos). Os incluídos da
 * rodada anterior têm precedência em `duplicata-redirect`. Gera um CSV de
 * revisão manual com uma linha por host ressondado.
 */
async function runRetry(motivo: string, deps: ProbeDeps): Promise<void> {
  const out = process.stdout;
  if (!existsSync(PROBED_PATH) || !existsSync(PROBED_META_PATH)) {
    throw new Error(`faltam ${PROBED_PATH} / ${PROBED_META_PATH}: rode antes \`npm run triage -- --probe\``);
  }

  const existentes = readCsvObjects(PROBED_PATH);
  const alvo = existentes.filter((e) => e["motivo_exclusao"] === motivo).map((e) => e["host"] ?? "");
  out.write(`Ressondagem dos excluídos por "${motivo}" — ${alvo.length} host(s)\n`);

  const results = await probeMany(alvo, deps);

  const donos = new Map<string, string>();
  for (const e of existentes) {
    const hf = e["incluido"] === "true" ? hostFinalDe(e["url_final"] ?? null) : null;
    if (hf !== null) donos.set(hf, e["host"] ?? "");
  }
  resolveDuplicates(results, donos);

  const novoPorHost = new Map(results.map((r) => [r.host, probeRow(r)]));
  const linhas = existentes.map((e) => novoPorHost.get(e["host"] ?? "") ?? PROBE_HEADER.map((h) => e[h] ?? ""));
  writeCsv(PROBED_PATH, PROBE_HEADER, linhas);
  const htmlGravados = gravarHtml(results);

  const metaArquivo = JSON.parse(readFileSync(PROBED_META_PATH, "utf8")) as Record<string, unknown>;
  const ressondagens = Array.isArray(metaArquivo["ressondagens"]) ? (metaArquivo["ressondagens"] as unknown[]) : [];
  ressondagens.push({
    meta: { ...buildMeta(), collectedAt: new Date().toISOString() },
    motivo,
    hosts: alvo.length,
    recuperados: results.filter((r) => r.incluido).length,
  });
  writeFileSync(PROBED_META_PATH, `${JSON.stringify({ ...metaArquivo, ressondagens }, null, 2)}\n`, "utf8");

  writeCsv(
    REVISAO_RESSONDAGEM_PATH,
    REVISAO_RESSONDAGEM_HEADER,
    results.map((r) => [
      r.host,
      String(r.incluido),
      r.motivoExclusao ?? "",
      r.incluido ? "" : r.detalhe,
      r.tlsInvalido,
      r.urlFinal ?? `https://${r.host}/`,
      "",
      "",
      "",
    ]),
  );

  resumo(
    "Resumo da ressondagem",
    results.map((r) => ({ incluido: r.incluido, motivo: r.motivoExclusao ?? "", tls: r.tlsInvalido })),
  );

  const causas = contar(
    results.filter((r) => r.motivoExclusao === "timeout").flatMap((r) => r.detalhe.split("; ").map((c) => c.replace(/^[^:]+: /, ""))),
  );
  out.write(`  causas das falhas (por tentativa): ${causas.map(([k, v]) => `${k}=${v}`).join(", ")}\n`);
  out.write(`Mesclado em ${PROBED_PATH}; +${htmlGravados} HTML; revisão em ${REVISAO_RESSONDAGEM_PATH}\n`);
}

// --------------------------------------------------------------------------
// Modo classificação + corpus (S04) — offline
// --------------------------------------------------------------------------

function runClassify(): void {
  const log = createLogger("triage");
  const out = process.stdout;

  if (!existsSync(PROBED_PATH) || !existsSync(PROBED_META_PATH)) {
    throw new Error(`faltam ${PROBED_PATH} / ${PROBED_META_PATH}: rode antes \`npm run triage -- --probe\``);
  }

  const { rows: normalized, funnel } = normalizeList(parseLines(readFileSync(INPUT_PATH, "utf8")));
  const probed = readCsvObjects(PROBED_PATH);
  const probedMeta = JSON.parse(readFileSync(PROBED_META_PATH, "utf8")) as { meta: { collectedAt: string } };
  const dataTriagem = probedMeta.meta.collectedAt.slice(0, 10);

  const htmlDe = (host: string): string | null => {
    const p = htmlPath(host);
    return existsSync(p) ? gunzipSync(readFileSync(p)).toString("utf8") : null;
  };

  const { rows, naoSondados } = buildCorpus({ normalized, probed, htmlDe, dataTriagem });
  const meta = buildMeta();

  writeCsv(CORPUS_PATH, CORPUS_HEADER, rows.map(corpusRowToCsv));
  mkdirSync(dirname(TRIAGEM_MD_PATH), { recursive: true });
  writeFileSync(TRIAGEM_MD_PATH, renderTriagemMd({ funnel, rows, naoSondados, dataTriagem, meta }), "utf8");
  writeCsv(REVISAO_PATH, REVISAO_HEADER, amostraRevisao(rows, TAMANHO_AMOSTRA_REVISAO).map(revisaoRowToCsv));

  const incluidos = rows.filter((r) => r.incluido);
  const porTipo = contar(incluidos.map((r) => r.tipo));
  const porTec = contar(incluidos.map((r) => r.tecnologia));

  log.info("classificação concluída", {
    output: CORPUS_PATH,
    linhas: rows.length,
    incluidos: incluidos.length,
    naoSondados,
    dataTriagem,
    porTipo: Object.fromEntries(porTipo),
    porTecnologia: Object.fromEntries(porTec),
  });

  out.write(`Classificação (S04) — sondagem de ${dataTriagem}\n`);
  if (naoSondados > 0) {
    out.write(`  ⚠ sondagem parcial: ${naoSondados} host(s) mantidos não sondados (rodada com --limit)\n`);
  }
  out.write(`  linhas no corpus ${rows.length}\n  incluídos        ${incluidos.length}\n`);
  out.write(`  por tipo:        ${porTipo.map(([k, v]) => `${k}=${v}`).join(", ")}\n`);
  out.write(`  por tecnologia:  ${porTec.map(([k, v]) => `${k}=${v}`).join(", ")}\n`);
  out.write(`Gravados: ${CORPUS_PATH}, ${TRIAGEM_MD_PATH}, ${REVISAO_PATH}\n`);
}

// --------------------------------------------------------------------------
// Entrada
// --------------------------------------------------------------------------

function parseLimit(argv: string[]): number | null {
  const i = argv.indexOf("--limit");
  if (i === -1) return null;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--limit requer um inteiro positivo (recebido: ${argv[i + 1] ?? "vazio"})`);
  }
  return n;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const iRetry = argv.indexOf("--retry");
  if (iRetry !== -1) {
    const motivo = argv[iRetry + 1];
    if (!motivo || motivo.startsWith("--")) throw new Error("--retry requer um motivo (ex.: --retry timeout)");
    await runRetry(motivo, createRealProbeDeps());
  } else if (argv.includes("--probe")) {
    await runProbe(parseLimit(argv), createRealProbeDeps());
  } else if (argv.includes("--classify")) {
    runClassify();
  } else {
    runNormalize();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`);
  process.exitCode = 1;
});
