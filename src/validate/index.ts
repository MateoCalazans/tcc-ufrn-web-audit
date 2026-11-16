import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";

import { runLighthouse } from "../collect/lighthouse.js";
import { readCsvObjects, writeCsv } from "../shared/csv.js";
import { createLogger } from "../shared/logger.js";
import { buildMeta } from "../shared/meta.js";
import { prepararComparador } from "./compare.js";
import { ARQ_VALIDACAO, colunasValidacao, copiaEmDia, linhaValidacao, resumoRecomendacoes, validarSite, type ValidacaoSite } from "./run.js";
import { DIR_SNAPSHOT, gravarSnapshot } from "./snapshot.js";
import { BLOQUEIO_DE_REDE, verificarSnapshot } from "./verify.js";

/**
 * Módulo 4 — Validação.
 *
 *   npm run validate -- snapshot --site <id> [--site <id> ...] [--verificar]
 *   npm run validate -- run --sample <amostra.csv> [--refazer] [--saida <nome>]
 *
 * `--saida` muda o nome do CSV consolidado (padrão `validation`; o censo do
 * adendo do censo ao ADR 004 usa `validation-censo`).
 *
 * `snapshot` (S17, ADR 018): lê `data/raw/<id>/` (imutável) e o `fixed.html`
 * do módulo 3; grava `data/processed/sites/<id>/snapshot/`. Com `--verificar`,
 * serve a cópia original localmente, com a rede externa bloqueada, e compara o
 * screenshot com o da coleta (`verificacao.json`, `local-original.png`).
 *
 * `run` (S18, ADR 004): para cada site da amostra, refaz a cópia local (se
 * faltar ou for mais velha que o `fixed.html`) e mede
 * original × corrigido (Lighthouse 3× por variante + semântica do DOM local),
 * gravando `data/processed/sites/<id>/validation.json`. Retomável: sites com
 * `validation.json` são pulados, salvo `--refazer`. Ao fim, junta todos os
 * sites da amostra em `data/processed/validation.csv` (+ `.meta.json`).
 */

const RAW = join("data", "raw");
const PROCESSED = join("data", "processed", "sites");

const argv = process.argv.slice(2);
const ids: string[] = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === "--site" && argv[i + 1] !== undefined) ids.push(argv[++i]!);
const iAmostra = argv.indexOf("--sample");
const arqAmostra = iAmostra >= 0 ? argv[iAmostra + 1] : undefined;
const comando = argv[0];
if (!((comando === "snapshot" && ids.length > 0) || (comando === "run" && arqAmostra !== undefined))) {
  process.stderr.write(
    "Uso: npm run validate -- snapshot --site <id> [--site <id> ...] [--verificar]\n" +
      "     npm run validate -- run --sample <amostra.csv> [--refazer] [--saida <nome>]\n",
  );
  process.exit(1);
}
const verificar = argv.includes("--verificar");

interface CollectJson {
  parametros?: { userAgent?: string };
  render?: { startedAt?: string };
}
const lerCollect = (id: string) => JSON.parse(readFileSync(join(RAW, id, "collect.json"), "utf8")) as CollectJson;

const log = createLogger("validate");
const meta = buildMeta();
if (comando === "run") {
  await rodarAmostra(arqAmostra!);
} else {
  await rodarSnapshot();
}

async function rodarSnapshot(): Promise<void> {
  const browser = verificar ? await chromium.launch({ args: [BLOQUEIO_DE_REDE] }) : null;
  const comparador = browser ? await (await browser.newContext()).newPage() : null;
  if (comparador) await prepararComparador(comparador);

  let erros = 0;
  for (const id of ids) {
    const dirRaw = join(RAW, id);
    const dirProcessado = join(PROCESSED, id);
    try {
      if (!existsSync(join(dirRaw, "index.html")) || !existsSync(join(dirRaw, "page.har"))) {
        throw new Error("sem index.html ou page.har na coleta");
      }
      const m = gravarSnapshot({ siteId: id, dirRaw, dirProcessado, meta });
      log.info("cópia local gravada", { site: id, ...m.resumo, corrigido: m.variantes.corrigido !== null });
      process.stdout.write(
        `${id}: ${m.resumo.servidas} recursos, ${m.resumo.redirecionamentos} redirecionamentos, limitações ${JSON.stringify(m.resumo.limitacoesPorMotivo)}` +
          `${m.variantes.corrigido ? "" : " (sem fixed.html: só a variante original)"}\n`,
      );

      if (browser && comparador) {
        const collect = lerCollect(id);
        const dirSnap = join(dirProcessado, DIR_SNAPSHOT);
        const { verificacao, png } = await verificarSnapshot(
          browser,
          comparador,
          dirSnap,
          readFileSync(join(dirRaw, "screenshot.png")),
          collect.parametros?.userAgent ?? "",
          collect.render?.startedAt ? new Date(collect.render.startedAt) : null,
        );
        writeFileSync(join(dirSnap, "local-original.png"), png);
        writeFileSync(join(dirSnap, "verificacao.json"), JSON.stringify({ meta, siteId: id, ...verificacao }, null, 2) + "\n", "utf8");
        const pct = (x: number | null) => (x === null ? "tamanho diferente" : `${(x * 100).toFixed(3)}%`);
        log.info("verificação", { site: id, coletaLocal: verificacao.coletaLocal.proporcao, ruido: verificacao.ruido.proporcao, faltas: verificacao.faltasNoServidor.length, externas: verificacao.externasBloqueadas.length });
        process.stdout.write(
          `  coleta × local ${pct(verificacao.coletaLocal.proporcao)} | ruído ${pct(verificacao.ruido.proporcao)} | ` +
            `faltas ${verificacao.faltasNoServidor.length} | sem query ${verificacao.servidasSemQuery.length} | externas bloqueadas ${verificacao.externasBloqueadas.length}\n`,
        );
      }
    } catch (err) {
      erros++;
      log.error("falha no site", { site: id, erro: err instanceof Error ? err.message : String(err) });
      process.stderr.write(`${id}: ERRO ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  await browser?.close();
  process.exitCode = erros > 0 ? 1 : 0;
}

async function rodarAmostra(arquivo: string): Promise<void> {
  const refazer = argv.includes("--refazer");
  const amostra = readCsvObjects(arquivo);
  const chromePath = chromium.executablePath();
  const browser = await chromium.launch({ args: [BLOQUEIO_DE_REDE] });
  log.info("inicio-run", { meta, amostra: arquivo, sites: amostra.map((l) => l.id), refazer });
  let erros = 0;
  try {
    for (const [posicao, l] of amostra.entries()) {
      const id = l.id!;
      const dirRaw = join(RAW, id);
      const dirProcessado = join(PROCESSED, id);
      if (!refazer && existsSync(join(dirProcessado, ARQ_VALIDACAO))) {
        process.stdout.write(`${id}: já validado (use --refazer)\n`);
        continue;
      }
      try {
        if (!existsSync(join(dirProcessado, "fixed.html"))) throw new Error("sem fixed.html: rode antes o npm run recommend");
        // Reaproveita a cópia em dia (refazer apagaria a verificação da S17).
        if (!copiaEmDia(dirProcessado)) gravarSnapshot({ siteId: id, dirRaw, dirProcessado, meta });
        const collect = lerCollect(id);
        process.stdout.write(`${id} (${posicao + 1}/${amostra.length}):`);
        const t0 = Date.now();
        const r = await validarSite({
          siteId: id,
          posicao,
          dirSnapshot: join(dirProcessado, DIR_SNAPSHOT),
          dirSaida: dirProcessado,
          meta,
          browser,
          runner: runLighthouse,
          chromePath,
          userAgent: collect.parametros?.userAgent ?? "",
          relogio: collect.render?.startedAt ? new Date(collect.render.startedAt) : null,
          contexto: { grupo: l.grupo || null, tecnologia: l.tecnologia || null, tipo: l.tipo || null },
          recomendacoes: resumoRecomendacoes(dirProcessado),
          aoExecutar: (v, n, nota) => process.stdout.write(` ${v[0]!.toUpperCase()}${n}=${nota ?? "x"}`),
        });
        const d = r.deltas;
        process.stdout.write(
          ` | perf ${d.nota_performance.original}→${d.nota_performance.corrigido} | índice ${d.indice_semantica.original?.toFixed(1)}→${d.indice_semantica.corrigido?.toFixed(1)} | ${Math.round((Date.now() - t0) / 1000)} s\n`,
        );
        log.info("site", { site: id, deltas: Object.fromEntries(Object.entries(d).map(([k, x]) => [k, x.delta])) });
      } catch (err) {
        erros++;
        log.error("falha no site", { site: id, erro: err instanceof Error ? err.message : String(err) });
        process.stderr.write(`\n${id}: ERRO ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }
  } finally {
    await browser.close();
  }

  // Junta os sites da amostra que têm validation.json.
  const linhas: string[][] = [];
  const faltando: string[] = [];
  for (const l of amostra) {
    const f = join(PROCESSED, l.id!, ARQ_VALIDACAO);
    if (!existsSync(f)) {
      faltando.push(l.id!);
      continue;
    }
    linhas.push(linhaValidacao(JSON.parse(readFileSync(f, "utf8")) as ValidacaoSite));
  }
  const iSaida = argv.indexOf("--saida");
  const base = iSaida >= 0 && argv[iSaida + 1] ? argv[iSaida + 1]! : "validation";
  if (!/^[\w.-]+$/.test(base)) throw new Error(`--saida inválida: ${base} (só o nome, sem pasta nem extensão)`);
  const saida = join("data", "processed", `${base}.csv`);
  writeCsv(saida, colunasValidacao(), linhas);
  writeFileSync(
    join("data", "processed", `${base}.meta.json`),
    JSON.stringify({ meta, amostra: arquivo, linhas: linhas.length, faltando, adr: "docs/decisoes/004-amostra-e-protocolo-da-validacao.md" }, null, 2) + "\n",
    "utf8",
  );
  process.stdout.write(`${saida}: ${linhas.length} sites${faltando.length ? `, faltando ${faltando.join(" ")}` : ""}\n`);
  process.exitCode = erros > 0 ? 1 : 0;
}
