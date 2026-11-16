import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";

import { createLogger } from "../shared/logger.js";
import { buildMeta } from "../shared/meta.js";
import { prepararComparador } from "./compare.js";
import { DIR_SNAPSHOT, gravarSnapshot } from "./snapshot.js";
import { BLOQUEIO_DE_REDE, verificarSnapshot } from "./verify.js";

/**
 * Módulo 4 — Validação. Por enquanto (S17, ADR 017), só a cópia local:
 *
 *   npm run validate -- snapshot --site <id> [--site <id> ...] [--verificar]
 *
 * Lê `data/raw/<id>/` (imutável) e o `fixed.html` do módulo 3; grava
 * `data/processed/sites/<id>/snapshot/`. Com `--verificar`, serve a cópia
 * original localmente, com a rede externa bloqueada, e compara o screenshot
 * com o da coleta (`verificacao.json`, `local-original.png`).
 * O antes/depois com Lighthouse (`validation.json`) é a S18.
 */

const RAW = join("data", "raw");
const PROCESSED = join("data", "processed", "sites");

const argv = process.argv.slice(2);
const ids: string[] = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === "--site" && argv[i + 1] !== undefined) ids.push(argv[++i]!);
if (argv[0] !== "snapshot" || ids.length === 0) {
  process.stderr.write("Uso: npm run validate -- snapshot --site <id> [--site <id> ...] [--verificar]\n");
  process.exit(1);
}
const verificar = argv.includes("--verificar");

const log = createLogger("validate");
const meta = buildMeta();
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
      const collect = JSON.parse(readFileSync(join(dirRaw, "collect.json"), "utf8")) as { parametros?: { userAgent?: string }; render?: { startedAt?: string } };
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
