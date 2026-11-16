import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import { numerosAusentes, parseAdr } from "../src/evidencias/adrs.js";
import { parseDiario, resumirUso } from "../src/evidencias/diarios.js";
import { montarIndice } from "../src/evidencias/indice.js";
import { buildMeta } from "../src/shared/meta.js";
import { arquivosDe, tags } from "./lib-repo.js";

/**
 * Gera `docs/artigo/indice-evidencias.md` (ADRs, tags, diário e resumo do uso
 * do Claude) e `docs/artigo/uso-ia.json` (os mesmos números, legíveis por máquina). S19.
 *
 *   npx tsx scripts/indice-evidencias.ts
 *
 * Só lê `docs/decisoes/`, `docs/diario/` e as tags do git.
 */

const ler = (f: string) => readFileSync(f, "utf8");

/** Números de ADR sem arquivo, com o motivo registrado no ROTEIRO. */
const MOTIVO_AUSENTE: Record<string, string> = {
  "017": "reservado para a S20, interface visual; ver `docs/ROTEIRO.md`, Fase 7",
};

const adrs = arquivosDe("docs/decisoes", /^\d{3}-.*\.md$/).map((f) => parseAdr(ler(f), basename(f)));
const diarios = arquivosDe("docs/diario", /^\d{4}-\d{2}-\d{2}-s.*\.md$/)
  .map((f) => parseDiario(ler(f), basename(f)))
  .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || a.arquivo.localeCompare(b.arquivo, "en", { numeric: true }));

const meta = buildMeta();
const proveniencia = `Gerado em ${meta.generatedAt} no commit \`${meta.gitCommit ?? "?"}\`${meta.gitDirty ? " (árvore com alterações não commitadas)" : ""}.`;

const md = montarIndice({
  adrs,
  adrsAusentes: numerosAusentes(adrs.map((a) => a.numero ?? "")).map((n) =>
    MOTIVO_AUSENTE[n] ? `${n} (${MOTIVO_AUSENTE[n]})` : n,
  ),
  tags: tags(),
  diarios,
  proveniencia,
});
writeFileSync("docs/artigo/indice-evidencias.md", md);

const resumo = resumirUso(diarios);
writeFileSync("docs/artigo/uso-ia.json", `${JSON.stringify({ meta, ...resumo }, null, 2)}\n`);

process.stdout.write(
  `ADRs ${adrs.length} | tags ${tags().length} | diários ${diarios.length} | itens ${resumo.itens} ${JSON.stringify(resumo.total)}\n`,
);
