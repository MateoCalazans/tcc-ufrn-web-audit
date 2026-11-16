import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { chromium } from "playwright";

import { buildMeta } from "../src/shared/meta.js";

/**
 * Interface (S21): axe-core nas telas, com o servidor já no ar (`npm run ui`).
 *
 *   npx tsx scripts/ui-axe.ts [--base http://127.0.0.1:5179]
 *
 * Abre cada tela nos temas claro e escuro, expande os <details> e roda o axe
 * com as regras WCAG 2.0/2.1/2.2 A e AA e as boas práticas. Grava
 * `docs/resultados/ui-axe.json` e sai com código 1 se houver violação.
 */

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const AXE_VERSAO = (JSON.parse(readFileSync(require.resolve("axe-core/package.json"), "utf8")) as { version: string }).version;

const i = process.argv.indexOf("--base");
const BASE = i >= 0 ? process.argv[i + 1]! : "http://127.0.0.1:5179";
const SITES = join("data", "processed", "sites");

/** Telas a verificar: escolhidas pelos dados que existem em disco. */
function telas(): Array<{ nome: string; hash: string }> {
  const ids = readdirSync(SITES);
  const comPar = ids.find((s) => existsSync(join(SITES, s, "landmarks-corrigido.png")) && existsSync(join(SITES, s, "recommendations.json")));
  const comRec = existsSync(join(SITES, "mat.ufrn.br", "recommendations.json")) ? "mat.ufrn.br" : ids.find((s) => existsSync(join(SITES, s, "recommendations.json")));
  const semRec = ids.find((s) => !existsSync(join(SITES, s, "recommendations.json")) && !existsSync(join("data", "avulsos", s)));
  const avulsa = existsSync(join("data", "avulsos", "mat.ufrn.br"))
    ? readdirSync(join("data", "avulsos", "mat.ufrn.br")).sort().reverse()[0]
    : undefined;
  return [
    { nome: "lista do corpus", hash: "#/" },
    ...(comRec ? [{ nome: `site com recomendações (${comRec})`, hash: `#/site/${comRec}` }] : []),
    ...(comPar ? [{ nome: `site com captura antes × depois (${comPar})`, hash: `#/site/${comPar}` }] : []),
    ...(semRec ? [{ nome: `site sem recomendações (${semRec})`, hash: `#/site/${semRec}` }] : []),
    { nome: "nova análise", hash: "#/nova" },
    ...(avulsa ? [{ nome: `análise avulsa concluída (mat.ufrn.br, ${avulsa})`, hash: `#/analise/mat.ufrn.br__${avulsa}` }] : []),
    { nome: "página não encontrada", hash: "#/xyz" },
  ];
}

interface Violacao {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: unknown; failureSummary?: string }>;
}

const resultados: Array<{ tela: string; hash: string; tema: string; violacoes: Violacao[]; passes: number; incompletas: number }> = [];

const navegador = await chromium.launch();
try {
  for (const tema of ["light", "dark"] as const) {
    const contexto = await navegador.newContext({ bypassCSP: true, colorScheme: tema, viewport: { width: 1280, height: 900 } });
    const pagina = await contexto.newPage();
    for (const t of telas()) {
      await pagina.goto(`${BASE}/${t.hash}`, { waitUntil: "networkidle" });
      await pagina.waitForSelector("h1");
      // Código do navegador como texto: o tsconfig da raiz não tem os tipos do DOM.
      await pagina.waitForFunction(`!document.querySelector('[data-carregando]')`, null, { timeout: 15000 });
      await pagina.waitForTimeout(1500); // fim das animações de entrada
      await pagina.evaluate(`document.querySelectorAll("details").forEach((d) => { d.open = true; })`);
      await pagina.waitForTimeout(1200); // fim da animação de abertura das dobras (GSAP)
      await pagina.addScriptTag({ content: AXE });
      const r = (await pagina.evaluate(
        `axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } })`,
      )) as { violations: Violacao[]; passes: unknown[]; incomplete: unknown[] };
      resultados.push({
        tela: t.nome,
        hash: t.hash,
        tema,
        violacoes: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
        })),
        passes: r.passes.length,
        incompletas: r.incomplete.length,
      });
      process.stderr.write(`[axe] ${tema} · ${t.nome}: ${r.violations.length} violações, ${r.incomplete.length} a revisar\n`);
    }
    await contexto.close();
  }
} finally {
  await navegador.close();
}

const meta = buildMeta();
const total = resultados.reduce((a, r) => a + r.violacoes.length, 0);
mkdirSync(join("docs", "resultados"), { recursive: true });
writeFileSync(
  join("docs", "resultados", "ui-axe.json"),
  JSON.stringify({ meta: { ...meta, toolVersions: { ...meta.toolVersions, "axe-core": AXE_VERSAO } }, base: BASE, totalViolacoes: total, resultados }, null, 2) + "\n",
);
process.stderr.write(`[axe] total: ${total} violações em ${resultados.length} verificações → docs/resultados/ui-axe.json\n`);
process.exitCode = total > 0 ? 1 : 0;
