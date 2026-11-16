import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";

import { type Situacao, conferir, extrairReferencias } from "../src/evidencias/referencias.js";
import { arquivosDe, arquivosNoDisco, arquivosVersionados, tags } from "./lib-repo.js";

/**
 * Confere se as referências da rastreabilidade apontam para arquivos reais (S19).
 * Só leitura.
 *
 *   npx tsx scripts/check-rastreabilidade.ts [docs/artigo/rastreabilidade.md]
 *
 * Situações: `ok` (versionado), `fora-do-git` (só no disco: dados pesados ou
 * saídas regeráveis), `ambiguo` (nome solto que casa com mais de um arquivo),
 * `ausente`. Sai com código 1 se houver alguma `ausente`.
 */

const arquivo = process.argv[2] ?? "docs/artigo/rastreabilidade.md";
const md = readFileSync(arquivo, "utf8");

const ctx = {
  versionados: arquivosVersionados(),
  noDisco: arquivosNoDisco(),
  tags: tags().map((t) => t.nome),
  adrs: arquivosDe("docs/decisoes", /^\d{3}-.*\.md$/).map((f) => basename(f).slice(0, 3)),
  dirBase: dirname(arquivo).replace(/\\/g, "/"),
};

const resultado = extrairReferencias(md).map((r) => conferir(r, ctx));
const contagem: Record<Situacao, number> = { ok: 0, "fora-do-git": 0, ambiguo: 0, ausente: 0 };
for (const r of resultado) contagem[r.situacao]++;

const ordem: Situacao[] = ["ausente", "ambiguo", "fora-do-git", "ok"];
for (const s of ordem) {
  const doTipo = resultado.filter((r) => r.situacao === s);
  if (doTipo.length === 0) continue;
  process.stdout.write(`\n## ${s} (${doTipo.length})\n`);
  for (const r of doTipo) {
    const extra = [r.resolvido && r.resolvido !== r.valor ? `→ ${r.resolvido}` : "", r.detalhe ?? ""]
      .filter(Boolean)
      .join(" ");
    process.stdout.write(`  L${r.linha} ${r.tipo.padEnd(7)} ${r.valor} ${extra}\n`);
  }
}
process.stdout.write(
  `\n${arquivo}: ${resultado.length} referências | ok ${contagem.ok} | fora-do-git ${contagem["fora-do-git"]} | ambíguo ${contagem.ambiguo} | ausente ${contagem.ausente}\n`,
);
process.exitCode = contagem.ausente > 0 ? 1 : 0;
