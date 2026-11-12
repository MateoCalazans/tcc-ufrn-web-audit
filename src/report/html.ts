import type { Meta } from "../shared/types.js";

/**
 * Peças de HTML dos relatórios (S13). Funções puras, sem dependências: o
 * relatório é estático, com CSS mínimo embutido (decisão da S13).
 */

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Número formatado em pt-BR; `—` para `null`/`undefined`/`NaN`. */
export function num(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function pct(parte: number, total: number, casas = 1): string {
  return total === 0 ? "—" : `${num((100 * parte) / total, casas)}%`;
}

/** Tabela simples: cabeçalho + linhas já em HTML (o chamador escapa o texto). */
export function tabela(cabecalho: string[], linhas: string[][]): string {
  const th = cabecalho.map((c) => `<th>${esc(c)}</th>`).join("");
  const tr = linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n");
  return `<table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${tr}\n</tbody>\n</table>`;
}

const CSS = `
body{font-family:system-ui,sans-serif;max-width:60rem;margin:1rem auto;padding:0 1rem;color:#111;background:#fff;line-height:1.4}
table{border-collapse:collapse;margin:.5rem 0 1.5rem;font-size:.9rem}
th,td{border:1px solid #ccc;padding:.25rem .5rem;text-align:left;vertical-align:top}
th{background:#f2f2f2}
td.n{text-align:right}
.aviso{background:#fff4d6;border:1px solid #e0c060;padding:.5rem}
footer{margin-top:2rem;font-size:.8rem;color:#555}
`.trim();

/** Página completa, com `meta` (regra 10) no rodapé. */
export function pagina(titulo: string, corpo: string, meta: Meta): string {
  const versoes = Object.entries(meta.toolVersions)
    .map(([k, v]) => `${esc(k)} ${esc(v ?? "—")}`)
    .join(" · ");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${corpo}
</main>
<footer>
Gerado em ${esc(meta.generatedAt)} · commit ${esc(meta.gitCommit ?? "—")}${meta.gitDirty ? " (árvore suja)" : ""} · ${versoes}
</footer>
</body>
</html>
`;
}
