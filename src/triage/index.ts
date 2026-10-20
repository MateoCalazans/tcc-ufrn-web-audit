import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { createLogger } from "../shared/logger.js";
import { normalizeList, parseLines, type NormalizedRow } from "./normalize.js";

/**
 * Módulo 0 — Triagem. Por enquanto roda só a normalização da lista (S02);
 * sondagem (S03) e classificação (S04) entram depois. Caminhos relativos à
 * raiz (os scripts rodam a partir dela via `npm run`).
 */
const INPUT_PATH = "data/input/registros-ufrn.txt";
const OUTPUT_PATH = "data/interim/normalized.csv";

const CSV_HEADER = ["linha_original", "host_normalizado", "situacao", "motivo", "detalhe"];

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: NormalizedRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [r.linhaOriginal, r.hostNormalizado, r.situacao, r.motivo, r.detalhe]
        .map(csvField)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function main(): void {
  const log = createLogger("triage");

  const text = readFileSync(INPUT_PATH, "utf8");
  const lines = parseLines(text);
  const { rows, funnel } = normalizeList(lines);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, toCsv(rows), "utf8");

  const descartados = rows.filter((r) => r.situacao === "descartado").length;
  const unificadosRows = rows.filter((r) => r.situacao === "unificado").length;

  log.info("normalização concluída", {
    input: INPUT_PATH,
    output: OUTPUT_PATH,
    funnel,
    descartadosInfra: descartados,
    linhasUnificadas: unificadosRows,
  });

  // Funil legível no terminal (vai para o diário / Metodologia).
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
  out.write(`CSV gravado em ${OUTPUT_PATH}\n`);
}

main();
