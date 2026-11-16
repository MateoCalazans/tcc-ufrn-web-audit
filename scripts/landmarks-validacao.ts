import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";

import { jarDoPacote, prepararVnu } from "../src/analyze/vnu.js";
import { MOBILE_SCREEN } from "../src/collect/page.js";
import { codificar, decodificar } from "../src/recommend/encoding.js";
import { aplicarEdicoes } from "../src/recommend/engine.js";
import { parsear } from "../src/recommend/html.js";
import { ID_REGRA_LLM, textoDoCorpo } from "../src/recommend/llm.js";
import { createLogger } from "../src/shared/logger.js";
import { buildMeta } from "../src/shared/meta.js";
import type { Recommendation } from "../src/shared/types.js";
import { compararPng, prepararComparador } from "../src/validate/compare.js";

/**
 * Validação das trocas da regra `landmarks-llm` (S16, ADR 016), site a site:
 *
 * 1. texto do `body` igual (original × original + trocas);
 * 2. vnu nos dois arquivos (a troca não deve criar erros);
 * 3. screenshots da página inteira, servida a partir do HAR da coleta
 *    (`routeFromHAR`, sem rede: regra 7), comparados pixel a pixel. O
 *    original é fotografado 2 vezes para medir o ruído (animações, carrosséis).
 *
 * Isola as trocas do LLM: o HTML comparado é o original com SÓ as edições da
 * `landmarks-llm`, não o `fixed.html` (que traz as outras regras).
 * Exploratório da S16; a validação do módulo 4 (S17–S18) é outra.
 *
 * Uso: npx tsx scripts/landmarks-validacao.ts --site <id> [--site <id> ...]
 * Saída: data/processed/sites/<id>/landmarks-validacao.json (+ .html e .png).
 */

const RAW = join("data", "raw");
const PROCESSED = join("data", "processed", "sites");
const log = createLogger("landmarks-validacao");

const ids: string[] = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i] === "--site" && argv[i + 1]) ids.push(argv[++i]!);
if (ids.length === 0) {
  process.stderr.write("Uso: npx tsx scripts/landmarks-validacao.ts --site <id> [--site <id> ...]\n");
  process.exit(1);
}

const meta = buildMeta();
const javaHome = process.env.JAVA_HOME?.trim();
const vnu = prepararVnu({ jar: jarDoPacote(), java: javaHome ? join(javaHome, "bin", "java") : "java" });
const browser = await chromium.launch();

/** Screenshot da página inteira, com o documento principal trocado por `corpo` e o resto vindo do HAR. */
async function fotografar(harPath: string, url: string, corpo: Buffer, tipo: string): Promise<Buffer> {
  const context = await browser.newContext({
    viewport: { width: MOBILE_SCREEN.width, height: MOBILE_SCREEN.height },
    deviceScaleFactor: MOBILE_SCREEN.deviceScaleFactor,
    isMobile: MOBILE_SCREEN.isMobile,
    hasTouch: MOBILE_SCREEN.hasTouch,
    serviceWorkers: "block",
  });
  try {
    await context.routeFromHAR(harPath, { notFound: "abort" });
    // Registrada depois do HAR, esta rota tem precedência (Playwright: ordem inversa).
    await context.route("**/*", (route) =>
      route.request().isNavigationRequest() && route.request().frame().parentFrame() === null
        ? route.fulfill({ status: 200, contentType: tipo, body: corpo })
        : route.fallback(),
    );
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(1500);
    return await page.screenshot({ fullPage: true, animations: "disabled" });
  } finally {
    await context.close();
  }
}

const comparador = await (await browser.newContext()).newPage();
// O tsx (esbuild, keepNames) envolve funções internas em `__name(...)`, que não existe no navegador.
await prepararComparador(comparador);
let erros = 0;
for (const id of ids) {
  try {
    const dirRaw = join(RAW, id);
    const dirOut = join(PROCESSED, id);
    const recsPath = join(dirOut, "recommendations.json");
    if (!existsSync(recsPath)) throw new Error("sem recommendations.json (rodar npm run recommend -- --llm)");
    const recs = JSON.parse(readFileSync(recsPath, "utf8")) as { url: string; recommendations: Recommendation[]; llm: unknown };
    const trocas = recs.recommendations.filter((r) => r.regra === ID_REGRA_LLM && r.correcaoAutomatica);
    const bruto = readFileSync(join(dirRaw, "index.html"));
    const fonte = decodificar(bruto);
    const resultado: Record<string, unknown> = { meta, id, url: recs.url, trocas: trocas.map((t) => ({ id: t.id, evidencia: t.evidencia })) };

    if (trocas.length === 0) {
      resultado.status = "sem-troca";
      writeFileSync(join(dirOut, "landmarks-validacao.json"), JSON.stringify(resultado, null, 2) + "\n", "utf8");
      process.stderr.write(`[landmarks-validacao] ${id}: sem troca aplicada.\n`);
      continue;
    }

    const so = aplicarEdicoes(fonte.texto, trocas.flatMap((t) => t.edicoes));
    const soPath = join(dirOut, "landmarks-only.html");
    const soBytes = codificar(so, fonte);
    writeFileSync(soPath, soBytes);

    // 1. Texto
    resultado.textoIgual = textoDoCorpo(parsear(fonte.texto)) === textoDoCorpo(parsear(so));

    // 2. vnu
    resultado.vnu = vnu.disponivel
      ? { versao: vnu.versao, original: vnu.validar(join(dirRaw, "index.html")), corrigido: vnu.validar(soPath) }
      : { indisponivel: vnu.motivo };

    // 3. Screenshots (o HAR da coleta serve tudo; nada vai à rede)
    const har = join(dirRaw, "page.har");
    const tipo = `text/html; charset=${fonte.codificacao}`;
    const a1 = await fotografar(har, recs.url, bruto, tipo);
    const a2 = await fotografar(har, recs.url, bruto, tipo);
    const b = await fotografar(har, recs.url, soBytes, tipo);
    writeFileSync(join(dirOut, "landmarks-original.png"), a1);
    writeFileSync(join(dirOut, "landmarks-corrigido.png"), b);
    resultado.screenshot = {
      ruido: await compararPng(comparador, a1, a2),
      originalCorrigido: await compararPng(comparador, a1, b),
    };
    resultado.status = "ok";
    writeFileSync(join(dirOut, "landmarks-validacao.json"), JSON.stringify(resultado, null, 2) + "\n", "utf8");
    log.info("site", resultado);
    process.stderr.write(`[landmarks-validacao] ${id}: ${JSON.stringify({ textoIgual: resultado.textoIgual, vnu: resultado.vnu, screenshot: resultado.screenshot })}\n`);
  } catch (e) {
    erros++;
    log.error("site", { id, erro: (e as Error).message });
    process.stderr.write(`[landmarks-validacao] ${id}: erro — ${(e as Error).message}\n`);
  }
}
await browser.close();
log.info("fim", { sites: ids.length, erros });
