import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import pLimit from "p-limit";

import { createLogger } from "../shared/logger.js";
import { normalizeHost, normalizeList, parseLines, type NormalizedRow } from "./normalize.js";
import { createRealProbeDeps, probeHost, type ProbeDeps, type ProbeResult } from "./probe.js";

/**
 * Módulo 0 — Triagem. Dois modos:
 *   - padrão (`npm run triage`): normalização da lista (S02).
 *   - `--probe` (`npm run triage -- --probe [--limit N]`): sondagem DNS/HTTP/
 *     robots dos hosts mantidos (S03), gravando `data/interim/probed.csv`.
 * Caminhos relativos à raiz (os scripts rodam a partir dela via `npm run`).
 */
const INPUT_PATH = "data/input/registros-ufrn.txt";
const NORMALIZED_PATH = "data/interim/normalized.csv";
const PROBED_PATH = "data/interim/probed.csv";

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function writeCsv(path: string, header: string[], rows: string[][]): void {
  const lines = [header.join(","), ...rows.map((r) => r.map(csvField).join(","))];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

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
  ];
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
 */
function resolveDuplicates(results: ProbeResult[]): void {
  const donoPorHostFinal = new Map<string, string>();
  for (const r of results) {
    if (!r.incluido || r.urlFinal === null) continue;
    let hostFinal: string;
    try {
      hostFinal = normalizeHost(new URL(r.urlFinal).host);
    } catch {
      continue;
    }
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

async function runProbe(limit: number | null, deps: ProbeDeps): Promise<void> {
  const log = createLogger("triage");
  const out = process.stdout;

  let hosts = keptHosts();
  if (limit !== null) hosts = hosts.slice(0, limit);

  out.write(`Sondagem (S03) — ${hosts.length} host(s)${limit !== null ? ` (--limit ${limit})` : ""}\n`);

  // Concorrência global de 2 (o HostLimiter interno também espaça por host).
  const gate = pLimit(2);
  let feitos = 0;
  const results = await Promise.all(
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
          urlFinal: r.urlFinal,
          status: r.status,
        });
        return r;
      }),
    ),
  );

  resolveDuplicates(results);
  writeCsv(PROBED_PATH, PROBE_HEADER, results.map(probeRow));

  // Resumo por veredito (vai para o diário / Resultados).
  const incluidos = results.filter((r) => r.incluido).length;
  const porMotivo = new Map<string, number>();
  for (const r of results) {
    if (r.incluido) continue;
    const m = r.motivoExclusao ?? "(sem motivo)";
    porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
  }

  log.info("sondagem concluída", {
    output: PROBED_PATH,
    total: results.length,
    incluidos,
    porMotivo: Object.fromEntries(porMotivo),
  });

  out.write(`\nResumo da sondagem\n`);
  out.write(`  sondados       ${results.length}\n`);
  out.write(`  incluídos      ${incluidos}\n`);
  for (const [motivo, n] of [...porMotivo.entries()].sort((a, b) => b[1] - a[1])) {
    out.write(`  excluído ${motivo.padEnd(18)} ${n}\n`);
  }
  out.write(`CSV gravado em ${PROBED_PATH}\n`);
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
  if (argv.includes("--probe")) {
    await runProbe(parseLimit(argv), createRealProbeDeps());
  } else {
    runNormalize();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`);
  process.exitCode = 1;
});
