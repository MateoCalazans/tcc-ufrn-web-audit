import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { VERSION as VERSAO_SDK } from "@anthropic-ai/sdk/version";
import { createRequire } from "node:module";
import { join } from "node:path";

import { createLogger } from "../shared/logger.js";
import { buildMeta } from "../shared/meta.js";
import type { Rule } from "../shared/types.js";
import { codificar } from "./encoding.js";
import { chromium, type Browser } from "playwright";

import { aplicarRegras, montarResultado } from "./engine.js";
import { desfazerReprovadas, guardarImagens, julgar, prepararMedicao, REGRA_GUARDADA, type ResultadoGuarda } from "./guarda-imagens.js";
import { lerEntradaDoSite } from "./entrada.js";
import {
  carregarPrompt,
  chamadorAnthropic,
  COLUNAS_LLM_RUNS,
  criarRegraLandmarks,
  type ExecucaoLlm,
  gastoRegistrado,
  linhaLlmRuns,
} from "./llm.js";
import { REGRAS } from "./rules/index.js";

/**
 * Módulo 3 — Recomendação (S14, ADR 014). Lê `data/raw/<id>/` (imutável,
 * regra 8): `index.html` (bruto), `collect.json` (URL), `page.har` e, desde a
 * S15, o `lh<n>.json` da execução mediana (ADR 009). Grava em
 * `data/processed/sites/<id>/`: `recommendations.json`, `fixed.html`, `fix.diff`.
 *
 * Com `--llm` (S16, ADR 016), acrescenta a regra `landmarks-llm`, que chama a
 * API da Anthropic (custo), e grava uma linha por site em
 * `data/processed/llm-runs.csv`. Sem a flag, o módulo é determinístico e sem custo.
 * Teto de gasto acumulado (soma de `custo_usd` no llm-runs.csv): `--teto-usd`,
 * padrão US$ 4,50 (crédito de US$ 5 do autor). Passou do teto, não chama.
 *
 * Uso: npm run recommend -- --site <id> [--site <id> ...] [--llm [--teto-usd N]]
 */

const RAW = join("data", "raw");
const PROCESSED = join("data", "processed", "sites");
const LLM_RUNS = join("data", "processed", "llm-runs.csv");

function sitesDosArgumentos(argv: string[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--site" && argv[i + 1] !== undefined) ids.push(argv[++i]!);
  }
  return ids;
}

const log = createLogger("recommend");
const ids = sitesDosArgumentos(process.argv.slice(2));
if (ids.length === 0) {
  process.stderr.write("Uso: npm run recommend -- --site <id> [--site <id> ...]\n");
  process.exit(1);
}

const meta = buildMeta();
const exigir = createRequire(import.meta.url);
meta.toolVersions.diff = (exigir("diff/package.json") as { version: string }).version;

// Regra com LLM (opcional): a execução de cada site vai para o llm-runs.csv.
const usarLlm = process.argv.includes("--llm");
const execucoes: ExecucaoLlm[] = [];
let regras: readonly Rule[] = REGRAS;
let llm: { prompt: string; arquivo: string; sha256: string; modelo: string; effort: string; maxTokens: number } | null = null;
if (usarLlm) {
  const prompt = carregarPrompt();
  meta.toolVersions["@anthropic-ai/sdk"] = VERSAO_SDK; // o pacote não exporta o package.json
  llm = { prompt: prompt.versao, arquivo: `docs/prompts/${prompt.versao}.md`, sha256: prompt.sha256, modelo: prompt.modelo, effort: prompt.effort, maxTokens: prompt.maxTokens };
  const i = process.argv.indexOf("--teto-usd");
  const tetoUsd = i >= 0 ? Number(process.argv[i + 1]) : 4.5;
  if (!Number.isFinite(tetoUsd) || tetoUsd < 0) {
    process.stderr.write("--teto-usd precisa de um número >= 0\n");
    process.exit(1);
  }
  // O CSV recebe uma linha por site antes do próximo; relê-lo inclui a execução atual.
  const orcamento = { tetoUsd, gastoUsd: () => gastoRegistrado(LLM_RUNS) };
  regras = [...REGRAS, criarRegraLandmarks({ chamar: chamadorAnthropic(), prompt, registrar: (e) => execucoes.push(e), orcamento })];
  process.stderr.write(`[recommend] LLM: gasto registrado US$ ${orcamento.gastoUsd().toFixed(4)} de teto US$ ${tetoUsd.toFixed(2)}.\n`);
}
log.info("inicio", { meta, sites: ids, regras: regras.map((r) => r.id), llm });

let erros = 0;
let navegador: Browser | undefined;
for (const id of ids) {
  const dir = join(RAW, id);
  try {
    // HTML bruto, HAR e o relatório da execução mediana (ADR 009).
    const { entrada, fonte, lhArquivo } = lerEntradaDoSite(dir, id);
    const { url, har, lighthouse } = entrada;

    const antes = execucoes.length;
    const bruto = await aplicarRegras(entrada, regras);

    // Guarda de renderização das imagens (S18b, adendo ao ADR 014): só fica a
    // correção da img-dimensions cujo tamanho exibido não muda (mobile e desktop).
    let guarda: ResultadoGuarda | null = null;
    let r = bruto;
    if (bruto.recommendations.some((x) => x.regra === REGRA_GUARDADA && x.edicoes.length > 0)) {
      const harPath = join(dir, "page.har");
      if (existsSync(harPath)) {
        const collect = JSON.parse(readFileSync(join(dir, "collect.json"), "utf8")) as { url: string; raw?: { finalUrl?: string | null; headers?: Record<string, string> } };
        navegador ??= await chromium.launch();
        guarda = await guardarImagens(
          navegador,
          { harPath, url: collect.raw?.finalUrl ?? collect.url, contentType: collect.raw?.headers?.["content-type"] ?? "text/html" },
          entrada.html,
          bruto.recommendations,
          (t) => codificar(t, fonte),
        );
      } else {
        // Sem HAR não há como medir: nenhuma correção da regra é mantida.
        const { marcadores } = prepararMedicao(entrada.html, bruto.recommendations);
        guarda = { ...julgar(marcadores, {}), erro: "sem page.har: nada a medir" };
      }
      r = montarResultado(entrada.html, regras.map((x) => x.id), desfazerReprovadas(bruto.recommendations, guarda));
      log.info("guarda-imagens", { id, mantidas: guarda.mantidas, desfeitas: guarda.desfeitas, erro: guarda.erro });
    }
    const execLlm = execucoes.slice(antes).find((e) => e.siteId === id) ?? null;
    if (execLlm !== null) {
      if (!existsSync(LLM_RUNS)) writeFileSync(LLM_RUNS, COLUNAS_LLM_RUNS.join(",") + "\n", "utf8");
      appendFileSync(LLM_RUNS, linhaLlmRuns(execLlm, new Date().toISOString(), meta.gitCommit) + "\n", "utf8");
      log.info("llm", { ...execLlm });
    }

    const destino = join(PROCESSED, id);
    mkdirSync(destino, { recursive: true });
    const saida = {
      meta,
      id,
      url,
      fonte: {
        html: "index.html",
        codificacao: fonte.codificacao,
        bom: fonte.bom,
        har: har !== undefined,
        lighthouse: lhArquivo,
        lighthouseVersion: lighthouse?.lighthouseVersion ?? null,
      },
      regras: regras.map((x) => ({ id: x.id, dimensao: x.dimensao, descricao: x.descricao })),
      llm: llm === null ? null : { ...llm, execucao: execLlm },
      resumo: r.resumo,
      guardaImagens: guarda,
      recommendations: r.recommendations,
    };
    writeFileSync(join(destino, "recommendations.json"), JSON.stringify(saida, null, 2) + "\n", "utf8");
    writeFileSync(join(destino, "fixed.html"), codificar(r.fixedHtml, fonte));
    writeFileSync(join(destino, "fix.diff"), codificar(r.diff, { ...fonte, bom: false }));
    log.info("site", { id, ...r.resumo });
    process.stderr.write(
      `[recommend] ${id}: ${r.resumo.total} recomendações, ${r.resumo.corrigidas} corrigidas.` +
        (guarda ? ` Guarda de imagens: ${guarda.mantidas} mantidas, ${guarda.desfeitas} desfeitas${guarda.erro ? ` (${guarda.erro})` : ""}.` : "") +
        "\n",
    );
  } catch (e) {
    erros++;
    log.error("site", { id, erro: (e as Error).message });
    process.stderr.write(`[recommend] ${id}: erro — ${(e as Error).message}\n`);
  }
}
await navegador?.close();
log.info("fim", { sites: ids.length, erros });
