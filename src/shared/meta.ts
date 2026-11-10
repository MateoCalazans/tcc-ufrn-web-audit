import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { readPackageJson } from "./pkg.js";
import type { Meta, ToolVersions } from "./types.js";

const require = createRequire(import.meta.url);

/** Ferramentas cujas versões são registradas em toda saída (regra 6/10). */
const TRACKED_TOOLS = ["lighthouse", "playwright", "cheerio"] as const;

/**
 * Versão de um pacote instalado, lendo o `version` do package.json dele.
 * Devolve `null` se o pacote não estiver instalado — o formato do JSON de
 * saída fica sempre igual, com a chave presente e valor nulo.
 */
function packageVersion(name: string): string | null {
  try {
    const pkg = require(`${name}/package.json`) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

export function getToolVersions(): ToolVersions {
  const versions: ToolVersions = {
    node: process.versions.node ?? null,
    lighthouse: null,
    playwright: null,
  };
  for (const tool of TRACKED_TOOLS) {
    versions[tool] = packageVersion(tool);
  }
  return versions;
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** HEAD atual, ou `null` fora de um repositório git. */
export function getGitCommit(): string | null {
  const out = git(["rev-parse", "HEAD"]);
  return out && out.length > 0 ? out : null;
}

/**
 * `true` se há alterações não commitadas (working tree ou index sujos).
 * Em caso de dúvida (git indisponível) assume `true`: é o lado conservador
 * para reprodutibilidade — melhor marcar como sujo do que afirmar limpo.
 */
export function isGitDirty(): boolean {
  const out = git(["status", "--porcelain"]);
  if (out === null) return true;
  return out.length > 0;
}

/**
 * Metadados padrão de toda saída JSON do pipeline (regra 10 do CLAUDE.md).
 * Módulos que gravam no fim (ex.: análise) devem trocar o rótulo para
 * `collectedAt` usando o mesmo valor, conforme o caso.
 */
export function buildMeta(): Meta {
  return {
    generatedAt: new Date().toISOString(),
    toolVersions: getToolVersions(),
    gitCommit: getGitCommit(),
    gitDirty: isGitDirty(),
  };
}

export { readPackageJson };
