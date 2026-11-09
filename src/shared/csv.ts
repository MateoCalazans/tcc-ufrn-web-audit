/**
 * CSV mínimo (RFC 4180): vírgula como separador, aspas duplas para campos com
 * vírgula/aspas/quebra de linha. Suficiente para os CSVs do próprio pipeline.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function formatCsv(header: string[], rows: string[][]): string {
  const lines = [header.join(","), ...rows.map((r) => r.map(csvField).join(","))];
  return `${lines.join("\n")}\n`;
}

export function writeCsv(path: string, header: string[], rows: string[][]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatCsv(header, rows), "utf8");
}

/** Faz o parsing de um CSV em linhas de campos (aspas e quebras dentro de aspas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Lê um CSV com cabeçalho como lista de objetos `{coluna: valor}`. */
export function readCsvObjects(path: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(readFileSync(path, "utf8"));
  if (header === undefined) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
