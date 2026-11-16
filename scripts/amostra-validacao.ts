import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { aplicarRegras } from "../src/recommend/engine.js";
import { lerEntradaDoSite } from "../src/recommend/entrada.js";
import { REGRAS } from "../src/recommend/rules/index.js";
import { readCsvObjects, writeCsv } from "../src/shared/csv.js";
import { buildMeta } from "../src/shared/meta.js";
import { type LinhaDataset, selecionarAmostra } from "../src/validate/amostra.js";

/**
 * Seleciona a amostra do antes/depois (S18, ADR 004). Só leitura de
 * `data/raw/` e do `dataset.csv`; as correções são contadas em memória com as
 * regras determinísticas (sem LLM, sem custo), sem gravar nada do módulo 3.
 *
 *   npx tsx scripts/amostra-validacao.ts [--por-grupo 3]
 *
 * Grava `data/validation/amostra.csv` e `data/validation/amostra.meta.json`.
 */

const RAW = join("data", "raw");
const SAIDA = join("data", "validation");

const i = process.argv.indexOf("--por-grupo");
const porGrupo = i >= 0 ? Number(process.argv[i + 1]) : 3;

/**
 * Sites tirados da amostra depois da conferência visual da S18 (ADR 004):
 * telas de login (regra 4) e ferramenta de infraestrutura. Ficam no conjunto principal do
 * diagnóstico (`dataset.csv` da v0.2); a exclusão no corpus é pendência.
 */
const EXCLUIDOS = new Map<string, string>([
  ["socrates.ct.ufrn.br", "login (regra 4): tela de carregamento do Portainer, que pede login"],
  ["secacademica.ect.ufrn.br", "login (regra 4): página inicial é o formulário de login"],
  ["artefatos.imd.ufrn.br", "ferramenta de infraestrutura (JFrog Artifactory), não é portal institucional; decisão do autor"],
]);

const linhas = readCsvObjects(join("data", "processed", "dataset.csv")) as unknown as LinhaDataset[];
const temCopiaLocal = (id: string) => existsSync(join(RAW, id, "index.html")) && existsSync(join(RAW, id, "page.har"));

const correcoes = new Map<string, number>();
for (const l of linhas) {
  if (!temCopiaLocal(l.id) || !readdirSync(join(RAW, l.id)).includes("collect.json")) continue;
  const { entrada } = lerEntradaDoSite(join(RAW, l.id), l.id);
  const r = await aplicarRegras(entrada, REGRAS);
  correcoes.set(l.id, r.resumo.corrigidas);
}

const s = selecionarAmostra({ linhas, correcoes, temCopiaLocal, porGrupo, excluidos: EXCLUIDOS });

const colunas = ["id", "grupo", "tecnologia", "tipo", "ordem_no_grupo", "nota_performance", "indice_semantica", "posto_performance", "posto_indice", "soma_postos", "correcoes_regras"];
mkdirSync(SAIDA, { recursive: true });
writeCsv(
  join(SAIDA, "amostra.csv"),
  colunas,
  s.amostra.map((c) => [c.id, c.grupo, c.tecnologia, c.tipo, String(c.ordemNoGrupo), String(c.notaPerformance), String(c.indiceSemantica), String(c.postoPerformance), String(c.postoIndice), String(c.somaPostos), String(c.correcoes)]),
);
const porGrupoElegiveis = Object.fromEntries(
  ["estatico", "framework-js", "wordpress", "outro"].map((g) => [g, s.elegiveis.filter((c) => c.grupo === g).length]),
);
writeFileSync(
  join(SAIDA, "amostra.meta.json"),
  JSON.stringify(
    {
      meta: buildMeta(),
      adr: "docs/decisoes/004-amostra-e-protocolo-da-validacao.md",
      parametros: { porGrupo, regras: REGRAS.map((r) => r.id), llm: false },
      fonte: { dataset: "data/processed/dataset.csv", raw: RAW },
      linhasNoDataset: linhas.length,
      excluidos: Object.fromEntries(EXCLUIDOS),
      inelegiveis: s.inelegiveis,
      elegiveis: s.elegiveis.length,
      elegiveisPorGrupo: porGrupoElegiveis,
      amostra: s.amostra.length,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
process.stdout.write(`dataset ${linhas.length} | elegíveis ${s.elegiveis.length} ${JSON.stringify(porGrupoElegiveis)} | inelegíveis ${JSON.stringify(s.inelegiveis)}\n`);
const j = process.argv.indexOf("--listar");
if (j >= 0) {
  const n = Number(process.argv[j + 1] ?? 6);
  for (const g of ["estatico", "framework-js", "wordpress", "outro"]) {
    process.stdout.write(`-- ${g} (${n} piores elegíveis)\n`);
    for (const c of s.elegiveis.filter((x) => x.grupo === g).slice(0, n)) {
      process.stdout.write(`   ${c.id.padEnd(42)} ${c.tipo.padEnd(14)} perf ${c.notaPerformance} índice ${c.indiceSemantica} soma ${c.somaPostos}\n`);
    }
  }
}
for (const c of s.amostra) {
  process.stdout.write(`${c.grupo.padEnd(13)} ${c.ordemNoGrupo} ${c.id.padEnd(32)} ${c.tipo.padEnd(14)} perf ${c.notaPerformance} índice ${c.indiceSemantica} soma ${c.somaPostos} correções ${c.correcoes}\n`);
}
